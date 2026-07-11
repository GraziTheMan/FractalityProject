// src/data/ContentStore.js
//
// The heavy "content tier" from DESIGN_NodeStorage_and_ObsidianImport.md.
// Stores full node payloads (e.g. an entire Markdown note body) keyed by node
// id, separate from the lean graph node. In the browser it uses IndexedDB
// (hundreds of MB+); where IndexedDB is unavailable (Node tests, private modes)
// it transparently falls back to an in-memory Map so callers never branch.

export class ContentStore {
    constructor({ dbName = 'fractality', storeName = 'node-content' } = {}) {
        this.dbName = dbName;
        this.storeName = storeName;
        this._db = null;
        this._mem = new Map();
        this._useMemory = typeof indexedDB === 'undefined';
    }

    async _getDB() {
        if (this._useMemory) return null;
        if (this._db) return this._db;
        this._db = await new Promise((resolve, reject) => {
            const req = indexedDB.open(this.dbName, 1);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName);
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        }).catch(() => {
            // IndexedDB present but unusable — degrade to memory.
            this._useMemory = true;
            return null;
        });
        return this._db;
    }

    async put(nodeId, content) {
        const db = await this._getDB();
        if (!db) { this._mem.set(nodeId, content); return; }
        await this._tx('readwrite', store => store.put(content, nodeId));
    }

    async get(nodeId) {
        const db = await this._getDB();
        if (!db) return this._mem.has(nodeId) ? this._mem.get(nodeId) : null;
        return this._tx('readonly', store => store.get(nodeId));
    }

    async has(nodeId) {
        const db = await this._getDB();
        if (!db) return this._mem.has(nodeId);
        const key = await this._tx('readonly', store => store.getKey(nodeId));
        return key !== undefined;
    }

    async delete(nodeId) {
        const db = await this._getDB();
        if (!db) { this._mem.delete(nodeId); return; }
        await this._tx('readwrite', store => store.delete(nodeId));
    }

    async clear() {
        const db = await this._getDB();
        if (!db) { this._mem.clear(); return; }
        await this._tx('readwrite', store => store.clear());
    }

    _tx(mode, fn) {
        return new Promise((resolve, reject) => {
            const tx = this._db.transaction(this.storeName, mode);
            const store = tx.objectStore(this.storeName);
            const req = fn(store);
            tx.oncomplete = () => resolve(req ? req.result : undefined);
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        });
    }
}
