// public/sw.js — the service worker for Fractality Platform.
//
// A service worker is the one piece of a web app that can break the app permanently: it
// sits in front of every request, it survives reloads, and a bad one serves a stale build
// to a user who has no obvious way to escape it. So this is deliberately conservative, and
// what it does NOT do is the important part.
//
// It never caches anything cross-origin. The API lives on its own origin, so this rule
// alone keeps authenticated responses — your maps, your feed, your profile — out of a
// cache that outlives the session. Same-origin API paths are excluded by name as well, in
// case the API is ever put behind the same host.
//
// It never caches a request that carries credentials, and it only ever handles GET.
//
// Navigation is network-FIRST, so a deploy is picked up the moment the user is online. The
// cache is a fallback for being offline, not the primary source. Only the hashed build
// assets are cache-first, and those are safe because their names change when their
// contents do — that is what a content hash is for.

const VERSION = 'v1';
const SHELL_CACHE = `fractality-shell-${VERSION}`;
const ASSET_CACHE = `fractality-assets-${VERSION}`;

/** The minimum needed to show something useful with no network. */
const SHELL = ['/', '/index.html', '/manifest.webmanifest'];

/**
 * Paths that must never be cached even when served from this origin.
 *
 * Everything here is either per-user or authenticated. A shared cache is the wrong place
 * for any of it, and "the API is on another origin today" is not a reason to rely on that
 * staying true.
 */
const NEVER_CACHE = ['/api/', '/maps', '/pulses', '/me', '/health'];

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(SHELL_CACHE);
        // Individually, not addAll: addAll rejects the whole install if any single request
        // fails, and one missing file should not leave the app with no worker at all.
        await Promise.all(SHELL.map(async (path) => {
            try {
                await cache.add(new Request(path, { cache: 'reload' }));
            } catch {
                /* not fatal */
            }
        }));
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        // Drop caches from older versions, or they accumulate for as long as the app is
        // installed.
        const names = await caches.keys();
        await Promise.all(names
            .filter((name) => name.startsWith('fractality-')
                && name !== SHELL_CACHE && name !== ASSET_CACHE)
            .map((name) => caches.delete(name)));
        await self.clients.claim();
    })());
});

/**
 * Take over immediately, but only when the page asks.
 *
 * Not on install: replacing the worker under a running page can leave it half on one build
 * and half on another. The page decides, after telling the user a new version is ready.
 */
self.addEventListener('message', (event) => {
    if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
    const { request } = event;

    if (request.method !== 'GET') return;

    let url;
    try {
        url = new URL(request.url);
    } catch {
        return;
    }

    // Cross-origin, which includes the API. Left entirely alone: not intercepted, not
    // cached, not inspected.
    if (url.origin !== self.location.origin) return;

    if (NEVER_CACHE.some((path) => url.pathname.startsWith(path))) return;

    // A credentialed request is per-user by definition.
    if (request.headers.has('Authorization')) return;

    // The build's hashed assets, and ONLY those. Cache-first is safe here because the
    // filename changes when the contents do — that is what a content hash is for — and it
    // is what makes a second launch fast.
    //
    // /icons/ is deliberately NOT here. Those filenames are fixed, so a cache-first entry
    // would serve the old artwork until this file's VERSION changes, which is a longer
    // pin than the HTTP cache the icons are already given. They fall through to the
    // network, and the installed app gets its icon from the OS anyway.
    if (url.pathname.startsWith('/assets/')) {
        event.respondWith(cacheFirst(request, ASSET_CACHE));
        return;
    }

    // Everything else, navigation included: network first, cache only as a fallback.
    if (request.mode === 'navigate' || SHELL.includes(url.pathname)) {
        event.respondWith(networkFirst(request, SHELL_CACHE));
    }
});

async function cacheFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    const hit = await cache.match(request);
    if (hit) return hit;

    const response = await fetch(request);
    // Only complete, successful, same-origin responses. An opaque or partial response
    // cached here would be indistinguishable from a real one on the next read.
    if (response.ok && response.type === 'basic') {
        cache.put(request, response.clone());
    }
    return response;
}

async function networkFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    try {
        const response = await fetch(request);
        if (response.ok && response.type === 'basic') {
            cache.put(request, response.clone());
        }
        return response;
    } catch (error) {
        const hit = await cache.match(request)
            // A deep link opened offline still gets the shell, which is what a
            // single-page app needs to route it.
            ?? await cache.match('/index.html');
        if (hit) return hit;
        throw error;
    }
}
