// src/utils/sanitize.js
//
// Escaping helpers for rendering user-authored content.
//
// The app builds a lot of its DOM with innerHTML and template literals. That is
// fine for static markup, but the moment a string comes from a user — a post
// title, a display name, a tag, a node label — interpolating it raw is stored
// XSS: one crafted value executes in every reader's browser.
//
// Rules of thumb:
//   * Prefer textContent over innerHTML when you only need text.
//   * If you must use innerHTML, run every user-authored value through
//     escapeHtml(), and every URL through safeUrl().
//   * Escaping is not a substitute for server-side validation. Do both.

/**
 * Escape a value for interpolation into HTML text or a quoted attribute.
 * Handles the five characters that can break out of either context.
 *
 * @param {*} value coerced to string; null/undefined become ''
 * @returns {string}
 */
export function escapeHtml(value) {
    if (value === null || value === undefined) return '';

    return String(value)
        .replace(/&/g, '&amp;')   // must be first
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Drop ASCII control characters and spaces.
 *
 * Done by code point rather than a regex range: attackers embed raw control
 * bytes (newlines, NULs, tabs) inside a scheme to slip past naive checks, as in
 * "java\nscript:alert(1)", and a literal control character in a regex literal is
 * itself easy to get wrong.
 */
function stripBlankAndControl(str) {
    let out = '';
    for (const ch of str) {
        if (ch.codePointAt(0) > 0x20) out += ch;
    }
    return out;
}

const BLOCKED_SCHEMES = /^(javascript|data|vbscript|file|blob):/;
const ANY_SCHEME = /^[a-z][a-z0-9+.-]*:/;

/**
 * Validate a URL for use in an href/src attribute.
 *
 * Allows absolute http(s), protocol-relative (//host), root-relative (/path) and
 * bare relative paths. Rejects every other scheme — notably `javascript:` and
 * `data:`, which execute or can carry markup when placed in an attribute.
 *
 * @param {*} url
 * @returns {string|null} an escaped, safe URL, or null if it must not be used
 */
export function safeUrl(url) {
    if (!url) return null;

    const raw = String(url).trim();
    if (raw === '') return null;

    const probe = stripBlankAndControl(raw).toLowerCase();

    if (BLOCKED_SCHEMES.test(probe)) return null;
    if (ANY_SCHEME.test(probe) && !/^https?:/.test(probe)) return null;

    return escapeHtml(raw);
}

/**
 * Escape a value for use inside a CSS context (e.g. a custom property).
 * Conservative: strips anything outside a safe allowlist.
 */
export function safeCssValue(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[^a-zA-Z0-9#(),.%\s-]/g, '');
}
