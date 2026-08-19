# Fractality API

Mind map storage, share links, and the foundation for the social features. FastAPI
over Neo4j.

## Status

| Feature | State |
|---|---|
| Mind map CRUD | implemented; **Cypher verified against live AuraDB** |
| Share links (view/edit, expiry, revoke) | implemented; **verified against live AuraDB** |
| Clerk JWT verification | implemented, tested with real RS256 signing |
| Newsfeed / pulses | implemented; **Cypher NOT yet verified against a live database** |
| Moderation (report, block, rate limit, own-delete) | implemented |
| Chat + AI proxy | not started (step 5) |
| Media uploads | not started — needs object storage, see below |
| Admin review queue | not started — needs a notion of an admin role |

**The Cypher is verified.** All 47 integration tests in
`api/tests/test_integration_neo4j.py` pass against a live AuraDB Free instance
(88s, Neo4j 5 / Aura, Python 3.14 on Windows).

This line has been wrong before, in the direction that matters: it claimed every test
passed while tests had been added since the last run. If you add to that file, either
run it or change this sentence — a verification claim rots silently, and a stale one
reads exactly like a true one.

They cover the full wire-shape round trip including the JSON-encoded nested objects,
relationship derivation, per-map node id scoping, cascade delete, a 500-node bulk
write, the complete share-link lifecycle, schema idempotency, node content up to the
64 KB cap, the signed resonance scale with a rating private to the reader who gave
it, impressions counted once per viewer, and the reader model seeing only its own
reader's ratings.

Re-run them after any change to `repository.py` — they are the only thing
standing between a Cypher typo and silent data loss.

**The feed's Cypher is the exception, and it matters.** The 17 feed tests in that
file were written alongside the queries but have never been executed: the
environment they were written in has no Neo4j and cannot reach one. So the feed's
`repository.py` functions are covered by 35 router tests with the repository
stubbed — which verify authorization, rate limiting and validation but would not
notice a mistyped relationship name or a `WHERE` clause that quietly matches
nothing.

Run this before trusting the feed with anything:

```bash
pytest api/tests/test_integration_neo4j.py -v      # 33 tests, 17 of them feed
```

## The feed

```
(:User)-[:POSTED]->(:Pulse)
(:User)-[:RESONATED_WITH {value, at}]->(:Pulse)
(:User)-[:SAW {at}]->(:Pulse)
(:User)-[:REPORTED {reason, at}]->(:Pulse)
(:User)-[:BLOCKED]->(:User)
```

### Resonance is a private rating, not a public count

`RESONATED_WITH` carries a signed **`value` from -2 to +2**: dissonant through
neutral to resonant. A rating of `0` deletes the relationship rather than storing a
zero, so "moved the slider back to the middle" and "never touched it" are one state.

**No aggregate of any kind is exposed.** There is no resonator count and no score on
the wire — not for readers, and not for the author of a post either. The only
resonance figure on a `Pulse` is `my_rating`, the caller's own. Ratings are collected
so the feed can learn what resonates with each *reader*; a visible tally turns that
into a scoreboard and turns writing into competing. This is enforced by tests that
assert the absence of those fields, because a field that exists eventually gets
rendered.

Each pulse also carries `predicted` (-1..+1) and `prediction_confidence` (0..1),
computed in `api/resonance.py` from the caller's **own** rating history and nobody
else's. Two readers must get different answers about the same post; if they ever get
the same one it has become a popularity measure with a personal label on it. It is
`None` — not neutral — whenever there is too little history to say anything honest.

`SAW` is the model's denominator: without it, a post that landed badly and a post
nobody was shown both look like "no ratings". It records only *that* a reader saw a
post, once. Not how long, not how often, and it is never read back to any user. The
client counts a post as seen when its card has been half on screen, not when the API
returned it.

**The server always returns the feed reverse-chronologically.** There is no ranking
endpoint and no ordering parameter: the API does not decide what is in a page.

The reader can then lean their own view, with a -2..+2 control in the client that
reorders the posts they have already loaded (`src/ui/feedLean.js`). It reorders and
never filters, so no setting can hide a post; returning it to 0 restores the server's
order exactly; and each post that changed place says how far it moved and why. That is
self-curation the reader can see and reverse, which is a different thing from a feed
ranked before it reaches them — hence the choice to keep it entirely client-side.

`MERGE` is used for ratings, impressions, reports and blocks, so all four are
idempotent: a double tap cannot create two relationships, rating twice replaces
rather than accumulates, and one person cannot inflate a report count by pressing
repeatedly.

The block filter is **inside** the feed query rather than applied afterwards. In
Python it would make `limit` mean "up to N, minus however many were blocked", so
blocking a prolific poster would silently give you short pages.

### Moderation

Not a later phase — a public feed with no path to removal except a database
console is not shippable, which is a legal position as much as a product one.

| Control | Where |
|---|---|
| Author deletes their own post | ownership is in the Cypher `MATCH`, so there is no check-then-act window |
| Report | `POST /pulses/{id}/report`, one per reporter, fixed reason list |
| Block an author | `PUT /pulses/authors/{id}/block`, hides them from your feed only |
| Posting rate limit | `MAX_PULSES_PER_HOUR`, default 20 |

The rate limit counts stored pulses rather than using an in-process counter,
because Render runs more than one instance and a per-process counter would hand
each of them its own allowance.

Report reasons are a fixed list, not free text: the reason is a routing signal
for a human, and an open text field on an unauthenticated-adjacent endpoint is
itself an abuse channel.

**What is still missing, and should block opening this to strangers at scale:**
an admin review queue (there is no admin role yet — reports currently go to the
service log at warning level), and image scanning, which cannot exist before
image uploads do.

## Quick start

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r api/requirements.txt

# Minimum to boot: nothing. The API starts without Neo4j and reports it
# at /health, so you can check wiring before provisioning anything.
uvicorn api.main:app --reload --port 8000

open http://localhost:8000/docs      # interactive API browser
```

## Configuration

Read from the environment (or a `.env` beside the repo root). All of it is
server-side and secret — never expose any of it to the browser.

| Variable | Required | Notes |
|---|---|---|
| `NEO4J_URI` | for DB routes | `neo4j+s://xxx.databases.neo4j.io` for AuraDB |
| `NEO4J_USER` / `NEO4J_USERNAME` | for DB routes | the instance ID on current Aura, not `neo4j` |
| `NEO4J_PASSWORD` | for DB routes | |
| `NEO4J_DATABASE` | | leave unset — server default. Only set for a non-default database |
| `CLERK_ISSUER` | for auth | e.g. `https://your-app-12.clerk.accounts.dev` |
| `CLERK_AUDIENCE` | | only if you configure one in Clerk |
| `CORS_ORIGIN` | yes in prod | comma-separated; **never `*`** with credentials |
| `ENVIRONMENT` | | `production` enables strict startup checks |
| `ALLOW_DEV_AUTH` | | dev only; accepts `dev:<user_id>` tokens |
| `MAX_NODES_PER_MAP` | | default 10000 |
| `MAX_MAPS_PER_USER` | | default 500 |
| `MAX_PULSES_PER_HOUR` | | default 20; the feed's posting rate limit |

In `production`, the app **refuses to start** if Neo4j or Clerk is unconfigured,
if `ALLOW_DEV_AUTH` is on, or if CORS is a wildcard. That is deliberate: each of
those would leave a service that looks healthy while being open or useless.

## Diagnosing a connection

Before running anything else against a new database:

```bash
python scripts/check_neo4j.py
```

It checks, and stops at the first failure: env vars present → DNS → TCP/TLS →
credentials accepted → target database exists and is online → write permission.
It also runs `SHOW DATABASES` and prints what actually exists, which is the
question a bare `DatabaseNotFound` error fails to answer. No secrets are printed.

Use this instead of reading pytest tracebacks — a config problem produces pages
of driver internals that say nothing useful.

Notes on Aura's credentials file — paste its values as-is:

- It spells the user `NEO4J_USERNAME`, not `NEO4J_USER`. Both are accepted.
- Current Aura issues the **instance ID as the username** (matching the URI
  subdomain and `AURA_INSTANCEID`). Older instances used `neo4j`.
- **Leave `NEO4J_DATABASE` unset** unless you need a specific non-default
  database. Empty means "use the server's default", which is correct for Aura.

## Setting up AuraDB Free

1. Create an instance at <https://console.neo4j.io> (Free tier).
2. **Download the credentials file when it is shown — the password is displayed
   exactly once.**
3. Set `NEO4J_URI`, `NEO4J_USERNAME` and `NEO4J_PASSWORD` from it verbatim.
   Leave `NEO4J_DATABASE` unset.
4. Start the API. Constraints and indexes are applied automatically on boot and
   are idempotent, so there is no separate migration step.

Two Free-tier behaviours worth planning around: instances **pause after a few
days of inactivity** (the first request after that fails while it resumes), and
there is a node/relationship ceiling. The driver uses a bounded pool and a
30-second acquisition timeout so a paused instance surfaces as a clean error
rather than a hung request.

## Setting up Clerk

1. Create an application at <https://clerk.com>.
2. Copy the **Issuer** URL from API Keys into `CLERK_ISSUER`.
3. In the frontend, set `VITE_API_BASE` and pass a token getter to the client:

```js
import { MindMapClient } from './src/api/mindMapClient.js';

const client = new MindMapClient({
  getToken: () => window.Clerk?.session?.getToken() ?? null
});
```

The API verifies tokens against Clerk's published JWKS locally — no network call
per request, and no secret key material is stored here. Signatures are pinned to
RS256, so a token cannot downgrade itself to `alg: none`.

## Running the tests

```bash
pytest api/tests -q                  # 66 tests, no database needed
```

The suite covers graph validation, JWT verification (with real RSA signing), and
the full authorization matrix with the repository stubbed. It is verified to be
meaningful: disabling the ownership check makes 5 tests fail.

To exercise the Cypher, point it at a **scratch** database. Either a file in the
repository root:

```ini
# .env.local   (or .env — both are read, and .env.local wins)
NEO4J_URI=neo4j+s://xxxxxxxx.databases.neo4j.io
NEO4J_USERNAME=xxxxxxxx    # instance ID, per the Aura credentials file
NEO4J_PASSWORD=...
```

or the shell, which overrides any file:

```bash
export NEO4J_URI='neo4j+s://xxxxx.databases.neo4j.io'
export NEO4J_USERNAME='xxxxx'
export NEO4J_PASSWORD='...'
```

then:

```bash
pytest api/tests/test_integration_neo4j.py -v
```

They skip without credentials, and **the skip reason says why** — which files were
read, whether the values were there but commented out, and whether a nearby file looks
misnamed (`.env.local.txt`, which is what Notepad produces when "All Files" is not
selected and which Explorer then hides the extension of). `python scripts/check_neo4j.py`
checks the connection on its own.

They create and delete data prefixed `itest-`, and the cleanup matches on that prefix
so nothing else is touched. Still: **never point them at production.** Before the first
test they print which host they are about to write to, so it is never something you have
to infer.

## Data model

```
(:User    {id, subject, username, email, created_at})
(:MindMap {id, title, description, visibility, node_count,
           root_id, created_at, updated_at})
(:MapNode {map_id, id, depth, label, type, tags, description, content,
           metadata_json, energy_json, resonance_json, visual_json,
           created, modified, last_visited})
(:ShareLink {token, permission, created_at, expires_at, revoked})

(:User)-[:OWNS]->(:MindMap)
(:MindMap)-[:CONTAINS]->(:MapNode)
(:MapNode)-[:HAS_CHILD]->(:MapNode)
(:MindMap)-[:SHARED_VIA]->(:ShareLink)
```

Two design notes:

**`HAS_CHILD` is authoritative; `childIds`/`parentId` are derived on read.** The
relationship is what makes traversal cheap — the entire reason for choosing a
graph database — while the scalar fields are what the frontend expects on the
wire.

**Nested objects are JSON strings.** Neo4j properties must be primitives or
arrays of primitives. `energy`, `resonance`, `visual` and any free-form extra
metadata are stored as JSON; fields worth querying or indexing (`label`, `type`,
`tags`, `depth`) are real properties. So is `content` — a node's markdown page, up
to 64 KB — which is the one field a reader may want without the rest of the node and
the one large enough to be worth projecting away.

Node ids are unique **per map**, not globally — the constraint is composite, so
two maps can each have a node called `root`.

## Authorization

| Actor | private | unlisted + token | public |
|---|---|---|---|
| owner | read/write | read/write | read/write |
| other user | — | read (view token) | read |
| anonymous | — | read (view token) | read |
| edit token holder | read/write | read/write | read/write |
| expired / revoked token | — | — | read |

Denials return **404, not 403**: confirming that a private map exists is itself a
small leak. Share tokens are 32 url-safe bytes, are scoped to one map, and are
revoked rather than deleted so a leaked token can never be reissued elsewhere.

A share token cannot be escalated — holding an edit token does not let you mint
further links or change visibility.

## Deploying

`render.yaml` carries the service definition. Two things that are not optional:

- **Not the free tier**, once chat exists. Idle spin-down drops WebSocket
  connections.
- **`CORS_ORIGIN` must list your real frontend origin.** Wildcard plus
  credentials is rejected by browsers, and the app refuses to boot on it in
  production.

## Not yet handled

- **Media/photo uploads.** Object storage (Cloudflare R2 recommended — no egress
  fees) with presigned URLs so the browser uploads directly. Never proxy image
  bytes through this API, and never store blobs in Neo4j.
- **Moderation.** A public feed with uploads needs report/block flows, admin
  delete, rate limiting, and image scanning before it accepts content from
  strangers. This carries legal obligations, not just product ones.
- **Rate limiting.** Nothing here is throttled yet.
- **Pagination beyond skip/limit.** Fine at current scale; cursor-based paging
  will be wanted for the feed.
