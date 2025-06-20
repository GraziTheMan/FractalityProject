// src/utils/DataBridge.js
/**
 * DataBridge - Utilities for bridging Data Console with Visualizer
 * Handles data format conversions and URL parameter passing
 */

import { NodeData, NodeGraph } from '../data/NodeData.js';

export class DataBridge {
    /**
     * Convert console format to NodeGraph
     */
    static consoleToNodeGraph(consoleData) {
        const nodeGraph = new NodeGraph();
        
        // Add nodes
        Object.values(consoleData.nodes).forEach(nodeData => {
            const node = new NodeData(
                nodeData.id,
                nodeData.depth,
                nodeData.parentId,
                nodeData.childIds,
                nodeData.position,
                nodeData.metadata
            );
            nodeGraph.addNode(node);
        });
        
        // Add connections
        if (consoleData.connections) {
            consoleData.connections.forEach(conn => {
                nodeGraph.addConnection(conn.from, conn.to, conn.type);
            });
        }
        
        return nodeGraph;
    }
    
    /**
     * Convert NodeGraph to console format
     */
    static nodeGraphToConsole(nodeGraph) {
        const consoleData = {
            metadata: {
                version: "2.0",
                created: new Date().toISOString().split('T')[0],
                description: "Exported from Fractality Visualizer"
            },
            nodes: {},
            connections: []
        };
        
        // Export nodes
        nodeGraph.nodes.forEach(node => {
            consoleData.nodes[node.id] = {
                id: node.id,
                depth: node.depth,
                parentId: node.parentId,
                childIds: node.childIds,
                position: node.position,
                metadata: node.metadata
            };
        });
        
        // Export connections
        nodeGraph.connections.forEach(conn => {
            consoleData.connections.push({
                from: conn.from,
                to: conn.to,
                type: conn.type || 'default'
            });
        });
        
        return consoleData;
    }
    
    /**
     * Load data from URL parameter
     */
    static loadFromURL() {
        const urlParams = new URLSearchParams(window.location.search);
        const encodedData = urlParams.get('data');
        
        if (encodedData) {
            try {
                const jsonStr = decodeURIComponent(encodedData);
                const data = JSON.parse(jsonStr);
                return this.consoleToNodeGraph(data);
            } catch (error) {
                console.error('Failed to load data from URL:', error);
            }
        }
        
        return null;
    }
    
    /**
     * Save data to localStorage with console format
     */
    static saveToLocalStorage(nodeGraph, key = 'fractalityData') {
        const consoleData = this.nodeGraphToConsole(nodeGraph);
        localStorage.setItem(key, JSON.stringify(consoleData));
    }
    
    /**
     * Load data from localStorage
     */
    static loadFromLocalStorage(key = 'fractalityData') {
        const saved = localStorage.getItem(key);
        if (saved) {
            try {
                const data = JSON.parse(saved);
                return this.consoleToNodeGraph(data);
            } catch (error) {
                console.error('Failed to load from localStorage:', error);
            }
        }
        return null;
    }
    
    /**
     * Generate shareable URL with embedded data
     */
    static generateShareURL(nodeGraph, baseURL = window.location.origin + '/index.html') {
        const consoleData = this.nodeGraphToConsole(nodeGraph);
        const jsonStr = JSON.stringify(consoleData);
        const encoded = encodeURIComponent(jsonStr);
        return `${baseURL}?data=${encoded}`;
    }
    
    /**
     * Validate console data format
     */
    static validateConsoleData(data) {
        if (!data || typeof data !== 'object') {
            return { valid: false, error: 'Data must be an object' };
        }
        
        if (!data.nodes || typeof data.nodes !== 'object') {
            return { valid: false, error: 'Missing or invalid nodes object' };
        }
        
        // Check each node
        for (const [id, node] of Object.entries(data.nodes)) {
            if (!node.id || node.id !== id) {
                return { valid: false, error: `Node ${id} has mismatched or missing ID` };
            }
            
            if (typeof node.depth !== 'number') {
                return { valid: false, error: `Node ${id} missing depth` };
            }
            
            if (!node.metadata || typeof node.metadata !== 'object') {
                return { valid: false, error: `Node ${id} missing metadata` };
            }
        }
        
        // Validate connections if present
        if (data.connections) {
            if (!Array.isArray(data.connections)) {
                return { valid: false, error: 'Connections must be an array' };
            }
            
            for (const conn of data.connections) {
                if (!conn.from || !conn.to) {
                    return { valid: false, error: 'Connection missing from/to' };
                }
            }
        }
        
        return { valid: true };
    }
    
    /**
     * Merge two console data objects
     */
    static mergeConsoleData(data1, data2) {
        const merged = {
            metadata: { ...data1.metadata, ...data2.metadata },
            nodes: { ...data1.nodes },
            connections: [...(data1.connections || [])]
        };
        
        // Merge nodes (data2 overwrites data1)
        Object.assign(merged.nodes, data2.nodes);
        
        // Merge connections (avoid duplicates)
        if (data2.connections) {
            data2.connections.forEach(conn2 => {
                const exists = merged.connections.some(conn1 =>
                    (conn1.from === conn2.from && conn1.to === conn2.to) ||
                    (conn1.from === conn2.to && conn1.to === conn2.from)
                );
                
                if (!exists) {
                    merged.connections.push(conn2);
                }
            });
        }
        
        return merged;
    }
    
    /**
     * Export node graph as downloadable file
     */
    static exportToFile(nodeGraph, filename = 'fractality_export.json') {
        const consoleData = this.nodeGraphToConsole(nodeGraph);
        const jsonStr = JSON.stringify(consoleData, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
    }
    
    /**
     * Import from file upload
     */
    static async importFromFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    const validation = this.validateConsoleData(data);
                    
                    if (!validation.valid) {
                        reject(new Error(validation.error));
                        return;
                    }
                    
                    const nodeGraph = this.consoleToNodeGraph(data);
                    resolve(nodeGraph);
                    
                } catch (error) {
                    reject(new Error(`Parse error: ${error.message}`));
                }
            };
            
            reader.onerror = () => {
                reject(new Error('Failed to read file'));
            };
            
            reader.readAsText(file);
        });
    }
}

// Auto-initialize if we're in the visualizer
if (typeof window !== 'undefined' && window.location.pathname.includes('index.html')) {
    window.addEventListener('DOMContentLoaded', () => {
        // Check for data in URL
        const nodeGraph = DataBridge.loadFromURL();
        if (nodeGraph) {
            console.log('📊 Loaded data from URL parameter');
            // The main app should handle this
            window.fractalityDataFromURL = nodeGraph;
        }
    });
}