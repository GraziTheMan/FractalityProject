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
// happens when they ask for it — see refreshApp() below, which is the other half of that
// bargain and was missing.
//
// It was missing in a way worth recording. The worker waits for a 'skip-waiting' message
// and NOTHING ever sent one, so a waiting build stayed waiting: a plain reload keeps the
// old worker in control, and only closing every copy of the app would let the new one
// take over. Inside an installed app there is no address bar and no pull-to-refresh, so
// there was no way to do even that. The notification said "reload to use it" and reloading
// did not use it.

/** Set when a new build has installed and is waiting to take over. */
let updateWaiting = false;

/** True when a newer build is installed and waiting for permission to take over. */
export function isUpdateWaiting() {
    return updateWaiting;
}

/**
 * Reload, applying a waiting update if there is one.
 *
 * The only way to refresh an installed app: no address bar, no pull-to-refresh, and a
 * plain reload would come back under the SAME worker and serve the same build. So this
 * hands the waiting worker its 'skip-waiting' message first, waits for it to take
 * control, and reloads into the new build.
 *
 * `update()` is called even when nothing is known to be waiting, because the browser only
 * checks for a new worker on its own schedule. Someone pressing Refresh is asking the
 * question directly, and should not be told "you are up to date" merely because nobody
 * has looked recently.
 *
 * Every path ends in a reload, including every failure. The one thing this must never do
 * is leave the user pressing Refresh and watching nothing happen — which is the state it
 * was written to fix.
 */
export async function refreshApp() {
    const reload = () => window.location.reload();

    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
        reload();
        return;
    }

    try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (!registration) {
            reload();
            return;
        }

        // Ask now rather than trusting the browser's own cadence.
        if (!registration.waiting) {
            try {
                await registration.update();
            } catch {
                // Offline, or the check failed. A reload is still the right answer.
            }
        }

        const waiting = registration.waiting;
        if (!waiting) {
            reload();
            return;
        }

        // Reload once the new worker is in charge, so the page comes back under it
        // rather than under the one being replaced.
        let reloaded = false;
        const once = () => {
            if (reloaded) return;
            reloaded = true;
            reload();
        };
        navigator.serviceWorker.addEventListener('controllerchange', once, { once: true });

        // A backstop. If controllerchange never arrives — the worker failed to activate,
        // the event was missed — reloading anyway is better than a button that did
        // nothing, and the guard above keeps it to one reload either way.
        setTimeout(once, 2500);

        waiting.postMessage('skip-waiting');
    } catch (error) {
        console.warn('Refresh could not apply an update:', error.message);
        reload();
    }
}

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

                updateWaiting = true;
                notify('A new version is ready — More › Refresh to use it.', 'info');
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
