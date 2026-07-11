// src/data/obsidian/ObsidianParser.js
//
// Pure, environment-agnostic parsing of a single Obsidian Markdown note.
// No imports, no DOM, no Node APIs — safe to run in the browser or under Node
// (so it is unit-testable without the render stack).
//
// Design goal: most real notes have NO YAML frontmatter. Everything the graph
// needs (label, tags, type, excerpt) is therefore DERIVED from the note itself,
// and frontmatter — when present — only augments or overrides those defaults.

/**
 * Split raw note text into { frontmatter, body }.
 * Recognizes a leading `---\n ... \n---` block. If absent, frontmatter is {}.
 */
export function parseFrontmatter(raw) {
    const text = String(raw ?? '').replace(/\r\n/g, '\n');
    const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
    if (!m) return { frontmatter: {}, body: text };
    return { frontmatter: parseSimpleYaml(m[1]), body: text.slice(m[0].length) };
}

/**
 * Minimal YAML subset parser — enough for typical Obsidian frontmatter:
 *   key: value            |  tags: [a, b]      |  tags:
 *   quoted: "value"       |                    |    - a
 *                                                   - b
 * Not a full YAML implementation; unknown/complex shapes fall back to strings.
 */
export function parseSimpleYaml(src) {
    const out = {};
    const lines = String(src).split('\n');
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        if (!line.trim() || line.trim().startsWith('#')) { i++; continue; }

        const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
        if (!kv) { i++; continue; }
        const key = kv[1];
        let val = kv[2].trim();

        if (val === '') {
            // Possible block list on following indented lines.
            const items = [];
            let j = i + 1;
            while (j < lines.length && /^\s*-\s+/.test(lines[j])) {
                items.push(stripQuotes(lines[j].replace(/^\s*-\s+/, '').trim()));
                j++;
            }
            out[key] = items.length ? items : '';
            i = items.length ? j : i + 1;
            continue;
        }

        if (val.startsWith('[') && val.endsWith(']')) {
            out[key] = val.slice(1, -1).split(',')
                .map(s => stripQuotes(s.trim())).filter(Boolean);
        } else {
            out[key] = stripQuotes(val);
        }
        i++;
    }
    return out;
}

function stripQuotes(s) {
    return s.replace(/^["']/, '').replace(/["']$/, '');
}

/** Derive a human label: frontmatter title -> first `# H1` -> filename. */
export function deriveTitle(path, body, frontmatter = {}) {
    if (frontmatter.title) return String(frontmatter.title);
    const h1 = body.match(/^\s{0,3}#\s+(.+?)\s*$/m);
    if (h1) return h1[1].replace(/#+\s*$/, '').trim();
    return basename(path).replace(/\.md$/i, '');
}

/**
 * Inline `#tags` in the body (Obsidian style). Excludes fenced code blocks and
 * ATX headings (`# Heading` has a space after #; tags never do). A tag must
 * contain at least one non-digit so `#123` issue-style refs are ignored.
 */
export function extractInlineTags(body) {
    const withoutCode = String(body).replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '');
    const tags = new Set();
    const re = /(?:^|[\s(])#([A-Za-z0-9_][A-Za-z0-9_/-]*)/g;
    let m;
    while ((m = re.exec(withoutCode)) !== null) {
        const tag = m[1];
        if (/[A-Za-z_/-]/.test(tag)) tags.add(tag);
    }
    return [...tags];
}

/** `[[Target]]` / `[[Target|alias]]` / `[[Target#heading]]` -> ['Target', ...]. */
export function extractWikiLinks(body) {
    const withoutCode = String(body).replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '');
    const links = [];
    const re = /\[\[([^\]]+?)\]\]/g;
    let m;
    while ((m = re.exec(withoutCode)) !== null) {
        let target = m[1].split('|')[0].split('#')[0].trim();
        if (target) links.push(target);
    }
    return links;
}

/** Short plain-text preview: strip common Markdown, collapse whitespace. */
export function makeExcerpt(body, maxLen = 200) {
    let t = String(body)
        .replace(/```[\s\S]*?```/g, ' ')            // fenced code
        .replace(/`[^`]*`/g, ' ')                    // inline code
        .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')       // images
        .replace(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g, '$1') // wikilinks -> text
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')     // md links -> text
        .replace(/^\s{0,3}#{1,6}\s+/gm, '')          // headings
        .replace(/(?:^|\s)#[A-Za-z0-9_][A-Za-z0-9_/-]*/g, ' ') // inline #tags (kept as metadata)
        .replace(/[*_>~]/g, '')                      // emphasis/blockquote marks
        .replace(/^\s*[-*+]\s+/gm, '')               // list bullets
        .replace(/\s+/g, ' ')
        .trim();
    if (t.length <= maxLen) return t;
    return t.slice(0, maxLen - 1).trimEnd() + '…';
}

/** Infer a node type from frontmatter or a light heuristic. */
export function inferType(frontmatter = {}, tags = []) {
    const raw = frontmatter.type || frontmatter.archetype;
    if (raw) return String(raw).replace(/[^\w -]/g, '').trim() || 'note'; // strip emoji
    return 'note';
}

/**
 * Parse a note into a normalized descriptor. `path` is the vault-relative path
 * (using '/' separators), used for the title fallback.
 */
export function parseNote(path, raw) {
    const { frontmatter, body } = parseFrontmatter(raw);

    const fmTags = normalizeTags(frontmatter.tags);
    const inlineTags = extractInlineTags(body);
    const tags = [...new Set([...fmTags, ...inlineTags])];

    return {
        title: deriveTitle(path, body, frontmatter),
        tags,
        type: inferType(frontmatter, tags),
        links: extractWikiLinks(body),
        excerpt: makeExcerpt(body),
        frontmatter,
        body,
    };
}

function normalizeTags(t) {
    if (!t) return [];
    if (Array.isArray(t)) return t.map(x => String(x).replace(/^#/, '').trim()).filter(Boolean);
    // comma- or space-separated string
    return String(t).split(/[,\s]+/).map(x => x.replace(/^#/, '').trim()).filter(Boolean);
}

export function basename(path) {
    const p = String(path).replace(/\/+$/, '');
    const i = p.lastIndexOf('/');
    return i === -1 ? p : p.slice(i + 1);
}
