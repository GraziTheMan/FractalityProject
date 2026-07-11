// src/data/obsidian/ObsidianImporter.js
//
// Turns a set of Obsidian vault files into a portable Fractality graph
// ({ nodes, stats, version }) that NodeGraph.fromJSON() can load directly, and
// streams heavy note bodies into a ContentStore (the two-tier model).
//
// Environment-agnostic: it only imports the pure parser, so it runs in the
// browser (real vault via a directory picker) and under Node (tests, a folder
// on disk). Folders become the parent/child hierarchy that drives the 3D
// Family View; [[wikilinks]] are recorded as cross-links on each node.

import { parseNote, basename } from './ObsidianParser.js';

const GRAPH_VERSION = '0.2.2';

/**
 * @param {{path:string, content:string}[]} files  vault-relative '/' paths
 * @param {object} opts
 * @param {ContentStore} [opts.contentStore]  where note bodies are written
 * @param {string} [opts.vaultName]           label for the synthetic root
 * @returns {Promise<{graph:object, stats:object}>}
 */
export async function importVault(files, opts = {}) {
    const { contentStore = null, vaultName = 'Vault' } = opts;

    const mdFiles = (files || [])
        .filter(f => f && typeof f.path === 'string' && /\.md$/i.test(f.path))
        .map(f => ({ path: normalizePath(f.path), content: f.content ?? '' }));

    const nodes = new Map();               // id -> node
    const add = (node) => { nodes.set(node.id, node); return node; };
    const linkPlan = [];                   // { fromId, targets:[] }
    const nameIndex = new Map();           // lowercased basename -> [ids]
    const pathIndex = new Map();           // 'folder/note' (no ext) -> id

    // --- root ---
    const rootId = '__vault_root__';
    add(makeNode(rootId, null, 0, {
        label: vaultName, type: 'Container', tags: [], isContainer: true,
        source: { kind: 'obsidian', role: 'vault-root' },
    }));

    // --- folders (Container nodes) ---
    const folderIds = new Map([['', rootId]]); // folder path -> node id
    const ensureFolder = (folderPath) => {
        if (folderIds.has(folderPath)) return folderIds.get(folderPath);
        const parentPath = folderPath.includes('/')
            ? folderPath.slice(0, folderPath.lastIndexOf('/')) : '';
        const parentId = ensureFolder(parentPath);
        const id = 'folder:' + folderPath;
        const depth = folderPath.split('/').length; // 'a'->1, 'a/b'->2
        add(makeNode(id, parentId, depth, {
            label: basename(folderPath), type: 'Container', tags: [], isContainer: true,
            source: { kind: 'obsidian', role: 'folder', path: folderPath },
        }));
        folderIds.set(folderPath, id);
        return id;
    };

    // --- notes ---
    for (const { path, content } of mdFiles) {
        const parsed = parseNote(path, content);
        const folderPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
        const parentId = ensureFolder(folderPath);
        const id = 'note:' + path.replace(/\.md$/i, '');
        const depth = path.split('/').length; // file adds one level below its folder

        add(makeNode(id, parentId, depth, {
            label: parsed.title,
            type: parsed.type,
            tags: parsed.tags,
            excerpt: parsed.excerpt,
            contentRef: contentStore ? `content:${id}` : null,
            contentType: 'markdown',
            links: [],                     // filled in the link pass
            source: { kind: 'obsidian', role: 'note', path },
        }));

        if (contentStore) await contentStore.put(id, content);

        const key = basename(path).replace(/\.md$/i, '').toLowerCase();
        if (!nameIndex.has(key)) nameIndex.set(key, []);
        nameIndex.get(key).push(id);
        pathIndex.set(path.replace(/\.md$/i, '').toLowerCase(), id);
        linkPlan.push({ fromId: id, targets: parsed.links });
    }

    // --- wire hierarchy (childIds) ---
    for (const node of nodes.values()) {
        if (node.parentId && nodes.has(node.parentId)) {
            nodes.get(node.parentId).childIds.push(node.id);
        }
    }

    // --- resolve links -> cross-edges (+ stubs for missing targets) ---
    let linkCount = 0, unresolved = 0;
    for (const { fromId, targets } of linkPlan) {
        for (const target of targets) {
            const targetId = resolveLink(target, nameIndex, pathIndex);
            if (targetId && nodes.has(targetId)) {
                nodes.get(fromId).metadata.links.push(targetId);
                linkCount++;
            } else {
                const stubId = 'stub:' + target.toLowerCase();
                if (!nodes.has(stubId)) {
                    const stub = add(makeNode(stubId, rootId, 1, {
                        label: target, type: 'stub', tags: [],
                        source: { kind: 'obsidian', role: 'unresolved-link' },
                    }));
                    nodes.get(rootId).childIds.push(stub.id);
                    unresolved++;
                }
                nodes.get(fromId).metadata.links.push(stubId);
                linkCount++;
            }
        }
    }

    const nodeList = [...nodes.values()];
    const graph = {
        version: GRAPH_VERSION,
        nodes: nodeList,
        stats: {
            totalNodes: nodeList.length,
            maxDepth: nodeList.reduce((m, n) => Math.max(m, n.depth), 0),
            averageChildren: avgChildren(nodeList),
        },
    };

    return {
        graph,
        stats: {
            notes: mdFiles.length,
            folders: folderIds.size - 1,      // exclude the '' root mapping
            links: linkCount,
            unresolvedLinks: unresolved,
            totalNodes: nodeList.length,
        },
    };
}

// --- helpers ---

function makeNode(id, parentId, depth, metadata) {
    return {
        id,
        parentId,
        childIds: [],
        depth,
        metadata: {
            created: Date.now(),
            ...metadata,
        },
    };
}

function resolveLink(target, nameIndex, pathIndex) {
    const t = target.replace(/\.md$/i, '').trim().toLowerCase();
    if (pathIndex.has(t)) return pathIndex.get(t);           // full-path link
    const byName = nameIndex.get(basename(t));               // by note name
    if (byName && byName.length) return byName[0];
    return null;
}

function normalizePath(p) {
    // Normalize separators and strip a leading "./" or "/". Stripping a vault
    // root prefix (e.g. from webkitRelativePath) is the caller's job.
    return String(p).replace(/\\/g, '/').replace(/^\.?\//, '');
}

function avgChildren(nodeList) {
    const parents = nodeList.filter(n => n.childIds.length > 0);
    if (!parents.length) return 0;
    return parents.reduce((s, n) => s + n.childIds.length, 0) / parents.length;
}
