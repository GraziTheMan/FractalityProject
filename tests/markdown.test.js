// tests/markdown.test.js
//
// The renderer's contract has two halves and the second one is the one that
// matters.
//
// It should turn markdown into the right elements. It must NEVER turn any input
// into markup the author did not get through the renderer's own rules. The second
// half is why this renderer exists instead of a dependency, so the hostile cases
// are not an afterthought here — they are most of the file.
//
// jsdom rather than a hand-rolled shim: a shim would let a bug pass by
// implementing whatever the code happens to call. The security assertions are
// repeated against a real browser in scripts/browser-check.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body></body>');
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;

const { renderMarkdown, renderMarkdownInto, markdownSummary } =
    await import('../src/ui/markdown.js');

/** Render into a detached div so queries and innerHTML inspection are easy. */
function render(markdown, options) {
    const host = document.createElement('div');
    host.appendChild(renderMarkdown(markdown, options));
    return host;
}

const html = (markdown, options) => render(markdown, options).innerHTML;
const text = (markdown, options) => render(markdown, options).textContent;

// --- structure -------------------------------------------------------------

test('headings become h1 through h6', () => {
    for (let level = 1; level <= 6; level++) {
        const host = render(`${'#'.repeat(level)} Title`);
        assert.equal(host.firstChild.tagName, `H${level}`);
        assert.equal(host.firstChild.textContent, 'Title');
    }
});

test('seven hashes is not a heading', () => {
    assert.equal(render('####### Nope').firstChild.tagName, 'P');
});

test('a closing sequence of hashes is not part of the title', () => {
    assert.equal(render('## Title ##').firstChild.textContent, 'Title');
});

test('blank-line-separated blocks become separate paragraphs', () => {
    const host = render('First para.\n\nSecond para.');
    assert.equal(host.children.length, 2);
    assert.deepEqual([...host.children].map((c) => c.tagName), ['P', 'P']);
    assert.equal(host.children[1].textContent, 'Second para.');
});

test('a single newline inside a paragraph is a space, not a break', () => {
    const host = render('one\ntwo');
    assert.equal(host.children.length, 1);
    assert.equal(host.textContent, 'one two');
    assert.equal(host.querySelectorAll('br').length, 0);
});

test('two trailing spaces make a hard break', () => {
    const host = render('one  \ntwo');
    assert.equal(host.querySelectorAll('br').length, 1);
});

test('bullets become a ul with one li each', () => {
    const host = render('- one\n- two\n- three');
    assert.equal(host.firstChild.tagName, 'UL');
    assert.equal(host.querySelectorAll('li').length, 3);
    assert.equal(host.querySelectorAll('li')[2].textContent, 'three');
});

test('all three bullet markers work', () => {
    for (const marker of ['-', '*', '+']) {
        assert.equal(render(`${marker} item`).firstChild.tagName, 'UL');
    }
});

test('numbers become an ol', () => {
    const host = render('1. one\n2. two');
    assert.equal(host.firstChild.tagName, 'OL');
    assert.equal(host.querySelectorAll('li').length, 2);
});

test('an ordered list keeps the number it starts at', () => {
    assert.equal(render('3. three\n4. four').firstChild.getAttribute('start'), '3');
});

test('indentation nests a list inside the item above it', () => {
    const host = render('- outer\n  - inner\n  - inner two\n- outer two');
    const top = host.firstChild;
    assert.equal(top.children.length, 2, 'two top-level items');
    const nested = top.children[0].querySelector('ul');
    assert.ok(nested, 'the first item holds a nested list');
    assert.equal(nested.querySelectorAll('li').length, 2);
});

test('a numbered list after bullets is not absorbed into them', () => {
    const host = render('- bullet\n1. number');
    assert.deepEqual([...host.children].map((c) => c.tagName), ['UL', 'OL']);
});

test('a fenced block is code, and its content is literal', () => {
    const host = render('```\n**not bold**\n```');
    assert.equal(host.firstChild.tagName, 'PRE');
    assert.equal(host.querySelector('code').textContent, '**not bold**');
    assert.equal(host.querySelectorAll('strong').length, 0);
});

test('a fence language becomes a class and a data attribute', () => {
    const host = render('```js\nconst x = 1;\n```');
    assert.equal(host.querySelector('code').className, 'language-js');
    assert.equal(host.firstChild.dataset.language, 'js');
});

test('a hostile fence language cannot become a class', () => {
    const host = render('```js" onload="alert(1)\nx\n```');
    assert.equal(host.querySelector('code').className, '');
});

test('an unclosed fence runs to the end rather than losing the rest', () => {
    // Half-written notes are normal; dropping everything after a stray ``` while
    // typing would look like the editor ate the page.
    const host = render('```\nstill here\nand here');
    assert.equal(host.firstChild.tagName, 'PRE');
    assert.match(host.textContent, /still here/);
    assert.match(host.textContent, /and here/);
});

test('tildes fence as well as backticks', () => {
    assert.equal(render('~~~\ncode\n~~~').firstChild.tagName, 'PRE');
});

test('a four-space indented block is code', () => {
    const host = render('    indented code');
    assert.equal(host.firstChild.tagName, 'PRE');
    assert.equal(host.querySelector('code').textContent, 'indented code');
});

test('a quote becomes a blockquote and its markdown still renders', () => {
    const host = render('> **strong** inside a quote');
    assert.equal(host.firstChild.tagName, 'BLOCKQUOTE');
    assert.equal(host.querySelector('strong').textContent, 'strong');
});

test('a rule becomes an hr', () => {
    for (const rule of ['---', '***', '___']) {
        assert.equal(render(rule).firstChild.tagName, 'HR');
    }
});

test('a table becomes a real table with a head and a body', () => {
    const host = render('| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |');
    assert.equal(host.firstChild.tagName, 'TABLE');
    assert.equal(host.querySelectorAll('thead th').length, 2);
    assert.equal(host.querySelectorAll('tbody tr').length, 2);
    assert.equal(host.querySelectorAll('tbody td')[3].textContent, '4');
});

test('a task list renders a disabled checkbox in the right state', () => {
    const host = render('- [x] done\n- [ ] not done');
    const boxes = host.querySelectorAll('input[type=checkbox]');
    assert.equal(boxes.length, 2);
    assert.equal(boxes[0].checked, true);
    assert.equal(boxes[1].checked, false);
    // A tick here would change the view without changing the markdown behind it,
    // which reads as a save that silently did not happen.
    assert.equal(boxes[0].disabled, true);
});

// --- inline ----------------------------------------------------------------

test('bold, italic, strikethrough and code each get their element', () => {
    const host = render('**b** _i_ ~~s~~ `c`');
    assert.equal(host.querySelector('strong').textContent, 'b');
    assert.equal(host.querySelector('em').textContent, 'i');
    assert.equal(host.querySelector('del').textContent, 's');
    assert.equal(host.querySelector('code').textContent, 'c');
});

test('code spans win over everything inside them', () => {
    const host = render('`**stars** and [a](http://x.test)`');
    assert.equal(host.querySelectorAll('strong').length, 0);
    assert.equal(host.querySelectorAll('a').length, 0);
    assert.equal(host.querySelector('code').textContent, '**stars** and [a](http://x.test)');
});

test('emphasis nests', () => {
    const host = render('**bold with _italic_ inside**');
    assert.equal(host.querySelector('strong em').textContent, 'italic');
});

test('an underscore inside a word is not emphasis', () => {
    assert.equal(render('snake_case_name').querySelectorAll('em').length, 0);
});

test('double markers are bold, not italic wrapped in stray asterisks', () => {
    // Both rules can match here; bold starts one character earlier and must win.
    for (const source of ['**bold**', '__bold__']) {
        const host = render(source);
        assert.equal(host.querySelector('strong')?.textContent, 'bold', source);
        assert.equal(host.querySelectorAll('em').length, 0, source);
        assert.equal(host.textContent, 'bold', source);
    }
});

test('single markers are italic', () => {
    for (const source of ['*it*', '_it_']) {
        assert.equal(render(source).querySelector('em')?.textContent, 'it', source);
    }
});

test('an asterisk inside a word still emphasises, unlike an underscore', () => {
    // Not symmetry for its own sake: this is what markdown specifies, and code
    // identifiers are the reason the underscore rule exists.
    assert.equal(render('foo*bar*baz').querySelector('em')?.textContent, 'bar');
    assert.equal(render('foo_bar_baz').querySelectorAll('em').length, 0);
});

test('an underscored identifier survives in every position', () => {
    for (const source of ['snake_case_name', 'a __b__ c d_e_f', '_leading and trailing_ x_y_z']) {
        const host = render(source);
        assert.match(host.textContent, /_/, `${source} lost its underscores`);
    }
});

test('a double underscore at a word boundary is still bold', () => {
    assert.equal(render('an __emphatic__ word').querySelector('strong')?.textContent, 'emphatic');
});

test('a link gets its href, its text and noopener', () => {
    const host = render('[Fractiverse](https://fractiverse.com/page)');
    const link = host.querySelector('a');
    assert.equal(link.getAttribute('href'), 'https://fractiverse.com/page');
    assert.equal(link.textContent, 'Fractiverse');
    assert.match(link.rel, /noopener/);
});

test("a link's query string is not mangled on the way to href", () => {
    // safeUrl HTML-escapes its return value, so assigning THAT would turn & into
    // &amp; and change the URL. The original has to be assigned.
    const host = render('[q](https://x.test/s?a=1&b=2)');
    assert.equal(host.querySelector('a').getAttribute('href'), 'https://x.test/s?a=1&b=2');
});

test('a bare URL becomes a link without eating the text around it', () => {
    const host = render('see https://x.test/page for more');
    assert.equal(host.querySelector('a').getAttribute('href'), 'https://x.test/page');
    assert.match(host.textContent, /^see https:\/\/x\.test\/page for more$/);
});

test('an angle-bracket autolink works', () => {
    assert.equal(render('<https://x.test/a>').querySelector('a').getAttribute('href'),
        'https://x.test/a');
});

test('an image renders as a link, not an img', () => {
    // A remote image in a shared page fetches from a third party in every reader's
    // browser, leaking their IP and letting the host count them.
    const host = render('![a diagram](https://x.test/d.png)');
    assert.equal(host.querySelectorAll('img').length, 0);
    const link = host.querySelector('a');
    assert.equal(link.getAttribute('href'), 'https://x.test/d.png');
    assert.equal(link.textContent, 'a diagram');
});

// --- wiki links ------------------------------------------------------------

test('a wiki link to a known node is clickable and reports the id', () => {
    const seen = [];
    const host = render('See [[Duality]].', {
        resolveWikiLink: (t) => (t === 'Duality' ? 'node-duality' : null),
        onWikiLink: (id) => seen.push(id),
    });
    const button = host.querySelector('.md-wikilink');
    assert.equal(button.textContent, 'Duality');
    assert.equal(button.disabled, false);
    button.click();
    assert.deepEqual(seen, ['node-duality']);
});

test('a wiki link to a node that does not exist is shown but inert', () => {
    // A page often refers to something not created yet. Hiding the reference would
    // lose the author's intent; making it clickable would go nowhere.
    const host = render('[[Not Yet]]', { resolveWikiLink: () => null });
    const button = host.querySelector('.md-wikilink');
    assert.equal(button.textContent, 'Not Yet');
    assert.ok(button.classList.contains('md-unresolved'));
    assert.equal(button.disabled, true);
});

test('a piped wiki link shows the label and resolves the target', () => {
    const host = render('[[duality|the second thing]]', {
        resolveWikiLink: (t) => (t === 'duality' ? 'n2' : null),
    });
    assert.equal(host.querySelector('.md-wikilink').textContent, 'the second thing');
    assert.equal(host.querySelector('.md-wikilink').disabled, false);
});

test('a wiki link is a button, so it cannot carry a URL at all', () => {
    const host = render('[[javascript:alert(1)]]', { resolveWikiLink: () => 'n1' });
    const el = host.querySelector('.md-wikilink');
    assert.equal(el.tagName, 'BUTTON');
    assert.equal(el.getAttribute('href'), null);
});

// --- hostile input ---------------------------------------------------------

test('a script tag is text, not a script', () => {
    const host = render('<script>alert(1)</script>');
    assert.equal(host.querySelectorAll('script').length, 0);
    assert.match(host.textContent, /<script>alert\(1\)<\/script>/);
    // The angle brackets must be escaped in the serialised HTML, which is what
    // proves they arrived as a text node rather than as markup.
    assert.match(host.innerHTML, /&lt;script&gt;/);
});

test('an img with an onerror handler is text', () => {
    const host = render('<img src=x onerror="alert(1)">');
    assert.equal(host.querySelectorAll('img').length, 0);
    assert.equal(host.querySelectorAll('[onerror]').length, 0);
});

test('a javascript: link is refused and its source shown instead', () => {
    const host = render('[click](javascript:alert(1))');
    assert.equal(host.querySelectorAll('a').length, 0);
    // Nothing is silently swallowed: the author sees what they wrote.
    assert.match(host.textContent, /\[click\]\(javascript:alert\(1\)\)/);
});

test('a javascript: scheme split by a control character is still refused', () => {
    assert.equal(render('[x](java\tscript:alert(1))').querySelectorAll('a').length, 0);
});

test('a data: URL link is refused', () => {
    assert.equal(
        render('[x](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)')
            .querySelectorAll('a').length,
        0);
});

test('a vbscript: link is refused', () => {
    assert.equal(render('[x](vbscript:msgbox(1))').querySelectorAll('a').length, 0);
});

test('a javascript: image is refused', () => {
    assert.equal(render('![x](javascript:alert(1))').querySelectorAll('a').length, 0);
});

test('an html comment does not open a way out', () => {
    const host = render('<!-- --><script>alert(1)</script><!-- -->');
    assert.equal(host.querySelectorAll('script').length, 0);
    assert.equal(host.innerHTML.includes('<script'), false);
});

test('a quoted attribute break in link text stays text', () => {
    const host = render('[a" onmouseover="alert(1)](https://x.test)');
    const link = host.querySelector('a');
    assert.equal(link.getAttribute('onmouseover'), null);
    assert.equal(link.textContent, 'a" onmouseover="alert(1)');
});

test('an svg with an onload handler is text', () => {
    const host = render('<svg onload="alert(1)"></svg>');
    assert.equal(host.querySelectorAll('svg').length, 0);
    assert.equal(host.querySelectorAll('[onload]').length, 0);
});

test('no input produces a single element that was not created by a rule', () => {
    // A sweep rather than a list of vectors: whatever these strings do, the result
    // may only contain tags this renderer is documented to emit.
    const allowed = new Set([
        'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'PRE', 'CODE',
        'BLOCKQUOTE', 'HR', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'A',
        'STRONG', 'EM', 'DEL', 'BR', 'BUTTON', 'INPUT',
    ]);
    const hostile = [
        '<iframe src="https://evil.test"></iframe>',
        '<object data="x"></object>',
        '<embed src="x">',
        '<style>body{display:none}</style>',
        '<link rel=stylesheet href=x>',
        '<meta http-equiv=refresh content=0>',
        '<form action=x><input name=p></form>',
        '<base href="https://evil.test/">',
        '# <script>x</script>',
        '- <img src=x onerror=alert(1)>',
        '> <iframe></iframe>',
        '`<script>x</script>`',
        '| <script>x</script> |\n|---|\n| y |',
        '**<svg/onload=alert(1)>**',
        '[[<script>x</script>]]',
    ];

    for (const source of hostile) {
        const host = render(source, { resolveWikiLink: () => 'n1' });
        for (const el of host.querySelectorAll('*')) {
            assert.ok(allowed.has(el.tagName),
                `"${source}" produced a <${el.tagName.toLowerCase()}>`);
        }
    }
});

test('no input produces an event-handler attribute', () => {
    const sources = [
        '<div onclick="alert(1)">x</div>',
        '[a](https://x.test "t\\" onclick=\\"alert(1)")',
        '```html\n<b onclick="alert(1)">\n```',
        '![a" onerror="alert(1)](https://x.test/i.png)',
    ];
    for (const source of sources) {
        const host = render(source);
        for (const el of host.querySelectorAll('*')) {
            for (const attr of el.attributes) {
                assert.equal(attr.name.startsWith('on'), false,
                    `"${source}" produced ${attr.name}`);
            }
        }
    }
});

// --- renderMarkdownInto ----------------------------------------------------

test('rendering into an element replaces what was there', () => {
    const host = document.createElement('div');
    host.appendChild(document.createTextNode('old'));
    renderMarkdownInto(host, '# new');
    assert.equal(host.children.length, 1);
    assert.equal(host.firstChild.tagName, 'H1');
    assert.equal(host.textContent, 'new');
});

test('rendering empty markdown leaves an empty element', () => {
    const host = document.createElement('div');
    host.appendChild(document.createTextNode('old'));
    renderMarkdownInto(host, '');
    assert.equal(host.childNodes.length, 0);
});

test('null and undefined render as nothing rather than as words', () => {
    assert.equal(text(null), '');
    assert.equal(text(undefined), '');
});

// --- summaries -------------------------------------------------------------

test('a summary strips markdown syntax', () => {
    assert.equal(markdownSummary('# Duality\n\nFrom **the Fractiverse**.'),
        'Duality From the Fractiverse.');
});

test('a summary drops code blocks rather than quoting them', () => {
    assert.equal(markdownSummary('Text.\n\n```js\nconst x = 1;\n```\n\nMore.'),
        'Text. More.');
});

test('a summary shows a link label, not its URL', () => {
    assert.equal(markdownSummary('See [the docs](https://x.test/a/b/c).'), 'See the docs.');
});

test('a summary shows a wiki link label', () => {
    assert.equal(markdownSummary('Flows into [[Duality]].'), 'Flows into Duality.');
});

test('a summary is cut at a word boundary and marked as cut', () => {
    const summary = markdownSummary(`${'word '.repeat(60)}`, 40);
    assert.ok(summary.length <= 41, summary);
    assert.match(summary, /…$/);
    assert.doesNotMatch(summary, /wor…$/, 'cut mid-word');
});

test('a summary shorter than the limit is not marked as cut', () => {
    assert.equal(markdownSummary('Short.', 40), 'Short.');
});

test('an empty page summarises to an empty string', () => {
    assert.equal(markdownSummary(''), '');
    assert.equal(markdownSummary(null), '');
});
