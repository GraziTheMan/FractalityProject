# Design: Node Storage, Fractal Nesting & Obsidian Import

**Status**: Draft / reference spec
**Scope**: How much a node holds, where heavy content lives, how nodes nest into
whole sub-universes, and how an Obsidian vault becomes a Fractality node map.

This doc **extends** existing design, it does not replace it. Read alongside:
- [`Fractality_Data_HybridArchitecture.md`](./Fractality_Data_HybridArchitecture.md) — Ice/Water/Vapor tiers, Postgres + JSONB + `edges`.
- [`FractalityDataArchitecture_DeepDive.md`](./FractalityDataArchitecture_DeepDive.md) — the living in-memory graph + indices.
- [`FractalityNodeTypes.md`](./FractalityNodeTypes.md) — the node taxonomy (note the `Container` type: *"Holds nested nodes"*).

Grounded in the current code: `src/shared/NodeSchema.js` (`FractalNode`),
`src/data/NodeData.js` (`NodeData` / `NodeGraph`), and — conceptually — the
Python `core/field_engines/superionic_database.py`, which already separates
`_extract_structure` (the lattice/graph) from `_extract_content` (the flow).

---

## 1. The core principle: separate the *graph node* from the *content payload*

Today a node's `metadata` is arbitrary JSON — **technically unbounded**. But two
hard limits make "store the whole note in the node" a bad idea:

1. **Render budget.** The engine is built to draw thousands of nodes at 60 fps;
   `NodeData` is deliberately "ultra-lean" and even has `getMemorySize()`. Fat
   nodes = slow universe.
2. **Storage ceiling.** The current LocalStorage bridge caps at ~5–10 MB *total*
   — an Obsidian vault blows past that immediately.

**Resolution — a two-tier model:**

| Tier | Holds | Client home | Server home (future) | Size/node |
|------|-------|-------------|----------------------|-----------|
| **Graph node** (lean) | id, parent/children, edges, label, type, tags, resonance scores, visual state, a short **excerpt**, and a `contentRef` | in-memory `NodeGraph` + IndexedDB | Postgres `nodes` + `edges` (JSONB) | ~0.2–1 KB |
| **Content payload** (heavy) | full Markdown body, embedded images, long text, attachments | **IndexedDB** (object store keyed by node id) | object store / blob (S3-style) or a `node_content` table | unbounded |

The graph node carries only a **pointer** (`contentRef`) plus a short excerpt for
hover/preview. The full body is **lazy-loaded only when a node is opened**. This
keeps the universe fast while making per-node content effectively unlimited, and
the body text becomes the corpus the resonance engine (TF-IDF / semantic) runs
over — loaded on demand, never all at once.

### Concrete storage ceilings

| Store | Practical limit | Role |
|-------|-----------------|------|
| `localStorage` (current bridge) | ~5–10 MB total | too small for vaults; keep for small UI state only |
| **IndexedDB** | hundreds of MB → GB (quota-based) | **content tier home in the browser** |
| Postgres + object store | effectively unlimited | server tier / multi-device / consensus |

**Rule of thumb:** keep a graph node's in-memory footprint under ~1 KB. Anything
larger than a sentence or two goes in the content tier behind a `contentRef`.

---

## 2. Lean node schema (what stays in the graph tier)

Building on `FractalNode` (`src/shared/NodeSchema.js`), the graph-tier node adds
three content-related fields and stays otherwise unchanged:

```js
{
  id, parentId, children: [...ids],
  metadata: {
    label, type,            // type ∈ FractalityNodeTypes taxonomy
    tags: [...],
    excerpt: "first ~200 chars / summary",   // NEW: cheap preview text
    contentRef: "content:<nodeId>" | null,   // NEW: pointer into the content tier
    contentType: "markdown" | "text" | null, // NEW
    source: { kind: "obsidian", path: "Folder/Note.md" } | null // provenance
  },
  energy:    { ATP, efficiency, network },
  resonance: { semanticScore, tfidfScore, connections: [...edgeIds] },
  visual:    { position, scale, color, glow },
  // fractal nesting (see §3)
  isContainer: false,
  childGraphRef: null
}
```

`excerpt` + `contentRef` are the whole trick: the graph stays light, the content
lives elsewhere, resonance can still index the body by fetching payloads lazily.

---

## 3. Fractal nesting: "open a node into a whole new world"

Two distinct behaviors, both worth having. They are *not* the same thing.

### 3a. Drill-down hierarchy (already works)
Parent → children via `parentId` / `children`. Selecting a node re-focuses the
Family View on it and reveals its children. This is the existing navigation and
maps directly onto Obsidian folders (a folder-note's children are its contents).

### 3b. True fractal nesting (the signature move)
A node flagged `isContainer: true` (the taxonomy's `Container` / `Map` types)
whose **content *is another whole graph***. Entering it doesn't just show
children — it descends into a sub-universe with its own layout, focus, and nodes.

```
Universe A ──(open Container node "Physics")──▶ Universe B (Physics' own graph)
                                                   └─(open "Thermodynamics")─▶ Universe C …
```

Model it as:
- `isContainer: true`
- `childGraphRef: "graph:<subGraphId>"` — pointer to a separately-stored
  `NodeGraph` (same two-tier rules recurse).
- A **breadcrumb / zoom stack** in app state so you can pop back up the nesting.

This lets a single map scale to millions of nodes without ever loading more than
the current universe. It's the structural expression of "fractal."

---

## 4. Obsidian vault → Fractality node map

An Obsidian vault is a folder of `.md` files with YAML frontmatter and
`[[wikilinks]]`. The mapping is clean:

| Obsidian | Fractality |
|----------|-----------|
| `.md` file | one graph node |
| filename / `# H1` / frontmatter `title` | `metadata.label` |
| YAML frontmatter `tags` | `metadata.tags` |
| YAML `type`/`archetype` (your notes already use `archetype`) | `metadata.type` (map to taxonomy) |
| other frontmatter keys | `metadata.*` |
| **note body** | **content payload** (IndexedDB), with a generated `excerpt` |
| `[[wikilink]]` | an `edge` (relationship: `link`, weight from link count) |
| folder structure | parent/child hierarchy; a folder → a `Container` node |
| folder-note (`Folder/Folder.md`) | the `Container` node for that folder |
| attachments/images | content-tier blobs referenced from the payload |

### Import algorithm (sketch)
1. **Walk** the vault; for each `.md`: parse frontmatter (YAML) + body.
2. **Create a lean node** (label/tags/type/excerpt); **write the body** to the
   content store under `content:<nodeId>`; set `contentRef` + `source`.
3. **Folders → Container nodes**; set `parentId`/`children` from the tree.
4. **Second pass — resolve links:** turn each `[[target]]` into an `edge`
   (create a stub node if the target file is missing, à la Obsidian).
5. **Index for resonance:** feed bodies to TF-IDF/semantic to seed
   `resonance.*` and discover non-explicit connections.
6. **Emit** a `NodeGraph` (memory) + content-store entries; hand to the engine
   exactly like any other data source (`DataLoader`).

### 3D graph view
Once imported, the "fly-around 3D Obsidian graph" is just the existing renderer +
layout engine seeded from the vault instead of a test pattern. Folders give it
hierarchy that Obsidian's flat link-graph lacks; wikilinks give it the cross-links.

---

## 5. Phased plan

1. **Content tier (client):** an `IndexedDBContentStore` with
   `get/put/delete(nodeId)`; add `excerpt`/`contentRef`/`contentType` to the
   schema; lazy-load on node open. *(Unblocks everything below.)*
2. **Obsidian importer (MVP):** frontmatter + body + folder hierarchy →
   `NodeGraph` + content store. Wikilinks as edges in a second pass.
3. **Resonance over content:** TF-IDF/semantic on lazy-loaded bodies feeding
   `resonance.*` (this is where the future `ResonanceEngine` plugs in).
4. **True fractal nesting:** `isContainer` / `childGraphRef` + a zoom stack.
5. **Server tier (later):** promote the content store + graph to the Postgres +
   object-store model from the Hybrid Architecture doc for multi-device/consensus.

---

## 6. Open questions
- **Edges as first-class objects?** The Hybrid doc has an `edges` table, but
  in-memory nodes still use `children: [...]`. Unifying on an explicit edge list
  (with `relationship_type`, `weight`) would make links, hierarchy, and resonance
  connections one mechanism. Worth deciding before the importer hard-codes either.
- **Content dedup / large vaults:** hash bodies to avoid re-storing identical
  notes; cap excerpt generation cost on import.
- **Round-trip:** is Obsidian import one-way, or do we sync edits back to `.md`?
- **Nesting vs. hierarchy authoring:** when should a folder become a `Container`
  (true sub-universe) vs. just a parent node? Default = folders are parents;
  promote to `Container` on demand.
