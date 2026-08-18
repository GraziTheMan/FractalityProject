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
NEO4J_USERNAME   = xxxxxxxx        # instance ID, exactly as the file gives it
NEO4J_PASSWORD   = <from the AuraDB credentials file>
# NEO4J_DATABASE deliberately NOT set — the server picks its default
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

Verify it works. **On Windows PowerShell** (`export` is bash-only):

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r api/requirements.txt

# Copy these three straight out of the Aura credentials file
$env:NEO4J_URI = 'neo4j+s://xxxxxxxx.databases.neo4j.io'
$env:NEO4J_USERNAME = 'xxxxxxxx'      # the instance ID, per the file
$env:NEO4J_PASSWORD = 'your-password'
# Leave NEO4J_DATABASE unset

python scripts/check_neo4j.py      # do this FIRST
pytest api/tests/test_integration_neo4j.py -v
```

On macOS/Linux or Git Bash, use `export NAME='value'` instead of `$env:`.

`check_neo4j.py` gives a one-line diagnosis instead of a pytest traceback, and
prints the output of `SHOW DATABASES` so you can see what your database is
actually called. Run it before the test suite every time.

About Aura's credentials file — just paste the values it gives you:

```
NEO4J_USERNAME=1efeea86          <- yes, the instance ID IS the username now
NEO4J_PASSWORD=...
NEO4J_URI=neo4j+s://1efeea86.databases.neo4j.io
AURA_INSTANCEID=1efeea86
```

- It spells the user **`NEO4J_USERNAME`**, not `NEO4J_USER`. Both are accepted.
- Current Aura issues the **instance ID as the username**, matching the URI
  subdomain. Older instances used `neo4j`; do not "correct" the file to that.
- **Do not set `NEO4J_DATABASE`.** Leave it unset and the server picks its own
  default. Forcing the name `neo4j` fails with `DatabaseNotFound` on instances
  whose default database is called something else.

Also note the `$env:` variables exist only in the terminal window where you set
them. A new tab means the tests silently skip.

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
npm test           # 104 passing
pytest api/tests   # 117 passing, 33 skipped without NEO4J_URI
npm run build      # then check dist/ loads
```

Then, for anything about whether the UI is actually *usable* — which the checks
above cannot see, since they only read files:

```bash
npm i -D playwright && npx playwright install chromium   # one-time
npm run preview &                 # serves the build on :4173
npm run browser-check             # 115 checks at three viewports
                                  # BROWSER_CHECK_ONLY=feed narrows it
```

It drives the real page at phone-portrait, phone-landscape and desktop sizes and
asserts that every control is reachable, that panels close again, that tapping a
node works, that the node geometry recovers from low-poly, that a save followed
by a failed list reload still reports the save as succeeded and still offers a
share link, and that **every entry in the dock has an observable effect** — the
menu it replaced was reachable, evenly spaced and completely inert, so
reachability alone proves nothing. Every check in it exists because the
corresponding bug shipped. See Parts 6, 7 and 9 of `docs/AUDIT-2026-08.md`.

## Exporting a map

Two formats, both under ☰ More:

| | |
|---|---|
| **Export JSON** | everything, including runtime metadata. The format to use for a backup you intend to re-import here. |
| **Export Turtle** | RDF/SKOS. The format to use for anything *else* — ontology tools, merging with someone else's map, publishing as linked data. |

Import is one button and detects which it has been given.

The Turtle export is deliberately narrower: transient visual state (positions,
colours) is recomputed by the layout engine, so it is not written out, and a
re-imported map is laid out afresh. Structure, tiers, sibling order, labels,
types, tags and descriptions all survive — there is a test asserting a round trip
returns a byte-identical structure.

## Free plan, and when to leave it

The API runs on Render's free plan. It spins down after about 15 minutes idle, and
the next request waits roughly 50 seconds for it to boot.

**This hurts more at low traffic, not less.** A handful of people checking in a
couple of times a day means almost every visit is a cold start. Reads retry
through it, so nothing breaks — it just looks broken while it waits.

Move to a paid instance when either is true:

- **Chat exists.** Spin-down drops WebSocket connections, so it stops being a slow
  experience and becomes a broken one.
- **You are showing it to someone whose first impression matters.**

AuraDB Free has its own, independent idle pause of a few days, which no Render
plan affects.

## When the Maps panel says it cannot reach the server

A failed cross-origin `fetch` gives JavaScript no reason — a cold start, a
restart, a dropped connection and a **CORS rejection** all look identical. The
panel now probes `/health` and tells you which it is. To check by hand:

```bash
curl -i https://<your-api-host>/health
```

- **No answer / connection refused** — the service is down or restarting. Look at
  the Render logs for the API service. An out-of-memory kill on the free plan
  shows up as exit status 137.
- **Answers, `"database"` not `"ok"`** — AuraDB credentials, or a Free instance
  paused after a few days idle. Run `python scripts/check_neo4j.py`.
- **Answers `{"status":"ok",...}` but the browser still fails** — it is CORS. See
  below.

### CORS_ORIGIN: list every origin the site is served from

`CORS_ORIGIN` is **comma-separated** (`api/settings.py`, `cors_origins`), and
whitespace around each entry is stripped:

```
CORS_ORIGIN = https://fractiverse.com,https://www.fractiverse.com
```

This is the setting that broke the deployed app, and both entries are what fixed
it — the site was reachable on `www` and the variable listed only that, so every
call from the bare domain was blocked.

Both entries are needed if both hostnames resolve. `https://www.fractiverse.com`
is a **different origin** from `https://fractiverse.com` as far as a browser is
concerned — matching is exact on scheme, host and port, with no trailing slash
and no wildcards in the hostname. Requests carry an `Authorization` header, so
`*` is rejected outright by browsers and the app refuses to boot on it in
production.

Set it on the **API** service, then redeploy the API. It is read at run time, so
no frontend rebuild is needed.

**Why a CORS problem is so hard to recognise:** the browser reports it to
JavaScript as a bare `TypeError` — the same thing you get when the server is
genuinely gone. The Maps panel now distinguishes them with a `mode: 'no-cors'`
probe, which still reaches the server but returns an unreadable response: if
that resolves, something answered and CORS is the problem; if it rejects,
nothing is listening. When it is CORS the panel prints the exact origin to add,
read from the page itself, so there is nothing to guess.

Free-plan cold starts are a real cost here: the API spins down after about 15
minutes idle and the next request waits ~50s for it to boot. Reads now retry
through that, but the first interaction after a quiet period will feel slow.
Moving the API to a paid instance is the only thing that removes it.

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
