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

/**
 * The three visibility states, in order from closed to open.
 *
 * `unlisted` is the middle state and is not a lesser `public`: it means "not in
 * the public list, but anyone holding a share link can read it". That is the state
 * a share link is for, which is why it sits between the two.
 */
const VISIBILITY_ORDER = ['private', 'unlisted', 'public'];

const VISIBILITY_LABELS = {
    private: '\u{1f512} Private',
    unlisted: '\u{1f517} Link only',
    public: '\u{1f30d} Public',
};

const VISIBILITY_HELP = {
    private: 'Only you can open this. Tap to allow anyone with the link.',
    unlisted: 'Anyone with a share link can read it. Tap to list it publicly.',
    public: 'Listed for everyone to find. Tap to make it private again.',
};

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

        /** The map nominated to open on sign-in, or null. Read from the profile. */
        this.defaultMapId = null;

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
                <button class="maps-share" title="Copy a share link for the saved map" disabled>🔗 Share</button>
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

        // Share the map that is currently loaded or was just saved.
        //
        // Until now Share existed only as a small button inside a list row,
        // which made it unreachable in exactly the situation where you most
        // want it: right after saving, when the list request has failed and
        // there are no rows to put a button in. The map is known at that point
        // — it is in this.currentMap — so sharing does not need the list.
        this.shareBtn = this.container.querySelector('.maps-share');
        this.shareBtn.addEventListener('click', () => {
            if (this.currentMap) this.share(this.currentMap.id);
        });

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

    /**
     * Assign this.currentMap and keep the header Share button in step.
     *
     * Everything that changes the current map goes through here, so the button
     * cannot drift out of sync with what it would act on.
     */
    /**
     * Where the reader was, remembered locally.
     *
     * Deliberately localStorage rather than the profile. The profile's
     * default_map_id is a *choice* — the star in this panel, meaning "this is what
     * I want on sign-in". This is a *fact*: the last map actually opened. Storing
     * the fact in the choice's field would overwrite a stated preference every
     * time someone glanced at another map.
     *
     * Local also means it is available instantly, before any request completes, and
     * per-device — which matches how it reads: where I left off on THIS machine.
     */
    static LAST_MAP_KEY = 'fractality.lastMapId';

    static readLastMapId() {
        try {
            return globalThis.localStorage?.getItem(MapsPanel.LAST_MAP_KEY) || null;
        } catch {
            return null;
        }
    }

    static rememberLastMapId(mapId) {
        try {
            if (mapId) globalThis.localStorage?.setItem(MapsPanel.LAST_MAP_KEY, mapId);
            else globalThis.localStorage?.removeItem(MapsPanel.LAST_MAP_KEY);
        } catch {
            /* a preference is never worth failing a load for */
        }
    }

    _setCurrentMap(map) {
        this.currentMap = map ?? null;
        // Only a map opened by its own id. A shared map belongs to someone else and
        // may stop being reachable, so reopening it silently on the next visit would
        // be both wrong and confusing.
        if (map?.id && !map.__viaShareToken) MapsPanel.rememberLastMapId(map.id);
        if (!this.shareBtn) return;
        this.shareBtn.disabled = !this.currentMap;
        this.shareBtn.title = this.currentMap
            ? `Copy a share link for "${this.currentMap.title}"`
            : 'Save or open a map first';
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
            return { ok: false, message: 'no API configured' };
        }

        this._setStatus('Loading…');

        let ok = false;
        let message = '';

        try {
            const signedIn = hasAuth() && getAuthState().signedIn;
            const onRetry = ({ attempt, of }) =>
                this._setStatus(
                    `Server did not respond — retrying (${attempt}/${of})…`,
                    'warning'
                );
            const maps = signedIn
                ? await this.client.listMyMaps({ onRetry })
                : await this.client.listPublicMaps({ onRetry });

            // Which map is nominated to open on sign-in, so the star renders in the
            // right state. Read alongside the list rather than cached at construction,
            // because it can be changed from another device.
            if (signedIn) {
                try {
                    this.defaultMapId =
                        (await this.client.getProfile())?.default_map_id ?? null;
                } catch {
                    // Not worth failing the list over: an unknown default just shows
                    // every star as unset, and pressing one still works.
                    this.defaultMapId = null;
                }
            } else {
                this.defaultMapId = null;
            }

            this._renderList(maps, signedIn);
            ok = true;
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
            message = this._describe(error);

            // A transport failure says nothing about WHY. /health needs no auth
            // and touches no data, so whether it answers separates "the service
            // is down or restarting" from "this one request was rejected" —
            // which are different problems with different fixes.
            //
            // Awaited deliberately: when this ran unawaited it resolved after
            // the caller had already written its own status line and silently
            // overwrote it, so a successful save reported a CORS error.
            if (MindMapClient.isNetworkError(error)) {
                message = (await this._diagnose()) ?? message;
            }
            this._setStatus(message, 'error');
        }

        return { ok, message };
    }

    /**
     * Probe /health after a transport failure and describe what it implies.
     *
     * Returns replacement status text, or null when the probe taught us nothing.
     * It does not touch the status itself — the caller owns that, so the two
     * cannot race.
     */
    async _diagnose() {
        let health;
        try {
            health = await this.client.checkHealth();
        } catch {
            return null;   // an HTTP error from /health is not worth interpreting
        }

        if (health === null) {
            // /health failed too — but that is ambiguous, because it went out
            // with an Authorization header and so is subject to CORS just like
            // everything else. An earlier version stopped here and blamed the
            // server, which was wrong whenever the real problem was CORS.
            const reachable = await this.client.probeReachable();

            if (reachable) {
                // Something answered, so the network and the service are fine
                // and the browser is refusing to hand us the response. Name the
                // origin the API has to allow — reading it from the page removes
                // the guesswork about www, http vs https, and ports.
                return 'The server is up but the browser is blocking its '
                     + `responses — a CORS problem. Set CORS_ORIGIN on the API `
                     + `to include exactly: ${window.location.origin}`;
            }

            return 'Nothing is answering at the API address — it is down, '
                 + 'restarting, or the URL is wrong. Check the service logs.';
        }

        // /health answered, so the service is up and the browser can reach it.
        // That narrows it to this specific request. The usual cause is CORS,
        // because a CORS rejection reaches JavaScript as a transport failure
        // indistinguishable from the server being gone.
        const notReady = [];
        if (health.database && health.database !== 'ok') notReady.push(`database: ${health.database}`);
        if (health.auth && health.auth !== 'configured') notReady.push(`auth: ${health.auth}`);

        if (notReady.length) {
            return `The API is up but not ready — ${notReady.join(', ')}.`;
        }

        return 'The API is up, so this request specifically was blocked. The '
             + 'usual cause is CORS: the API\'s CORS_ORIGIN must list this '
             + 'exact origin.';
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

                // Visibility, which had no control at all: every map was created
                // private and there was no way to publish one. A cycling button
                // rather than a dropdown, because the three states have a natural
                // order from closed to open and it is one tap either way.
                const visibilityBtn = document.createElement('button');
                visibilityBtn.className = 'maps-visibility';
                visibilityBtn.textContent = VISIBILITY_LABELS[map.visibility] ?? map.visibility;
                visibilityBtn.title = VISIBILITY_HELP[map.visibility] ?? 'Change who can see this';
                visibilityBtn.addEventListener('click', () => this.cycleVisibility(map));
                actions.appendChild(visibilityBtn);

                // Which map opens on sign-in. A star rather than a menu: it is one
                // choice across all maps, so the control belongs on each row where you
                // can see which one currently holds it.
                const isDefault = this.defaultMapId === map.id;
                const defaultBtn = document.createElement('button');
                defaultBtn.className = 'maps-default';
                defaultBtn.textContent = isDefault ? '★' : '☆';
                defaultBtn.title = isDefault
                    ? 'Opens on sign-in. Press to stop.'
                    : 'Open this map automatically on sign-in';
                defaultBtn.setAttribute('aria-pressed', String(isDefault));
                defaultBtn.addEventListener('click', () => this.setDefault(map, !isDefault));
                actions.appendChild(defaultBtn);

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
            if (shareToken) apiMap.__viaShareToken = true;
            const graph = apiMapToNodeGraph(apiMap);

            await this.onLoadMap(graph, apiMap);
            this._setCurrentMap(apiMap);

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

            this._setCurrentMap(created);
            this.notify(`Saved "${created.title}" (${created.node_count} nodes)`);
            // The save is already committed. Reloading the list is a courtesy,
            // and its failure used to overwrite the success message with an
            // error — so a save that worked read as a save that failed, and the
            // map looked lost when it was not.
            await this._refreshAfterWrite(`Saved "${created.title}"`);
        } catch (error) {
            this._setStatus(this._describe(error), 'error');
            this.notify(this._describe(error), 'error');
        }
    }

    /**
     * Reload the list after a write that already succeeded.
     *
     * Keeps the write's own outcome in the status line if the reload fails, so
     * a committed save is never reported as an error.
     */
    async _refreshAfterWrite(successText) {
        const { ok, message } = await this.refresh();
        if (ok) return;

        // Both facts matter and neither replaces the other: the write is safe,
        // AND something is wrong with reading. Leading with the reassurance
        // stops a committed save from reading as a lost one, while keeping the
        // diagnosis so the underlying problem is still actionable.
        this._setStatus(
            `${successText} — your map is saved. Press 🔗 Share for its link. `
            + `The list could not be reloaded: ${message}`,
            'warning'
        );
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

            this._setCurrentMap(updated);
            this.notify(`Updated "${updated.title}" (${updated.node_count} nodes)`);
            await this._refreshAfterWrite(`Updated "${updated.title}"`);
        } catch (error) {
            this._setStatus(this._describe(error), 'error');
            this.notify(this._describe(error), 'error');
        }
    }

    /**
     * Move a map one step around private -> link only -> public -> private.
     *
     * Publishing is confirmed and un-publishing is not: making something visible
     * to strangers is the step that cannot be taken back for anyone who has
     * already seen it.
     */
    /**
     * Nominate a map to open on sign-in, or clear the nomination.
     *
     * Stored on the profile, so it follows the person to any device they sign in from —
     * which is the point of asking for it rather than remembering it locally.
     */
    async setDefault(map, on) {
        this._setStatus(on ? 'Setting your default map…' : 'Clearing your default map…');
        try {
            const profile = await this.client.updateProfile({
                default_map_id: on ? map.id : null
            });
            this.defaultMapId = profile?.default_map_id ?? null;
            this.notify(on
                ? `"${map.title}" will open when you sign in`
                : 'No map will open automatically');
            await this.refresh();
        } catch (error) {
            this._setStatus(this._describe(error), 'error');
        }
    }

    async cycleVisibility(map) {
        const current = VISIBILITY_ORDER.indexOf(map.visibility);
        const next = VISIBILITY_ORDER[(current + 1) % VISIBILITY_ORDER.length];

        if (next === 'public') {
            const ok = confirm(
                `Make "${map.title}" public?\n\n`
                + 'It will be listed for anyone to find and read. '
                + 'You can make it private again at any time, but you cannot '
                + 'un-see it for anyone who has already looked.'
            );
            if (!ok) return;
        }

        this._setStatus('Changing visibility…');
        try {
            const updated = await this.client.updateMap(map.id, { visibility: next });
            if (this.currentMap?.id === map.id) this._setCurrentMap(updated);
            this.notify(`"${map.title}" is now ${VISIBILITY_LABELS[next].replace(/^\S+\s/, '')}`);
            await this.refresh();
        } catch (error) {
            this._setStatus(this._describe(error), 'error');
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
            if (this.currentMap?.id === map.id) this._setCurrentMap(null);
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
        if (MindMapClient.isNetworkError(error)) {
            // Say what is known, not what is guessed. The browser withholds the
            // reason, and it is genuinely ambiguous: a cold start, a restart, a
            // CORS rejection and a dropped connection are indistinguishable
            // from here. _diagnose() narrows it by probing /health.
            return 'No response from the server. Retrying did not help — '
                 + 'checking why…';
        }

        return error?.message || 'Something went wrong';
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
            .maps-actions .maps-share { flex: 0 0 auto; white-space: nowrap; }
            .maps-share:disabled {
                opacity: 0.4;
                cursor: default;
                border-color: #333;
            }
            .maps-share:disabled:hover { border-color: #333; }
            .maps-list { overflow-y: auto; flex: 1; }
            .maps-item {
                padding: 10px 12px;
                border-bottom: 1px solid #1a1a1a;
            }
            .maps-item.current { background: rgba(0,255,255,0.06); }
            .maps-item-title { font-weight: 600; margin-bottom: 2px; }
            .maps-item-meta { color: #888; font-size: 11px; margin-bottom: 6px; }
            .maps-item-actions { display: flex; gap: 4px; flex-wrap: wrap; }
            .maps-visibility { white-space: nowrap; }
            /* The map that opens on sign-in. Filled when it holds the nomination, so
               which one it is can be seen without pressing anything. */
            .maps-default {
                min-width: 30px;
                color: #666;
                font-size: 13px;
                line-height: 1;
            }
            .maps-default[aria-pressed="true"] { color: #fcd34d; border-color: #fcd34d; }
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
