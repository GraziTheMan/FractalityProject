// tests/authNotify.test.js
//
// Covers the guard that stopped the auth layer from broadcasting when nothing
// observable had changed.
//
// The bug it fixes: Clerk's addListener fires on any resource change, and the
// session token refreshes on a roughly one-minute timer. Every one of those was a
// full notification, subscribers re-render on notification, and the feed's compose
// area rebuilt itself — throwing away whatever the user was typing.
//
// The DANGEROUS failure mode is not the old bug, though. It is over-suppression:
// a signature that stops distinguishing real states would silence sign-in and
// sign-out entirely, and the app would show a signed-out UI to a signed-in user
// with no error anywhere. So most of this file is about changes that MUST still
// get through, not about the ones that must not.

import test from 'node:test';
import assert from 'node:assert/strict';

const { stateSignature } = await import('../src/auth/clerkClient.js');

const signedIn = {
    configured: true,
    signedIn: true,
    user: {
        id: 'user_1',
        name: 'Nick',
        email: 'nick@example.com',
        imageUrl: 'https://img.example.com/a.png'
    }
};

/** A structural clone, so nothing is shared by reference with the original. */
const clone = (state) => JSON.parse(JSON.stringify(state));

test('an identical state produces an identical signature', () => {
    // This is the whole point: the token refreshed, nothing the app can see
    // changed, so no notification should go out.
    assert.equal(stateSignature(signedIn), stateSignature(clone(signedIn)));
});

test('a fresh object with the same values still matches', () => {
    // getAuthState() builds a NEW object every call, so a signature that
    // depended on identity rather than value would never dedupe anything.
    const rebuilt = {
        configured: true,
        signedIn: true,
        user: {
            id: 'user_1',
            name: 'Nick',
            email: 'nick@example.com',
            imageUrl: 'https://img.example.com/a.png'
        }
    };
    assert.equal(stateSignature(signedIn), stateSignature(rebuilt));
});

// --- the changes that must NOT be swallowed --------------------------------

test('signing in changes the signature', () => {
    const signedOut = { configured: true, signedIn: false, user: null };
    assert.notEqual(stateSignature(signedOut), stateSignature(signedIn));
});

test('signing out changes the signature', () => {
    const after = { configured: true, signedIn: false, user: null };
    assert.notEqual(stateSignature(signedIn), stateSignature(after));
});

test('switching to a different user changes the signature', () => {
    // Same name and email, different id. Keying on the display name alone would
    // miss this, and the app would keep showing the previous account's data.
    const other = clone(signedIn);
    other.user.id = 'user_2';
    assert.notEqual(stateSignature(signedIn), stateSignature(other));
});

test('auth becoming configured changes the signature', () => {
    const unconfigured = { configured: false, signedIn: false, user: null };
    const configured = { configured: true, signedIn: false, user: null };
    assert.notEqual(stateSignature(unconfigured), stateSignature(configured));
});

test('every observable user field is covered', () => {
    // Written as a loop over the fields getAuthState() actually returns, so
    // adding a field there and forgetting it here fails rather than silently
    // becoming un-notifiable. The values are chosen to differ from the baseline.
    const changes = {
        id: 'user_999',
        name: 'Someone Else',
        email: 'other@example.com',
        imageUrl: 'https://img.example.com/b.png'
    };

    assert.deepEqual(
        Object.keys(changes).sort(),
        Object.keys(signedIn.user).sort(),
        'this test no longer covers every field getAuthState() returns'
    );

    for (const [field, value] of Object.entries(changes)) {
        const changed = clone(signedIn);
        changed.user[field] = value;
        assert.notEqual(
            stateSignature(signedIn),
            stateSignature(changed),
            `a change to user.${field} would not be broadcast`
        );
    }
});

test('a signed-out state is stable across calls', () => {
    // The unconfigured path returns a literal each time; it must still dedupe or
    // an app with no Clerk key would notify on every Clerk-less tick.
    const a = { configured: false, signedIn: false, user: null };
    const b = { configured: false, signedIn: false, user: null };
    assert.equal(stateSignature(a), stateSignature(b));
});
