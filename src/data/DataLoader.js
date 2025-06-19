// src/data/DataLoader.js
import { NodeGraph } from './NodeData.js';
import { testDataGenerator } from './TestDataGenerator.js';

/**
 * Handles loading fractal data from various sources
 */
export class DataLoader {
    constructor() {
        this.cache = new Map();
        this.loadingPromises = new Map();
        this.config = {
            cacheEnabled: true,
            maxCacheSize: 100 * 1024 * 1024, // 100MB
            preloadDepth: 2,
            chunkSize: 50 // Nodes per chunk
        };
    }
    
    /**
     * Load data from various sources
     */
    async load(source, options = {}) {
        // Check cache first
        if (this.config.cacheEnabled && this.cache.has(source)) {
            return this.cache.get(source);
        }
        
        // Check if already loading
        if (this.loadingPromises.has(source)) {
            return this.loadingPromises.get(source);
        }
        
        // Start loading
        const loadPromise = this._loadFromSource(source, options);
        this.loadingPromises.set(source, loadPromise);
        
        try {
            const graph = await loadPromise;
            
            // Cache if enabled
            if (this.config.cacheEnabled) {
                this._addToCache(source, graph);
            }
            
            return graph;
        } finally {
            this.loadingPromises.delete(source);
        }
    }
    
    /**
     * Load from specific source type
     */
    async _loadFromSource(source, options) {
        // Test data patterns
        if (source.startsWith('test:')) {
            return this._loadTestData(source.substring(5), options);
        }
        
        // File URLs
        if (source.startsWith('http://') || source.startsWith('https://')) {
            return this._loadFromURL(source, options);
        }
        
        // Local files
        if (source.startsWith('file:')) {
            return this._loadFromFile(source.substring(5), options);
        }
        
        // JSON data
        if (typeof source === 'object') {
            return this._loadFromJSON(source, options);
        }
        
        // Default: treat as test pattern
        return this._loadTestData(source, options);
    }
    
    /**
     * Load test data
     */
    async _loadTestData(pattern, options) {
        // Simulate async loading
        await new Promise(resolve => setTimeout(resolve, 100));
        
        switch (pattern) {
            case 'balanced':
                return testDataGenerator.generateBalancedTree(options);
            case 'spiral':
                return testDataGenerator.generateGoldenSpiral(options);
            case 'organic':
                return testDataGenerator.generateOrganic(options);
            case 'stress':
                return testDataGenerator.generateTestPattern('stress');
            case 'deep':
                return testDataGenerator.generateTestPattern('deep');
            case 'wide':
                return testDataGenerator.generateTestPattern('wide');
            default:
                return testDataGenerator.generateTestPattern('simple');
        }
    }
    
    /**
     * Load from URL
     */
    async _loadFromURL(url, options) {
        try {
            const response = await fetch(url, {
                headers: {
                    'Accept': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error(`Failed to load from ${url}: ${response.statusText}`);
            }
            
            const data = await response.json();
            return this._loadFromJSON(data, options);
        } catch (error) {
            console.error('Failed to load from URL:', error);
            throw error;
        }
    }
    
    /**
     * Load from file
     */
    async _loadFromFile(filePath, options) {
        // This would be implemented differently in Node.js vs browser
        // For browser, would use File API
        // For now, throw not implemented
        throw new Error('File loading not implemented in browser environment');
    }
    
    /**
     * Load from JSON data
     */
    async _loadFromJSON(data, options) {
        try {
            // Validate data structure
            if (!data.nodes || !Array.isArray(data.nodes)) {
                throw new Error('Invalid data format: missing nodes array');
            }
            
            // Create graph from JSON
            const graph = NodeGraph.fromJSON(data);
            
            // Apply any post-processing options
            if (options.filter) {
                this._applyFilter(graph, options.filter);
            }
            
            if (options.limit) {
                this._applyLimit(graph, options.limit);
            }
            
            return graph;
        } catch (error) {
            console.error('Failed to parse JSON data:', error);
            throw error;
        }
    }
    
    /**
     * Progressive loading around a focus node
     */
    async loadAroundNode(graph, nodeId, depth = 2) {
        const toLoad = new Set();
        const queue = [{ id: nodeId, depth: 0 }];
        const visited = new Set();
        
        while (queue.length > 0) {
            const { id, depth: currentDepth } = queue.shift();
            
            if (visited.has(id) || currentDepth > depth) continue;
            visited.add(id);
            
            const node = graph.getNode(id);
            if (!node) {
                toLoad.add(id);
                continue;
            }
            
            // Queue parent
            if (node.parentId && currentDepth < depth) {
                queue.push({ id: node.parentId, depth: currentDepth + 1 });
            }
            
            // Queue children
            node.childIds.forEach(childId => {
                if (currentDepth < depth) {
                    queue.push({ id: childId, depth: currentDepth + 1 });
                }
            });
        }
        
        // Load missing nodes
        if (toLoad.size > 0) {
            await this._loadNodes(graph, Array.from(toLoad));
        }
    }
    
    /**
     * Load specific nodes (stub for API integration)
     */
    async _loadNodes(graph, nodeIds) {
        // This would make API calls to load specific nodes
        // For now, just log
        console.log(`Would load nodes: ${nodeIds.join(', ')}`);
    }
    
    /**
     * Add to cache with size management
     */
    _addToCache(key, graph) {
        const size = graph.getMemoryUsage();
        
        // Check if we need to evict items
        if (this._getCacheSize() + size > this.config.maxCacheSize) {
            this._evictFromCache(size);
        }
        
        this.cache.set(key, {
            graph,
            size,
            timestamp: Date.now(),
            hits: 0
        });
    }
    
    /**
     * Get total cache size
     */
    _getCacheSize() {
        let total = 0;
        this.cache.forEach(entry => {
            total += entry.size;
        });
        return total;
    }
    
    /**
     * Evict items from cache (LRU)
     */
    _evictFromCache(neededSpace) {
        const entries = Array.from(this.cache.entries());
        
        // Sort by least recently used (combination of timestamp and hits)
        entries.sort((a, b) => {
            const scoreA = a[1].timestamp + (a[1].hits * 1000);
            const scoreB = b[1].timestamp + (b[1].hits * 1000);
            return scoreA - scoreB;
        });
        
        let freedSpace = 0;
        for (const [key, entry] of entries) {
            if (freedSpace >= neededSpace) break;
            
            freedSpace += entry.size;
            this.cache.delete(key);
        }
    }
    
    /**
     * Apply filter to graph
     */
    _applyFilter(graph, filter) {
        // Example: filter by depth, type, etc.
        if (filter.maxDepth !== undefined) {
            const toRemove = [];
            graph.nodes.forEach(node => {
                if (node.depth > filter.maxDepth) {
                    toRemove.push(node.id);
                }
            });
            toRemove.forEach(id => graph.nodes.delete(id));
        }
    }
    
    /**
     * Apply node limit to graph
     */
    _applyLimit(graph, limit) {
        if (graph.nodes.size <= limit) return;
        
        // Keep nodes closest to root
        const nodesByDepth = [];
        graph.nodes.forEach(node => {
            if (!nodesByDepth[node.depth]) {
                nodesByDepth[node.depth] = [];
            }
            nodesByDepth[node.depth].push(node);
        });
        
        const keep = new Set();
        let count = 0;
        
        for (let depth = 0; depth < nodesByDepth.length && count < limit; depth++) {
            const nodesAtDepth = nodesByDepth[depth] || [];
            for (const node of nodesAtDepth) {
                if (count >= limit) break;
                keep.add(node.id);
                count++;
            }
        }
        
        // Remove nodes not in keep set
        const toRemove = [];
        graph.nodes.forEach(node => {
            if (!keep.has(node.id)) {
                toRemove.push(node.id);
            }
        });
        toRemove.forEach(id => graph.nodes.delete(id));
    }
    
    /**
     * Clear cache
     */
    clearCache() {
        this.cache.clear();
    }
    
    /**
     * Get cache statistics
     */
    getCacheStats() {
        return {
            entries: this.cache.size,
            totalSize: this._getCacheSize(),
            maxSize: this.config.maxCacheSize,
            utilizationPercent: (this._getCacheSize() / this.config.maxCacheSize) * 100
        };
    }
}

/**
 * Export singleton instance
 */
export const dataLoader = new DataLoader();