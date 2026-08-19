// src/pwa.js
//
// Registering the service worker, and telling the user when a new build is ready.
//
// Two rules, both learned from how this usually goes wrong.
//
// It only registers in a production build. A service worker in front of a dev server
// caches the very files being edited, and the resulting "my change did nothing" is
// indistinguishable from a broken change.
//
// It never activates a new worker under a running page. Swapping the worker mid-session
// can leave the page half on one build and half on another — a module already loaded from
// the old build calling into one fetched from the new. So the user is told, and the swap
// happens on their reload.

/**
 * Register the service worker, if this build should have one.
 *
 * @param {(message: string, type?: string) => void} [notify]
 * @returns {Promise<ServiceWorkerRegistration|null>}
 */
export async function registerServiceWorker(notify = () => {}) {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;

    // import.meta.env.DEV is replaced at build time, so this whole branch is removed from
    // the production bundle rather than being a runtime check.
    if (import.meta.env?.DEV) {
        // And clean up after any worker a previous production build left registered on
        // localhost, which would otherwise keep serving its cache to the dev server.
        const existing = await navigator.serviceWorker.getRegistrations();
        await Promise.all(existing.map((r) => r.unregister()));
        return null;
    }

    try {
        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });

        registration.addEventListener('updatefound', () => {
            const incoming = registration.installing;
            if (!incoming) return;

            incoming.addEventListener('statechange', () => {
                if (incoming.state !== 'installed') return;

                // No existing controller means this is the first install, not an update:
                // there is no old version for the user to be warned about.
                if (!navigator.serviceWorker.controller) return;

                notify('A new version is ready — reload to use it.', 'info');
            });
        });

        return registration;
    } catch (error) {
        // Not fatal. A page that works online without a worker is a working page.
        console.warn('Service worker registration failed:', error.message);
        return null;
    }
}

/**
 * Whether the app is running as an installed app rather than in a browser tab.
 *
 * Used to decide whether to offer installing it — offering it to someone who already did
 * is the kind of small wrongness that makes an app feel unfinished.
 */
export function isInstalled() {
    if (typeof window === 'undefined') return false;
    return window.matchMedia?.('(display-mode: standalone)').matches === true
        // iOS Safari, which predates display-mode and never adopted it.
        || window.navigator.standalone === true;
}
