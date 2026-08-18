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

import { hasAuth, getAuthState, onAuthChange, signIn, signOut } from '../auth/clerkClient.js';
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

        if (hasAuth()) {
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
        return !hasAuth() || getAuthState().signedIn;
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

        if (!hasAuth()) {
            this._note(
                'Accounts are not configured for this deployment. '
                + 'Set VITE_CLERK_PUBLISHABLE_KEY to enable signing in.'
            );
            return;
        }

        if (!getAuthState().signedIn) {
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

        const state = getAuthState();

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
        const email = document.createElement('div');
        email.className = 'account-email';
        email.textContent = this.profile?.email || state.user?.email || '';
        who.append(name, email);

        identity.append(avatar, who);
        this.bodyEl.appendChild(identity);

        if (!this.client?.available) {
            this._note('The API is not configured, so your profile cannot be saved.');
        } else {
            this.bodyEl.appendChild(this._renderProfileForm(state));
        }

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

        form.append(nameLabel, avatarLabel, hint, save);
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
