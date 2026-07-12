// src/ui/ContentViewer.js
//
// Reads the focused node's body from the content tier (IndexedDB) and renders
// it as Markdown in a docked side panel. This is the "open a node -> read its
// note" half of the experience; the 3D graph is the "see it" half.
//
// Safe by construction: note text is HTML-escaped before any Markdown
// formatting is applied, so a note containing raw HTML/script cannot inject.

import { ContentStore } from '../data/ContentStore.js';

export class ContentViewer {
    /**
     * @param {object} opts
     * @param {(nodeId:string)=>void} [opts.onNavigate]  called when a wikilink is clicked
     * @param {ContentStore} [opts.contentStore]
     */
    constructor({ onNavigate = null, contentStore = null } = {}) {
        this.onNavigate = onNavigate;
        this.store = contentStore || new ContentStore();
        this.el = null;
        this.bodyEl = null;
        this.titleEl = null;
        this.visible = false;
        this._reqId = 0;
    }

    init() {
        if (this.el) return;
        this._injectStyles();

        const panel = document.createElement('div');
        panel.className = 'content-viewer hidden';
        panel.innerHTML = `
            <div class="cv-header">
                <span class="cv-title"></span>
                <button class="cv-close" title="Close">✕</button>
            </div>
            <div class="cv-body"></div>
        `;
        document.body.appendChild(panel);

        this.el = panel;
        this.titleEl = panel.querySelector('.cv-title');
        this.bodyEl = panel.querySelector('.cv-body');

        panel.querySelector('.cv-close').addEventListener('click', () => this.hide());

        // Delegate wikilink clicks to navigation.
        this.bodyEl.addEventListener('click', (e) => {
            const a = e.target.closest('a.wikilink');
            if (!a) return;
            e.preventDefault();
            if (this.onNavigate) this.onNavigate(a.dataset.target);
        });
    }

    /** Show a node's content. Metadata-only nodes show their excerpt. */
    async show(node) {
        if (!node) return;
        this.init();

        const reqId = ++this._reqId;            // guard against out-of-order loads
        this.titleEl.textContent = node.metadata?.label || node.id;
        this.el.classList.remove('hidden');
        this.visible = true;

        const hasContent = !!node.metadata?.contentRef;
        if (!hasContent) {
            const excerpt = node.metadata?.excerpt;
            this.bodyEl.innerHTML = excerpt
                ? `<p class="cv-muted">${escapeHtml(excerpt)}</p>`
                : `<p class="cv-muted">No content for this node.</p>`;
            return;
        }

        this.bodyEl.innerHTML = `<p class="cv-muted">Loading…</p>`;
        let raw = null;
        try {
            raw = await this.store.get(node.id);
        } catch (_) { /* fall through */ }

        if (reqId !== this._reqId) return;      // a newer show() superseded this
        this.bodyEl.innerHTML = raw != null
            ? renderMarkdown(stripFrontmatter(raw))
            : `<p class="cv-muted">Content not found in store.</p>`;
        this.bodyEl.scrollTop = 0;
    }

    hide() {
        if (!this.el) return;
        this.el.classList.add('hidden');
        this.visible = false;
    }

    _injectStyles() {
        if (document.getElementById('content-viewer-styles')) return;
        const style = document.createElement('style');
        style.id = 'content-viewer-styles';
        style.textContent = `
            .content-viewer {
                position: fixed; top: 0; right: 0; height: 100vh; width: min(380px, 92vw);
                background: rgba(10,10,14,0.92); color: #e4e4e7; z-index: 1001;
                border-left: 1px solid #333; backdrop-filter: blur(10px);
                display: flex; flex-direction: column; transition: transform .25s ease;
                font-family: 'Inter', -apple-system, system-ui, sans-serif;
            }
            .content-viewer.hidden { transform: translateX(100%); }
            .cv-header {
                display: flex; align-items: center; justify-content: space-between;
                padding: 14px 16px; border-bottom: 1px solid #2a2a2a; flex: 0 0 auto;
            }
            .cv-title { font-weight: 600; font-size: 15px; color: #a78bfa;
                overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .cv-close { background: none; border: none; color: #a1a1aa; cursor: pointer;
                font-size: 16px; padding: 2px 6px; }
            .cv-close:hover { color: #fff; }
            .cv-body { padding: 16px; overflow-y: auto; flex: 1 1 auto; line-height: 1.6;
                font-size: 14px; }
            .cv-body h1, .cv-body h2, .cv-body h3 { color: #f4f4f5; margin: 14px 0 6px; line-height: 1.3; }
            .cv-body h1 { font-size: 20px; } .cv-body h2 { font-size: 17px; } .cv-body h3 { font-size: 15px; }
            .cv-body p { margin: 8px 0; } .cv-body ul { margin: 8px 0; padding-left: 20px; }
            .cv-body code { background: #26262b; padding: 1px 5px; border-radius: 4px; font-size: 13px; }
            .cv-body pre { background: #18181b; padding: 12px; border-radius: 8px; overflow-x: auto; }
            .cv-body pre code { background: none; padding: 0; }
            .cv-body a { color: #6ee7b7; text-decoration: none; } .cv-body a:hover { text-decoration: underline; }
            .cv-body a.wikilink { color: #f0abfc; cursor: pointer; }
            .cv-muted { color: #a1a1aa; font-style: italic; }
        `;
        document.head.appendChild(style);
    }
}

// --- rendering helpers (pure) ---

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function stripFrontmatter(raw) {
    const t = String(raw).replace(/\r\n/g, '\n');
    const m = t.match(/^---\n[\s\S]*?\n---\n?/);
    return m ? t.slice(m[0].length) : t;
}

/**
 * Minimal, safe Markdown -> HTML. Escapes first, then applies a small set of
 * formatting rules (headings, bold/italic, code, links, wikilinks, lists).
 * Not a full CommonMark implementation — enough to read a note comfortably.
 */
export function renderMarkdown(md) {
    const lines = escapeHtml(md).split('\n');
    const html = [];
    let inCode = false, inList = false;

    const closeList = () => { if (inList) { html.push('</ul>'); inList = false; } };

    for (let line of lines) {
        if (/^\s*```/.test(line)) {
            if (!inCode) { closeList(); html.push('<pre><code>'); inCode = true; }
            else { html.push('</code></pre>'); inCode = false; }
            continue;
        }
        if (inCode) { html.push(line); continue; }

        const h = line.match(/^(#{1,3})\s+(.*)$/);
        if (h) { closeList(); html.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); continue; }

        if (/^\s*[-*+]\s+/.test(line)) {
            if (!inList) { html.push('<ul>'); inList = true; }
            html.push(`<li>${inline(line.replace(/^\s*[-*+]\s+/, ''))}</li>`);
            continue;
        }

        closeList();
        if (line.trim() === '') { html.push(''); continue; }
        html.push(`<p>${inline(line)}</p>`);
    }
    if (inCode) html.push('</code></pre>');
    closeList();
    return html.join('\n');
}

function inline(s) {
    return s
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g,
            (_, t) => `<a class="wikilink" data-target="${t.trim()}">${t.trim()}</a>`)
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/__([^_]+)__/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        .replace(/(^|[^\w])_([^_]+)_(?=[^\w]|$)/g, '$1<em>$2</em>');
}
