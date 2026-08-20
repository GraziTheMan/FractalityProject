// src/ui/AccountPanel.js
//
// Sign in, sign out, and the profile that decides how you appear to other people.
//
// It exists because signing in had no home of its own. The only ways to do it
// were a button inside the Maps panel header and one inside the feed composer —
// so on a fresh desktop browser there was no obvious way to sign in at all, and
// an anonymous visitor sees only PUBLIC maps. That is why maps saved on a phone
// appeared to be missing on a desktop: they were private, and the desktop was
// never signed in. The data was in Neo4j the whole time.
//
// The display name is stored on the server rather than read from the token,
// because Clerk's session JWT does not carry one. A default Clerk token has
// `sub`, `iss` and `exp` and no name at all, which is why every feed post was
// attributed to "Anonymous".

import { hasAuth, getAuthState, onAuthChange, signIn, signOut,
         openAccountSettings, claimUsername } from '../auth/clerkClient.js';
import { safeUrl } from '../utils/sanitize.js';

export class AccountPanel {
    /**
     * @param {object} options
     * @param {object} options.client            a FeedClient (carries /me)
     * @param {(msg: string, type?: string) => void} [options.notify]
     * @param {() => void} [options.onProfileChanged]
     */
    constructor(options = {}) {
        this.client = options.client;
        this.notify = options.notify ?? ((m) => console.log(m));
        this.onProfileChanged = options.onProfileChanged ?? (() => {});

        /**
         * How this panel learns who is signed in.
         *
         * Injected rather than imported directly, matching every other component
         * here — ConeView takes getGraph, BubbleView takes getFocusedNode. The
         * reason is not symmetry: reading the module binding meant the signed-in
         * half of this panel could not be exercised at all without a live Clerk
         * key, so the username, the bio, the claim box and the map list had no
         * check on them. A seam is the difference between "probably fine" and
         * tested.
         */
        this.getAuth = options.getAuth ?? getAuthState;
        this.hasAuth = options.hasAuth ?? hasAuth;

        this.container = null;
        this.isOpen = false;
        this.profile = null;
        this._unsubscribe = null;
    }

    // --- lifecycle ---------------------------------------------------------

    init() {
        if (this.container) return;

        this.container = document.createElement('div');
        this.container.className = 'account-panel hidden';
        this.container.innerHTML = `
            <div class="account-header">
                <h3>Account</h3>
                <button class="account-close" type="button" title="Close">×</button>
            </div>
            <div class="account-body"></div>
            <div class="account-status"></div>
        `;
        document.body.appendChild(this.container);

        this.bodyEl = this.container.querySelector('.account-body');
        this.statusEl = this.container.querySelector('.account-status');
        this.container.querySelector('.account-close')
            .addEventListener('click', () => this.hide());

        this._injectStyles();

        if (this.hasAuth()) {
            this._unsubscribe = onAuthChange(() => {
                if (this.isOpen) this.refresh();
            });
        }
    }

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
        this._unsubscribe?.();
        this.container?.remove();
        this.container = null;
    }

    // --- state -------------------------------------------------------------

    /** True when the user is signed in, or when auth is not configured at all. */
    get signedIn() {
        return !this.hasAuth() || this.getAuth().signedIn;
    }

    async refresh() {
        this.init();
        this._render();

        if (!this.signedIn || !this.client?.available) return;

        // Loaded rather than assumed: the display name lives on the server, and
        // the client cannot know whether one has been set.
        try {
            this.profile = await this.client.getProfile();
            this._render();
        } catch (error) {
            this._setStatus(this._describe(error), 'error');
        }
    }

    // --- rendering ---------------------------------------------------------

    _render() {
        if (!this.bodyEl) return;
        this.bodyEl.innerHTML = '';
        // Every element in here is about to be discarded, and an in-flight
        // _loadFriends() checks this to see whether its list still belongs to the
        // page. Left set, it would write results into a detached node.
        this._friendsListEl = null;

        if (!this.hasAuth()) {
            this._note(
                'Accounts are not configured for this deployment. '
                + 'Set VITE_CLERK_PUBLISHABLE_KEY to enable signing in.'
            );
            return;
        }

        if (!this.getAuth().signedIn) {
            this._note(
                'Sign in to save maps to the cloud, post to the feed, and appear '
                + 'under your own name.'
            );
            const button = document.createElement('button');
            button.className = 'account-primary';
            button.type = 'button';
            button.textContent = 'Sign in';
            button.addEventListener('click', async () => {
                try {
                    await signIn();
                } catch (error) {
                    this._setStatus(error.message, 'error');
                }
            });
            this.bodyEl.appendChild(button);
            return;
        }

        const state = this.getAuth();

        // --- who you are
        const identity = document.createElement('div');
        identity.className = 'account-identity';

        const avatar = document.createElement('div');
        avatar.className = 'account-avatar';
        const avatarUrl = this.profile?.avatar_url ? safeUrl(this.profile.avatar_url) : null;
        if (avatarUrl) {
            const img = document.createElement('img');
            // The original URL, not safeUrl's return value: safeUrl HTML-escapes
            // what it vouches for, which is right for innerHTML and wrong for a
            // property, where &amp; in a query string is a different URL.
            img.src = this.profile.avatar_url;
            img.alt = '';
            avatar.appendChild(img);
        } else {
            const initial = (this.profile?.display_name || state.user?.name || '?').trim();
            avatar.textContent = initial.charAt(0).toUpperCase() || '?';
        }

        const who = document.createElement('div');
        who.className = 'account-who';
        const name = document.createElement('div');
        name.className = 'account-name';
        name.textContent = this.profile?.display_name
            || state.user?.name
            || 'No display name set';
        // The handle. Shown from the provider rather than from our profile: it is
        // written into the User node from the verified token, so the token is the
        // fresher of the two and the one that cannot be wrong.
        const handle = document.createElement('div');
        handle.className = 'account-handle';
        const username = state.user?.username || this.profile?.username || null;
        handle.textContent = username ? `@${username}` : 'No username yet';
        if (!username) handle.classList.add('account-handle-missing');

        const email = document.createElement('div');
        email.className = 'account-email';
        email.textContent = this.profile?.email || state.user?.email || '';
        who.append(name, handle, email);

        identity.append(avatar, who);
        this.bodyEl.appendChild(identity);

        if (!this.client?.available) {
            this._note('The API is not configured, so your profile cannot be saved.');
        } else {
            this.bodyEl.appendChild(this._renderProfileForm(state));
        }

        // --- claiming a username, for accounts that predate it being required
        if (!username) this.bodyEl.appendChild(this._renderUsernameClaim());

        // --- the provider's own settings
        const settings = document.createElement('button');
        settings.className = 'account-secondary';
        settings.type = 'button';
        settings.textContent = 'Settings — email, password, security';
        settings.addEventListener('click', async () => {
            const opened = await openAccountSettings();
            if (!opened) {
                this._setStatus('Account settings are not available here', 'error');
            }
        });
        this.bodyEl.appendChild(settings);

        // --- who you are connected to
        if (this.client?.available) {
            this.bodyEl.appendChild(this._renderFriends());
        }

        // --- what you have made
        this.bodyEl.appendChild(this._renderPublicMaps());

        // --- sign out
        const signOutButton = document.createElement('button');
        signOutButton.className = 'account-secondary';
        signOutButton.type = 'button';
        signOutButton.textContent = 'Sign out';
        signOutButton.addEventListener('click', async () => {
            try {
                await signOut();
                this.profile = null;
                this.onProfileChanged();
                this.refresh();
            } catch (error) {
                this._setStatus(error.message, 'error');
            }
        });
        this.bodyEl.appendChild(signOutButton);
    }

    /**
     * Claim a username. Only appears when there is none to claim.
     *
     * A permanent handle is worth a moment's friction, so this says plainly that it
     * cannot be changed afterwards rather than letting someone discover that later.
     */
    _renderUsernameClaim() {
        const box = document.createElement('div');
        box.className = 'account-claim';

        const why = document.createElement('p');
        why.className = 'account-claim-why';
        why.textContent = 'Your account was made before usernames were required. '
            + 'Choose one now — it is how other people will find you, and it cannot '
            + 'be changed later.';

        const row = document.createElement('div');
        row.className = 'account-claim-row';

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'account-input';
        input.placeholder = 'username';
        input.maxLength = 64;
        input.autocapitalize = 'none';
        input.autocomplete = 'off';
        input.spellcheck = false;

        const button = document.createElement('button');
        button.className = 'account-primary';
        button.type = 'button';
        button.textContent = 'Claim';

        const submit = async () => {
            button.disabled = true;
            input.disabled = true;
            this._setStatus('Claiming…');

            const result = await claimUsername(input.value);
            if (result.ok) {
                // No re-enable: the field is gone on the next render, because the
                // whole point is that this happens once.
                this._setStatus(`You are @${result.username}`, 'success');
                this.refresh();
                return;
            }

            // The provider's own words. "That username is taken" and "usernames
            // must be at least 4 characters" are different problems and a single
            // invented message would hide which one this is.
            this._setStatus(result.reason, 'error');
            button.disabled = false;
            input.disabled = false;
            input.focus();
        };

        button.addEventListener('click', submit);
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') submit();
        });

        row.append(input, button);
        box.append(why, row);
        return box;
    }

    /**
     * Friends: who you are connected to, and who is waiting on an answer.
     *
     * Lives here rather than in a screen of its own because a friend list is part
     * of who you are in this app, and a separate screen would be a fifth dock entry
     * that is empty for most people most of the time.
     *
     * Everything below re-fetches after a change instead of patching the list in
     * place. It is one small request, and the alternative — moving a row from
     * "requests" to "friends" locally — is a second copy of the server's rules that
     * can drift from them silently.
     */
    _renderFriends() {
        const box = document.createElement('div');
        box.className = 'account-friends';

        const heading = document.createElement('div');
        heading.className = 'account-section-title';
        heading.textContent = 'Friends';
        box.appendChild(heading);

        box.appendChild(this._renderFriendSearch());

        const list = document.createElement('div');
        list.className = 'account-friends-list';
        list.textContent = 'Loading…';
        box.appendChild(list);

        this._friendsListEl = list;
        this._loadFriends();
        return box;
    }

    /** Find somebody by handle and ask them. */
    _renderFriendSearch() {
        const row = document.createElement('div');
        row.className = 'account-claim-row';

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'account-input';
        input.placeholder = 'Add by username';
        input.maxLength = 64;
        input.autocapitalize = 'none';
        input.autocomplete = 'off';
        input.spellcheck = false;

        const button = document.createElement('button');
        button.className = 'account-primary';
        button.type = 'button';
        button.textContent = 'Add';

        const submit = async () => {
            const handle = input.value.trim().replace(/^@/, '');
            if (!handle) return;

            button.disabled = true;
            this._setStatus(`Looking for @${handle}…`);
            try {
                const found = await this.client.findUserByUsername(handle);
                const result = await this.client.requestFriend(found.id);
                input.value = '';
                this._setStatus(
                    result?.status === 'friends'
                        ? `You and ${found.name} are now friends — they had already asked.`
                        : `Asked ${found.name}.`,
                    'success'
                );
                this._loadFriends();
            } catch (error) {
                // 404 and 409 are different answers and must not be merged: one
                // means the handle does not exist, the other that the request was
                // refused. The refusal deliberately does not say why — it covers
                // blocks in either direction, and naming one would announce it.
                if (error.status === 404) {
                    this._setStatus(`No account with the username @${handle}`, 'error');
                } else if (error.status === 409) {
                    this._setStatus('That request could not be sent.', 'error');
                } else {
                    this._setStatus(this._describe(error), 'error');
                }
            } finally {
                button.disabled = false;
            }
        };

        button.addEventListener('click', submit);
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') submit();
        });

        row.append(input, button);
        return row;
    }

    async _loadFriends() {
        const list = this._friendsListEl;
        if (!list) return;

        try {
            const [friends, requests] = await Promise.all([
                this.client.listFriends(),
                this.client.listFriendRequests(),
            ]);
            // The panel can be re-rendered while this is in flight; writing into a
            // detached element would silently show nothing.
            if (this._friendsListEl !== list) return;

            list.textContent = '';

            // Incoming first: it is the only part of this that is waiting on you.
            this._appendFriendGroup(list, 'Wants to be friends', requests.incoming ?? [], (friend) => [
                this._friendAction('Accept', 'account-primary', async () => {
                    await this.client.acceptFriend(friend.id);
                    this._setStatus(`You and ${friend.name} are friends.`, 'success');
                }),
                this._friendAction('Decline', 'account-secondary', async () => {
                    await this.client.dropFriendRequest(friend.id);
                    this._setStatus('Declined.', 'success');
                }),
            ]);

            this._appendFriendGroup(list, 'Asked', requests.outgoing ?? [], (friend) => [
                this._friendAction('Withdraw', 'account-secondary', async () => {
                    await this.client.dropFriendRequest(friend.id);
                    this._setStatus('Request withdrawn.', 'success');
                }),
            ]);

            this._appendFriendGroup(list, 'Friends', friends ?? [], (friend) => [
                this._friendAction('Remove', 'account-secondary', async () => {
                    await this.client.unfriend(friend.id);
                    this._setStatus(`Removed ${friend.name}.`, 'success');
                }, `Remove ${friend.name} from your friends?`),
            ]);

            if (!list.hasChildNodes()) {
                const empty = document.createElement('p');
                empty.className = 'account-empty';
                empty.textContent = 'Nobody yet. Add someone by their username above, '
                    + 'then their posts appear under Friends in the feed.';
                list.appendChild(empty);
            }
        } catch (error) {
            if (this._friendsListEl !== list) return;
            list.textContent = `Could not load your friends: ${error.message}`;
        }
    }

    _appendFriendGroup(list, title, people, actionsFor) {
        if (people.length === 0) return;

        const heading = document.createElement('div');
        heading.className = 'account-friends-group';
        heading.textContent = `${title} (${people.length})`;
        list.appendChild(heading);

        for (const friend of people) {
            const row = document.createElement('div');
            row.className = 'account-friend';

            const who = document.createElement('span');
            who.className = 'account-friend-who';
            const name = document.createElement('span');
            name.className = 'account-friend-name';
            name.textContent = friend.name || 'Someone';
            who.appendChild(name);
            if (friend.username) {
                const handle = document.createElement('span');
                handle.className = 'account-friend-handle';
                handle.textContent = `@${friend.username}`;
                who.appendChild(handle);
            }

            const actions = document.createElement('span');
            actions.className = 'account-friend-actions';
            for (const button of actionsFor(friend)) actions.appendChild(button);

            row.append(who, actions);
            list.appendChild(row);
        }
    }

    /**
     * One button in a friend row.
     *
     * Disables itself for the duration: these are one-shot acts, and a second tap
     * on "Accept" while the first is in flight is a request the server answers 404,
     * which would report a failure for something that worked.
     */
    _friendAction(label, className, run, confirmWith = null) {
        const button = document.createElement('button');
        button.className = `account-friend-action ${className}`;
        button.type = 'button';
        button.textContent = label;
        button.addEventListener('click', async () => {
            if (confirmWith && !confirm(confirmWith)) return;
            button.disabled = true;
            try {
                await run();
                this._loadFriends();
            } catch (error) {
                this._setStatus(this._describe(error), 'error');
                button.disabled = false;
            }
        });
        return button;
    }

    /**
     * The maps this person has made public.
     *
     * Filtered from their own list rather than fetched from a new endpoint: the
     * summaries already carry visibility, and for your OWN account the answer is
     * already in hand. Reading somebody else's profile will need an endpoint, and
     * that is a different feature.
     */
    _renderPublicMaps() {
        const box = document.createElement('div');
        box.className = 'account-maps';

        const heading = document.createElement('div');
        heading.className = 'account-section-title';
        heading.textContent = 'Public maps';
        box.appendChild(heading);

        const list = document.createElement('div');
        list.className = 'account-maps-list';
        list.textContent = 'Loading…';
        box.appendChild(list);

        (async () => {
            if (!this.client?.available) {
                list.textContent = 'The API is not configured.';
                return;
            }
            try {
                const maps = await this.client.listMyMaps({ limit: 50 });
                const shared = (maps ?? []).filter((m) => m.visibility === 'public');

                list.textContent = '';
                if (shared.length === 0) {
                    const empty = document.createElement('p');
                    empty.className = 'account-empty';
                    // Says how to change it, because "none" on its own reads as a
                    // missing feature rather than as a setting nobody has used.
                    empty.textContent = 'None yet. Set a map to Public in Maps to '
                        + 'have it listed here.';
                    list.appendChild(empty);
                    return;
                }

                for (const map of shared) {
                    const row = document.createElement('div');
                    row.className = 'account-map';
                    const title = document.createElement('span');
                    title.className = 'account-map-title';
                    title.textContent = map.title || 'Untitled';
                    const meta = document.createElement('span');
                    meta.className = 'account-map-meta';
                    meta.textContent = `${map.node_count ?? 0} nodes`;
                    row.append(title, meta);
                    list.appendChild(row);
                }
            } catch (error) {
                list.textContent = `Could not load your maps: ${error.message}`;
            }
        })();

        return box;
    }

    _renderProfileForm(state) {
        const form = document.createElement('div');
        form.className = 'account-form';

        const nameLabel = document.createElement('label');
        nameLabel.className = 'account-label';
        nameLabel.textContent = 'Display name';
        const nameInput = document.createElement('input');
        nameInput.className = 'account-input';
        nameInput.type = 'text';
        nameInput.maxLength = 60;
        nameInput.placeholder = state.user?.name || 'How others see you';
        nameInput.value = this.profile?.display_name ?? '';
        nameLabel.appendChild(nameInput);

        const avatarLabel = document.createElement('label');
        avatarLabel.className = 'account-label';
        avatarLabel.textContent = 'Avatar image URL';
        const avatarInput = document.createElement('input');
        avatarInput.className = 'account-input';
        avatarInput.type = 'url';
        avatarInput.placeholder = 'https://…';
        avatarInput.value = this.profile?.avatar_url ?? '';
        avatarLabel.appendChild(avatarInput);

        const hint = document.createElement('div');
        hint.className = 'account-hint';
        // Honest about why this is a URL and not a file picker.
        hint.textContent = 'A link to an image. Uploads need object storage, '
            + 'which this deployment does not have yet.';

        const bioLabel = document.createElement('label');
        bioLabel.className = 'account-label';
        bioLabel.textContent = 'Bio';
        const bioInput = document.createElement('textarea');
        bioInput.className = 'account-input account-bio';
        bioInput.rows = 4;
        // Matches MAX_BIO in api/models.py. The server enforces it; this stops
        // someone writing 900 characters and only then being told.
        bioInput.maxLength = 600;
        bioInput.placeholder = 'A few lines about you and what you map.';
        bioInput.value = this.profile?.bio ?? '';
        bioLabel.appendChild(bioInput);

        const remaining = document.createElement('div');
        remaining.className = 'account-hint';
        const countdown = () => {
            const left = 600 - bioInput.value.length;
            remaining.textContent = `${left} character${left === 1 ? '' : 's'} left`;
        };
        bioInput.addEventListener('input', countdown);
        countdown();

        const save = document.createElement('button');
        save.className = 'account-primary';
        save.type = 'button';
        save.textContent = 'Save profile';
        save.addEventListener('click', async () => {
            const avatarText = avatarInput.value.trim();
            if (avatarText && !safeUrl(avatarText)) {
                this._setStatus('That avatar link is not a valid http or https URL.', 'warning');
                avatarInput.focus();
                return;
            }

            save.disabled = true;
            this._setStatus('Saving…');
            try {
                // null, not '': the API treats null as "clear it" and an omitted
                // field as "leave it alone".
                this.profile = await this.client.updateProfile({
                    display_name: nameInput.value.trim() || null,
                    avatar_url: avatarText || null,
                    // trim() only at the ends: a bio has paragraphs, and the
                    // server's validator makes the same distinction.
                    bio: bioInput.value.trim() || null,
                });
                this._setStatus('Saved.');
                this.notify('Profile updated');
                // The feed shows author names, so it has to be told.
                this.onProfileChanged();
                this._render();
            } catch (error) {
                this._setStatus(this._describe(error), 'error');
            } finally {
                save.disabled = false;
            }
        });

        form.append(nameLabel, avatarLabel, hint, bioLabel, remaining, save);
        return form;
    }

    _note(text) {
        const note = document.createElement('p');
        note.className = 'account-note';
        note.textContent = text;
        this.bodyEl.appendChild(note);
    }

    _setStatus(text, type = 'info') {
        if (!this.statusEl) return;
        this.statusEl.textContent = text || '';
        this.statusEl.className = `account-status ${type}`;
    }

    _describe(error) {
        if (error?.status === 0) return 'No API configured';
        if (error?.isAuthError) return 'Sign in to do that';
        if (error?.status === 503) return 'The server is not ready';
        if (error?.status === 422) return `The server rejected that: ${error.message}`;
        return error?.message || 'Something went wrong';
    }

    // --- styles ------------------------------------------------------------

    _injectStyles() {
        if (document.getElementById('account-panel-styles')) return;

        const style = document.createElement('style');
        style.id = 'account-panel-styles';
        style.textContent = `
            .account-panel {
                position: fixed;
                top: 64px;
                left: 16px;
                bottom: auto;
                width: 340px;
                max-height: 80vh;
                display: flex;
                flex-direction: column;
                overflow-y: auto;
                background: rgba(0, 0, 0, 0.94);
                border: 1px solid #333;
                border-radius: 10px;
                backdrop-filter: blur(12px);
                color: #fff;
                font-size: 13px;
                z-index: 1001;
            }
            .account-panel.hidden { display: none; }

            .account-header {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 10px 12px;
                border-bottom: 1px solid #222;
            }
            .account-header h3 {
                margin: 0;
                flex: 1;
                font-size: 13px;
                color: #0ff;
                text-transform: uppercase;
                letter-spacing: 1px;
            }
            .account-close {
                min-width: 34px;
                min-height: 34px;
                background: rgba(255,255,255,0.06);
                border: 1px solid #333;
                border-radius: 6px;
                color: #fff;
                font-size: 19px;
                line-height: 1;
                cursor: pointer;
            }
            .account-close:hover { border-color: #0ff; }

            .account-body {
                display: flex;
                flex-direction: column;
                gap: 12px;
                padding: 12px;
            }

            .account-identity { display: flex; align-items: center; gap: 10px; }
            .account-avatar {
                flex: 0 0 auto;
                width: 44px;
                height: 44px;
                border-radius: 50%;
                background: rgba(0,255,255,0.12);
                border: 1px solid #077;
                color: #0ff;
                font-size: 19px;
                font-weight: 600;
                display: flex;
                align-items: center;
                justify-content: center;
                overflow: hidden;
            }
            .account-avatar img { width: 100%; height: 100%; object-fit: cover; }
            .account-who { min-width: 0; }
            .account-name { font-weight: 600; overflow-wrap: anywhere; }
            .account-email { color: #888; font-size: 11px; overflow-wrap: anywhere; }

            .account-form { display: flex; flex-direction: column; gap: 10px; }
            .account-label {
                display: flex;
                flex-direction: column;
                gap: 4px;
                color: #999;
                font-size: 11px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            .account-input {
                padding: 8px 10px;
                background: rgba(255,255,255,0.04);
                border: 1px solid #2c2c2c;
                border-radius: 7px;
                color: #fff;
                font-family: inherit;
                font-size: 13px;
                text-transform: none;
                letter-spacing: normal;
            }
            .account-input:focus { outline: none; border-color: #0ff; }
            .account-hint { color: #666; font-size: 11px; line-height: 1.4; }

            .account-handle {
                color: #0ff;
                font-size: 12px;
                font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            }
            /* Not an error colour: having no handle yet is a state, not a fault. */
            .account-handle-missing { color: #8a7f5a; font-style: italic; }

            .account-bio {
                min-height: 84px;
                resize: vertical;
                font-family: inherit;
                line-height: 1.45;
            }

            .account-claim {
                border: 1px solid #3a4a2a;
                background: rgba(30,40,20,0.5);
                border-radius: 8px;
                padding: 12px;
                margin: 12px 0;
            }
            .account-claim-why {
                margin: 0 0 10px;
                color: #b9c7a8;
                font-size: 12px;
                line-height: 1.45;
            }
            .account-claim-row { display: flex; gap: 8px; align-items: stretch; }
            .account-claim-row .account-input { flex: 1; min-width: 0; }
            .account-claim-row .account-primary { flex: 0 0 auto; }

            .account-section-title {
                color: #0ff;
                font-size: 11px;
                letter-spacing: 0.08em;
                text-transform: uppercase;
                margin: 18px 0 8px;
            }
            .account-maps-list { display: flex; flex-direction: column; gap: 6px; }
            .account-map {
                display: flex;
                justify-content: space-between;
                gap: 10px;
                padding: 8px 10px;
                background: rgba(255,255,255,0.03);
                border: 1px solid #262b30;
                border-radius: 6px;
                font-size: 12px;
            }
            .account-map-title { color: #dfe8ec; overflow-wrap: anywhere; }
            .account-map-meta { color: #6a7f88; flex: 0 0 auto; }
            .account-empty { margin: 0; color: #6a7f88; font-size: 12px; line-height: 1.45; }

            .account-friends-list { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
            .account-friends-group {
                color: #6a7f88;
                font-size: 11px;
                letter-spacing: 0.06em;
                text-transform: uppercase;
                margin: 8px 0 2px;
            }
            .account-friend {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 10px;
                padding: 7px 10px;
                background: rgba(255,255,255,0.03);
                border: 1px solid #262b30;
                border-radius: 6px;
                font-size: 12px;
            }
            .account-friend-who {
                display: flex;
                flex-direction: column;
                min-width: 0;
            }
            .account-friend-name { color: #dfe8ec; overflow-wrap: anywhere; }
            .account-friend-handle { color: #6a7f88; font-size: 11px; overflow-wrap: anywhere; }
            .account-friend-actions { display: flex; gap: 6px; flex: 0 0 auto; }
            /* Smaller than the page's buttons, but not below the 32px a thumb needs:
               these sit in a list where the row above is a different person. */
            .account-friend-action {
                min-height: 32px;
                padding: 5px 10px;
                font-size: 12px;
            }
            .account-note { margin: 0; color: #aaa; font-size: 12px; line-height: 1.5; }

            .account-primary, .account-secondary {
                min-height: 40px;
                padding: 9px 14px;
                border-radius: 7px;
                font-family: inherit;
                font-size: 13px;
                cursor: pointer;
            }
            .account-primary {
                background: rgba(0,255,255,0.12);
                border: 1px solid #077;
                color: #0ff;
                font-weight: 600;
            }
            .account-primary:hover { border-color: #0ff; }
            .account-primary:disabled { opacity: 0.5; cursor: default; }
            .account-secondary {
                background: rgba(255,255,255,0.05);
                border: 1px solid #333;
                color: #ccc;
            }
            .account-secondary:hover { border-color: #ef4444; color: #f87171; }

            .account-status {
                padding: 8px 12px;
                border-top: 1px solid #222;
                color: #888;
                font-size: 11px;
                min-height: 22px;
                word-break: break-word;
            }
            .account-status.warning { color: #fcd34d; }
            .account-status.error { color: #f87171; }

            @media (max-width: 720px), (max-height: 500px) {
                .account-panel {
                    top: 44px;
                    left: 8px;
                    right: 8px;
                    width: auto;
                    bottom: calc(var(--dock-height, 0px) + 8px);
                    max-height: none;
                }
            }
        `;
        document.head.appendChild(style);
    }
}
