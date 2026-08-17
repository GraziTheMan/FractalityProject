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
            const { Clerk } = await import('@clerk/clerk-js');
            const instance = new Clerk(publishableKey);
            await instance.load({ afterSignOutUrl: window.location.origin });

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

function notify() {
    const state = getAuthState();
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
                  imageUrl: user.imageUrl ?? null
              }
            : null
    };
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
