# Fractality API

Mind map storage, share links, and the foundation for the social features. FastAPI
over Neo4j.

## Status

| Feature | State |
|---|---|
| Mind map CRUD | implemented, unit-tested; Cypher untested against a live DB |
| Share links (view/edit, expiry, revoke) | implemented, unit-tested |
| Clerk JWT verification | implemented, tested with real RS256 signing |
| Newsfeed / pulses | not started (step 4) |
| Chat + AI proxy | not started (step 5) |
| Media uploads | not started — needs object storage, see below |

**The Cypher in `repository.py` has not been run against a real Neo4j.** The
sandbox this was written in has no Neo4j and cannot reach one. `api/tests/
test_integration_neo4j.py` exists to close that gap — see below. Treat schema
setup and the first round trip as unverified until you have run it.

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
| `NEO4J_USER` | | defaults to `neo4j` |
| `NEO4J_PASSWORD` | for DB routes | |
| `NEO4J_DATABASE` | | defaults to `neo4j` |
| `CLERK_ISSUER` | for auth | e.g. `https://your-app-12.clerk.accounts.dev` |
| `CLERK_AUDIENCE` | | only if you configure one in Clerk |
| `CORS_ORIGIN` | yes in prod | comma-separated; **never `*`** with credentials |
| `ENVIRONMENT` | | `production` enables strict startup checks |
| `ALLOW_DEV_AUTH` | | dev only; accepts `dev:<user_id>` tokens |
| `MAX_NODES_PER_MAP` | | default 10000 |
| `MAX_MAPS_PER_USER` | | default 500 |

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

Note on variable names: Aura's downloaded credentials file spells the user
`NEO4J_USERNAME`, not `NEO4J_USER`. Both are accepted. Its value is `neo4j`; the
hex string in your URI is the **instance ID**, not the username.

## Setting up AuraDB Free

1. Create an instance at <https://console.neo4j.io> (Free tier).
2. **Download the credentials file when it is shown — the password is displayed
   exactly once.**
3. Set `NEO4J_URI` / `NEO4J_PASSWORD` from it.
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

To exercise the Cypher, point it at a **scratch** database:

```bash
export NEO4J_URI='neo4j+s://xxxxx.databases.neo4j.io'
export NEO4J_USER='neo4j'
export NEO4J_PASSWORD='...'
pytest api/tests/test_integration_neo4j.py -v
```

Those 16 tests skip silently without `NEO4J_URI`. They create and delete data
prefixed `itest-`; **never point them at production.**

## Data model

```
(:User    {id, subject, username, email, created_at})
(:MindMap {id, title, description, visibility, node_count,
           root_id, created_at, updated_at})
(:MapNode {map_id, id, depth, label, type, tags, description,
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
`tags`, `depth`) are real properties.

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
