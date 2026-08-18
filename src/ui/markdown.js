// src/ui/markdown.js
//
// Markdown to DOM, for the page behind each node.
//
// Written rather than depended on, for two reasons.
//
// The first is safety. Every markdown library returns an HTML *string*, which has
// to be assigned to innerHTML, which means the sanitiser is the only thing
// standing between a shared map and stored XSS in every reader's browser. This
// renderer builds elements with createElement and puts text in with textContent,
// so there is no string of HTML at any point and nothing to sanitise: a page
// containing "<script>" produces a text node reading "<script>", because that is
// the only thing a text node can produce. The single place a value reaches an
// attribute is a link's href, and that goes through safeUrl.
//
// The second is size. A full CommonMark implementation is tens of kilobytes for a
// spec this does not need. What is here is the subset a notes page actually uses.
//
// Supported: ATX headings, paragraphs, unordered and ordered lists (nested by
// indentation), fenced and indented code blocks, block quotes, horizontal rules,
// tables, and inline code, bold, italic, strikethrough, links, images, autolinks
// and [[wiki links]] to other nodes.
//
// Deliberately absent: raw HTML passthrough. In a format whose whole point here is
// that it cannot inject markup, an escape hatch back to markup would defeat it.
// A page containing HTML shows that HTML as text, which is a defensible reading of
// a document nobody promised was CommonMark.

import { safeUrl } from '../utils/sanitize.js';

/** Fenced code: ``` or ~~~, with an optional language. */
const FENCE = /^(\s*)(`{3,}|~{3,})\s*([^`\s]*)\s*$/;
const ATX = /^(#{1,6})\s+(.*)$/;
const RULE = /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;
const BULLET = /^(\s*)([-*+])\s+(.*)$/;
const ORDERED = /^(\s*)(\d{1,9})[.)]\s+(.*)$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;
const TABLE_DIVIDER = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;

/**
 * Render markdown into a fresh DocumentFragment.
 *
 * @param {string} markdown
 * @param {object} [options]
 * @param {(target: string) => (string|null)} [options.resolveWikiLink]
 *        Given the text inside [[...]], return a node id if it names one. A
 *        wiki link to a node that does not exist is still shown, marked as
 *        unresolved, because a page often refers to something not made yet.
 * @param {(nodeId: string) => void} [options.onWikiLink] called when one is clicked
 * @returns {DocumentFragment}
 */
export function renderMarkdown(markdown, options = {}) {
    const fragment = document.createDocumentFragment();
    const lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n');

    let i = 0;
    while (i < lines.length) {
        const line = lines[i];

        if (!line.trim()) { i++; continue; }

        // --- fenced code. Taken first: everything inside a fence is literal, so
        // no other rule may look at those lines.
        const fence = FENCE.exec(line);
        if (fence) {
            const [, , marker, language] = fence;
            const body = [];
            i++;
            while (i < lines.length && !_closesFence(lines[i], marker)) {
                body.push(lines[i]);
                i++;
            }
            // An unterminated fence runs to the end of the document rather than
            // being abandoned: half-written notes are the normal case, and losing
            // everything after an unclosed ``` while typing would be maddening.
            i++;
            fragment.appendChild(_codeBlock(body.join('\n'), language));
            continue;
        }

        const heading = ATX.exec(line);
        if (heading) {
            const level = heading[1].length;
            const el = document.createElement(`h${level}`);
            _inline(el, heading[2].replace(/\s+#+\s*$/, ''), options);
            fragment.appendChild(el);
            i++;
            continue;
        }

        if (RULE.test(line)) {
            fragment.appendChild(document.createElement('hr'));
            i++;
            continue;
        }

        if (QUOTE.test(line)) {
            const body = [];
            while (i < lines.length && (QUOTE.test(lines[i]) || (body.length && lines[i].trim()))) {
                const m = QUOTE.exec(lines[i]);
                body.push(m ? m[1] : lines[i]);
                i++;
            }
            const quote = document.createElement('blockquote');
            // Recursion, so a quote can hold a list or a code block. The content is
            // markdown either way; treating it as plain text would be a lie.
            quote.appendChild(renderMarkdown(body.join('\n'), options));
            fragment.appendChild(quote);
            continue;
        }

        if (BULLET.test(line) || ORDERED.test(line)) {
            const consumed = _list(lines, i, options);
            fragment.appendChild(consumed.el);
            i = consumed.next;
            continue;
        }

        // An indented block is code, but only where a list is not already open —
        // which it is not here, since lists are consumed whole above.
        if (/^(?: {4}|\t)/.test(line)) {
            const body = [];
            while (i < lines.length && (/^(?: {4}|\t)/.test(lines[i]) || !lines[i].trim())) {
                body.push(lines[i].replace(/^(?: {4}|\t)/, ''));
                i++;
            }
            while (body.length && !body[body.length - 1].trim()) body.pop();
            fragment.appendChild(_codeBlock(body.join('\n'), ''));
            continue;
        }

        if (i + 1 < lines.length && line.includes('|') && TABLE_DIVIDER.test(lines[i + 1])) {
            const consumed = _table(lines, i, options);
            fragment.appendChild(consumed.el);
            i = consumed.next;
            continue;
        }

        // --- paragraph: everything up to a blank line or the start of a block
        const paragraph = [];
        while (i < lines.length && lines[i].trim() && !_startsBlock(lines[i])) {
            paragraph.push(lines[i]);
            i++;
        }
        const p = document.createElement('p');
        _inline(p, paragraph.join('\n'), options);
        fragment.appendChild(p);
    }

    return fragment;
}

/**
 * Replace an element's children with rendered markdown.
 *
 * The one function most callers want. Clears with replaceChildren rather than
 * innerHTML = '' so no HTML parse happens even on the empty case.
 */
export function renderMarkdownInto(element, markdown, options = {}) {
    element.replaceChildren(renderMarkdown(markdown, options));
    return element;
}

/**
 * The first line of a page, for a one-line summary in a list.
 *
 * Markdown stripped, because a preview reading "# Duality" instead of "Duality"
 * shows the syntax rather than the content.
 *
 * @param {string} markdown
 * @param {number} [limit]
 * @returns {string}
 */
export function markdownSummary(markdown, limit = 120) {
    const text = String(markdown ?? '')
        .replace(/```[\s\S]*?(?:```|$)/g, ' ')     // fenced code
        .replace(/^\s{0,3}[#>]+\s*/gm, '')          // heading and quote markers
        .replace(/^\s*[-*+]\s+/gm, '')              // bullets
        .replace(/^\s*\d{1,9}[.)]\s+/gm, '')        // numbers
        .replace(/!?\[\[([^\]]*)\]\]/g, '$1')       // wiki links
        .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')  // links and images
        .replace(/[*_~`]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    if (text.length <= limit) return text;
    // Cut at a word where one is close by, so a preview does not end mid-word.
    const cut = text.slice(0, limit);
    const space = cut.lastIndexOf(' ');
    return `${(space > limit - 20 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

// --- blocks ----------------------------------------------------------------

function _closesFence(line, marker) {
    const m = /^\s*(`{3,}|~{3,})\s*$/.exec(line);
    return Boolean(m) && m[1][0] === marker[0] && m[1].length >= marker.length;
}

function _startsBlock(line) {
    return ATX.test(line) || RULE.test(line) || QUOTE.test(line)
        || BULLET.test(line) || ORDERED.test(line) || FENCE.test(line);
}

function _codeBlock(text, language) {
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    if (language && /^[\w+-]{1,20}$/.test(language)) {
        // A class, not a style: the value is checked against an allowlist first,
        // so it cannot carry anything but a word.
        code.className = `language-${language}`;
        pre.dataset.language = language;
    }
    code.textContent = text;
    pre.appendChild(code);
    return pre;
}

/**
 * Consume one list, including nested lists, and return the element.
 *
 * Nesting is by indentation. A deeper item opens a sub-list inside the current
 * item rather than a sibling, which is what indentation is for.
 */
function _list(lines, start, options) {
    const first = BULLET.exec(lines[start]) ?? ORDERED.exec(lines[start]);
    const baseIndent = _width(first[1]);
    const ordered = !BULLET.test(lines[start]);

    const list = document.createElement(ordered ? 'ol' : 'ul');
    if (ordered) {
        const from = Number(first[2]);
        // A list starting at 3 renders starting at 3. Renumbering it silently
        // changes what the author wrote.
        if (from > 1 && from < 1e9) list.start = from;
    }

    let i = start;
    let item = null;

    while (i < lines.length) {
        const line = lines[i];

        if (!line.trim()) {
            // A blank line ends the list unless the next line continues it, which
            // is how a loose list (paragraph spacing between items) is written.
            const next = lines[i + 1];
            if (!next || !(BULLET.test(next) || ORDERED.test(next) || /^\s{2,}\S/.test(next))) break;
            i++;
            continue;
        }

        const match = BULLET.exec(line) ?? ORDERED.exec(line);
        if (match) {
            const indent = _width(match[1]);
            if (indent < baseIndent) break;

            if (indent > baseIndent) {
                // Nested. Recurse from here and attach inside the open item.
                const nested = _list(lines, i, options);
                (item ?? list).appendChild(nested.el);
                i = nested.next;
                continue;
            }

            // Switching marker type at the same level starts a new list, so that
            // a numbered list following bullets is not absorbed into them.
            if ((BULLET.test(line) ? false : true) !== ordered) break;

            item = document.createElement('li');
            _listItem(item, match[3], options);
            list.appendChild(item);
            i++;
            continue;
        }

        // A continuation line: indented under the item, or a lazy continuation.
        if (item) {
            item.appendChild(document.createTextNode(' '));
            _inline(item, line.trim(), options);
            i++;
            continue;
        }
        break;
    }

    return { el: list, next: i };
}

/** A list item, honouring a GitHub-style [ ] / [x] checkbox. */
function _listItem(item, text, options) {
    const task = /^\[([ xX])\]\s+(.*)$/.exec(text);
    if (!task) {
        _inline(item, text, options);
        return;
    }

    item.classList.add('md-task');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = task[1].toLowerCase() === 'x';
    // Read-only: the rendered page is a view. Ticking a box here would change
    // what is on screen without changing the markdown behind it, which reads as
    // a save that silently did not happen.
    box.disabled = true;
    item.append(box, document.createTextNode(' '));
    _inline(item, task[2], options);
}

function _table(lines, start, options) {
    const cells = (line) => line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());

    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    for (const cell of cells(lines[start])) {
        const th = document.createElement('th');
        _inline(th, cell, options);
        headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    let i = start + 2; // skip the header and the divider
    while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
        const tr = document.createElement('tr');
        for (const cell of cells(lines[i])) {
            const td = document.createElement('td');
            _inline(td, cell, options);
            tr.appendChild(td);
        }
        tbody.appendChild(tr);
        i++;
    }
    table.appendChild(tbody);

    return { el: table, next: i };
}

/** A tab counts as four columns, so indentation compares correctly either way. */
function _width(indent) {
    let n = 0;
    for (const ch of indent) n += ch === '\t' ? 4 : 1;
    return n;
}

// --- inline ----------------------------------------------------------------

// Ordered by precedence. Code comes first: inside a code span nothing else
// applies, which is the whole point of writing `**not bold**`.
const INLINE = [
    { name: 'code', re: /`([^`]+)`/ },
    { name: 'image', re: /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/ },
    { name: 'wiki', re: /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/ },
    { name: 'link', re: /\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/ },
    // Bold and italic are two rules each, because ** and __ are not equivalent.
    // Markdown treats an underscore inside a word as literal, so that
    // snake_case_name is a name and not a name with emphasis in the middle; an
    // asterisk has no such rule. One combined pattern gets this wrong either way.
    { name: 'bold', re: /\*\*(?=\S)([\s\S]*?\S)\*\*/, body: 1 },
    { name: 'bold', re: /(?<![\p{L}\p{N}_])__(?=\S)([\s\S]*?\S)__(?![\p{L}\p{N}_])/u, body: 1 },
    { name: 'italic', re: /\*(?=\S)([^*]*?\S)\*/, body: 1 },
    { name: 'italic', re: /(?<![\p{L}\p{N}_])_(?=\S)([^_]*?\S)_(?![\p{L}\p{N}_])/u, body: 1 },
    { name: 'strike', re: /~~(?=\S)([\s\S]*?\S)~~/, body: 1 },
    { name: 'autolink', re: /<(https?:\/\/[^>\s]+)>/ },
    { name: 'bare', re: /(^|[\s(])(https?:\/\/[^\s<>()]+)/ },
];

/**
 * Append inline-formatted markdown to a parent element.
 *
 * Finds the earliest match among the inline rules, emits the text before it as a
 * text node, emits the match as an element, and continues after it. Text never
 * goes anywhere but textContent, so no input can become markup.
 */
function _inline(parent, text, options) {
    let rest = String(text ?? '');

    while (rest) {
        let best = null;
        for (const rule of INLINE) {
            const m = rule.re.exec(rest);
            if (m && (!best || m.index < best.match.index)) best = { rule, match: m };
            // index 0 cannot be beaten, so stop looking.
            if (best && best.match.index === 0) break;
        }

        if (!best) {
            _text(parent, rest);
            return;
        }

        const { rule, match } = best;
        if (match.index > 0) _text(parent, rest.slice(0, match.index));

        const node = _inlineNode(rule.name, match, options, rule.body ?? 2);
        if (node) {
            parent.appendChild(node);
        } else {
            // A rule that declined (a rejected URL, for instance) emits its own
            // source text, so nothing is silently swallowed.
            _text(parent, match[0]);
        }

        rest = rest.slice(match.index + match[0].length);
    }
}

function _inlineNode(name, match, options, body) {
    switch (name) {
        case 'code': {
            const code = document.createElement('code');
            code.textContent = match[1];
            return code;
        }
        case 'image': {
            // Rendered as a link, not an <img>. A remote image in a shared page is
            // a request to a third party from every reader's browser, which leaks
            // their IP address and lets whoever hosts it count them. Making it a
            // link keeps the reference and leaves the fetch to the reader.
            const href = safeUrl(match[2]);
            if (!href) return null;
            const link = document.createElement('a');
            link.href = match[2];      // the original: safeUrl HTML-escapes its return
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.className = 'md-image-link';
            link.textContent = match[1] || match[3] || 'image';
            link.title = match[3] || `Image: ${match[2]}`;
            return link;
        }
        case 'wiki': {
            const target = match[1].trim();
            const shown = (match[2] ?? match[1]).trim();
            const resolved = options.resolveWikiLink?.(target) ?? null;

            const link = document.createElement('button');
            link.type = 'button';
            link.className = resolved ? 'md-wikilink' : 'md-wikilink md-unresolved';
            link.textContent = shown;
            link.title = resolved
                ? `Go to "${target}"`
                : `No node named "${target}" yet`;
            if (resolved) {
                link.addEventListener('click', () => options.onWikiLink?.(resolved));
            } else {
                link.disabled = true;
            }
            return link;
        }
        case 'link': {
            const href = safeUrl(match[2]);
            if (!href) return null;
            const link = document.createElement('a');
            link.href = match[2];
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = match[1] || match[2];
            if (match[3]) link.title = match[3];
            return link;
        }
        case 'bold': {
            const strong = document.createElement('strong');
            _inline(strong, match[body], options);
            return strong;
        }
        case 'italic': {
            const em = document.createElement('em');
            _inline(em, match[body], options);
            return em;
        }
        case 'strike': {
            const del = document.createElement('del');
            _inline(del, match[body], options);
            return del;
        }
        case 'autolink':
        case 'bare': {
            const url = name === 'autolink' ? match[1] : match[2];
            if (!safeUrl(url)) return null;
            const wrapper = document.createDocumentFragment();
            // The 'bare' rule captures the character before the URL so it does not
            // match mid-word; that character is text and has to be kept.
            if (name === 'bare' && match[1]) wrapper.appendChild(document.createTextNode(match[1]));
            const link = document.createElement('a');
            link.href = url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = url;
            wrapper.appendChild(link);
            return wrapper;
        }
        default:
            return null;
    }
}

/**
 * Append literal text, turning a hard line break into a <br>.
 *
 * Two trailing spaces or a backslash before a newline is markdown's hard break;
 * a plain newline inside a paragraph is a soft one and stays a space.
 */
function _text(parent, text) {
    const parts = text.split(/(?:  +|\\)\n/);
    parts.forEach((part, index) => {
        if (index > 0) parent.appendChild(document.createElement('br'));
        // A soft newline is whitespace, which is what a text node makes of it.
        if (part) parent.appendChild(document.createTextNode(part.replace(/\n/g, ' ')));
    });
}
