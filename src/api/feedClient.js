// src/api/feedClient.js
//
// Client for the feed routes (api/routers/feed.py).
//
// Extends MindMapClient rather than duplicating its transport. That class is
// really the client for this whole API — its name predates the feed — and what
// is being inherited is not trivial: the retry policy (reads retry through a
// transport failure, writes never do, because a failed fetch does not mean the
// server ignored the request), the per-browser network-error detection, and the
// no-cors reachability probe that tells a CORS block apart from a dead service.
//
// Reimplementing any of that here would mean reimplementing its bugs too.

import { MindMapClient, ApiError } from './mindMapClient.js';
import { deployConfig } from '../config/deploy.js';

export { ApiError };

export class FeedClient extends MindMapClient {
    /** The public feed, newest first. Works without a signed-in user. */
    listFeed({ skip = 0, limit = 30, tag = null, onRetry } = {}) {
        const params = new URLSearchParams({ skip: String(skip), limit: String(limit) });
        if (tag) params.set('tag', tag);
        return this._request(`/pulses?${params}`, { onRetry });
    }

    /** Everything the caller posted, private pulses included. */
    listMyPulses({ skip = 0, limit = 30, onRetry } = {}) {
        const params = new URLSearchParams({ skip: String(skip), limit: String(limit) });
        return this._request(`/pulses/mine?${params}`, { onRetry });
    }

    /**
     * Post a pulse.
     *
     * @param {{title: string, preview?: string, tags?: string[],
     *          media?: {kind: 'link', url: string, title?: string, description?: string},
     *          visibility?: 'public'|'private'}} pulse
     */
    createPulse(pulse) {
        return this._request('/pulses', { method: 'POST', body: pulse });
    }

    getPulse(pulseId) {
        return this._request(`/pulses/${encodeURIComponent(pulseId)}`);
    }

    deletePulse(pulseId) {
        return this._request(`/pulses/${encodeURIComponent(pulseId)}`, { method: 'DELETE' });
    }

    /**
     * Resonate with a pulse, or take it back.
     *
     * Returns the updated pulse, so the caller never has to guess the new count —
     * incrementing locally and hoping is how a like count drifts from reality.
     */
    setResonance(pulseId, on = true) {
        return this._request(
            `/pulses/${encodeURIComponent(pulseId)}/resonance?on=${on ? 'true' : 'false'}`,
            { method: 'PUT' }
        );
    }

    /** Report a pulse. `reason` must be one the API recognises. */
    reportPulse(pulseId, reason = 'other') {
        return this._request(`/pulses/${encodeURIComponent(pulseId)}/report`, {
            method: 'POST',
            body: { reason }
        });
    }

    /** Hide (or unhide) an author's pulses from your own feed. */
    setBlock(authorId, blocked = true) {
        return this._request(
            `/pulses/authors/${encodeURIComponent(authorId)}/block?blocked=${blocked ? 'true' : 'false'}`,
            { method: 'PUT' }
        );
    }

    /** Who you have blocked. A block you cannot review is one you cannot undo. */
    listBlocked() {
        return this._request('/pulses/authors/blocked');
    }
}

/**
 * Shared instance, inert until VITE_API_BASE is set.
 *
 * Safe to construct unconditionally: `available` is false without a base URL and
 * every method then fails with a 0-status ApiError rather than touching the
 * network.
 */
export const feedClient = new FeedClient({ baseUrl: deployConfig.apiBase });

export default feedClient;
