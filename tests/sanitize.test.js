// tests/sanitize.test.js
//
// These guard the feed against stored XSS. The feed renderer builds markup with
// innerHTML, so a post title or display name that survives unescaped executes in
// every reader's browser. Do not relax these without replacing innerHTML use.

import test from 'node:test';
import assert from 'node:assert/strict';

import { escapeHtml, safeUrl, safeCssValue } from '../src/utils/sanitize.js';

test('escapeHtml neutralises tag injection', () => {
    assert.equal(
        escapeHtml('<script>alert(1)</script>'),
        '&lt;script&gt;alert(1)&lt;/script&gt;'
    );
});

test('escapeHtml neutralises attribute break-out', () => {
    // The classic payload for a value interpolated into src="..."
    assert.equal(
        escapeHtml('" onerror="alert(1)'),
        '&quot; onerror=&quot;alert(1)'
    );
    assert.equal(escapeHtml("' onload='x"), '&#39; onload=&#39;x');
});

test('escapeHtml escapes ampersands first, avoiding double-encoding bugs', () => {
    assert.equal(escapeHtml('&lt;'), '&amp;lt;');
});

test('escapeHtml coerces null and undefined to empty string', () => {
    assert.equal(escapeHtml(null), '');
    assert.equal(escapeHtml(undefined), '');
    assert.equal(escapeHtml(0), '0');
});

test('safeUrl allows ordinary web URLs and relative paths', () => {
    assert.equal(safeUrl('https://example.com/a.png'), 'https://example.com/a.png');
    assert.equal(safeUrl('http://example.com'), 'http://example.com');
    assert.equal(safeUrl('/avatars/1.png'), '/avatars/1.png');
    assert.equal(safeUrl('avatars/1.png'), 'avatars/1.png');
    assert.equal(safeUrl('//cdn.example.com/a.png'), '//cdn.example.com/a.png');
});

test('safeUrl rejects javascript: and data: URLs', () => {
    assert.equal(safeUrl('javascript:alert(1)'), null);
    assert.equal(safeUrl('JavaScript:alert(1)'), null);
    assert.equal(safeUrl('data:text/html,<script>alert(1)</script>'), null);
    assert.equal(safeUrl('vbscript:msgbox(1)'), null);
});

test('safeUrl rejects schemes obfuscated with control characters', () => {
    // Browsers ignore embedded control chars when resolving the scheme, so a
    // naive startsWith('javascript:') check misses these.
    assert.equal(safeUrl('java\nscript:alert(1)'), null);
    assert.equal(safeUrl('java\tscript:alert(1)'), null);
    assert.equal(safeUrl(' javascript:alert(1)'), null);
    assert.equal(safeUrl('java script:alert(1)'), null);
});

test('safeUrl rejects unknown schemes but keeps escaping applied', () => {
    assert.equal(safeUrl('ftp://example.com'), null);
    // A query string with HTML metacharacters must come back escaped
    assert.equal(
        safeUrl('https://example.com/?q=<b>&x=1'),
        'https://example.com/?q=&lt;b&gt;&amp;x=1'
    );
});

test('safeUrl treats empty input as absent', () => {
    assert.equal(safeUrl(''), null);
    assert.equal(safeUrl('   '), null);
    assert.equal(safeUrl(null), null);
    assert.equal(safeUrl(undefined), null);
});

test('safeCssValue strips characters that could close a declaration', () => {
    assert.equal(safeCssValue('red'), 'red');
    assert.equal(safeCssValue('#8b5cf6'), '#8b5cf6');
    assert.equal(safeCssValue('rgb(1, 2, 3)'), 'rgb(1, 2, 3)');
    assert.equal(safeCssValue('red; background: url(x)'), 'red background url(x)');
});
