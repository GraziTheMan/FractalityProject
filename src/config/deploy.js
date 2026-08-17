// src/config/deploy.js
//
// Single source of truth for anything environment-dependent: which backend to
// talk to, which realtime endpoint to use, whether the local Python CLI bridge
// is available.
//
// Everything here comes from Vite env vars, which are substituted at BUILD
// time. Two consequences worth knowing:
//
//   * Only names prefixed VITE_ are exposed to client code. That is a feature —
//     it makes it hard to leak a server secret by accident.
//   * Because substitution happens at build time, changing one of these
//     requires a rebuild, not just a restart. On Render, that means the values
//     must be set as environment variables on the *static site* (build) config.
//
// NEVER put a provider API key or any other secret in a VITE_ var. It ends up
// in the JS bundle served to every visitor. Secrets belong on the server; see
// src/config/chatConfig.js for the longer version of this warning.

/**
 * Read a Vite env var without assuming a bundler or a Node global, so this
 * module is safe to import from tests and from plain node.
 */
function env(name) {
    try {
        return import.meta.env?.[name];
    } catch {
        return undefined;
    }
}

function bool(value, fallback = false) {
    if (value === undefined || value === '') return fallback;
    return value === 'true' || value === '1' || value === true;
}

/** Strip a trailing slash so callers can safely template `${base}/path`. */
function normalizeBase(url) {
    if (!url) return null;
    return url.replace(/\/+$/, '');
}

const isDev = bool(env('DEV'), false) || env('MODE') === 'development';

export const deployConfig = {
    /** True when running under `vite dev`. */
    isDev,

    /**
     * Base URL of the Fractality API (mind maps, feed, users).
     * Null until the backend exists — callers must handle that.
     * e.g. https://api.fractiverse.com
     */
    apiBase: normalizeBase(env('VITE_API_BASE')),

    /**
     * Realtime endpoint for chat. Null disables realtime entirely rather
     * than falling back to some previous deployment's host.
     */
    socketUrl: normalizeBase(env('VITE_SOCKET_URL')),

    /**
     * The Python CLI bridge (NodeBridge). This is a *local developer tool* —
     * it runs on your own machine alongside the CLI. It must stay unset in
     * production: a deployed page cannot reach your localhost, and a
     * plain-http URL is blocked outright as mixed content on an https site.
     *
     * Defaults to the conventional local port during dev only.
     */
    cliBridgeUrl: normalizeBase(env('VITE_CLI_BRIDGE_URL'))
        || (isDev ? 'http://localhost:8001' : null),

    /** Server-side proxy that holds the real AI provider credentials. */
    aiProxyUrl: normalizeBase(env('VITE_AI_PROXY_URL')),

    /**
     * Clerk publishable key.
     *
     * This is the one credential that legitimately belongs in a VITE_ variable:
     * publishable keys are designed to be public, which is the entire point of
     * the publishable/secret split. Clerk's SECRET key must never appear here or
     * anywhere else in frontend code.
     */
    clerkPublishableKey: env('VITE_CLERK_PUBLISHABLE_KEY') || null,
};

/** True when a real backend is configured. */
export function hasApi() {
    return Boolean(deployConfig.apiBase);
}

/** True when the local Python CLI bridge should be contacted at all. */
export function hasCliBridge() {
    return Boolean(deployConfig.cliBridgeUrl);
}

/** True when chat realtime is configured. */
export function hasRealtime() {
    return Boolean(deployConfig.socketUrl);
}

export default deployConfig;
