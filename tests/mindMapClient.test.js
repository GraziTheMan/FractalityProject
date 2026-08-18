// tests/mindMapClient.test.js
//
// Covers the transport behaviour that a browser test cannot reach reliably: how
// the client reacts when fetch fails without a response.
//
// This matters because the failure it models actually happened in production —
// a save succeeded and the list request immediately after it failed at the
// transport layer, which made a committed save look like a lost one.

import test from 'node:test';
import assert from 'node:assert/strict';

import { MindMapClient, ApiError } from '../src/api/mindMapClient.js';

/** A fetch stand-in that fails the first `failures` calls, then succeeds. */
function flakyFetch(failures, { body = { ok: true }, error } = {}) {
    let calls = 0;
    const fn = async () => {
        calls++;
        if (calls <= failures) {
            throw error ?? new TypeError('Failed to fetch');
        }
        return {
            ok: true,
            status: 200,
            statusText: 'OK',
            text: async () => JSON.stringify(body),
        };
    };
    Object.defineProperty(fn, 'calls', { get: () => calls });
    return fn;
}

function client(fetchImpl) {
    globalThis.fetch = fetchImpl;
    return new MindMapClient({ baseUrl: 'https://api.example.test' });
}

test('isNetworkError matches transport failures across browsers', () => {
    // Each browser words this differently; matching on message text alone would
    // silently stop working in whichever browser was not tested.
    for (const message of [
        'Failed to fetch',                                   // Chrome
        'Load failed',                                       // Safari
        'NetworkError when attempting to fetch resource.',    // Firefox
    ]) {
        assert.equal(MindMapClient.isNetworkError(new TypeError(message)), true, message);
    }

    assert.equal(MindMapClient.isNetworkError(Object.assign(new Error(), { name: 'AbortError' })), true);

    // An HTTP error is NOT a transport failure: retrying it is pointless and
    // reporting it as unreachable is wrong.
    assert.equal(MindMapClient.isNetworkError(new ApiError('nope', 503, null)), false);
    assert.equal(MindMapClient.isNetworkError(new TypeError('x is not a function')), false);
    assert.equal(MindMapClient.isNetworkError(null), false);
});

test('a GET retries through a transient transport failure', async () => {
    const fetchImpl = flakyFetch(2, { body: [{ id: 'm1' }] });
    const c = client(fetchImpl);

    const seen = [];
    const maps = await c.listMyMaps({ onRetry: (info) => seen.push(info.attempt) });

    assert.deepEqual(maps, [{ id: 'm1' }]);
    assert.equal(fetchImpl.calls, 3, 'should have tried three times in total');
    assert.deepEqual(seen, [1, 2], 'each retry should be reported so the UI can say so');
});

test('a GET gives up after its retries and rethrows the transport error', async () => {
    const fetchImpl = flakyFetch(99);
    const c = client(fetchImpl);

    await assert.rejects(() => c.listMyMaps(), (err) => {
        assert.equal(MindMapClient.isNetworkError(err), true);
        return true;
    });
    assert.equal(fetchImpl.calls, 3, 'one attempt plus two retries');
});

test('a write is NOT retried, because the first attempt may have landed', async () => {
    // fetch rejecting does not mean the server did not process the request —
    // the response may simply have been lost. Retrying a create would produce
    // two maps, which is worse than reporting the failure.
    const fetchImpl = flakyFetch(1);
    const c = client(fetchImpl);

    await assert.rejects(() => c.createMap({ title: 'x' }));
    assert.equal(fetchImpl.calls, 1, 'a failed POST must not be re-sent');
});

test('an HTTP error response is never retried', async () => {
    let calls = 0;
    const c = client(async () => {
        calls++;
        return {
            ok: false,
            status: 503,
            statusText: 'Service Unavailable',
            text: async () => JSON.stringify({ detail: 'database unreachable' }),
        };
    });

    await assert.rejects(() => c.listMyMaps(), (err) => {
        assert.ok(err instanceof ApiError);
        assert.equal(err.status, 503);
        assert.equal(err.message, 'database unreachable');
        return true;
    });
    assert.equal(calls, 1, 'the server answered; asking again would not change it');
});

test('checkHealth reports null when the API cannot be reached', async () => {
    const c = client(flakyFetch(99));
    assert.equal(await c.checkHealth(), null);
});

test('checkHealth returns the body when the API answers', async () => {
    const c = client(flakyFetch(0, { body: { status: 'ok', database: 'ok' } }));
    assert.deepEqual(await c.checkHealth(), { status: 'ok', database: 'ok' });
});

test('checkHealth propagates an HTTP error rather than hiding it as unreachable', async () => {
    // "up but broken" and "not there" need different fixes, so they must not
    // collapse into the same result.
    const c = client(async () => ({
        ok: false, status: 500, statusText: 'Internal Server Error',
        text: async () => JSON.stringify({ detail: 'boom' }),
    }));
    await assert.rejects(() => c.checkHealth(), (err) => err instanceof ApiError);
});

test('no configured base URL fails fast without touching the network', async () => {
    let called = false;
    globalThis.fetch = async () => { called = true; };
    const c = new MindMapClient({ baseUrl: '' });

    await assert.rejects(() => c.listMyMaps(), (err) => {
        assert.ok(err instanceof ApiError);
        assert.equal(err.status, 0);
        return true;
    });
    assert.equal(called, false);
});

test('probeReachable is true when a server answers, even opaquely', async () => {
    // A no-cors fetch resolves with an opaque response the caller cannot read.
    // Resolving at all is the signal: something was listening.
    let sawMode = null;
    let sawHeaders = 'unset';
    globalThis.fetch = async (_url, opts) => {
        sawMode = opts.mode;
        sawHeaders = opts.headers;
        return { type: 'opaque', status: 0, ok: false };
    };
    const c = new MindMapClient({ baseUrl: 'https://api.example.test' });

    assert.equal(await c.probeReachable(), true);
    assert.equal(sawMode, 'no-cors', 'must not be a normal CORS request');
    // A non-safelisted header would push the request back out of no-cors mode
    // and reintroduce the very CORS failure this is meant to see past.
    assert.equal(sawHeaders, undefined, 'must send no headers at all');
});

test('probeReachable is false when the connection cannot be made', async () => {
    globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
    const c = new MindMapClient({ baseUrl: 'https://api.example.test' });
    assert.equal(await c.probeReachable(), false);
});

test('probeReachable separates a CORS block from an unreachable server', async () => {
    // This is the distinction the whole probe exists for, and the reason the
    // first version of the diagnosis was wrong: with CORS misconfigured, the
    // normal /health read fails, so checkHealth() alone cannot tell the two
    // apart and blamed the server.
    const c = new MindMapClient({ baseUrl: 'https://api.example.test' });
    c.getToken = async () => 'a-token';

    globalThis.fetch = async (_url, opts = {}) => {
        if (opts.mode === 'no-cors') return { type: 'opaque', status: 0 };
        throw new TypeError('Failed to fetch');   // what CORS looks like to JS
    };

    assert.equal(await c.checkHealth(), null, 'the readable probe cannot get through');
    assert.equal(await c.probeReachable(), true, 'but the server is demonstrably up');
});

test('probeReachable does not fire without a configured base URL', async () => {
    let called = false;
    globalThis.fetch = async () => { called = true; return {}; };
    assert.equal(await new MindMapClient({ baseUrl: '' }).probeReachable(), false);
    assert.equal(called, false);
});
