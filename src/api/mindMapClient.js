// src/api/mindMapClient.js
//
// Client for the Fractality API (api/main.py).
//
// Deliberately additive: nothing in the existing local-data path calls this yet,
// so wiring it in cannot break the working visualizer. Use hasApi() to decide
// whether to offer cloud features at all.
//
// The node shape returned by `getMap` matches FractalNode.toJSON() from
// src/shared/NodeSchema.js field for field, so responses can be handed straight
// to the existing loaders without translation.

import { deployConfig, hasApi } from '../config/deploy.js';

/** Thrown for any non-2xx response, carrying the status for callers to branch on. */
export class ApiError extends Error {
    constructor(message, status, body) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.body = body;
    }

    get isAuthError() {
        return this.status === 401 || this.status === 403;
    }

    get isNotFound() {
        return this.status === 404;
    }
}

export class MindMapClient {
    /**
     * @param {object} [options]
     * @param {string} [options.baseUrl] defaults to VITE_API_BASE
     * @param {() => Promise<string|null>} [options.getToken] returns the current
     *   auth token. With Clerk this is `() => window.Clerk?.session?.getToken()`.
     */
    constructor(options = {}) {
        this.baseUrl = options.baseUrl ?? deployConfig.apiBase;
        this.getToken = options.getToken ?? (async () => null);
    }

    get available() {
        return Boolean(this.baseUrl);
    }

    async _request(path, { method = 'GET', body, token, signal } = {}) {
        if (!this.baseUrl) {
            throw new ApiError('No API configured (set VITE_API_BASE)', 0, null);
        }

        const headers = { Accept: 'application/json' };
        if (body !== undefined) headers['Content-Type'] = 'application/json';

        // A share token in the query string authorizes anonymous access, so a
        // bearer token is optional rather than required.
        const authToken = await this.getToken();
        if (authToken) headers.Authorization = `Bearer ${authToken}`;

        const response = await fetch(`${this.baseUrl}${path}`, {
            method,
            headers,
            body: body === undefined ? undefined : JSON.stringify(body),
            signal
        });

        if (response.status === 204) return null;

        const text = await response.text();
        let parsed = null;
        if (text) {
            try {
                parsed = JSON.parse(text);
            } catch {
                parsed = text;
            }
        }

        if (!response.ok) {
            const detail =
                (parsed && parsed.detail) || response.statusText || 'Request failed';
            throw new ApiError(
                typeof detail === 'string' ? detail : JSON.stringify(detail),
                response.status,
                parsed
            );
        }

        return parsed;
    }

    // --- maps --------------------------------------------------------------

    /** Maps owned by the signed-in user. */
    listMyMaps({ skip = 0, limit = 50 } = {}) {
        return this._request(`/maps?skip=${skip}&limit=${limit}`);
    }

    /** Publicly discoverable maps. No authentication needed. */
    listPublicMaps({ skip = 0, limit = 50 } = {}) {
        return this._request(`/maps/public?skip=${skip}&limit=${limit}`);
    }

    /**
     * Fetch a map with all its nodes.
     * @param {string} mapId
     * @param {object} [options]
     * @param {string} [options.shareToken] read a private map via a share link
     */
    getMap(mapId, { shareToken } = {}) {
        const query = shareToken ? `?token=${encodeURIComponent(shareToken)}` : '';
        return this._request(`/maps/${encodeURIComponent(mapId)}${query}`);
    }

    /**
     * Create a map, optionally with its initial nodes.
     * @param {{title: string, description?: string, visibility?: string,
     *          nodes?: Array, root_id?: string}} map
     */
    createMap(map) {
        return this._request('/maps', { method: 'POST', body: map });
    }

    /** Update title, description or visibility. Owner only. */
    updateMap(mapId, changes) {
        return this._request(`/maps/${encodeURIComponent(mapId)}`, {
            method: 'PATCH',
            body: changes
        });
    }

    deleteMap(mapId) {
        return this._request(`/maps/${encodeURIComponent(mapId)}`, { method: 'DELETE' });
    }

    /**
     * Replace a map's entire node set.
     *
     * Full replacement, not a diff: the client owns the map it is editing. Pass
     * the same array shape the visualizer holds.
     */
    saveNodes(mapId, nodes, { rootId = null, shareToken } = {}) {
        const query = shareToken ? `?token=${encodeURIComponent(shareToken)}` : '';
        return this._request(`/maps/${encodeURIComponent(mapId)}/nodes${query}`, {
            method: 'PUT',
            body: { nodes, root_id: rootId }
        });
    }

    // --- share links -------------------------------------------------------

    /**
     * Mint a share token.
     * @param {string} mapId
     * @param {{permission?: 'view'|'edit', expiresInSeconds?: number}} [options]
     */
    createShareLink(mapId, { permission = 'view', expiresInSeconds = null } = {}) {
        return this._request(`/maps/${encodeURIComponent(mapId)}/shares`, {
            method: 'POST',
            body: { permission, expires_in_seconds: expiresInSeconds }
        });
    }

    listShareLinks(mapId) {
        return this._request(`/maps/${encodeURIComponent(mapId)}/shares`);
    }

    revokeShareLink(mapId, token) {
        return this._request(
            `/maps/${encodeURIComponent(mapId)}/shares/${encodeURIComponent(token)}`,
            { method: 'DELETE' }
        );
    }

    // --- helpers -----------------------------------------------------------

    /** Server health and readiness. Useful for a connection indicator. */
    health() {
        return this._request('/health');
    }

    /**
     * Build a shareable URL for a token, pointing at the current origin.
     */
    static shareUrl(mapId, token, origin = window.location.origin) {
        const url = new URL(origin);
        url.searchParams.set('map', mapId);
        url.searchParams.set('token', token);
        return url.toString();
    }

    /**
     * Read `?map=...&token=...` from the current URL, for opening a shared map
     * on load.
     */
    static readShareParams(search = window.location.search) {
        const params = new URLSearchParams(search);
        const mapId = params.get('map');
        if (!mapId) return null;
        return { mapId, shareToken: params.get('token') || undefined };
    }
}

/** Shared instance using the deploy config. */
export const mindMapClient = new MindMapClient();

export { hasApi };
