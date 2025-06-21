// src/chat/ChatMemoryStore.js
export class ChatMemoryStore {
    constructor() {
        this.dbName = 'FractalityChatDB';
        this.version = 1;
        this.db = null;
        this.initPromise = this.initDB();
    }
    
    async initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Messages store
                if (!db.objectStoreNames.contains('messages')) {
                    const messageStore = db.createObjectStore('messages', { 
                        keyPath: 'id' 
                    });
                    messageStore.createIndex('sessionId', 'sessionId', { unique: false });
                    messageStore.createIndex('senderId', 'senderId', { unique: false });
                    messageStore.createIndex('timestamp', 'timestamp', { unique: false });
                    messageStore.createIndex('type', 'type', { unique: false });
                }
                
                // Sessions store
                if (!db.objectStoreNames.contains('sessions')) {
                    const sessionStore = db.createObjectStore('sessions', { 
                        keyPath: 'id' 
                    });
                    sessionStore.createIndex('startTime', 'startTime', { unique: false });
                    sessionStore.createIndex('topic', 'topic', { unique: false });
                }
                
                // Contexts store
                if (!db.objectStoreNames.contains('contexts')) {
                    const contextStore = db.createObjectStore('contexts', { 
                        keyPath: 'id' 
                    });
                    contextStore.createIndex('participantId', 'participantId', { unique: false });
                    contextStore.createIndex('lastActive', 'lastActive', { unique: false });
                }
            };
        });
    }
    
    async ensureDB() {
        if (!this.db) {
            await this.initPromise;
        }
    }
    
    async save(message) {
        await this.ensureDB();
        
        const tx = this.db.transaction(['messages'], 'readwrite');
        const store = tx.objectStore('messages');
        
        return new Promise((resolve, reject) => {
            const request = store.add(message);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    
    async saveSessionMetadata(session) {
        await this.ensureDB();
        
        const tx = this.db.transaction(['sessions'], 'readwrite');
        const store = tx.objectStore('sessions');
        
        const metadata = {
            id: session.id,
            startTime: session.startTime,
            endTime: session.endTime,
            topic: session.topic,
            participants: session.participants.map(p => ({
                id: p.id,
                type: p.type,
                name: p.type === 'human' ? p.name : p.personality?.name
            })),
            metadata: session.metadata
        };
        
        return new Promise((resolve, reject) => {
            const request = store.put(metadata);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    
    async getSessionHistory(sessionId, limit = 100) {
        await this.ensureDB();
        
        const tx = this.db.transaction(['messages'], 'readonly');
        const store = tx.objectStore('messages');
        const index = store.index('sessionId');
        
        return new Promise((resolve, reject) => {
            const messages = [];
            const request = index.openCursor(IDBKeyRange.only(sessionId));
            
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor && messages.length < limit) {
                    messages.push(cursor.value);
                    cursor.continue();
                } else {
                    // Sort by timestamp
                    messages.sort((a, b) => a.timestamp - b.timestamp);
                    resolve(messages);
                }
            };
            
            request.onerror = () => reject(request.error);
        });
    }
    
    async getParticipantHistory(participantId, limit = 50) {
        await this.ensureDB();
        
        const tx = this.db.transaction(['messages'], 'readonly');
        const store = tx.objectStore('messages');
        const index = store.index('senderId');
        
        return new Promise((resolve, reject) => {
            const messages = [];
            const request = index.openCursor(IDBKeyRange.only(participantId));
            
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor && messages.length < limit) {
                    messages.push(cursor.value);
                    cursor.continue();
                } else {
                    messages.sort((a, b) => b.timestamp - a.timestamp);
                    resolve(messages);
                }
            };
            
            request.onerror = () => reject(request.error);
        });
    }
    
    async searchSimilarConversations(query, limit = 10) {
        await this.ensureDB();
        
        // For now, simple text search. Could integrate with similarity engines
        const tx = this.db.transaction(['messages'], 'readonly');
        const store = tx.objectStore('messages');
        
        return new Promise((resolve, reject) => {
            const results = [];
            const queryLower = query.toLowerCase();
            const request = store.openCursor();
            
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    const message = cursor.value;
                    if (message.content.toLowerCase().includes(queryLower)) {
                        results.push({
                            message: message,
                            relevance: this.calculateRelevance(message.content, query)
                        });
                    }
                    cursor.continue();
                } else {
                    // Sort by relevance
                    results.sort((a, b) => b.relevance - a.relevance);
                    resolve(results.slice(0, limit));
                }
            };
            
            request.onerror = () => reject(request.error);
        });
    }
    
    calculateRelevance(content, query) {
        // Simple relevance scoring - could be enhanced
        const contentLower = content.toLowerCase();
        const queryLower = query.toLowerCase();
        const words = queryLower.split(/\s+/);
        
        let score = 0;
        words.forEach(word => {
            const count = (contentLower.match(new RegExp(word, 'g')) || []).length;
            score += count;
        });
        
        // Boost for exact phrase match
        if (contentLower.includes(queryLower)) {
            score *= 2;
        }
        
        return score;
    }
    
    async saveContext(sessionId, participantId, context) {
        await this.ensureDB();
        
        const tx = this.db.transaction(['contexts'], 'readwrite');
        const store = tx.objectStore('contexts');
        
        const contextData = {
            id: `${sessionId}-${participantId}`,
            sessionId,
            participantId,
            context: context,
            lastActive: Date.now()
        };
        
        return new Promise((resolve, reject) => {
            const request = store.put(contextData);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    
    async loadContext(sessionId, participantId) {
        await this.ensureDB();
        
        const tx = this.db.transaction(['contexts'], 'readonly');
        const store = tx.objectStore('contexts');
        
        return new Promise((resolve, reject) => {
            const request = store.get(`${sessionId}-${participantId}`);
            request.onsuccess = () => resolve(request.result?.context || null);
            request.onerror = () => reject(request.error);
        });
    }
    
    async getAllSessions() {
        await this.ensureDB();
        
        const tx = this.db.transaction(['sessions'], 'readonly');
        const store = tx.objectStore('sessions');
        
        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => {
                const sessions = request.result;
                sessions.sort((a, b) => b.startTime - a.startTime);
                resolve(sessions);
            };
            request.onerror = () => reject(request.error);
        });
    }
    
    async clearOldData(maxAge = 30 * 24 * 60 * 60 * 1000) { // 30 days
        await this.ensureDB();
        
        const cutoffTime = Date.now() - maxAge;
        
        // Clear old messages
        const tx = this.db.transaction(['messages', 'sessions', 'contexts'], 'readwrite');
        
        // Messages
        const messageStore = tx.objectStore('messages');
        const timestampIndex = messageStore.index('timestamp');
        const oldMessages = timestampIndex.openCursor(IDBKeyRange.upperBound(cutoffTime));
        
        oldMessages.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                cursor.delete();
                cursor.continue();
            }
        };
        
        // Sessions
        const sessionStore = tx.objectStore('sessions');
        const sessionIndex = sessionStore.index('startTime');
        const oldSessions = sessionIndex.openCursor(IDBKeyRange.upperBound(cutoffTime));
        
        oldSessions.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                cursor.delete();
                cursor.continue();
            }
        };
        
        // Contexts
        const contextStore = tx.objectStore('contexts');
        const contextIndex = contextStore.index('lastActive');
        const oldContexts = contextIndex.openCursor(IDBKeyRange.upperBound(cutoffTime));
        
        oldContexts.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                cursor.delete();
                cursor.continue();
            }
        };
        
        return new Promise((resolve) => {
            tx.oncomplete = () => resolve();
        });
    }
}