// tests/accountFriends.test.js
//
// The friends section of the Account panel.
//
// jsdom rather than a shim, for the same reason markdown.test.js uses one: a shim
// implements whatever the code happens to call, so it agrees with any bug that only
// calls what it implements.
//
// What is worth asserting here is not that rows render — it is the handful of places
// where a plausible-looking UI would lie to the person using it:
//
//   * 404 and 409 from "Add" are different answers and must not be merged
//   * a refusal must not be dressed up with a reason the server refused to give
//   * a request answered while the panel re-rendered must not write into a
//     discarded list
//   * removing a friend must actually be confirmed first

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.confirm = () => true;

const { AccountPanel } = await import('../src/ui/AccountPanel.js');

class FakeError extends Error {
    constructor(status, message = 'failed') {
        super(message);
        this.status = status;
    }
}

/**
 * A client that answers the friends calls and records what was asked.
 *
 * Deliberately NOT a full graph: the rules are tested against one in
 * api/tests/test_friends.py. What this has to be able to do is answer wrongly —
 * refuse, 404, or hang — because those are the paths under test.
 */
function fakeClient(overrides = {}) {
    const calls = [];
    const record = (name) => (...args) => {
        calls.push([name, ...args]);
        return overrides[name]?.(...args) ?? Promise.resolve(undefined);
    };
    return {
        available: true,
        calls,
        getProfile: async () => ({ username: 'me', display_name: 'Me', bio: '' }),
        listMyMaps: async () => [],
        listFriends: overrides.listFriends ?? (async () => []),
        listFriendRequests:
            overrides.listFriendRequests ?? (async () => ({ incoming: [], outgoing: [] })),
        findUserByUsername: record('findUserByUsername'),
        requestFriend: record('requestFriend'),
        acceptFriend: record('acceptFriend'),
        dropFriendRequest: record('dropFriendRequest'),
        unfriend: record('unfriend'),
    };
}

/** A signed-in panel with the friends section rendered and its first load settled. */
async function open(client) {
    const panel = new AccountPanel({
        client,
        notify: () => {},
        hasAuth: () => true,
        getAuth: () => ({ signedIn: true, user: { name: 'Me', username: 'me' } }),
    });
    panel.show();
    await panel.refresh();
    await settle();
    return panel;
}

/** Let the in-flight promises inside _loadFriends resolve. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const status = (panel) => panel.container.querySelector('.account-status').textContent;

function buttonSaying(panel, label) {
    return [...panel.container.querySelectorAll('button')]
        .find((b) => b.textContent === label);
}

test.afterEach(() => {
    document.body.innerHTML = '';
    globalThis.confirm = () => true;
});

// --- adding somebody --------------------------------------------------------

test('adding by username looks the handle up and then asks that id', async () => {
    const client = fakeClient({
        findUserByUsername: async () => ({ id: 'u-them', name: 'Them', username: 'them' }),
        requestFriend: async () => ({ status: 'sent' }),
    });
    const panel = await open(client);

    panel.container.querySelector('.account-friends .account-input').value = '  @Them ';
    buttonSaying(panel, 'Add').click();
    await settle();

    // The @ and the spaces are the user's, not part of the handle.
    assert.deepEqual(client.calls[0], ['findUserByUsername', 'Them']);
    assert.deepEqual(client.calls[1], ['requestFriend', 'u-them']);
    assert.match(status(panel), /Asked Them/);
});

test('a mutual request is reported as a friendship, not as a request sent', async () => {
    const client = fakeClient({
        findUserByUsername: async () => ({ id: 'u-them', name: 'Them', username: 'them' }),
        requestFriend: async () => ({ status: 'friends' }),
    });
    const panel = await open(client);

    panel.container.querySelector('.account-friends .account-input').value = 'them';
    buttonSaying(panel, 'Add').click();
    await settle();

    assert.match(status(panel), /now friends/);
});

test('an unknown handle and a refusal say different things', async () => {
    const missing = fakeClient({
        findUserByUsername: async () => { throw new FakeError(404); },
    });
    const panel = await open(missing);
    panel.container.querySelector('.account-friends .account-input').value = 'ghost';
    buttonSaying(panel, 'Add').click();
    await settle();
    const notFound = status(panel);

    const refused = fakeClient({
        findUserByUsername: async () => ({ id: 'u-them', name: 'Them', username: 'them' }),
        requestFriend: async () => { throw new FakeError(409); },
    });
    const other = await open(refused);
    other.container.querySelector('.account-friends .account-input').value = 'them';
    buttonSaying(other, 'Add').click();
    await settle();
    const conflict = status(other);

    assert.match(notFound, /@ghost/);
    assert.notEqual(notFound, conflict);
});

test('a refusal is not given a reason the server withheld', async () => {
    // The server returns one message for blocked-either-way, already-friends and
    // aimed-at-yourself. Guessing between them here would announce a block that
    // the API went out of its way not to announce.
    const client = fakeClient({
        findUserByUsername: async () => ({ id: 'u-them', name: 'Them', username: 'them' }),
        requestFriend: async () => { throw new FakeError(409); },
    });
    const panel = await open(client);
    panel.container.querySelector('.account-friends .account-input').value = 'them';
    buttonSaying(panel, 'Add').click();
    await settle();

    const said = status(panel).toLowerCase();
    for (const guess of ['block', 'already', 'yourself']) {
        assert.ok(!said.includes(guess), `the UI guessed at the reason: "${status(panel)}"`);
    }
});

test('an empty box does nothing at all', async () => {
    const client = fakeClient();
    const panel = await open(client);

    panel.container.querySelector('.account-friends .account-input').value = '   ';
    buttonSaying(panel, 'Add').click();
    await settle();

    assert.equal(client.calls.length, 0);
});

// --- the three groups -------------------------------------------------------

test('incoming, outgoing and friends each get their own actions', async () => {
    const client = fakeClient({
        listFriends: async () => [{ id: 'u-a', name: 'Ada', username: 'ada' }],
        listFriendRequests: async () => ({
            incoming: [{ id: 'u-b', name: 'Bo', username: 'bo' }],
            outgoing: [{ id: 'u-c', name: 'Cy', username: 'cy' }],
        }),
    });
    const panel = await open(client);

    const groups = [...panel.container.querySelectorAll('.account-friends-group')]
        .map((el) => el.textContent);
    // Incoming first: it is the only one of the three waiting on this person.
    assert.deepEqual(groups, ['Wants to be friends (1)', 'Asked (1)', 'Friends (1)']);

    for (const label of ['Accept', 'Decline', 'Withdraw', 'Remove']) {
        assert.ok(buttonSaying(panel, label), `no ${label} button`);
    }
});

test('accepting calls accept, not request', async () => {
    const client = fakeClient({
        listFriendRequests: async () => ({
            incoming: [{ id: 'u-b', name: 'Bo', username: 'bo' }],
            outgoing: [],
        }),
    });
    const panel = await open(client);

    buttonSaying(panel, 'Accept').click();
    await settle();

    assert.deepEqual(client.calls[0], ['acceptFriend', 'u-b']);
});

test('declining and withdrawing are the same call', async () => {
    const client = fakeClient({
        listFriendRequests: async () => ({
            incoming: [{ id: 'u-b', name: 'Bo', username: 'bo' }],
            outgoing: [{ id: 'u-c', name: 'Cy', username: 'cy' }],
        }),
    });
    const panel = await open(client);

    buttonSaying(panel, 'Decline').click();
    await settle();
    buttonSaying(panel, 'Withdraw').click();
    await settle();

    assert.deepEqual(client.calls.map((c) => c[0]), ['dropFriendRequest', 'dropFriendRequest']);
    assert.deepEqual(client.calls.map((c) => c[1]), ['u-b', 'u-c']);
});

test('removing a friend is confirmed first, and abandoned if refused', async () => {
    const client = fakeClient({
        listFriends: async () => [{ id: 'u-a', name: 'Ada', username: 'ada' }],
    });
    const panel = await open(client);

    let asked = null;
    globalThis.confirm = (message) => { asked = message; return false; };
    buttonSaying(panel, 'Remove').click();
    await settle();

    assert.match(asked, /Ada/);
    assert.equal(client.calls.length, 0, 'unfriended despite the confirmation being refused');
});

test('an action that fails re-enables its button', async () => {
    // Otherwise one network blip leaves a dead row and the only way out is a
    // reload — which on the installed app is not an obvious thing to do.
    const client = fakeClient({
        listFriendRequests: async () => ({
            incoming: [{ id: 'u-b', name: 'Bo', username: 'bo' }],
            outgoing: [],
        }),
        acceptFriend: async () => { throw new FakeError(500, 'boom'); },
    });
    const panel = await open(client);

    const accept = buttonSaying(panel, 'Accept');
    accept.click();
    await settle();

    assert.equal(accept.disabled, false);
});

// --- the empty and the broken cases ----------------------------------------

test('no friends says how to get some, and points at the feed scope', async () => {
    const panel = await open(fakeClient());
    const empty = panel.container.querySelector('.account-friends .account-empty');

    assert.ok(empty, 'no empty-state message');
    assert.match(empty.textContent, /username/i);
    assert.match(empty.textContent, /feed/i);
});

test('a failed load says so instead of showing an empty friend list', async () => {
    const client = fakeClient();
    client.listFriends = async () => { throw new FakeError(503, 'no database'); };
    const panel = await open(client);

    assert.match(
        panel.container.querySelector('.account-friends-list').textContent,
        /no database/
    );
});

test('a load that lands after a re-render is discarded', async () => {
    // The panel re-renders on every auth change and after saving a profile, so a
    // slow friends request outliving its own list is ordinary, not exotic. Writing
    // into the detached element loses the results with nothing on screen to say so.
    // One resolver per call, kept in order: the re-render starts a SECOND load, and
    // resolving that one instead would test nothing — the first request is the one
    // whose list has been thrown away.
    const pending = [];
    const client = fakeClient({
        listFriends: () => new Promise((resolve) => pending.push(resolve)),
    });
    const panel = await open(client);

    const stale = panel._friendsListEl;
    const mine = pending.length - 1;       // the load belonging to `stale`
    panel._render();                       // discards the list that load belongs to
    const fresh = panel._friendsListEl;
    assert.ok(pending.length > mine + 1, 'the re-render did not start a second load');
    pending[mine]([{ id: 'u-a', name: 'Ada', username: 'ada' }]);
    await settle();

    assert.notEqual(stale, fresh);
    assert.equal(stale.querySelectorAll('.account-friend').length, 0);
});
