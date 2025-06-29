// src/bridge/NodeBridge.js
// Bridge between CLI-generated content and frontend visualization
// Works with the unified NodeSchema.js

import { FractalNode, NodeCollection, NodeMigration } from '../shared/NodeSchema.js';
import { DataLoader } from '../data/DataLoader.js';

/**
 * NodeBridge - Connects CLI markdown system with frontend visualization
 * Handles data synchronization, format conversion, and live updates
 */
export class NodeBridge {
    constructor() {
        this.nodeCollection = new NodeCollection();
        this.dataLoader = new DataLoader();
        this.syncInterval = null;
        this.watchedFiles = new Set();
        
        // Event emitter for updates
        this.listeners = new Map();
    }
    
    /**
     * Load nodes from CLI export
     */
    async loadFromCLI(source) {
        try {
            // Load data using existing DataLoader
            const data = await this.dataLoader.loadData(source);
            
            if (!data || !data.nodes) {
                throw new Error('Invalid data format');
            }
            
            // Import nodes with migration if needed
            const importResult = this.importNodes(data.nodes);
            
            console.log('✅ CLI Bridge: Loaded', importResult);
            
            // Emit load event
            this.emit('nodesLoaded', {
                nodes: this.nodeCollection.exportAll(),
                stats: importResult
            });
            
            return importResult;
            
        } catch (error) {
            console.error('❌ CLI Bridge: Load failed', error);
            throw error;
        }
    }
    
    /**
     * Import nodes with format detection and migration
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
     * Export nodes for CLI consumption
     */
    exportForCLI() {
        const nodes = this.nodeCollection.exportAll();
        
        // Add CLI-specific fields
        const cliNodes = nodes.map(node => ({
            ...node,
            _content: this.generateMarkdownContent(node),
            _filepath: this.generateFilepath(node)
        }));
        
        return {
            version: "0.2.2",
            nodes: cliNodes,
            metadata: {
                exported: new Date().toISOString(),
                totalNodes: cliNodes.length,
                source: "fractality-frontend"
            }
        };
    }
    
    /**
     * Enable auto-sync with CLI export file
     */
    enableAutoSync(exportPath, interval = 2000) {
        this.disableAutoSync();
        
        this.syncInterval = setInterval(async () => {
            try {
                // Check if file has changed (mock implementation)
                const hasChanged = await this.checkFileChanged(exportPath);
                
                if (hasChanged) {
                    console.log('🔄 CLI Bridge: Detected changes, syncing...');
                    await this.loadFromCLI(exportPath);
                }
            } catch (error) {
                console.error('❌ CLI Bridge: Sync error', error);
            }
        }, interval);
        
        console.log('✅ CLI Bridge: Auto-sync enabled');
    }
    
    /**
     * Disable auto-sync
     */
    disableAutoSync() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
            console.log('🛑 CLI Bridge: Auto-sync disabled');
        }
    }
    
    /**
     * Update resonance scores from similarity engine
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
     * Update CACE energy values
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
     * Get nodes for visualization with all computed properties
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
     * Search nodes by content (for connecting to CLI find command)
     */
    async searchNodes(query, options = {}) {
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
     * Bridge to Python CLI command execution
     */
    async executeCLICommand(command, args) {
        // This would connect to a local server or use WebSockets
        // For now, we'll simulate the response
        
        console.log(`🔧 CLI Bridge: Executing ${command}`, args);
        
        switch (command) {
            case 'find':
                return this.searchNodes(args.query, args.options);
                
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
    
    // Event emitter methods
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
    
    // Helper methods
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
        // For now, return false (no change)
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
            console.log('🔗 CLI Bridge: Found export parameter, loading...');
            nodeBridge.loadFromCLI(cliExport)
                .then(() => {
                    console.log('✅ CLI Bridge: Ready');
                })
                .catch(error => {
                    console.error('❌ CLI Bridge: Failed to load', error);
                });
        }
    });
}