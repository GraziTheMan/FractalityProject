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
    listFeed({ skip = 0, limit = 30, tag = null, scope = 'world', onRetry } = {}) {
        const params = new URLSearchParams({ skip: String(skip), limit: String(limit) });
        if (tag) params.set('tag', tag);
        if (scope && scope !== 'world') params.set('scope', scope);
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
     * Record how much a pulse resonates with you, from -2 to +2.
     *
     * 0 clears the rating rather than storing a neutral one, so returning the
     * slider to the middle is the same state as never having touched it.
     *
     * Returns the updated pulse, which carries your rating and your own predicted
     * resonance — and no tally of anyone else's, by design. There is nothing to
     * increment locally and hope about.
     */
    setResonance(pulseId, value = 0) {
        const clamped = Math.max(-2, Math.min(2, Math.round(Number(value) || 0)));
        return this._request(
            `/pulses/${encodeURIComponent(pulseId)}/resonance?value=${clamped}`,
            { method: 'PUT' }
        );
    }

    /**
     * Tell the server which pulses the reader has seen.
     *
     * The model's denominator: without it there is no way to tell a post that
     * landed badly from one that was barely shown. Fire-and-forget on purpose —
     * nothing on screen depends on it, so a failure here must never surface to the
     * reader or interrupt their scrolling.
     */
    async recordImpressions(pulseIds) {
        const ids = [...new Set(pulseIds)].filter(Boolean).slice(0, 200);
        if (ids.length === 0) return false;
        try {
            await this._request('/pulses/impressions', {
                method: 'POST',
                body: { pulse_ids: ids }
            });
            return true;
        } catch {
            return false;
        }
    }

    // --- comments ----------------------------------------------------------

    /**
     * The conversation on a post, oldest first.
     *
     * Readable signed out, like the feed. Signed in, three things change: comments
     * from blocked authors disappear, my_rating carries what you said, and a
     * prediction appears once your history can support one.
     */
    listComments(pulseId, { skip = 0, limit = 100, onRetry } = {}) {
        return this._request(
            `/pulses/${encodeURIComponent(pulseId)}/comments?skip=${skip}&limit=${limit}`,
            { onRetry }
        );
    }

    createComment(pulseId, text) {
        return this._request(`/pulses/${encodeURIComponent(pulseId)}/comments`, {
            method: 'POST',
            body: { text }
        });
    }

    updateComment(commentId, text) {
        return this._request(`/pulses/comments/${encodeURIComponent(commentId)}`, {
            method: 'PATCH',
            body: { text }
        });
    }

    deleteComment(commentId) {
        return this._request(`/pulses/comments/${encodeURIComponent(commentId)}`, {
            method: 'DELETE'
        });
    }

    /**
     * Rate a comment, -2..+2, 0 to clear.
     *
     * The same act as rating a post, and the same privacy: what comes back is your
     * own rating and your own prediction. Nobody's tally, including the comment
     * author's — there is nothing to increment locally and hope about.
     */
    setCommentResonance(commentId, value = 0) {
        const clamped = Math.max(-2, Math.min(2, Math.round(Number(value) || 0)));
        return this._request(
            `/pulses/comments/${encodeURIComponent(commentId)}/resonance?value=${clamped}`,
            { method: 'PUT' }
        );
    }

    reportComment(commentId) {
        return this._request(`/pulses/comments/${encodeURIComponent(commentId)}/report`, {
            method: 'POST'
        });
    }

    // --- friends -----------------------------------------------------------

    /** Everyone you are connected to. */
    listFriends() {
        return this._request('/pulses/friends');
    }

    /**
     * Pending requests, both directions.
     *
     * Returns `{incoming, outgoing}`. Incoming is a decision waiting for you;
     * outgoing is one waiting for somebody else, and showing it is what stops
     * people asking twice and wondering why nothing happened.
     */
    listFriendRequests() {
        return this._request('/pulses/friends/requests');
    }

    /**
     * Find somebody by handle. Exact match, case-insensitive.
     *
     * 404 means no such handle — the only answer this gives, deliberately. A
     * prefix search here would be a way to enumerate the whole membership.
     */
    findUserByUsername(username) {
        return this._request(`/pulses/friends/lookup/${encodeURIComponent(username)}`);
    }

    /**
     * Ask to be friends.
     *
     * Resolves to `{status: 'sent'}` or `{status: 'friends'}` — the second when
     * they had already asked you, because asking back IS accepting.
     *
     * A 409 means refused, and carries no reason on purpose: blocked in either
     * direction, already friends and aiming at yourself all look the same from
     * out here. Do not try to guess between them in the UI.
     */
    requestFriend(userId) {
        return this._request(`/pulses/friends/${encodeURIComponent(userId)}`, {
            method: 'POST'
        });
    }

    acceptFriend(userId) {
        return this._request(`/pulses/friends/${encodeURIComponent(userId)}/accept`, {
            method: 'POST'
        });
    }

    /** Decline one aimed at you, or withdraw one you sent — the same act. */
    dropFriendRequest(userId) {
        return this._request(`/pulses/friends/requests/${encodeURIComponent(userId)}`, {
            method: 'DELETE'
        });
    }

    unfriend(userId) {
        return this._request(`/pulses/friends/${encodeURIComponent(userId)}`, {
            method: 'DELETE'
        });
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

    /**
     * Edit one of your own posts.
     *
     * Omitted fields are left alone. The server stamps `edited_at` on every
     * change, because a feed where posts can be silently rewritten after people
     * have responded to them is worse than one without editing at all.
     */
    updatePulse(pulseId, changes) {
        return this._request(`/pulses/${encodeURIComponent(pulseId)}`, {
            method: 'PATCH',
            body: changes,
        });
    }

    // Profile methods live on MindMapClient, which this extends. They were here, but
    // /me is not a feed concern — it carries the display name, the avatar AND which map
    // opens on sign-in, and the Maps panel needs that last one without having any reason
    // to hold a feed client.
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
