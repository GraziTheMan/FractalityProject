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
        username: 'grazitheman',
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
            username: 'grazitheman',
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

test('every user field in the fixture is covered', () => {
    // A loop over every field, so a change to any one of them must be broadcast.
    //
    // Note what this canNOT do, because the comment here used to claim otherwise:
    // it compares two fixtures in this file, so a field added to the real
    // getAuthState() does not fail it. `username` was added to that shape and this
    // passed unchanged. The guard against that drift is the SIGNATURE building
    // itself from the returned object rather than from Clerk's — a field the app
    // cannot observe cannot need a notification — plus the named test below.
    const changes = {
        id: 'user_999',
        name: 'Someone Else',
        username: 'someone-else',
        email: 'other@example.com',
        imageUrl: 'https://img.example.com/b.png'
    };

    assert.deepEqual(
        Object.keys(changes).sort(),
        Object.keys(signedIn.user).sort(),
        'the fixture and the change list have drifted apart'
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

test('claiming a username is broadcast', () => {
    // The reason username had to reach the signature at all: someone with no
    // handle sets one, and every surface showing "no username yet" has to stop
    // saying so. Before it was included, that change was invisible to subscribers.
    const before = clone(signedIn);
    before.user.username = null;
    assert.notEqual(stateSignature(before), stateSignature(signedIn));
});

test('a signed-out state is stable across calls', () => {
    // The unconfigured path returns a literal each time; it must still dedupe or
    // an app with no Clerk key would notify on every Clerk-less tick.
    const a = { configured: false, signedIn: false, user: null };
    const b = { configured: false, signedIn: false, user: null };
    assert.equal(stateSignature(a), stateSignature(b));
});
