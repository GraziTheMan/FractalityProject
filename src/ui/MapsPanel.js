// src/ui/MapsPanel.js
//
// Cloud map browser: list, load, save and share.
//
// Degrades in three stages rather than breaking:
//   * no VITE_API_BASE      -> panel explains the app is in local-only mode
//   * API but no auth       -> public maps are browsable, saving is unavailable
//   * signed in             -> full list/save/share
//
// All user-authored text (map titles, descriptions, owner names, error details
// from the server) is rendered with textContent or escaped, never interpolated
// raw into innerHTML.

import { mindMapClient, MindMapClient, ApiError } from '../api/mindMapClient.js';
import { apiMapToNodeGraph, graphToCreatePayload, nodeGraphToApiNodes, findRootId } from '../api/graphAdapter.js';
import { hasAuth, getAuthState, onAuthChange, signIn, signOut } from '../auth/clerkClient.js';

export class MapsPanel {
    /**
     * @param {object} options
     * @param {() => object|null} options.getGraph current NodeGraph, for saving
     * @param {(graph: object, meta: object) => Promise<void>} options.onLoadMap
     * @param {(msg: string, type?: string) => void} [options.notify]
     */
    constructor(options = {}) {
        this.getGraph = options.getGraph ?? (() => null);
        this.onLoadMap = options.onLoadMap ?? (async () => {});
        this.notify = options.notify ?? ((m) => console.log(m));

        this.client = options.client ?? mindMapClient;
        this.container = null;
        this.listEl = null;
        this.isOpen = false;

        /** The map currently loaded from the cloud, if any. */
        this.currentMap = null;

        this._unsubscribe = null;
    }

    init() {
        if (this.container) return;

        this.container = document.createElement('div');
        this.container.className = 'maps-panel hidden';
        this.container.innerHTML = `
            <div class="maps-header">
                <h3>🗺 Cloud Maps</h3>
                <div class="maps-account"></div>
                <button class="maps-close" title="Close">✕</button>
            </div>
            <div class="maps-actions">
                <button class="maps-save" title="Save the current view as a new map">💾 Save current</button>
                <button class="maps-refresh" title="Reload the list">🔄</button>
            </div>
            <div class="maps-list"></div>
            <div class="maps-status"></div>
        `;

        document.body.appendChild(this.container);
        this.listEl = this.container.querySelector('.maps-list');
        this.statusEl = this.container.querySelector('.maps-status');
        this.accountEl = this.container.querySelector('.maps-account');

        this.container.querySelector('.maps-close')
            .addEventListener('click', () => this.hide());
        this.container.querySelector('.maps-refresh')
            .addEventListener('click', () => this.refresh());
        this.container.querySelector('.maps-save')
            .addEventListener('click', () => this.saveCurrent());

        this._injectStyles();

        if (hasAuth()) {
            this._unsubscribe = onAuthChange(() => this._renderAccount());
        }
        this._renderAccount();
    }

    // --- visibility --------------------------------------------------------

    show() {
        this.init();
        this.container.classList.remove('hidden');
        this.isOpen = true;
        this.refresh();
    }

    hide() {
        if (this.container) this.container.classList.add('hidden');
        this.isOpen = false;
    }

    toggle() {
        this.isOpen ? this.hide() : this.show();
    }

    destroy() {
        if (this._unsubscribe) this._unsubscribe();
        if (this.container) this.container.remove();
        this.container = null;
    }

    // --- account -----------------------------------------------------------

    _renderAccount() {
        if (!this.accountEl) return;
        this.accountEl.innerHTML = '';

        if (!hasAuth()) {
            const note = document.createElement('span');
            note.className = 'maps-note';
            note.textContent = 'accounts not configured';
            this.accountEl.appendChild(note);
            return;
        }

        const state = getAuthState();
        const button = document.createElement('button');
        button.className = 'maps-auth-button';

        if (state.signedIn) {
            button.textContent = `Sign out (${state.user.name})`;
            button.addEventListener('click', async () => {
                await signOut();
                this.refresh();
            });
        } else {
            button.textContent = 'Sign in';
            button.addEventListener('click', async () => {
                try {
                    await signIn();
                } catch (error) {
                    this.notify(error.message, 'error');
                }
            });
        }

        this.accountEl.appendChild(button);
    }

    _setStatus(text, type = 'info') {
        if (!this.statusEl) return;
        this.statusEl.textContent = text || '';
        this.statusEl.className = `maps-status ${type}`;
    }

    // --- listing -----------------------------------------------------------

    async refresh() {
        this.init();
        this._renderAccount();

        if (!this.client.available) {
            this.listEl.innerHTML = '';
            this._setStatus(
                'Local-only mode: set VITE_API_BASE to enable saving and sharing.',
                'warning'
            );
            return;
        }

        this._setStatus('Loading…');

        try {
            const signedIn = hasAuth() && getAuthState().signedIn;
            const maps = signedIn
                ? await this.client.listMyMaps()
                : await this.client.listPublicMaps();

            this._renderList(maps, signedIn);
            this._setStatus(
                maps.length === 0
                    ? signedIn
                        ? 'No maps yet. Save the current view to create one.'
                        : 'No public maps yet.'
                    : signedIn
                        ? `${maps.length} map(s)`
                        : `${maps.length} public map(s) — sign in to save your own`
            );
        } catch (error) {
            this.listEl.innerHTML = '';
            this._setStatus(this._describe(error), 'error');
        }
    }

    _renderList(maps, signedIn) {
        this.listEl.innerHTML = '';

        for (const map of maps) {
            const item = document.createElement('div');
            item.className = 'maps-item';
            if (this.currentMap && this.currentMap.id === map.id) {
                item.classList.add('current');
            }

            const title = document.createElement('div');
            title.className = 'maps-item-title';
            // textContent: titles are user-authored
            title.textContent = map.title || 'Untitled';

            const meta = document.createElement('div');
            meta.className = 'maps-item-meta';
            const owner = map.owner_name ? ` · ${map.owner_name}` : '';
            meta.textContent =
                `${map.node_count} nodes · ${map.visibility}${owner}`;

            const actions = document.createElement('div');
            actions.className = 'maps-item-actions';

            const openBtn = document.createElement('button');
            openBtn.textContent = 'Open';
            openBtn.addEventListener('click', () => this.loadMap(map.id));
            actions.appendChild(openBtn);

            // Only the owner can overwrite or share
            if (signedIn) {
                const saveBtn = document.createElement('button');
                saveBtn.textContent = 'Overwrite';
                saveBtn.title = 'Replace this map with the current view';
                saveBtn.addEventListener('click', () => this.overwrite(map.id));
                actions.appendChild(saveBtn);

                const shareBtn = document.createElement('button');
                shareBtn.textContent = 'Share';
                shareBtn.addEventListener('click', () => this.share(map.id));
                actions.appendChild(shareBtn);

                const delBtn = document.createElement('button');
                delBtn.textContent = 'Delete';
                delBtn.className = 'danger';
                delBtn.addEventListener('click', () => this.remove(map));
                actions.appendChild(delBtn);
            }

            item.append(title, meta, actions);
            this.listEl.appendChild(item);
        }
    }

    // --- operations --------------------------------------------------------

    /**
     * Load a map into the engine.
     * @param {string} mapId
     * @param {string} [shareToken] for maps reached via a share link
     */
    async loadMap(mapId, shareToken) {
        this._setStatus('Opening…');

        try {
            const apiMap = await this.client.getMap(mapId, { shareToken });
            const graph = apiMapToNodeGraph(apiMap);

            await this.onLoadMap(graph, apiMap);
            this.currentMap = apiMap;

            this._setStatus(`Opened "${apiMap.title}"`);
            this.notify(`Opened "${apiMap.title}"`);
            return apiMap;
        } catch (error) {
            this._setStatus(this._describe(error), 'error');
            this.notify(this._describe(error), 'error');
            return null;
        }
    }

    async saveCurrent() {
        const graph = this.getGraph();
        if (!graph || graph.nodes.size === 0) {
            this.notify('Nothing to save — load or generate a map first', 'warning');
            return;
        }

        if (hasAuth() && !getAuthState().signedIn) {
            this.notify('Sign in to save maps', 'warning');
            return;
        }

        const title = prompt('Name this map:', this.currentMap?.title || 'My Mind Map');
        if (!title) return;

        this._setStatus('Saving…');

        try {
            const payload = graphToCreatePayload(graph, { title });
            const created = await this.client.createMap(payload);

            this.currentMap = created;
            this.notify(`Saved "${created.title}" (${created.node_count} nodes)`);
            await this.refresh();
        } catch (error) {
            this._setStatus(this._describe(error), 'error');
            this.notify(this._describe(error), 'error');
        }
    }

    async overwrite(mapId) {
        const graph = this.getGraph();
        if (!graph || graph.nodes.size === 0) {
            this.notify('Nothing to save', 'warning');
            return;
        }

        if (!confirm('Replace that map\'s contents with the current view?')) return;

        this._setStatus('Saving…');

        try {
            const nodes = nodeGraphToApiNodes(graph);
            const updated = await this.client.saveNodes(mapId, nodes, {
                rootId: findRootId(graph)
            });

            this.currentMap = updated;
            this.notify(`Updated "${updated.title}" (${updated.node_count} nodes)`);
            await this.refresh();
        } catch (error) {
            this._setStatus(this._describe(error), 'error');
            this.notify(this._describe(error), 'error');
        }
    }

    async share(mapId) {
        try {
            const link = await this.client.createShareLink(mapId, { permission: 'view' });
            const url = MindMapClient.shareUrl(mapId, link.token);

            // Clipboard access can be denied; fall back to showing the URL
            try {
                await navigator.clipboard.writeText(url);
                this.notify('Share link copied to clipboard');
            } catch {
                this._showShareUrl(url);
            }
        } catch (error) {
            this.notify(this._describe(error), 'error');
        }
    }

    _showShareUrl(url) {
        const wrap = document.createElement('div');
        wrap.className = 'maps-share-url';

        const label = document.createElement('div');
        label.textContent = 'Share link:';

        const input = document.createElement('input');
        input.type = 'text';
        input.readOnly = true;
        input.value = url;
        input.addEventListener('focus', () => input.select());

        wrap.append(label, input);
        this.statusEl.innerHTML = '';
        this.statusEl.appendChild(wrap);
        input.focus();
    }

    async remove(map) {
        if (!confirm(`Delete "${map.title}"? This cannot be undone.`)) return;

        try {
            await this.client.deleteMap(map.id);
            if (this.currentMap?.id === map.id) this.currentMap = null;
            this.notify(`Deleted "${map.title}"`);
            await this.refresh();
        } catch (error) {
            this.notify(this._describe(error), 'error');
        }
    }

    /** Turn an error into something safe and useful to show a user. */
    _describe(error) {
        if (error instanceof ApiError) {
            if (error.status === 0) return 'No API configured';
            if (error.isAuthError) return 'Sign in to do that';
            if (error.isNotFound) return 'Not found';
            if (error.status === 503) return 'Server is not ready (database or auth unconfigured)';
            return `Server error (${error.status}): ${error.message}`;
        }

        // A cross-origin fetch that never reaches the server throws a bare
        // TypeError whose message is the useless string "Failed to fetch" (or
        // "Load failed" in Safari). The browser deliberately withholds the
        // reason — that is a same-origin-policy protection, not something we
        // can interrogate — so the honest answer is to name the likely causes.
        //
        // On a free Render instance the overwhelmingly common one is cold start:
        // the service spins down when idle and the first request after that
        // fails while it wakes.
        if (this._isNetworkError(error)) {
            return 'Could not reach the server. It may be waking up from '
                 + 'idle — wait a few seconds and press \u{1f504} to retry.';
        }

        return error?.message || 'Something went wrong';
    }

    /**
     * True for a fetch that failed before getting a response at all.
     *
     * Matched by shape rather than message text, because the message differs
     * per browser: Chrome "Failed to fetch", Safari "Load failed", Firefox
     * "NetworkError when attempting to fetch resource".
     */
    _isNetworkError(error) {
        if (!error) return false;
        if (error.name === 'AbortError' || error.name === 'TimeoutError') return true;
        if (!(error instanceof TypeError)) return false;
        return /fetch|network|load failed/i.test(error.message || '');
    }

    _injectStyles() {
        if (document.getElementById('maps-panel-styles')) return;

        const style = document.createElement('style');
        style.id = 'maps-panel-styles';
        style.textContent = `
            .maps-panel {
                position: fixed;
                /* Left side: the performance dashboard occupies the top-right,
                   and the state indicator sits above at top-left. */
                top: 64px;
                left: 16px;
                width: 340px;
                max-height: 70vh;
                display: flex;
                flex-direction: column;
                background: rgba(0, 0, 0, 0.92);
                border: 1px solid #333;
                border-radius: 10px;
                backdrop-filter: blur(12px);
                color: #fff;
                z-index: 1001;
                font-size: 13px;
            }
            .maps-panel.hidden { display: none; }
            .maps-header {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 10px 12px;
                border-bottom: 1px solid #222;
            }
            .maps-header h3 {
                margin: 0;
                font-size: 13px;
                color: #0ff;
                text-transform: uppercase;
                letter-spacing: 1px;
                flex: 1;
            }
            .maps-close, .maps-refresh, .maps-save, .maps-auth-button,
            .maps-item-actions button {
                background: rgba(255,255,255,0.06);
                color: #fff;
                border: 1px solid #333;
                border-radius: 6px;
                padding: 4px 8px;
                font-size: 11px;
                font-family: inherit;
                cursor: pointer;
            }
            .maps-close:hover, .maps-refresh:hover, .maps-save:hover,
            .maps-auth-button:hover, .maps-item-actions button:hover {
                border-color: #0ff;
            }
            .maps-item-actions button.danger:hover { border-color: #ef4444; }
            .maps-actions {
                display: flex;
                gap: 6px;
                padding: 8px 12px;
                border-bottom: 1px solid #222;
            }
            .maps-actions .maps-save { flex: 1; }
            .maps-list { overflow-y: auto; flex: 1; }
            .maps-item {
                padding: 10px 12px;
                border-bottom: 1px solid #1a1a1a;
            }
            .maps-item.current { background: rgba(0,255,255,0.06); }
            .maps-item-title { font-weight: 600; margin-bottom: 2px; }
            .maps-item-meta { color: #888; font-size: 11px; margin-bottom: 6px; }
            .maps-item-actions { display: flex; gap: 4px; flex-wrap: wrap; }
            .maps-status {
                padding: 8px 12px;
                color: #888;
                font-size: 11px;
                border-top: 1px solid #222;
                word-break: break-word;
            }
            .maps-status.error { color: #f87171; }
            .maps-status.warning { color: #fcd34d; }
            .maps-note { color: #666; font-size: 11px; }
            .maps-share-url input {
                width: 100%;
                margin-top: 4px;
                padding: 4px;
                font-size: 11px;
                background: #111;
                color: #0ff;
                border: 1px solid #333;
                border-radius: 4px;
            }
            @media (max-width: 720px) {
                .maps-panel {
                    left: 12px;
                    right: 12px;
                    width: auto;
                    /* Stop above the bottom dock rather than behind it — the
                       Save/Share buttons are the whole point of this panel.
                       --dock-height comes from shell.css. */
                    max-height: calc(100vh - 64px - var(--dock-height, 0px) - 16px);
                }
                .maps-item-actions button,
                .maps-close, .maps-refresh, .maps-save, .maps-auth-button {
                    padding: 8px 12px;
                    font-size: 12px;
                }
            }
        `;
        document.head.appendChild(style);
    }
}
