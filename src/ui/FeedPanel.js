// src/ui/FeedPanel.js
//
// The newsfeed: text and links posted by other people, newest first.
//
// Deliberately a secondary surface. The stated intent for it is "a feature to
// help replace the scrolling of modern corporate social media" — which means the
// design goal is a feed you can reach the end of, not one engineered to be
// endless. Two consequences that are choices rather than omissions:
//
//   * no infinite scroll; a "Load more" button, so continuing is a decision
//   * no algorithmic ranking; strictly reverse-chronological
//
// Everything is built with createElement and textContent rather than innerHTML.
// This renders text written by strangers, so it is the one component where a
// convenient template literal is a stored-XSS vector. Links go through
// safeUrl(), which rejects javascript: and data: URLs including
// control-character obfuscations.
//
// A separate component from ResonanceFeedController, which belongs to the
// unverified mobile app and is styled by mobile-menu.css — a stylesheet
// index.html does not load, and cannot load without colliding with the shell.

import { ApiError } from '../api/feedClient.js';
import { safeUrl } from '../utils/sanitize.js';
import { hasAuth, getAuthState, signIn } from '../auth/clerkClient.js';
import { createResonanceSlider, createResonanceGauge } from './ResonanceControl.js';

/** Report reasons the API accepts. Kept in step with PulseReport in models.py. */
const REPORT_REASONS = [
    ['spam', 'Spam'],
    ['abuse', 'Abuse or harassment'],
    ['sexual', 'Sexual content'],
    ['violence', 'Violence'],
    ['illegal', 'Illegal content'],
    ['other', 'Something else'],
];

const PAGE_SIZE = 20;

export class FeedPanel {
    /**
     * Lowercase, strip a leading #, drop blanks, deduplicate, cap the count.
     *
     * Mirrors PulseCreate._clean_tags in api/models.py. Tags are filters, so
     * "Fractal", "fractal" and " fractal " being three tags would quietly
     * fragment the feed.
     *
     * @param {string[]} raw
     * @returns {string[]}
     */
    static normaliseTags(raw) {
        const out = [];
        for (const item of raw ?? []) {
            const tag = String(item).trim().replace(/^#+/, '').toLowerCase();
            if (tag && !out.includes(tag)) out.push(tag);
        }
        return out.slice(0, 8);
    }

    /**
     * @param {object} options
     * @param {object} options.client                a FeedClient
     * @param {(msg: string, type?: string) => void} [options.notify]
     */
    constructor(options = {}) {
        this.client = options.client;
        this.notify = options.notify ?? ((m) => console.log(m));

        this.container = null;
        this.isOpen = false;

        /** Pulses currently rendered, in order. */
        this.pulses = [];
        /** Active #tag filter, or null. */
        this.tag = null;
        /** True while a request is in flight, to stop double-submits. */
        this.busy = false;
        /** False once a page comes back short — there is nothing more to load. */
        this.hasMore = true;

        this._unsubscribe = null;
    }

    // --- lifecycle ---------------------------------------------------------

    init() {
        if (this.container) return;

        this.container = document.createElement('div');
        this.container.className = 'pulsefeed-panel hidden';
        this.container.innerHTML = `
            <div class="pulsefeed-header">
                <h3>Feed</h3>
                <span class="pulsefeed-filter"></span>
                <button class="pulsefeed-refresh" type="button" title="Reload">🔄</button>
                <button class="pulsefeed-close" type="button" title="Close">×</button>
            </div>
            <div class="pulsefeed-compose"></div>
            <div class="pulsefeed-list"></div>
            <div class="pulsefeed-more"></div>
            <div class="pulsefeed-status"></div>
        `;
        document.body.appendChild(this.container);

        this.listEl = this.container.querySelector('.pulsefeed-list');
        this.statusEl = this.container.querySelector('.pulsefeed-status');
        this.composeEl = this.container.querySelector('.pulsefeed-compose');
        this.filterEl = this.container.querySelector('.pulsefeed-filter');
        this.moreEl = this.container.querySelector('.pulsefeed-more');

        this.container.querySelector('.pulsefeed-close')
            .addEventListener('click', () => this.hide());
        this.container.querySelector('.pulsefeed-refresh')
            .addEventListener('click', () => this.refresh());

        this._injectStyles();

        if (hasAuth()) {
            this._unsubscribe = (async () => {
                const { onAuthChange } = await import('../auth/clerkClient.js');
                return onAuthChange(() => this._renderCompose());
            })();
        }
    }

    show() {
        this.init();
        this.container.classList.remove('hidden');
        this.isOpen = true;
        this.refresh();
    }

    hide() {
        // Closing is the last chance to report what was read. Waiting out the batch
        // timer would lose the final screenful every time.
        this._flushImpressions();
        if (this.container) this.container.classList.add('hidden');
        this.isOpen = false;
    }

    toggle() {
        this.isOpen ? this.hide() : this.show();
    }

    destroy() {
        Promise.resolve(this._unsubscribe).then((fn) => fn?.());
        clearTimeout(this._impressionTimer);
        this._impressionObserver?.disconnect();
        this._impressionObserver = null;
        this.container?.remove();
        this.container = null;
    }

    // --- loading -----------------------------------------------------------

    async refresh() {
        this.init();
        this._renderCompose();
        this._renderFilter();

        if (!this.client?.available) {
            this.listEl.innerHTML = '';
            this.moreEl.innerHTML = '';
            this._setStatus(
                'The feed needs the API. Set VITE_API_BASE and redeploy to enable it.',
                'warning'
            );
            return;
        }

        this.pulses = [];
        this.hasMore = true;
        await this._loadPage({ replace: true });
    }

    async _loadPage({ replace = false } = {}) {
        if (this.busy) return;
        this.busy = true;
        this._setStatus(replace ? 'Loading…' : 'Loading more…');

        try {
            const onRetry = ({ attempt, of }) =>
                this._setStatus(`Server did not respond — retrying (${attempt}/${of})…`, 'warning');

            const page = await this.client.listFeed({
                skip: replace ? 0 : this.pulses.length,
                limit: PAGE_SIZE,
                tag: this.tag,
                onRetry,
            });

            this.pulses = replace ? page : [...this.pulses, ...page];
            // A short page means the end. Asking again would return nothing and
            // leave a "Load more" button that does nothing when pressed.
            this.hasMore = page.length === PAGE_SIZE;

            this._renderList();
            this._renderMore();
            this._setStatus(this._summarise());
        } catch (error) {
            this._renderMore();
            this._setStatus(await this._describe(error), 'error');
        } finally {
            this.busy = false;
        }
    }

    _summarise() {
        if (this.pulses.length === 0) {
            return this.tag
                ? `Nothing tagged #${this.tag} yet.`
                : 'No posts yet. Be the first.';
        }
        const scope = this.tag ? ` tagged #${this.tag}` : '';
        return `${this.pulses.length} post${this.pulses.length === 1 ? '' : 's'}${scope}`
            + (this.hasMore ? ' so far' : '');
    }

    // --- compose -----------------------------------------------------------

    _renderCompose() {
        if (!this.composeEl) return;
        this.composeEl.innerHTML = '';

        if (!this.client?.available) return;

        const signedIn = !hasAuth() || getAuthState().signedIn;
        if (!signedIn) {
            const prompt = document.createElement('button');
            prompt.className = 'pulsefeed-signin';
            prompt.type = 'button';
            prompt.textContent = 'Sign in to post';
            prompt.addEventListener('click', async () => {
                try {
                    await signIn();
                } catch (error) {
                    this.notify(error.message, 'error');
                }
            });
            this.composeEl.appendChild(prompt);
            return;
        }

        const title = document.createElement('input');
        title.className = 'pulsefeed-input pulsefeed-input-title';
        title.type = 'text';
        title.placeholder = 'Say something';
        title.maxLength = 200;

        const body = document.createElement('textarea');
        body.className = 'pulsefeed-input pulsefeed-input-body';
        body.placeholder = 'More, if you want to (optional)';
        body.rows = 2;
        body.maxLength = 2000;

        const link = document.createElement('input');
        link.className = 'pulsefeed-input pulsefeed-input-link';
        link.type = 'url';
        link.placeholder = 'A link (optional)';

        const tags = document.createElement('input');
        tags.className = 'pulsefeed-input pulsefeed-input-tags';
        tags.type = 'text';
        tags.placeholder = 'tags, comma separated (optional)';

        // Everything past the first field is hidden until the user engages.
        // Four inputs plus a row is half a phone screen, and a feed whose compose
        // box crowds out the feed has its priorities backwards.
        const extra = document.createElement('div');
        extra.className = 'pulsefeed-compose-extra';
        extra.hidden = true;

        const expand = () => { extra.hidden = false; };
        title.addEventListener('focus', expand);
        title.addEventListener('input', expand);

        const row = document.createElement('div');
        row.className = 'pulsefeed-compose-row';

        const post = document.createElement('button');
        post.className = 'pulsefeed-post';
        post.type = 'button';
        post.textContent = 'Post';

        const privateLabel = document.createElement('label');
        privateLabel.className = 'pulsefeed-private';
        const privateBox = document.createElement('input');
        privateBox.type = 'checkbox';
        const privateText = document.createElement('span');
        privateText.textContent = 'Only me';
        privateLabel.append(privateBox, privateText);

        post.addEventListener('click', () => this._submit({
            title, body, link, tags, privateBox, post,
        }));

        row.append(privateLabel, post);
        extra.append(body, link, tags, row);
        this.composeEl.append(title, extra);
    }

    async _submit(fields) {
        const { title, body, link, tags, privateBox, post } = fields;

        const titleText = title.value.trim();
        if (!titleText) {
            this._setStatus('A post needs something in the first field.', 'warning');
            title.focus();
            return;
        }

        // Checked here as well as server-side, so a bad link is caught before a
        // round trip rather than coming back as a 422.
        const linkText = link.value.trim();
        if (linkText && !safeUrl(linkText)) {
            this._setStatus('That link is not a valid http or https URL.', 'warning');
            link.focus();
            return;
        }

        const payload = {
            title: titleText,
            preview: body.value.trim(),
            // Normalised here as well as on the server. Not redundant: the server
            // is the authority, but without this the payload carries "#Alpha" and
            // "alpha" as two tags, and anything rendering the response optimistically
            // shows duplicates that will not exist once it round-trips.
            tags: FeedPanel.normaliseTags(tags.value.split(',')),
            visibility: privateBox.checked ? 'private' : 'public',
        };
        if (linkText) payload.media = { kind: 'link', url: linkText };

        post.disabled = true;
        this._setStatus('Posting…');

        try {
            await this.client.createPulse(payload);
            this.notify('Posted');
            // Clear only on success: a failed post that wiped the box would lose
            // what the user wrote.
            title.value = '';
            body.value = '';
            link.value = '';
            tags.value = '';
            await this.refresh();   // rebuilds compose, collapsed again
        } catch (error) {
            this._setStatus(await this._describe(error), 'error');
        } finally {
            post.disabled = false;
        }
    }

    // --- rendering ---------------------------------------------------------

    _renderFilter() {
        if (!this.filterEl) return;
        this.filterEl.innerHTML = '';
        if (!this.tag) return;

        const clear = document.createElement('button');
        clear.className = 'pulsefeed-tag-clear';
        clear.type = 'button';
        clear.textContent = `#${this.tag} ×`;
        clear.title = 'Clear the tag filter';
        clear.addEventListener('click', () => {
            this.tag = null;
            this.refresh();
        });
        this.filterEl.appendChild(clear);
    }

    _renderList() {
        this.listEl.innerHTML = '';
        for (const pulse of this.pulses) {
            this.listEl.appendChild(this._renderPulse(pulse));
        }
    }

    // --- impressions -------------------------------------------------------
    //
    // The model's denominator: without it a post that landed badly and a post that
    // was barely shown are the same thing, because both have no ratings.
    //
    // Nothing read from this is ever shown to anybody — not to a post's author and
    // not as a per-viewer record. It is not a reading log: what is recorded is that
    // a reader saw a post, once, and never how long they looked or how often.

    /** Report `pulseId` as seen once its card has been on screen. */
    _watchForImpression(card, pulseId) {
        if (typeof IntersectionObserver === 'undefined') {
            // No observer (an old browser, or a test environment). Falling back to
            // "the server sent it" would be the wrong denominator, so nothing is
            // recorded at all: a missing measurement beats a wrong one.
            return;
        }

        if (!this._impressionObserver) {
            this._pendingImpressions = new Set();
            this._impressionObserver = new IntersectionObserver((entries) => {
                for (const entry of entries) {
                    if (!entry.isIntersecting) continue;
                    const id = entry.target.dataset.pulseId;
                    if (id) this._pendingImpressions.add(id);
                    // One impression per post per reader, so there is nothing left
                    // to watch for on this card.
                    this._impressionObserver.unobserve(entry.target);
                }
                this._scheduleImpressionFlush();
            }, {
                // Half the card, so a post clipped at the bottom edge of the screen
                // as the reader stops scrolling does not count as read.
                threshold: 0.5
            });
        }

        this._impressionObserver.observe(card);
    }

    _scheduleImpressionFlush() {
        clearTimeout(this._impressionTimer);
        // Batched: a screenful of cards intersects at once, and thirty requests to
        // say "I scrolled" is absurd.
        this._impressionTimer = setTimeout(() => this._flushImpressions(), 1500);
    }

    async _flushImpressions() {
        clearTimeout(this._impressionTimer);
        if (!this._pendingImpressions?.size) return;
        if (hasAuth() && !getAuthState().signedIn) {
            // An anonymous reader has no model to feed, so there is nothing to
            // record and nobody it would be recorded against.
            this._pendingImpressions.clear();
            return;
        }

        const ids = [...this._pendingImpressions];
        this._pendingImpressions.clear();
        // Fire and forget. Nothing on screen depends on this, so a failure must
        // never surface to the reader — but the ids are dropped rather than retried,
        // because a queue that grows while offline would eventually send a batch
        // claiming the reader saw everything at once.
        await this.client.recordImpressions(ids);
    }

    _renderMore() {
        this.moreEl.innerHTML = '';
        if (!this.hasMore || this.pulses.length === 0) return;

        const more = document.createElement('button');
        more.className = 'pulsefeed-load-more';
        more.type = 'button';
        more.textContent = 'Load more';
        // A button, not infinite scroll. Continuing should be a decision.
        more.addEventListener('click', () => this._loadPage());
        this.moreEl.appendChild(more);
    }

    _renderPulse(pulse) {
        const card = document.createElement('article');
        card.className = 'pulsefeed-pulse';
        card.dataset.pulseId = pulse.id;
        // Counted as seen only once it is actually on screen. Counting everything
        // the API returned would inflate the denominator with posts nobody scrolled
        // to, which makes every post look like it landed worse than it did.
        if (!pulse.own) this._watchForImpression(card, pulse.id);

        // --- who and when
        const head = document.createElement('div');
        head.className = 'pulsefeed-pulse-head';

        const author = document.createElement('span');
        author.className = 'pulsefeed-author';
        author.textContent = pulse.author?.name || 'Anonymous';

        const when = document.createElement('time');
        when.className = 'pulsefeed-when';
        when.textContent = this._timeAgo(pulse.timestamp);
        when.title = new Date(pulse.timestamp).toLocaleString();

        head.append(author, when);

        if (pulse.edited_at) {
            // A reader is entitled to know a post changed after it was published.
            const edited = document.createElement('span');
            edited.className = 'pulsefeed-badge';
            edited.textContent = 'edited';
            edited.title = `Edited ${this._timeAgo(pulse.edited_at)}`;
            head.appendChild(edited);
        }

        if (pulse.visibility === 'private') {
            const badge = document.createElement('span');
            badge.className = 'pulsefeed-badge';
            badge.textContent = 'only me';
            head.appendChild(badge);
        }

        // --- the post itself
        const title = document.createElement('h4');
        title.className = 'pulsefeed-title';
        title.textContent = pulse.title;

        card.append(head, title);

        if (pulse.preview) {
            const body = document.createElement('p');
            body.className = 'pulsefeed-body';
            body.textContent = pulse.preview;
            card.appendChild(body);
        }

        if (pulse.media?.url) {
            // safeUrl returns NULL for anything it will not vouch for — not '#',
            // which an earlier version of this checked for. That comparison never
            // matched, so a javascript: URL got as far as `link.href = null`,
            // which the browser renders as the literal string "null". Inert by
            // luck rather than by design.
            const vouched = safeUrl(pulse.media.url);
            if (vouched) {
                const link = document.createElement('a');
                link.className = 'pulsefeed-link';
                // The ORIGINAL url, not safeUrl's return value. safeUrl
                // HTML-escapes what it vouches for, which is right for innerHTML
                // and wrong for a property: a query string containing & would
                // become a literally different URL. The scheme has already been
                // checked, and a property assignment needs no HTML escaping.
                link.href = pulse.media.url;
                link.target = '_blank';
                // noopener: without it the opened page can reach back through
                // window.opener and navigate this one.
                link.rel = 'noopener noreferrer nofollow';
                link.textContent = pulse.media.title || pulse.media.url;
                card.appendChild(link);
            }
        }

        if (pulse.tags?.length) {
            const tagRow = document.createElement('div');
            tagRow.className = 'pulsefeed-tags';
            for (const tag of pulse.tags) {
                const chip = document.createElement('button');
                chip.className = 'pulsefeed-tag';
                chip.type = 'button';
                chip.textContent = `#${tag}`;
                chip.addEventListener('click', () => {
                    this.tag = tag;
                    this.refresh();
                });
                tagRow.appendChild(chip);
            }
            card.appendChild(tagRow);
        }

        card.appendChild(this._renderActions(pulse));
        return card;
    }

    _renderActions(pulse) {
        const actions = document.createElement('div');
        actions.className = 'pulsefeed-actions';

        const signedIn = !hasAuth() || getAuthState().signedIn;

        // --- how much this resonates with you
        //
        // A five-notch slider rather than one button. A single button can only mean
        // approval, and a scale with no way to say "this did not land for me"
        // collects agreement instead of reactions.
        //
        // No count anywhere near it. Nothing here reports how anyone else rated the
        // post, to the reader or to its author: the ratings exist so the feed can
        // learn what resonates with each person, and a visible tally would turn that
        // into a scoreboard.
        actions.appendChild(createResonanceSlider({
            value: pulse.my_rating ?? 0,
            enabled: signedIn,
            onChange: (value) => this._rate(pulse, value)
        }));

        // What YOU are predicted to make of it, from your own past ratings. Absent
        // until there is enough history to mean anything, which for a new reader is
        // most of the time — that is the honest state, not a broken one.
        const gauge = createResonanceGauge({
            predicted: pulse.predicted,
            confidence: pulse.prediction_confidence ?? 0
        });
        if (gauge) actions.appendChild(gauge);

        const spacer = document.createElement('span');
        spacer.className = 'pulsefeed-spacer';
        actions.appendChild(spacer);

        if (pulse.own) {
            // Your own post: edit and delete. No report or block — reporting
            // yourself is noise, and blocking yourself would empty your own feed.
            const edit = document.createElement('button');
            edit.className = 'pulsefeed-action';
            edit.type = 'button';
            edit.textContent = 'Edit';
            edit.addEventListener('click', () => this._startEdit(pulse));
            actions.appendChild(edit);

            const del = document.createElement('button');
            del.className = 'pulsefeed-action pulsefeed-danger';
            del.type = 'button';
            del.textContent = 'Delete';
            del.addEventListener('click', () => this._delete(pulse));
            actions.appendChild(del);
            return actions;
        }

        if (!signedIn) return actions;

        // --- moderation, on someone else's post
        const report = document.createElement('button');
        report.className = 'pulsefeed-action';
        report.type = 'button';
        report.textContent = 'Report';
        report.title = 'Flag this for review';
        report.addEventListener('click', () => this._report(pulse));
        actions.appendChild(report);

        const block = document.createElement('button');
        block.className = 'pulsefeed-action';
        block.type = 'button';
        block.textContent = 'Block';
        block.title = `Hide everything from ${pulse.author?.name || 'this author'}`;
        block.addEventListener('click', () => this._block(pulse));
        actions.appendChild(block);

        return actions;
    }

    /**
     * Replace a post's card with an inline editor.
     *
     * In place rather than in a dialog: you are editing something you can see, and
     * a modal would hide the thing being changed.
     */
    _startEdit(pulse) {
        const index = this.pulses.findIndex((p) => p.id === pulse.id);
        if (index < 0) return;

        const card = this.listEl.children[index];
        if (!card) return;

        const editor = document.createElement('article');
        editor.className = 'pulsefeed-pulse pulsefeed-editing';

        const title = document.createElement('input');
        title.className = 'pulsefeed-input pulsefeed-input-title';
        title.type = 'text';
        title.maxLength = 200;
        title.value = pulse.title ?? '';

        const body = document.createElement('textarea');
        body.className = 'pulsefeed-input pulsefeed-input-body';
        body.rows = 3;
        body.maxLength = 2000;
        body.value = pulse.preview ?? '';

        const link = document.createElement('input');
        link.className = 'pulsefeed-input pulsefeed-input-link';
        link.type = 'url';
        link.placeholder = 'A link (optional)';
        link.value = pulse.media?.url ?? '';

        const tags = document.createElement('input');
        tags.className = 'pulsefeed-input pulsefeed-input-tags';
        tags.type = 'text';
        tags.placeholder = 'tags, comma separated';
        tags.value = (pulse.tags ?? []).join(', ');

        const row = document.createElement('div');
        row.className = 'pulsefeed-actions';

        const save = document.createElement('button');
        save.className = 'pulsefeed-action pulsefeed-save';
        save.type = 'button';
        save.textContent = 'Save changes';

        const cancel = document.createElement('button');
        cancel.className = 'pulsefeed-action';
        cancel.type = 'button';
        cancel.textContent = 'Cancel';
        cancel.addEventListener('click', () => this._renderList());

        const spacer = document.createElement('span');
        spacer.className = 'pulsefeed-spacer';
        row.append(cancel, spacer, save);

        save.addEventListener('click', async () => {
            const titleText = title.value.trim();
            if (!titleText) {
                this._setStatus('A post needs something in the first field.', 'warning');
                title.focus();
                return;
            }

            const linkText = link.value.trim();
            if (linkText && !safeUrl(linkText)) {
                this._setStatus('That link is not a valid http or https URL.', 'warning');
                link.focus();
                return;
            }

            const changes = {
                title: titleText,
                preview: body.value.trim(),
                tags: FeedPanel.normaliseTags(tags.value.split(',')),
                // Explicitly null when cleared, so removing a link works. Omitting
                // it would mean "leave it alone".
                media: linkText ? { kind: 'link', url: linkText } : null,
            };

            save.disabled = true;
            this._setStatus('Saving…');
            try {
                const updated = await this.client.updatePulse(pulse.id, changes);
                this.pulses[index] = updated;
                this._renderList();
                this._setStatus('Saved.');
                this.notify('Post updated');
            } catch (error) {
                this._setStatus(await this._describe(error), 'error');
                save.disabled = false;
            }
        });

        editor.append(title, body, link, tags, row);
        this.listEl.replaceChild(editor, card);
        title.focus();
    }

    // --- actions -----------------------------------------------------------

    /**
     * Record this reader's rating of a pulse.
     *
     * The API returns the pulse with the rating applied AND a freshly computed
     * prediction, because this rating is part of the reader's history now — so the
     * gauge is re-read from the server rather than guessed locally.
     */
    async _rate(pulse, value) {
        if (hasAuth() && !getAuthState().signedIn) {
            this._setStatus('Sign in to say how something resonates with you.', 'warning');
            return;
        }

        const at = this.pulses.findIndex((p) => p.id === pulse.id);
        try {
            const updated = await this.client.setResonance(pulse.id, value);
            if (at >= 0) {
                this.pulses[at] = updated;
                this.listEl.replaceChild(this._renderPulse(updated), this.listEl.children[at]);
            }
        } catch (error) {
            this._setStatus(await this._describe(error), 'error');
            // Redraw from what we still believe, so the slider does not sit showing
            // a rating the server never accepted.
            if (at >= 0) {
                this.listEl.replaceChild(
                    this._renderPulse(this.pulses[at]), this.listEl.children[at]
                );
            }
        }
    }

    async _delete(pulse) {
        if (!confirm(`Delete "${pulse.title}"? This cannot be undone.`)) return;

        try {
            await this.client.deletePulse(pulse.id);
            this.pulses = this.pulses.filter((p) => p.id !== pulse.id);
            this._renderList();
            this._setStatus('Deleted.');
            this.notify('Post deleted');
        } catch (error) {
            this._setStatus(await this._describe(error), 'error');
        }
    }

    async _report(pulse) {
        // A fixed list, not free text: the reason is a routing signal for a human,
        // and an open text field on a report endpoint is itself an abuse channel.
        const menu = REPORT_REASONS.map(([, label], i) => `${i + 1}. ${label}`).join('\n');
        const answer = prompt(`Report this post.\n\n${menu}\n\nEnter a number:`, '1');
        if (answer === null) return;

        const index = Number.parseInt(answer, 10) - 1;
        const chosen = REPORT_REASONS[index];
        if (!chosen) {
            this._setStatus('That is not one of the options.', 'warning');
            return;
        }

        try {
            await this.client.reportPulse(pulse.id, chosen[0]);
            // Honest about what happens next: nothing automatic does, because
            // there is no admin review queue yet.
            this._setStatus('Reported. A human will review it.');
            this.notify('Reported. Thank you.');
        } catch (error) {
            this._setStatus(await this._describe(error), 'error');
        }
    }

    async _block(pulse) {
        const name = pulse.author?.name || 'this author';
        if (!confirm(`Hide all posts from ${name}? You can undo this later.`)) return;

        try {
            await this.client.setBlock(pulse.author.id, true);
            this.notify(`Blocked ${name}`);
            await this.refresh();
        } catch (error) {
            this._setStatus(await this._describe(error), 'error');
        }
    }

    // --- errors ------------------------------------------------------------

    /**
     * Turn an error into something safe and useful to show.
     *
     * Async because diagnosing a transport failure means probing the API, which
     * is the only way to tell a CORS block apart from a dead service.
     */
    async _describe(error) {
        if (error instanceof ApiError) {
            if (error.status === 0) return 'No API configured';
            if (error.isAuthError) return 'Sign in to do that';
            if (error.isNotFound) return 'That post is gone';
            if (error.status === 429) {
                // The server states the limit in its detail; passing it through
                // beats inventing a friendlier message that says less.
                return error.message || 'Posting limit reached. Try again later.';
            }
            if (error.status === 422) return `The server rejected that: ${error.message}`;
            if (error.status === 503) return 'The server is not ready (database or auth unconfigured)';
            return `Server error (${error.status}): ${error.message}`;
        }

        if (this.client?.constructor?.isNetworkError?.(error)) {
            const reachable = await this.client.probeReachable();
            if (reachable) {
                return 'The server is up but the browser is blocking its responses — '
                     + `a CORS problem. CORS_ORIGIN must include exactly: ${window.location.origin}`;
            }
            return 'Nothing is answering at the API address — it is down, restarting, '
                 + 'or the URL is wrong.';
        }

        return error?.message || 'Something went wrong';
    }

    /** "3m", "2h", "5d" — short, because it sits beside the author's name. */
    _timeAgo(timestampMs) {
        const seconds = Math.max(0, Math.floor((Date.now() - timestampMs) / 1000));
        if (seconds < 60) return 'just now';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        if (days < 30) return `${days}d ago`;
        return new Date(timestampMs).toLocaleDateString();
    }

    _setStatus(text, type = 'info') {
        if (!this.statusEl) return;
        this.statusEl.textContent = text || '';
        this.statusEl.className = `pulsefeed-status ${type}`;
    }

    // --- styles ------------------------------------------------------------

    _injectStyles() {
        if (document.getElementById('pulsefeed-panel-styles')) return;

        const style = document.createElement('style');
        style.id = 'pulsefeed-panel-styles';
        // Prefixed `pulsefeed-`, not `feed-`: mobile-menu.css already styles
        // `.feed-title` and friends for ResonanceFeedController, and sharing a
        // class name with a stylesheet written for another DOM is how a toast
        // ended up 814px tall and 175px off the left of a phone. npm run health
        // flags exactly this, and flagged it here before the rename.
        style.textContent = `
            .pulsefeed-panel {
                position: fixed;
                top: 64px;
                left: 16px;
                bottom: auto;
                width: 420px;
                max-height: 78vh;
                display: flex;
                flex-direction: column;
                background: rgba(0, 0, 0, 0.94);
                border: 1px solid #333;
                border-radius: 10px;
                backdrop-filter: blur(12px);
                color: #fff;
                font-size: 13px;
                z-index: 1001;
            }
            .pulsefeed-panel.hidden { display: none; }

            .pulsefeed-header {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 10px 12px;
                border-bottom: 1px solid #222;
            }
            .pulsefeed-header h3 {
                margin: 0;
                font-size: 13px;
                color: #0ff;
                text-transform: uppercase;
                letter-spacing: 1px;
            }
            .pulsefeed-filter { flex: 1; }
            .pulsefeed-refresh, .pulsefeed-close {
                min-width: 34px;
                min-height: 34px;
                background: rgba(255,255,255,0.06);
                border: 1px solid #333;
                border-radius: 6px;
                color: #fff;
                font-size: 14px;
                cursor: pointer;
            }
            .pulsefeed-close { font-size: 19px; line-height: 1; }
            .pulsefeed-refresh:hover, .pulsefeed-close:hover { border-color: #0ff; }

            .pulsefeed-tag-clear {
                background: rgba(0,255,255,0.12);
                border: 1px solid #066;
                border-radius: 999px;
                color: #0ff;
                font-family: inherit;
                font-size: 11px;
                padding: 3px 9px;
                cursor: pointer;
            }

            /* --- compose --- */
            .pulsefeed-compose {
                display: flex;
                flex-direction: column;
                gap: 6px;
                padding: 10px 12px;
                border-bottom: 1px solid #222;
            }
            .pulsefeed-input {
                width: 100%;
                padding: 8px 10px;
                background: rgba(255,255,255,0.04);
                border: 1px solid #2c2c2c;
                border-radius: 7px;
                color: #fff;
                font-family: inherit;
                font-size: 13px;
                box-sizing: border-box;
            }
            .pulsefeed-input:focus { outline: none; border-color: #0ff; }
            .pulsefeed-input-body { resize: vertical; min-height: 44px; }
            .pulsefeed-input-link, .pulsefeed-input-tags { font-size: 12px; }

            .pulsefeed-compose-extra {
                display: flex;
                flex-direction: column;
                gap: 6px;
            }
            .pulsefeed-compose-extra[hidden] { display: none; }

            .pulsefeed-compose-row {
                display: flex;
                align-items: center;
                gap: 10px;
            }
            .pulsefeed-private {
                flex: 1;
                display: flex;
                align-items: center;
                gap: 6px;
                color: #888;
                font-size: 11px;
                cursor: pointer;
            }
            .pulsefeed-post, .pulsefeed-signin {
                min-height: 38px;
                padding: 8px 18px;
                background: rgba(0,255,255,0.12);
                border: 1px solid #077;
                border-radius: 7px;
                color: #0ff;
                font-family: inherit;
                font-size: 13px;
                font-weight: 600;
                cursor: pointer;
            }
            .pulsefeed-post:hover, .pulsefeed-signin:hover { border-color: #0ff; }
            .pulsefeed-post:disabled { opacity: 0.5; cursor: default; }
            .pulsefeed-signin { width: 100%; }

            /* --- the feed --- */
            .pulsefeed-list { flex: 1; overflow-y: auto; min-height: 80px; }

            .pulsefeed-pulse {
                padding: 12px;
                border-bottom: 1px solid #1a1a1a;
            }
            .pulsefeed-pulse-head {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 6px;
            }
            .pulsefeed-author { color: #9ad; font-size: 12px; font-weight: 600; }
            .pulsefeed-when { color: #666; font-size: 11px; }
            .pulsefeed-badge {
                color: #fcd34d;
                font-size: 10px;
                border: 1px solid #553;
                border-radius: 999px;
                padding: 1px 7px;
            }

            .pulsefeed-title { margin: 0 0 4px; font-size: 14px; font-weight: 600; }
            .pulsefeed-body {
                margin: 0 0 6px;
                color: #ccc;
                line-height: 1.45;
                /* Posts are written by other people; a single long token must not
                   push the panel wider than the screen. */
                overflow-wrap: anywhere;
            }

            .pulsefeed-link {
                display: block;
                margin-bottom: 6px;
                color: #6cf;
                font-size: 12px;
                overflow-wrap: anywhere;
            }

            .pulsefeed-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; }
            .pulsefeed-tag {
                background: rgba(255,255,255,0.05);
                border: 1px solid #2c2c2c;
                border-radius: 999px;
                color: #8ab;
                font-family: inherit;
                font-size: 11px;
                padding: 2px 8px;
                cursor: pointer;
            }
            .pulsefeed-tag:hover { border-color: #0ff; color: #0ff; }

            .pulsefeed-editing {
                display: flex;
                flex-direction: column;
                gap: 6px;
                background: rgba(0,255,255,0.04);
            }
            .pulsefeed-save { border-color: #077; color: #0ff; }

            .pulsefeed-actions { display: flex; align-items: center; gap: 6px; }
            .pulsefeed-spacer { flex: 1; }
            .pulsefeed-action {
                min-height: 32px;
                padding: 4px 10px;
                background: rgba(255,255,255,0.05);
                border: 1px solid #2c2c2c;
                border-radius: 6px;
                color: #bbb;
                font-family: inherit;
                font-size: 11px;
                cursor: pointer;
            }
            .pulsefeed-action:hover { border-color: #555; color: #fff; }
            .pulsefeed-danger:hover { border-color: #ef4444; color: #f87171; }

            /* --- the resonance slider ------------------------------------ */
            .pulsefeed-resonance {
                display: flex;
                align-items: center;
                gap: 6px;
                min-width: 0;
            }
            .pulsefeed-resonance-end {
                color: #555;
                font-size: 9px;
                letter-spacing: 0.4px;
                text-transform: uppercase;
                white-space: nowrap;
            }
            .pulsefeed-notches {
                display: flex;
                align-items: center;
                gap: 2px;
                padding: 2px;
                background: rgba(255,255,255,0.04);
                border: 1px solid #2c2c2c;
                border-radius: 999px;
            }
            .pulsefeed-notch {
                width: 26px;
                height: 26px;
                padding: 0;
                background: none;
                border: 1px solid transparent;
                border-radius: 50%;
                color: #666;
                font-family: inherit;
                font-size: 10px;
                line-height: 1;
                cursor: pointer;
            }
            /* The middle notch is smaller and dimmer: it is the default and the
               absence of an opinion, so it should not look like a third choice
               competing with the other two sides. */
            .pulsefeed-notch.neutral { color: #444; font-size: 9px; }
            .pulsefeed-notch:hover { border-color: #555; color: #ccc; }
            .pulsefeed-notch.dissonant:hover { border-color: #f8717188; color: #f87171; }
            .pulsefeed-notch.resonant:hover { border-color: #0ff8; color: #0ff; }

            .pulsefeed-notch.chosen.dissonant {
                background: rgba(248,113,113,0.16);
                border-color: #f87171;
                color: #fca5a5;
            }
            .pulsefeed-notch.chosen.resonant {
                background: rgba(0,255,255,0.16);
                border-color: #0ff;
                color: #0ff;
            }
            .pulsefeed-notch.chosen.neutral {
                background: rgba(255,255,255,0.08);
                border-color: #555;
                color: #999;
            }
            /* Clickable while unavailable, so a press can explain itself rather
               than doing nothing to a reader who is not signed in. */
            .pulsefeed-notch.unavailable { opacity: 0.4; }

            /* --- the prediction gauge ------------------------------------ */
            .pulsefeed-gauge { display: inline-flex; align-items: center; flex: 0 0 auto; }
            .pulsefeed-gauge svg { display: block; }
            .pulsefeed-gauge-track {
                fill: none;
                stroke: rgba(255,255,255,0.10);
                stroke-width: 2.5;
            }
            .pulsefeed-gauge-arc {
                fill: none;
                stroke-width: 2.5;
                stroke-linecap: round;
            }
            .pulsefeed-gauge.resonant .pulsefeed-gauge-arc { stroke: #0ff; }
            .pulsefeed-gauge.dissonant .pulsefeed-gauge-arc { stroke: #f87171; }

            .pulsefeed-more { padding: 0 12px; }
            .pulsefeed-load-more {
                width: 100%;
                min-height: 40px;
                margin: 10px 0;
                background: rgba(255,255,255,0.05);
                border: 1px solid #2c2c2c;
                border-radius: 7px;
                color: #bbb;
                font-family: inherit;
                font-size: 12px;
                cursor: pointer;
            }
            .pulsefeed-load-more:hover { border-color: #0ff; color: #0ff; }

            .pulsefeed-status {
                padding: 8px 12px;
                border-top: 1px solid #222;
                color: #888;
                font-size: 11px;
                min-height: 22px;
                word-break: break-word;
            }
            .pulsefeed-status.warning { color: #fcd34d; }
            .pulsefeed-status.error { color: #f87171; }

            /* --- phones --- */
            @media (max-width: 720px), (max-height: 500px) {
                .pulsefeed-panel {
                    top: 44px;
                    left: 8px;
                    right: 8px;
                    width: auto;
                    /* Clears the dock; --dock-height comes from shell.css. */
                    bottom: calc(var(--dock-height, 0px) + 8px);
                    max-height: none;
                }
                .pulsefeed-action { min-height: 36px; padding: 6px 11px; font-size: 12px; }
                .pulsefeed-tag { padding: 4px 10px; }
            }
        `;
        document.head.appendChild(style);
    }
}
