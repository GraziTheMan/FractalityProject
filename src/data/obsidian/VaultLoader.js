// src/data/obsidian/VaultLoader.js
//
// Browser glue between a picked vault folder and the running engine. Reads
// Markdown out of a <input webkitdirectory> FileList, runs the (pure) importer,
// and turns the portable graph into a NodeGraph the engine can load.
//
// Browser-only (imports NodeData -> three via the page import map). The parser
// and importer stay Node-testable on their own.

import { importVault } from './ObsidianImporter.js';
import { ContentStore } from '../ContentStore.js';
import { NodeGraph } from '../NodeData.js';

/** Drop the vault-root folder that webkitRelativePath prepends. */
export function stripVaultRoot(relPath) {
    const parts = String(relPath).replace(/\\/g, '/').split('/');
    return parts.length > 1 ? parts.slice(1).join('/') : parts[0];
}

/** FileList (from a directory picker) -> [{ path, content }] of Markdown files. */
export async function filesFromFileList(fileList) {
    const md = Array.from(fileList).filter(f => /\.md$/i.test(f.name));
    return Promise.all(md.map(async f => ({
        path: stripVaultRoot(f.webkitRelativePath || f.name),
        content: await f.text(),
    })));
}

/**
 * Import vault files into an engine-ready NodeGraph.
 * @param {{path:string,content:string}[]} files
 * @returns {Promise<{nodeGraph:NodeGraph, stats:object, contentStore:ContentStore}>}
 */
export async function importVaultToGraph(files, { contentStore, vaultName = 'Obsidian Vault' } = {}) {
    const store = contentStore || new ContentStore();
    const { graph, stats } = await importVault(files, { contentStore: store, vaultName });
    // `graph` is the portable JSON (persist this); `nodeGraph` is the live instance.
    return { nodeGraph: NodeGraph.fromJSON(graph), graph, stats, contentStore: store };
}
