// src/bridge/NodeBridge.js
// Bridge between CLI-generated content and frontend visualization
// Now includes Flask server communication alongside file-based sync
// COMPLETE VERSION - includes all original methods plus server integration

import { FractalNode, NodeCollection, NodeMigration } from '../shared/NodeSchema.js';
import { DataLoader } from '../data/DataLoader.js';

/**
 * NodeBridge - Unified bridge for CLI integration
 * Handles server communication, file sync, data conversion, and live updates
 */
export class NodeBridge {
    constructor(serverUrl = 'http://localhost:8001') {
        this.nodeCollection = new NodeCollection();
        this.dataLoader = new DataLoader();
        this.syncInterval = null;
        this.watchedFiles = new Set();
        
        // Server connection
        this.serverUrl = serverUrl;
        this.serverConnected = false;
        this.lastHealthCheck = null;
        
        // Event emitter for updates
        this.listeners = new Map();
        
        // Initialize server connection
        this.initializeServer();
    }
    
    /**
     * Initialize connection to Flask server
     */
    async initializeServer() {
        try {
            const response = await fetch(`${this.serverUrl}/health`);
            if (response.ok) {
                this.lastHealthCheck = await response.json();
                this.serverConnected = true;
                console.log('✅ NodeBridge: Connected to CLI server', this.lastHealthCheck);
                this.emit('serverConnected', this.lastHealthCheck);
                return true;
            }
        } catch (error) {
            console.log('📁 NodeBridge: Server not available, using file-based mode');
            this.serverConnected = false;
            this.emit('serverDisconnected', error);
            return false;
        }
    }
    
    /**
     * Load nodes from CLI (server or file) - UPDATED METHOD
     */
    async loadFromCLI(source) {
        if (this.serverConnected) {
            return await this.loadFromServer();
        } else {
            return await this.loadFromFile(source);
        }
    }
    
    /**
     * Load nodes from Flask server - NEW METHOD
     */
    async loadFromServer() {
        try {
            const response = await this.serverFetch('/nodes');
            
            if (!response.success) {
                throw new Error(response.error || 'Server load failed');
            }
            
            // Import nodes with migration if needed
            const importResult = this.importNodes(response.nodes);
            
            console.log('✅ NodeBridge: Loaded from server', importResult);
            
            // Emit load event
            this.emit('nodesLoaded', {
                nodes: this.nodeCollection.exportAll(),
                stats: importResult,
                source: 'server'
            });
            
            return importResult;
            
        } catch (error) {
            console.error('❌ NodeBridge: Server load failed', error);
            this.serverConnected = false;
            throw error;
        }
    }
    
    /**
     * Load nodes from file - RENAMED FROM loadFromCLI
     */
    async loadFromFile(source) {
        try {
            // Load data using existing DataLoader
            const data = await this.dataLoader.loadData(source);
            
            if (!data || !data.nodes) {
                throw new Error('Invalid data format');
            }
            
            // Import nodes with migration if needed
            const importResult = this.importNodes(data.nodes);
            
            console.log('✅ NodeBridge: Loaded from file', importResult);
            
            // Emit load event
            this.emit('nodesLoaded', {
                nodes: this.nodeCollection.exportAll(),
                stats: importResult,
                source: 'file'
            });
            
            return importResult;
            
        } catch (error) {
            console.error('❌ NodeBridge: File load failed', error);
            throw error;
        }
    }
    
    /**
     * Import nodes with format detection and migration - ORIGINAL METHOD
     */
    importNodes(nodesData) {
        const results = {
            added: 0,
            updated: 0,
            migrated: 0,
            errors: []
        };
        
        nodesData.forEach(nodeData => {
            try {
                // Detect format and migrate if needed
                const format = NodeMigration.detectFormat(nodeData);
                let node = nodeData;
                
                if (format === 'legacy' || format === 'unknown') {
                    node = NodeMigration.migrateNode(nodeData);
                    results.migrated++;
                }
                
                // Add to collection
                const existing = this.nodeCollection.nodes.has(node.id);
                const added = this.nodeCollection.addNode(node);
                
                if (added) {
                    if (existing) {
                        results.updated++;
                    } else {
                        results.added++;
                    }
                }
                
            } catch (error) {
                results.errors.push({
                    nodeId: nodeData.id,
                    error: error.message
                });
            }
        });
        
        return results;
    }
    
    /**
     * Export nodes for CLI consumption - ORIGINAL METHOD
     */
    exportForCLI() {
        const nodes = this.nodeCollection.exportAll();
        
        // Add CLI-specific fields
        const cliNodes = nodes.map(node => ({
            ...node,
            _content: this.generateMarkdownContent(node),
            _filepath: this.generateFilepath(node)
        }));
        
        const exportData = {
            version: "0.2.2",
            nodes: cliNodes,
            metadata: {
                exported: new Date().toISOString(),
                totalNodes: cliNodes.length,
                source: "fractality-frontend"
            }
        };
        
        // Try server export if connected
        if (this.serverConnected) {
            this.serverFetch('/export', {
                method: 'POST',
                body: JSON.stringify({ output: 'fractal-export.json' })
            }).catch(error => {
                console.warn('Server export failed:', error);
            });
        }
        
        return exportData;
    }
    
    /**
     * Enable auto-sync with CLI export file - UPDATED METHOD
     */
    enableAutoSync(exportPath, interval = 2000) {
        this.disableAutoSync();
        
        this.syncInterval = setInterval(async () => {
            try {
                if (this.serverConnected) {
                    // Check server health
                    const health = await this.serverFetch('/health');
                    this.lastHealthCheck = health;
                } else {
                    // Try to reconnect
                    await this.initializeServer();
                    
                    // Check file changes if in file mode
                    const hasChanged = await this.checkFileChanged(exportPath);
                    if (hasChanged) {
                        console.log('🔄 NodeBridge: File changes detected, reloading...');
                        await this.loadFromFile(exportPath);
                    }
                }
            } catch (error) {
                console.warn('NodeBridge: Auto-sync error', error);
                this.serverConnected = false;
                this.emit('serverDisconnected', error);
            }
        }, interval);
        
        console.log('✅ NodeBridge: Auto-sync enabled');
    }
    
    /**
     * Disable auto-sync - ORIGINAL METHOD
     */
    disableAutoSync() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
            console.log('🛑 NodeBridge: Auto-sync disabled');
        }
    }
    
    /**
     * Update resonance scores from similarity engine - ORIGINAL METHOD
     */
    updateResonanceScores(scores) {
        let updated = 0;
        
        Object.entries(scores).forEach(([nodeId, scoreData]) => {
            const node = this.nodeCollection.getNode(nodeId);
            if (node) {
                node.resonance.semanticScore = scoreData.semantic || 0;
                node.resonance.tfidfScore = scoreData.tfidf || 0;
                node.timestamps.modified = Date.now();
                updated++;
            }
        });
        
        if (updated > 0) {
            this.emit('resonanceUpdated', { updatedCount: updated });
        }
        
        return updated;
    }
    
    /**
     * Update CACE energy values - ORIGINAL METHOD
     */
    updateEnergyValues(energyData) {
        let updated = 0;
        
        Object.entries(energyData).forEach(([nodeId, energy]) => {
            const node = this.nodeCollection.getNode(nodeId);
            if (node) {
                node.energy = { ...node.energy, ...energy };
                node.timestamps.modified = Date.now();
                updated++;
            }
        });
        
        if (updated > 0) {
            this.emit('energyUpdated', { updatedCount: updated });
        }
        
        return updated;
    }
    
    /**
     * Get nodes for visualization with all computed properties - ORIGINAL METHOD
     */
    getVisibleNodes(criteria = {}) {
        const nodes = this.nodeCollection.findNodes(criteria);
        
        // Enrich with computed properties
        return nodes.map(node => ({
            ...node.toJSON(),
            // Add family relationships
            parent: node.parentId ? this.nodeCollection.getNode(node.parentId) : null,
            children: this.nodeCollection.getChildren(node.id),
            siblings: this.nodeCollection.getSiblings(node.id),
            // Add computed scores
            totalResonance: (node.resonance.semanticScore + node.resonance.tfidfScore) / 2,
            energyLevel: node.energy.ATP * node.energy.efficiency
        }));
    }
    
    /**
     * Search nodes by content - UPDATED METHOD
     */
    async searchNodes(query, options = {}) {
        if (this.serverConnected) {
            return await this.searchOnServer(query, options);
        } else {
            return await this.searchLocally(query, options);
        }
    }
    
    /**
     * Search using server's resonance engine - NEW METHOD
     */
    async searchOnServer(query, options = {}) {
        try {
            const searchData = {
                query: query,
                limit: options.limit || 10,
                type: options.type || 'hybrid'
            };
            
            const response = await this.serverFetch('/search', {
                method: 'POST',
                body: JSON.stringify(searchData)
            });
            
            if (!response.success) {
                throw new Error(response.error || 'Search failed');
            }
            
            // Update local resonance scores
            const scores = {};
            response.results.forEach(result => {
                scores[result.node_id] = {
                    semantic: result.similarity.semantic,
                    tfidf: result.similarity.tfidf
                };
            });
            this.updateResonanceScores(scores);
            
            console.log(`🔍 NodeBridge: Server search found ${response.results.length} results`);
            
            // Convert server results to local format
            const localResults = response.results.map(result => ({
                node: this.nodeCollection.getNode(result.node_id)?.toJSON(),
                score: result.similarity.hybrid,
                matches: [{
                    type: 'server',
                    similarity: result.similarity
                }]
            })).filter(r => r.node); // Filter out nodes not in local collection
            
            return localResults;
            
        } catch (error) {
            console.warn('Server search failed, falling back to local:', error);
            return await this.searchLocally(query, options);
        }
    }
    
    /**
     * Search locally - ORIGINAL METHOD
     */
    async searchLocally(query, options = {}) {
        const results = [];
        
        this.nodeCollection.nodes.forEach(node => {
            let score = 0;
            
            // Simple text matching (would be replaced by resonance engine)
            const content = this.generateMarkdownContent(node).toLowerCase();
            const queryLower = query.toLowerCase();
            
            if (content.includes(queryLower)) {
                score = 1.0;
            } else if (node.metadata.tags.some(tag => tag.toLowerCase().includes(queryLower))) {
                score = 0.8;
            } else if (node.metadata.label.toLowerCase().includes(queryLower)) {
                score = 0.6;
            }
            
            if (score > 0) {
                results.push({
                    node: node.toJSON(),
                    score,
                    matches: this.findMatches(node, query)
                });
            }
        });
        
        // Sort by score
        results.sort((a, b) => b.score - a.score);
        
        // Limit results
        const limit = options.limit || 10;
        return results.slice(0, limit);
    }
    
    /**
     * Execute CLI command - UPDATED METHOD
     */
    async executeCLICommand(command, args) {
        if (this.serverConnected) {
            return await this.executeOnServer(command, args);
        } else {
            return await this.executeMockCommand(command, args);
        }
    }
    
    /**
     * Execute command on Flask server - NEW METHOD
     */
    async executeOnServer(command, args) {
        try {
            switch (command) {
                case 'find':
                    return await this.searchOnServer(args.query, args.options);
                    
                case 'add':
                    const response = await this.serverFetch('/nodes', {
                        method: 'POST',
                        body: JSON.stringify({
                            path: args.path || `${args.label}.md`,
                            archetype: args.type || 'default',
                            content: args.content || `# ${args.label}\n\nNew node created via bridge`,
                            tags: args.tags || []
                        })
                    });
                    
                    if (response.success) {
                        // Reload nodes to get the new one
                        await this.loadFromServer();
                        return { success: true, node_id: response.node_id };
                    } else {
                        throw new Error(response.error);
                    }
                    
                case 'connect':
                    const connectResponse = await this.serverFetch('/connect', {
                        method: 'POST',
                        body: JSON.stringify({
                            source: args.sourceId,
                            target: args.targetId,
                            weight: args.weight || 1.0
                        })
                    });
                    
                    if (connectResponse.success) {
                        return { success: true, connection: connectResponse.connection };
                    } else {
                        throw new Error(connectResponse.error);
                    }
                    
                default:
                    return { success: false, error: 'Unknown command' };
            }
        } catch (error) {
            console.error(`Server command ${command} failed:`, error);
            // Fallback to mock if available
            return await this.executeMockCommand(command, args);
        }
    }
    
    /**
     * Execute mock command - ORIGINAL METHOD (renamed for clarity)
     */
    async executeMockCommand(command, args) {
        console.log(`🔧 NodeBridge: Mock executing ${command}`, args);
        
        switch (command) {
            case 'find':
                return this.searchLocally(args.query, args.options);
                
            case 'add':
                const newNode = new FractalNode({
                    label: args.label,
                    parentId: args.parentId,
                    type: args.type || 'default'
                });
                this.nodeCollection.addNode(newNode);
                return { success: true, node: newNode.toJSON() };
                
            case 'connect':
                const source = this.nodeCollection.getNode(args.sourceId);
                const target = this.nodeCollection.getNode(args.targetId);
                if (source && target) {
                    source.resonance.connections.push({
                        targetId: args.targetId,
                        weight: args.weight || 1.0
                    });
                    return { success: true };
                }
                return { success: false, error: 'Nodes not found' };
                
            default:
                return { success: false, error: 'Unknown command' };
        }
    }
    
    /**
     * Get server status - NEW METHOD
     */
    async getServerStatus() {
        if (!this.serverConnected) {
            return {
                connected: false,
                local_nodes: this.nodeCollection.nodes.size
            };
        }
        
        try {
            const status = await this.serverFetch('/status');
            return {
                connected: true,
                ...status
            };
        } catch (error) {
            this.serverConnected = false;
            throw error;
        }
    }
    
    /**
     * Check if server is connected - NEW METHOD
     */
    isServerConnected() {
        return this.serverConnected;
    }
    
    /**
     * Server fetch helper - NEW METHOD
     */
    async serverFetch(endpoint, options = {}) {
        const url = `${this.serverUrl}${endpoint}`;
        const config = {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        };
        
        const response = await fetch(url, config);
        
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`HTTP ${response.status}: ${error}`);
        }
        
        return await response.json();
    }
    
    // Event emitter methods - ORIGINAL METHODS
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }
    
    off(event, callback) {
        if (this.listeners.has(event)) {
            const callbacks = this.listeners.get(event);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }
    
    emit(event, data) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(callback => {
                callback(data);
            });
        }
    }
    
    // Helper methods - ORIGINAL METHODS
    generateMarkdownContent(node) {
        const lines = [];
        lines.push(`# ${node.metadata.label}`);
        lines.push('');
        
        if (node.metadata.description) {
            lines.push(node.metadata.description);
            lines.push('');
        }
        
        if (node.metadata.tags.length > 0) {
            lines.push(`Tags: ${node.metadata.tags.join(', ')}`);
            lines.push('');
        }
        
        return lines.join('\n');
    }
    
    generateFilepath(node) {
        // Convert label to filename
        const filename = node.metadata.label
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
            
        // Build path based on parent hierarchy
        const pathParts = [];
        let current = node;
        
        while (current) {
            pathParts.unshift(filename);
            if (current.parentId) {
                current = this.nodeCollection.getNode(current.parentId);
            } else {
                break;
            }
        }
        
        return pathParts.join('/') + '.md';
    }
    
    findMatches(node, query) {
        const matches = [];
        const content = this.generateMarkdownContent(node);
        const queryLower = query.toLowerCase();
        
        // Find matches in content
        const lines = content.split('\n');
        lines.forEach((line, index) => {
            if (line.toLowerCase().includes(queryLower)) {
                matches.push({
                    type: 'content',
                    line: index + 1,
                    text: line.trim()
                });
            }
        });
        
        // Find matches in metadata
        if (node.metadata.label.toLowerCase().includes(queryLower)) {
            matches.push({
                type: 'label',
                text: node.metadata.label
            });
        }
        
        node.metadata.tags.forEach(tag => {
            if (tag.toLowerCase().includes(queryLower)) {
                matches.push({
                    type: 'tag',
                    text: tag
                });
            }
        });
        
        return matches;
    }
    
    async checkFileChanged(filepath) {
        // This would check file modification time
        // For now, return false (no change detected)
        return false;
    }
}

// Singleton instance
export const nodeBridge = new NodeBridge();

// Auto-initialize if CLI export is available
if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
        // Check for CLI export parameter
        const params = new URLSearchParams(window.location.search);
        const cliExport = params.get('cli-export');
        
        if (cliExport) {
            console.log('🔗 NodeBridge: Found export parameter, loading...');
            nodeBridge.loadFromCLI(cliExport)
                .then(() => {
                    console.log('✅ NodeBridge: Ready');
                })
                .catch(error => {
                    console.error('❌ NodeBridge: Failed to load', error);
                });
        }
    });
}
