# Deploying Fractality

Where every configuration value goes, and in what order to set things up.

## The short answer: config lives in three places, not one

This is the thing most likely to trip you up, so it comes first.

| Where | What goes there | When it applies |
|---|---|---|
| **Render → static site → Environment** | `VITE_*` only | baked in at **build** time |
| **Render → API service → Environment** | all real secrets | read at **run** time |
| **Your machine: `.env.local` / `.env`** | local dev copies | never committed |

Two consequences worth internalising:

**`VITE_*` variables are public.** Vite substitutes them into the JavaScript
bundle during `npm run build`. Anyone can read them in devtools. That is fine for
an API URL or a Clerk *publishable* key — those are designed to be public — and
catastrophic for a database password or an `sk-...` provider key.

**`VITE_*` changes require a rebuild, not a restart.** Because substitution
happens at build time, editing one in the Render dashboard does nothing until you
trigger a redeploy of the static site.

Everything secret — `NEO4J_PASSWORD`, `ANTHROPIC_API_KEY`, Clerk's *secret* key —
goes on the **API service**, never the static site, and never with a `VITE_`
prefix.

## Exact variable placement

### Render static site (`fractality-web`)

```
VITE_API_BASE               = https://api.fractiverse.com
VITE_SOCKET_URL             = https://api.fractiverse.com     # step 5, chat
VITE_AI_PROXY_URL           = https://api.fractiverse.com/ai  # step 5, chat
VITE_CLERK_PUBLISHABLE_KEY  = pk_test_...  or  pk_live_...
NODE_VERSION                = 22
```

`pk_` keys are publishable and belong here. A `sk_` key never does.

### Render API service (`fractality-api`)

Mark every one of these **secret / `sync: false`** so it is not written into
`render.yaml`:

```
ENVIRONMENT      = production
CORS_ORIGIN      = https://fractiverse.com
NEO4J_URI        = neo4j+s://xxxxxxxx.databases.neo4j.io
NEO4J_USER       = neo4j
NEO4J_PASSWORD   = <from the AuraDB credentials file>
CLERK_ISSUER     = https://your-app-12.clerk.accounts.dev
```

In `production` the API **refuses to boot** if Neo4j or Clerk is unconfigured, if
`ALLOW_DEV_AUTH` is on, or if `CORS_ORIGIN` is `*`. Each of those would otherwise
leave a service that looks healthy while being wide open or useless — better a
loud failure at deploy than a quiet one in production.

### Your machine

```bash
cp .env.example .env.local     # frontend, VITE_* only, gitignored
```

For the API, export in your shell or use a `.env` at the repo root:

```bash
export NEO4J_URI='neo4j+s://xxxxxxxx.databases.neo4j.io'
export NEO4J_PASSWORD='...'
export ALLOW_DEV_AUTH=true     # accept `dev:alice` bearer tokens locally
uvicorn api.main:app --reload --port 8000
```

`ALLOW_DEV_AUTH` lets you exercise the API without Clerk. It is refused outright
when `ENVIRONMENT=production`, and there is a test asserting that.

## Setup order

Each step is independently verifiable, so you find problems one at a time.

### 1. AuraDB — you are here

Your instance is **Fractality Platform**. When you created it:

- **Download the credentials file.** The password is shown exactly once. If you
  have lost it, reset it from the console rather than guessing.
- The URI looks like `neo4j+s://xxxxxxxx.databases.neo4j.io`. The `+s` matters —
  it means TLS, and AuraDB requires it.

Verify it works, and validate the Cypher at the same time:

```bash
export NEO4J_URI='neo4j+s://xxxxxxxx.databases.neo4j.io'
export NEO4J_USER='neo4j'
export NEO4J_PASSWORD='...'

pip install -r api/requirements.txt
pytest api/tests/test_integration_neo4j.py -v
```

**This is the highest-value thing you can do right now.** Those 16 tests are the
only check on the Cypher in `api/repository.py`, which has never run against a
real database. They create and delete nodes prefixed `itest-`; point them at a
scratch database, not one holding anything you care about.

Two AuraDB Free behaviours to expect: instances **pause after a few days idle**
(the first request afterwards fails while it wakes), and there is a node ceiling.
The driver uses a 30-second acquisition timeout so a paused instance gives a
clean error rather than hanging.

### 2. Clerk

1. Create an application at <https://clerk.com>.
2. Copy the **Publishable key** (`pk_...`) → static site `VITE_CLERK_PUBLISHABLE_KEY`.
3. Copy the **Issuer** URL → API service `CLERK_ISSUER`.
4. Add `https://fractiverse.com` to Clerk's allowed origins.

The **secret key is not used anywhere in this project.** The API verifies tokens
against Clerk's published JWKS, so it needs no secret. If you find yourself
pasting an `sk_` value somewhere, stop.

### 3. Render static site

Connect the repo; `render.yaml` defines it. Build `npm ci && npm run build`,
publish `dist`. Add `fractiverse.com` under Settings → Custom Domains and point
DNS at the target Render gives you — since your domain is already on Cloudflare,
that is a CNAME. Set the Cloudflare record to **DNS only** (grey cloud) initially;
proxying through Cloudflare on top of Render's own TLS is a common source of
redirect loops.

### 4. Render API service

Uncomment the `fractality-api` block in `render.yaml`, set the secrets above,
deploy. Then check:

```bash
curl https://api.fractiverse.com/health
```

Expect `{"status":"ok","database":"ok","auth":"configured"}`. If `database` says
`unreachable`, the credentials or the URI scheme are wrong. If it says
`unconfigured`, the env vars did not reach the service.

**Use `plan: starter`, not free.** Free instances spin down when idle, which
drops WebSocket connections and makes cold starts look like outages.

### 5. Point the frontend at it

Set `VITE_API_BASE` on the **static site** and **redeploy it** — remember that
`VITE_*` is build-time. Then the Maps panel switches from "Local-only mode" to a
real map list.

## Verifying end to end

```bash
npm run health     # 0 errors expected
npm test           # 44 passing
pytest api/tests   # 66 passing, 16 skipped without NEO4J_URI
npm run build      # then check dist/ loads
```

Then in the browser, with the API configured: sign in, click **🗺 Maps → Save
current**, and confirm the map appears in the list. Click **Share**, open the
copied URL in a private window, and confirm an anonymous visitor sees the map.
That single loop exercises auth, Cypher, share tokens and the graph adapter
together.

## Degradation, by design

Nothing here is required for the app to run. Each missing piece disables one
feature and says so:

| Missing | Effect |
|---|---|
| `VITE_API_BASE` | local-only mode; Maps panel explains why |
| `VITE_CLERK_PUBLISHABLE_KEY` | public maps browsable, saving unavailable |
| `VITE_SOCKET_URL` | chat disabled |
| `VITE_AI_PROXY_URL` | AI chat participant disabled |
| Neo4j on the API | database routes return 503, `/health` reports it |

This is why the site can go live before the backend exists.

## Email note

You mentioned `grazi@fractiverse.com` via Cloudflare + Brevo. Nothing in this
codebase sends email yet, so there is no configuration for it here. When
something does — password resets are handled by Clerk, so more likely
notifications or feed digests — the Brevo API key is a **server-side secret** and
belongs on the API service, never in a `VITE_` variable.

Worth doing early regardless: set SPF, DKIM and DMARC records for
`fractiverse.com`. Brevo will walk you through it. Without them, mail from your
domain lands in spam, and that is much harder to fix retroactively once your
domain has a poor reputation.
