// src/data/VaultPersistence.js
//
// Remembers the last-imported vault so it reappears on reload — no re-import.
// The heavy note bodies already live in the ContentStore (IndexedDB); this just
// persists the lightweight graph (nodes + metadata) alongside it. Uses its own
// IndexedDB database so it never collides with the content store's schema.

import { ContentStore } from './ContentStore.js';

const KEY = 'current';

export class VaultPersistence {
    constructor() {
        // Separate DB so multiple object stores aren't needed in one schema.
        this.store = new ContentStore({ dbName: 'fractality-vault-meta', storeName: 'meta' });
    }

    /** @param {object} graph portable { version, nodes, stats } from the importer */
    async save(graph, stats) {
        await this.store.put(KEY, { graph, stats, savedAt: Date.now() });
    }

    /** @returns {Promise<{graph:object, stats:object, savedAt:number}|null>} */
    async load() {
        return (await this.store.get(KEY)) || null;
    }

    async clear() {
        await this.store.delete(KEY);
    }
}
