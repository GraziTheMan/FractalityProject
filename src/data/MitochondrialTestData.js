// src/data/MitochondrialTestData.js
import { NodeData, NodeGraph } from './NodeData.js';

/**
 * MitochondrialTestData - Generates test data with energy-aware node types
 * Creates fractal structures that mirror biological mitochondrial distributions
 */
export class MitochondrialTestData {
    constructor() {
        // Node type definitions with mitochondrial profiles
        this.nodeTypes = {
            executive: {
                mitochondrialDensity: 0.9,
                color: '#ff00ff',
                energyDemand: 'high',
                preferredNetwork: 'executive'
            },
            integration: {
                mitochondrialDensity: 0.85,
                color: '#ff44ff',
                energyDemand: 'high',
                preferredNetwork: 'executive'
            },
            memory: {
                mitochondrialDensity: 0.7,
                color: '#00ffff',
                energyDemand: 'medium',
                preferredNetwork: 'memory'
            },
            processing: {
                mitochondrialDensity: 0.6,
                color: '#44ffff',
                energyDemand: 'medium',
                preferredNetwork: 'memory'
            },
            routing: {
                mitochondrialDensity: 0.5,
                color: '#88ff88',
                energyDemand: 'low',
                preferredNetwork: 'memory'
            },
            sensory: {
                mitochondrialDensity: 0.4,
                color: '#ffff00',
                energyDemand: 'low',
                preferredNetwork: 'sensory'
            }
        };
    }
    
    /**
     * Generate a consciousness network test pattern
     */
    generateConsciousnessNetwork(config = {}) {
        const defaults = {
            executiveNodes: 10,
            memoryNodes: 20,
            sensoryNodes: 30,
            connectionDensity: 0.3,
            energyGradient: true
        };
        
        const settings = { ...defaults, ...config };
        const graph = new NodeGraph();
        
        // Create root executive node
        const root = this._createNode('root', 'executive', 0);
        graph.addNode(root);
        
        // Create executive layer (highest energy)
        const executiveLayer = [];
        for (let i = 0; i < settings.executiveNodes; i++) {
            const node = this._createNode(
                `exec-${i}`,
                i < 3 ? 'executive' : 'integration',
                1,
                'root'
            );
            graph.addNode(node);
            executiveLayer.push(node);
        }
        
        // Create memory layer (medium energy)
        const memoryLayer = [];
        executiveLayer.forEach((parent, parentIdx) => {
            const childCount = Math.floor(settings.memoryNodes / settings.executiveNodes);
            
            for (let i = 0; i < childCount; i++) {
                const node = this._createNode(
                    `mem-${parentIdx}-${i}`,
                    i < childCount / 2 ? 'memory' : 'processing',
                    2,
                    parent.id
                );
                graph.addNode(node);
                memoryLayer.push(node);
            }
        });
        
        // Create sensory layer (lowest energy)
        memoryLayer.forEach((parent, parentIdx) => {
            const childCount = Math.floor(settings.sensoryNodes / settings.memoryNodes);
            
            for (let i = 0; i < childCount; i++) {
                const nodeType = i === 0 ? 'routing' : 'sensory';
                const node = this._createNode(
                    `sens-${parentIdx}-${i}`,
                    nodeType,
                    3,
                    parent.id
                );
                graph.addNode(node);
            }
        });
        
        // Add cross-connections based on energy gradients
        if (settings.energyGradient) {
            this._addEnergyGradientConnections(graph, settings.connectionDensity);
        }
        
        return graph;
    }
    
    /**
     * Generate a mitochondrial distribution pattern
     */
    generateMitochondrialPattern(size = 100) {
        const graph = new NodeGraph();
        
        // Create nodes distributed like mitochondria in brain tissue
        const regions = [
            { type: 'executive', count: size * 0.15, center: { x: 0, y: 0, z: 0 } },
            { type: 'memory', count: size * 0.35, center: { x: 10, y: 0, z: 0 } },
            { type: 'sensory', count: size * 0.5, center: { x: -10, y: 0, z: 0 } }
        ];
        
        let nodeIndex = 0;
        
        regions.forEach(region => {
            const regionNodes = [];
            
            for (let i = 0; i < region.count; i++) {
                // Create clustered distribution
                const angle = (i / region.count) * Math.PI * 2;
                const radius = Math.sqrt(i / region.count) * 10;
                
                const node = this._createNode(
                    `node-${nodeIndex++}`,
                    region.type,
                    Math.floor(Math.random() * 3) + 1
                );
                
                // Set position for spatial distribution
                node.metadata.position = {
                    x: region.center.x + Math.cos(angle) * radius,
                    y: region.center.y + Math.sin(angle) * radius,
                    z: region.center.z + (Math.random() - 0.5) * 5
                };
                
                graph.addNode(node);
                regionNodes.push(node);
            }
            
            // Connect nodes within region
            this._connectRegion(regionNodes, graph);
        });
        
        // Add inter-region connections
        this._addInterRegionConnections(graph);
        
        return graph;
    }
    
    /**
     * Generate energy cascade pattern
     */
    generateEnergyCascade(levels = 5) {
        const graph = new NodeGraph();
        
        // Create a cascade where energy flows from high to low
        let previousLevel = [];
        
        for (let level = 0; level < levels; level++) {
            const nodeCount = Math.pow(2, level);
            const currentLevel = [];
            
            // Determine node type based on level
            let nodeType;
            if (level === 0) nodeType = 'executive';
            else if (level <= 2) nodeType = 'integration';
            else if (level <= 3) nodeType = 'memory';
            else nodeType = 'sensory';
            
            for (let i = 0; i < nodeCount; i++) {
                const node = this._createNode(
                    `cascade-${level}-${i}`,
                    nodeType,
                    level
                );
                
                // Connect to parent from previous level
                if (previousLevel.length > 0) {
                    const parentIdx = Math.floor(i / 2);
                    node.parentId = previousLevel[parentIdx].id;
                    previousLevel[parentIdx].childIds.push(node.id);
                }
                
                // Add energy flow metadata
                node.metadata.energyFlow = {
                    inflow: level === 0 ? 100 : 0,
                    outflow: 0,
                    efficiency: this.nodeTypes[nodeType].mitochondrialDensity
                };
                
                graph.addNode(node);
                currentLevel.push(node);
            }
            
            previousLevel = currentLevel;
        }
        
        return graph;
    }
    
    /**
     * Generate fusion/fission test pattern
     */
    generateFusionFissionPattern() {
        const graph = new NodeGraph();
        
        // Create pairs of nodes that can fuse
        const fusionPairs = [
            { type: 'memory', distance: 'close' },
            { type: 'processing', distance: 'medium' },
            { type: 'sensory', distance: 'far' }
        ];
        
        fusionPairs.forEach((pair, pairIdx) => {
            // Create node pairs
            const node1 = this._createNode(
                `fusion-${pairIdx}-a`,
                pair.type,
                2
            );
            const node2 = this._createNode(
                `fusion-${pairIdx}-b`,
                pair.type,
                2
            );
            
            // Set fusion metadata
            node1.metadata.fusionPartner = node2.id;
            node2.metadata.fusionPartner = node1.id;
            node1.metadata.fusionDistance = pair.distance;
            node2.metadata.fusionDistance = pair.distance;
            
            // Create parent for the pair
            const parent = this._createNode(
                `fusion-parent-${pairIdx}`,
                'integration',
                1
            );
            
            node1.parentId = parent.id;
            node2.parentId = parent.id;
            parent.childIds = [node1.id, node2.id];
            
            graph.addNode(parent);
            graph.addNode(node1);
            graph.addNode(node2);
            
            // Add fission candidates (energy-starved nodes)
            const fissionNode = this._createNode(
                `fission-${pairIdx}`,
                'sensory',
                3
            );
            fissionNode.metadata.energyStarved = true;
            fissionNode.metadata.atpLevel = 0.1;
            fissionNode.parentId = node1.id;
            node1.childIds.push(fissionNode.id);
            
            graph.addNode(fissionNode);
        });
        
        return graph;
    }
    
    /**
     * Create a node with mitochondrial metadata
     */
    _createNode(id, type, depth, parentId = null) {
        const node = new NodeData(id, depth);
        const typeData = this.nodeTypes[type] || this.nodeTypes.sensory;
        
        node.parentId = parentId;
        node.metadata = {
            label: `${type.charAt(0).toUpperCase() + type.slice(1)} ${id}`,
            type: type,
            energyDemand: typeData.energyDemand,
            networkAffinity: typeData.preferredNetwork,
            mitochondrialDensity: typeData.mitochondrialDensity,
            color: typeData.color,
            created: Date.now(),
            tags: [type, `energy-${typeData.energyDemand}`, typeData.preferredNetwork]
        };
        
        return node;
    }
    
    /**
     * Connect nodes within a region
     */
    _connectRegion(nodes, graph) {
        // Create sparse connections within region
        nodes.forEach((node, i) => {
            // Connect to 2-3 nearby nodes
            const connectionCount = 2 + Math.floor(Math.random() * 2);
            
            for (let j = 0; j < connectionCount; j++) {
                const targetIdx = (i + j + 1) % nodes.length;
                const target = nodes[targetIdx];
                
                if (!node.childIds.includes(target.id) && 
                    !target.childIds.includes(node.id)) {
                    
                    // Create bidirectional connection
                    node.metadata.connections = node.metadata.connections || [];
                    node.metadata.connections.push({
                        target: target.id,
                        strength: Math.random() * 0.5 + 0.5,
                        type: 'intra-region'
                    });
                }
            }
        });
    }
    
    /**
     * Add connections between regions
     */
    _addInterRegionConnections(graph) {
        const nodesByType = new Map();
        
        // Group nodes by type
        graph.nodes.forEach(node => {
            const type = node.metadata.type;
            if (!nodesByType.has(type)) {
                nodesByType.set(type, []);
            }
            nodesByType.get(type).push(node);
        });
        
        // Create connections between different types
        const types = Array.from(nodesByType.keys());
        
        for (let i = 0; i < types.length - 1; i++) {
            const sourceType = types[i];
            const targetType = types[i + 1];
            
            const sourceNodes = nodesByType.get(sourceType);
            const targetNodes = nodesByType.get(targetType);
            
            // Connect some nodes between regions
            const connectionCount = Math.min(5, sourceNodes.length, targetNodes.length);
            
            for (let j = 0; j < connectionCount; j++) {
                const source = sourceNodes[Math.floor(Math.random() * sourceNodes.length)];
                const target = targetNodes[Math.floor(Math.random() * targetNodes.length)];
                
                source.metadata.connections = source.metadata.connections || [];
                source.metadata.connections.push({
                    target: target.id,
                    strength: Math.random() * 0.3 + 0.2,
                    type: 'inter-region'
                });
            }
        }
    }
    
    /**
     * Add energy gradient connections
     */
    _addEnergyGradientConnections(graph, density) {
        const nodes = Array.from(graph.nodes.values());
        
        // Sort by mitochondrial density
        nodes.sort((a, b) => 
            (b.metadata.mitochondrialDensity || 0) - (a.metadata.mitochondrialDensity || 0)
        );
        
        // Create connections from high to low energy
        for (let i = 0; i < nodes.length - 1; i++) {
            const source = nodes[i];
            
            // Connect to some lower-energy nodes
            const targetCount = Math.floor(density * 10);
            
            for (let j = 0; j < targetCount; j++) {
                const targetIdx = i + 1 + Math.floor(Math.random() * (nodes.length - i - 1));
                const target = nodes[targetIdx];
                
                if (target && source.metadata.mitochondrialDensity > target.metadata.mitochondrialDensity) {
                    source.metadata.energyConnections = source.metadata.energyConnections || [];
                    source.metadata.energyConnections.push({
                        target: target.id,
                        gradient: source.metadata.mitochondrialDensity - target.metadata.mitochondrialDensity,
                        flowRate: Math.random() * 0.5 + 0.5
                    });
                }
            }
        }
    }
    
    /**
     * Generate all test patterns
     */
    static generateAllPatterns() {
        const generator = new MitochondrialTestData();
        
        return {
            consciousness: generator.generateConsciousnessNetwork(),
            distribution: generator.generateMitochondrialPattern(),
            cascade: generator.generateEnergyCascade(),
            fusion: generator.generateFusionFissionPattern()
        };
    }
}