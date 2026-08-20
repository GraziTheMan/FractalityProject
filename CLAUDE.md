# Fractality Platform — working notes for Claude

Read fresh at the start of every session, which is the point: anything here
survives a context reset, and anything said only in a prompt does not.

## Standing instructions

**Push directly to `main`.** No feature branch, no PR, unless asked for one.
Render deploys `main`, so work that is not on `main` is not deployed — a button
can be written, tested and pushed and still be absent from the live app.

Commit and push when a piece of work is done rather than batching it.

## Where it runs

| Piece | Where | Notes |
|---|---|---|
| App | `fp.fractiverse.com` → Render static site | installable PWA; **the** origin for the app |
| API | Render web service (`api/`, FastAPI) | free plan, so ~50s cold start after idle |
| Database | Neo4j AuraDB Free | separate idle pause of a few days |
| Auth | Clerk, **development** instance | not hostname-locked; app runs fine with no key at all |
| Landing page | `fractiverse.com` (planned) | will point at `fp.` and `tef.` |

`fractiverse.com` is also the RDF namespace and Clerk's session root. It is an
identifier as much as an address — see the comment in `src/data/turtle.js` before
changing it anywhere.

`render.yaml` is a Blueprint and **Render is not reading it**; both services were
made by hand in the dashboard. It is accurate documentation, not configuration.
Header and env-var changes there must also be entered in the dashboard.

## Checks

```
npm run health          # parses every file, resolves imports, 0 errors expected
npm test                # client unit tests (jsdom)
python3 -m pytest api/tests -q
npm run build && npx vite preview --port 4173
CHROMIUM_PATH=/opt/pw-browsers/chromium-*/chrome-linux/chrome node scripts/browser-check.mjs
```

The browser check takes ~2.5 minutes — run it in the background, not under a
120-second timeout.

`api/tests/test_integration_neo4j.py` skips unless `NEO4J_URI` is set. It needs a
scratch database, never production. `test_integration_call_signatures.py` checks
that file's call sites *without* a database, because a skipped test is never
checked for anything.

## House rules that have each been learned the hard way

**Mutate every guard you add.** Seven weak fixtures have been found this way and
none by reading. When a mutation survives, suspect the fixture before the
assertion.

**Reproduce in a real browser before diagnosing.** Several "obvious" causes were
wrong; several checks failed on their own selectors rather than on the app.

**No `innerHTML` for anything derived from user or network data.** `src/ui/markdown.js`
exists so there is no HTML string to sanitise.

**Never put a secret in a `VITE_` variable** — those are compiled into the bundle
every visitor downloads. The Clerk *publishable* key (`pk_`) is the only
legitimate one. `NEO4J_PASSWORD` and friends live only on the API service.
`.env*` is gitignored except `.env.example`; never commit or paste a credential.

**Correct stale comments when you touch the code they describe.** Several
comments here have described intentions the code stopped having.

## Model notes

Three relations, and the distinction is load-bearing:

| Relation | Circular? | Bears a tier? | Means |
|---|---|---|---|
| `parentId` | no | yes | containment — one parent |
| `emergesFrom` | no | yes | convergence — many contributors |
| `resetsTo` | **yes** | **no** | recurrence — the cycle closing |

Tiers are `1 + max(all parents)` via Kahn's algorithm, never BFS depth.
`metadata.onAxis` is a **declared** property, not derived — radial distance means
Axiom IV's crystallization spectrum, and no rule over parent counts can place a
node on the axis correctly.

Tier / Branch / Level are *metadata*. Tier 0 Node 0 is "The Fractiverse", the
unknowable container.

## Ongoing

`docs/AUDIT-2026-08.md` is the running record — 23 parts, each explaining a
change and what it cost to find. Add to it rather than starting a new document.
