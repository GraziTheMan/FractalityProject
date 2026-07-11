# Design: The Resonance Engine (resonance & dissonance)

**Status**: Draft / reference spec
**Scope**: How Fractality scores similarity ("resonance") and productive
difference ("dissonance") between nodes, content, and whole structures — and how
those scores drive sorting, filtering, discovery, and the social feed.

Read alongside:
- [`DESIGN_NodeStorage_and_ObsidianImport.md`](./DESIGN_NodeStorage_and_ObsidianImport.md) — the content tier this engine reads from.
- [`FractalityNodeTypes.md`](./FractalityNodeTypes.md) — the `Resonance` node type ("a similarity activation").

Grounded in existing code:
- Python matchers already exist and work: `core/similarity_engine/tfidf_resonance.py`
  (`TfidfResonance.find_similar`), `semantic_resonance.py` (`SemanticResonance`),
  and `engine.py` (`HybridResonance.hybrid_search`, `hybrid = tfidf·0.3 + semantic·0.7`).
- The schema already reserves fields: `FractalNode.resonance = { semanticScore,
  tfidfScore, connections }` (`src/shared/NodeSchema.js`).
- The **missing** JS module `src/intelligence/ResonanceEngine.js` is imported by
  `MobileApp.js` and `ResonanceFeedController.js` — this doc specifies what it
  should be.

---

## 1. First, untangle two things the code conflates

The callers currently expect one `ResonanceEngine` that does *both* math and
networking. Split it into two layers with a clean seam:

| Layer | Responsibility | Analogy |
|-------|----------------|---------|
| **Resonance Core** | Pure scoring: given nodes/text/subgraphs, compute resonance + dissonance. Deterministic, offline-capable, no network. | the ranking function |
| **Resonance Network** | Social/live layer: connect to peers, `fetchResonantPulses()`, `resonate(id)`, low-power mode. *Consumes* Core scores to rank a feed. | the feed service |

`MobileApp`/`ResonanceFeedController` talk to the **Network** layer; the Network
layer calls the **Core**. This doc specifies both, Core first.

---

## 2. Definitions

- **Resonance** = similarity / harmonic alignment. High when two things "say the
  same thing" lexically and/or meaningfully. Range `[0, 1]`.
- **Dissonance** = *productive* difference — related enough to be relevant, but
  contrasting. This is **not** just `1 − resonance` (random noise is maximally
  dissimilar but worthless). Dissonance is high when two nodes share **context**
  (some connection, shared tags, or a path between them) yet **diverge** in
  content. It's what surfaces creative tension and breaks echo chambers.

A useful mental model on the `[0,1]` similarity axis:

```
similarity:  0 ─────────────────────────────────── 1
             │        │                    │        │
          unrelated  DISSONANCE         RESONANCE  identical
          (noise)   (contrast, useful) (alignment) (dup)
```

Both extremes are low-value (noise / duplicates). The **mid-bands** are the
signal: resonance for "more like this," dissonance for "meaningfully different."

---

## 3. Resonance Core

### 3.1 Inputs
Works over the **content tier** (§ storage doc): a node's body is lazy-loaded and
tokenized once, cached as a vector. The Core never needs the whole vault in
memory — only the vectors of the candidate set.

### 3.2 Three matchers (mirrors the Python engines)

1. **Lexical (TF-IDF)** — cosine similarity of TF-IDF vectors. Cheap, exact,
   good for shared terminology. Port of `TfidfResonance`.
2. **Semantic (embeddings)** — cosine similarity of embedding vectors. Catches
   meaning across different words. Port of `SemanticResonance`. (Client: a small
   embedding model or a call to the Python backend; cache vectors on the node.)
3. **Structural** — *new*, and the piece the vision specifically asks for
   ("resonance and dissonance of overall **structures**"). Compares the *shape*
   of two subgraphs, not their text: degree/branching profile, depth, type
   histogram (`FractalityNodeTypes`), and shared-neighbor overlap. Two maps can
   resonate structurally even with different words.

### 3.3 Hybrid score
Keep the Python weighting as the default, extended with structure:

```
resonance = w_tfidf·tfidf + w_semantic·semantic + w_structural·structural
defaults:  w_tfidf=0.3,  w_semantic=0.6,  w_structural=0.1   // tune later
```

(Python currently uses 0.3/0.7 with no structural term; these defaults collapse
to that when `w_structural=0`.)

### 3.4 Dissonance score
Given a *shared-context* signal `ctx ∈ [0,1]` (do they share tags / an edge / a
short path?) and similarity `sim`:

```
dissonance = ctx · (1 − sim)          // related context, divergent content
```

So two notes under the same parent that argue opposite points score **high
dissonance**; two unrelated random notes score ~0 (no shared context).

### 3.5 Core API (JS)
```js
class ResonanceCore {
  index(nodes)                         // build/refresh vectors (lazy, cached)
  score(aId, bId) -> {                 // pairwise
    resonance, dissonance,
    tfidf, semantic, structural, context
  }
  findResonant(queryId | text, {topN, minScore}) -> [{id, resonance, ...}]
  findDissonant(queryId, {topN})       -> [{id, dissonance, ...}]
  rank(candidateIds, queryId, {mode: 'resonance'|'dissonance'|'hybrid', weights})
}
```
`findResonant(text, …)` maps 1:1 onto the Python `find_similar(query_text,
top_n)`, so the client and backend can share results/tests.

---

## 4. Where the scores go
- Write back onto the node: `FractalNode.resonance.{tfidfScore, semanticScore}`
  (+ add `structuralScore`, `dissonanceScore`). These already exist in the schema.
- Discovered strong pairs become **edges** (relationship: `resonance` — the
  `Resonance` node/edge type) so the graph itself records what resonates.
- The engine layer (`CACEEngine`, layout) can then **sort/filter/color** nodes by
  resonance or dissonance — e.g. pull resonant nodes closer, push dissonant ones
  into contrast clusters.

---

## 5. Resonance Network (social feed layer)
The thin layer the mobile UI already expects. It does **not** do math — it calls
the Core to rank.

```js
class ResonanceNetwork {
  async connect() / disconnect()
  async fetchResonantPulses({ userId, focusNodeId, limit }) // ranked via Core
  async resonate(pulseId)         // user boosts/echoes a pulse
  enterLowPowerMode() / exitLowPowerMode()
  getLatency()
}
```
"Pulses" are social posts/thoughts; the feed ranks them by resonance to the
viewer's current focus (and can offer a **dissonance toggle** — "show me
challenging views" — straight from `findDissonant`). Transport is the existing
Socket.IO server (`server.js`).

---

## 6. Python ↔ JS parity
- The Python engines stay the **batch/heavy** path (full-vault indexing, model
  hosting) exposed via `consciousness_backend/consciousness/consciousness_api.py`.
- The JS Core is the **interactive/client** path for the current view's candidate
  set. Same formulas, same weights, so scores agree. Shared fixtures should test
  that `find_similar` (py) and `findResonant` (js) rank a sample set identically.

---

## 7. Phased plan
1. **Core MVP (lexical):** port `TfidfResonance` to JS; `findResonant(text)` +
   pairwise `score`; write `resonance.tfidfScore`. No network, no embeddings.
2. **Dissonance:** add the `ctx·(1−sim)` term + `findDissonant`; a UI toggle in
   the feed/family view.
3. **Semantic:** embeddings (client model or backend call), cached per node.
4. **Structural resonance:** subgraph shape comparison (the novel piece).
5. **Resonance Network:** implement `ResonanceNetwork` over Socket.IO, feeding
   `ResonanceFeedController` real ranked pulses.

---

## 8. Open questions
- **Embeddings on the client?** ship a tiny model (privacy, offline) vs. call the
  Python backend (heavier model, needs the server). Likely: backend for indexing,
  cache vectors on nodes so the client only does cosine math.
- **Structural metric:** which features matter most — branching, type histogram,
  or neighbor overlap? Needs experiments once real vaults are imported.
- **Dissonance context signal:** tags-only, edges-only, or path-distance? Start
  with "shares a tag OR within 2 hops," refine with data.
- **Recompute cadence:** resonance is expensive; recompute on the candidate set
  per focus change, not globally. Cache aggressively, invalidate on content edit.
