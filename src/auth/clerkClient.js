// src/auth/clerkClient.js
//
// Sign-in, backed by Clerk.
//
// Everything provider-specific is confined to this file. The rest of the app
// only uses: isSignedIn(), getToken(), signIn(), signOut(), onAuthChange().
// Swapping providers means rewriting this module, not the callers.
//
// The publishable key IS meant to be public — that is the whole point of the
// publishable/secret split, and it is why this one VITE_ variable is a
// legitimate exception to the "never put keys in VITE_" rule. Clerk's *secret*
// key must never appear in frontend code or in any VITE_ variable.
//
// @clerk/clerk-js is loaded through a dynamic import so it is code-split out of
// the main bundle and only downloaded when auth is actually configured.

const PUBLISHABLE_KEY_VAR = 'VITE_CLERK_PUBLISHABLE_KEY';

function env(name) {
    try {
        return import.meta.env?.[name];
    } catch {
        return undefined;
    }
}

const publishableKey = env(PUBLISHABLE_KEY_VAR) || null;

let clerk = null;
let loading = null;
const listeners = new Set();

/** True when a publishable key is configured. */
export function hasAuth() {
    return Boolean(publishableKey);
}

/**
 * Load and initialise Clerk. Idempotent; concurrent callers share the load.
 * Resolves to null when auth is not configured.
 */
export async function loadAuth() {
    if (clerk) return clerk;
    if (loading) return loading;

    if (!hasAuth()) {
        console.info(
            `🔑 Auth disabled: set ${PUBLISHABLE_KEY_VAR} to enable accounts. ` +
            'The app runs fine without it, using local data only.'
        );
        return null;
    }

    loading = (async () => {
        try {
            // Two packages, both required. As of clerk-js v6 the core bundle does
            // NOT contain the UI components: they live in @clerk/ui and must be
            // handed to load(). Omit them and load() still succeeds, then throws
            // "Clerk was not loaded with Ui components" the moment anything opens
            // a modal — so the failure shows up on first sign-in, not at startup.
            //
            // Pass `ui` straight through. It is an object of the shape
            // { __brand, version, ClerkUI }, and clerk-js reads `options.ui.ClerkUI`
            // and calls `new` on it. Wrapping it again as `{ ClerkUI: ui }` makes
            // that field the wrapper object instead of the class, which fails later
            // and less helpfully with "is not a constructor".
            const [{ Clerk }, { ui }] = await Promise.all([
                import('@clerk/clerk-js'),
                import('@clerk/ui')
            ]);

            const instance = new Clerk(publishableKey);
            await instance.load({
                afterSignOutUrl: window.location.origin,
                ui
            });

            clerk = instance;

            // Notify on any session change so the UI can re-render
            instance.addListener(() => notify());
            notify();

            return clerk;
        } catch (error) {
            console.error('🔑 Auth failed to load:', error);
            return null;
        } finally {
            loading = null;
        }
    })();

    return loading;
}

/**
 * A signature of everything a listener can observe through getAuthState().
 *
 * Deliberately built from the returned shape rather than from Clerk's objects, so
 * it cannot drift from what getAuthState() actually exposes: if a field is added
 * there and not here, the change is invisible to subscribers anyway.
 */
export function stateSignature(state) {
    return JSON.stringify([
        state.configured,
        state.signedIn,
        state.user?.id ?? null,
        state.user?.name ?? null,
        state.user?.email ?? null,
        state.user?.imageUrl ?? null,
        state.user?.username ?? null
    ]);
}

let lastSignature = null;

/**
 * Broadcast, but only when something a listener can SEE has changed.
 *
 * Clerk's addListener fires on any resource change, and the session token is
 * refreshed on a timer — roughly once a minute. Every one of those was a full
 * notification carrying a state identical to the previous one, and subscribers
 * respond to a notification by re-rendering. The visible result was a menu or a
 * panel rebuilding itself about once a minute for no reason, and in the feed's
 * compose area that meant text the user was part-way through typing was thrown
 * away. A silent, periodic loss of someone's writing is the worst kind of bug
 * this class produces, which is why the guard belongs here at the source rather
 * than in each of the four subscribers.
 *
 * onAuthChange still fires immediately on subscribe, which is a different thing:
 * that one is "tell me where we are", not "something changed".
 */
function notify() {
    const state = getAuthState();

    const signature = stateSignature(state);
    if (signature === lastSignature) return;
    lastSignature = signature;

    for (const listener of [...listeners]) {
        try {
            listener(state);
        } catch (error) {
            console.error('Auth listener failed:', error);
        }
    }
}

/**
 * Subscribe to sign-in/sign-out. Returns an unsubscribe function.
 * Fires immediately with the current state.
 */
export function onAuthChange(listener) {
    listeners.add(listener);
    listener(getAuthState());
    return () => listeners.delete(listener);
}

export function getAuthState() {
    if (!hasAuth()) return { configured: false, signedIn: false, user: null };

    const user = clerk?.user ?? null;
    return {
        configured: true,
        signedIn: Boolean(user),
        user: user
            ? {
                  id: user.id,
                  name:
                      user.fullName ||
                      user.username ||
                      user.primaryEmailAddress?.emailAddress ||
                      'Signed in',
                  email: user.primaryEmailAddress?.emailAddress ?? null,
                  imageUrl: user.imageUrl ?? null,
                  // Separate from `name`, which falls back through several things
                  // and can therefore be an email address. This is the handle —
                  // unique, permanent, and null when the account predates the
                  // provider requiring one.
                  username: user.username ?? null
              }
            : null
    };
}

/**
 * Open the provider's own account settings.
 *
 * Deliberately not reimplemented. Changing an email or a password runs through
 * verification mails, re-authentication and whatever second factor is configured;
 * a hand-built form here would either duplicate that badly or bypass it. Clerk's
 * modal is the same one they maintain for those flows.
 */
export async function openAccountSettings() {
    const instance = clerk ?? (await loadAuth());
    if (!instance?.openUserProfile) return false;
    instance.openUserProfile();
    return true;
}

/**
 * Claim a username, once.
 *
 * Only ever fills a blank. Usernames are meant to be permanent here — the app is
 * becoming social, and a handle that changes is a handle that misidentifies
 * people in every conversation it already appears in — so this refuses to
 * overwrite one that exists rather than offering a rename that the rest of the
 * app would have to chase.
 *
 * It exists at all because accounts created before the provider required a
 * username have none, and there is otherwise no way to give them one.
 *
 * @returns {Promise<{ok: true, username: string} | {ok: false, reason: string}>}
 */
export async function claimUsername(candidate) {
    const wanted = String(candidate ?? '').trim();
    if (!wanted) return { ok: false, reason: 'Choose a username first' };

    const instance = clerk ?? (await loadAuth());
    if (!instance?.user) return { ok: false, reason: 'Sign in first' };

    if (instance.user.username) {
        return { ok: false, reason: 'Your username is already set and cannot be changed' };
    }

    try {
        await instance.user.update({ username: wanted });
        notify();
        return { ok: true, username: instance.user.username ?? wanted };
    } catch (error) {
        // Clerk reports "already taken" and "not allowed" through the same shape;
        // its own message is more specific than anything invented here.
        const detail = error?.errors?.[0]?.longMessage
            || error?.errors?.[0]?.message
            || error?.message
            || 'That username could not be set';
        return { ok: false, reason: detail };
    }
}

export function isSignedIn() {
    return Boolean(clerk?.user);
}

/**
 * Current session token for the API's Authorization header.
 * Returns null when not configured or not signed in — callers must handle that
 * rather than assuming a token exists.
 */
export async function getToken() {
    if (!hasAuth()) return null;

    const instance = clerk ?? (await loadAuth());
    if (!instance?.session) return null;

    try {
        return await instance.session.getToken();
    } catch (error) {
        console.warn('🔑 Could not get session token:', error);
        return null;
    }
}

/** Open Clerk's hosted sign-in UI. */
export async function signIn() {
    const instance = clerk ?? (await loadAuth());
    if (!instance) {
        throw new Error(`Auth is not configured (${PUBLISHABLE_KEY_VAR} is unset)`);
    }
    instance.openSignIn({ afterSignInUrl: window.location.href });
}

export async function signOut() {
    const instance = clerk ?? (await loadAuth());
    if (!instance) return;
    await instance.signOut();
}

/** Mount Clerk's user button into a container, if auth is available. */
export async function mountUserButton(element) {
    const instance = clerk ?? (await loadAuth());
    if (!instance || !element) return false;

    instance.mountUserButton(element);
    return true;
}
