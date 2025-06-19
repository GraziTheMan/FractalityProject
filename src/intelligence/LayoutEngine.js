// src/intelligence/LayoutEngine.js
import * as THREE from 'three';

/**
 * LayoutEngine - Mathematical Layout Calculations
 * DeepSeek's Domain: Beautiful mathematical patterns and cosmic arrangements
 * 
 * Implements the golden spiral, fibonacci patterns, and other
 * mathematically elegant layouts for the fractal universe.
 */
export class LayoutEngine {
    constructor() {
        // Mathematical constants
        this.PHI = (1 + Math.sqrt(5)) / 2; // Golden ratio
        this.PHI_ANGLE = Math.PI * (3 - Math.sqrt(5)); // Golden angle
        
        // Layout configurations
        this.layouts = {
            // Family view layout (default)
            family: {
                parent: { offset: [0, 0, -10], scale: 1.2 },
                siblings: { radius: 8, height: -4, arc: Math.PI },
                children: { radius: 5, spiralTightness: 1.0 }
            },
            
            // Pure golden spiral
            goldenSpiral: {
                radiusBase: 2,
                radiusGrowth: 0.5,
                heightScale: 0.3,
                rotations: 2
            },
            
            // Fibonacci sphere
            fibonacciSphere: {
                radius: 10,
                samples: 100
            },
            
            // Fractal tree
            fractalTree: {
                branchAngle: Math.PI / 6,
                branchScale: 0.7,
                levelHeight: 5
            },
            
            // Cosmic web
            cosmicWeb: {
                nodeRadius: 15,
                connectionStrength: 0.5,
                gravityConstant: 0.1
            }
        };
        
        // Active layout type
        this.activeLayout = 'family';
        
        // Layout calculation cache
        this.layoutCache = new Map();
        this.cacheTimeout = 500; // 500ms
        
        // Temporary vectors for calculations
        this._tempVec3 = new THREE.Vector3();
        this._tempQuat = new THREE.Quaternion();
    }
    
    /**
     * Calculate layout positions for visible nodes
     */
    calculateLayout(visibleNodes, focusNodeId, config = {}) {
        const positions = new Map();
        
        // Check cache
        const cacheKey = `${focusNodeId}-${visibleNodes.length}-${this.activeLayout}`;
        const cached = this.layoutCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.positions;
        }
        
        // Calculate based on active layout
        switch (this.activeLayout) {
            case 'goldenSpiral':
                this._calculateGoldenSpiralLayout(visibleNodes, focusNodeId, positions, config);
                break;
            case 'fibonacciSphere':
                this._calculateFibonacciSphereLayout(visibleNodes, focusNodeId, positions, config);
                break;
            case 'fractalTree':
                this._calculateFractalTreeLayout(visibleNodes, focusNodeId, positions, config);
                break;
            case 'cosmicWeb':
                this._calculateCosmicWebLayout(visibleNodes, focusNodeId, positions, config);
                break;
            case 'family':
            default:
                this._calculateFamilyLayout(visibleNodes, focusNodeId, positions, config);
                break;
        }
        
        // Cache result
        this.layoutCache.set(cacheKey, {
            positions: new Map(positions),
            timestamp: Date.now()
        });
        
        // Clean old cache
        this._cleanCache();
        
        return positions;
    }
    
    /**
     * Calculate family view layout (default)
     */
    _calculateFamilyLayout(visibleNodes, focusNodeId, positions, config) {
        const layoutConfig = { ...this.layouts.family, ...config };
        const focusNode = visibleNodes.find(n => n.id === focusNodeId);
        
        if (!focusNode) return;
        
        // Focus node at origin
        positions.set(focusNodeId, new THREE.Vector3(0, 0, 0));
        
        // Categorize nodes by relationship
        const relationships = this._categorizeNodesByRelationship(visibleNodes, focusNode);
        
        // Position parent
        if (relationships.parent) {
            const parentPos = new THREE.Vector3(...layoutConfig.parent.offset);
            positions.set(relationships.parent.id, parentPos);
        }
        
        // Position siblings in arc
        this._positionSiblingsInArc(relationships.siblings, positions, layoutConfig.siblings);
        
        // Position children in golden spiral
        this._positionChildrenInSpiral(relationships.children, positions, layoutConfig.children);
        
        // Position others (context nodes)
        this._positionContextNodes(relationships.others, positions, focusNode);
    }
    
    /**
     * Calculate pure golden spiral layout
     */
    _calculateGoldenSpiralLayout(visibleNodes, focusNodeId, positions, config) {
        const spiralConfig = { ...this.layouts.goldenSpiral, ...config };
        
        // Sort nodes by importance (focus first, then by depth)
        const sortedNodes = [...visibleNodes].sort((a, b) => {
            if (a.id === focusNodeId) return -1;
            if (b.id === focusNodeId) return 1;
            return a.depth - b.depth;
        });
        
        sortedNodes.forEach((node, index) => {
            const angle = index * this.PHI_ANGLE;
            const radius = spiralConfig.radiusBase + 
                          spiralConfig.radiusGrowth * Math.sqrt(index);
            const height = spiralConfig.heightScale * index;
            
            const position = new THREE.Vector3(
                radius * Math.cos(angle),
                height - (sortedNodes.length * spiralConfig.heightScale / 2),
                radius * Math.sin(angle)
            );
            
            positions.set(node.id, position);
        });
    }
    
    /**
     * Calculate Fibonacci sphere layout
     */
    _calculateFibonacciSphereLayout(visibleNodes, focusNodeId, positions, config) {
        const sphereConfig = { ...this.layouts.fibonacciSphere, ...config };
        const samples = Math.min(visibleNodes.length, sphereConfig.samples);
        
        visibleNodes.forEach((node, index) => {
            const i = index + 0.5;
            
            const theta = Math.acos(1 - 2 * i / samples);
            const phi = this.PHI_ANGLE * i;
            
            const position = new THREE.Vector3(
                sphereConfig.radius * Math.sin(theta) * Math.cos(phi),
                sphereConfig.radius * Math.sin(theta) * Math.sin(phi),
                sphereConfig.radius * Math.cos(theta)
            );
            
            // Focus node at center
            if (node.id === focusNodeId) {
                position.set(0, 0, 0);
            }
            
            positions.set(node.id, position);
        });
    }
    
    /**
     * Calculate fractal tree layout
     */
    _calculateFractalTreeLayout(visibleNodes, focusNodeId, positions, config) {
        const treeConfig = { ...this.layouts.fractalTree, ...config };
        const focusNode = visibleNodes.find(n => n.id === focusNodeId);
        
        if (!focusNode) return;
        
        // Build tree structure
        const tree = this._buildTreeStructure(visibleNodes, focusNode);
        
        // Position nodes recursively
        this._positionTreeNode(
            tree,
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, 1, 0),
            treeConfig.levelHeight,
            positions,
            treeConfig
        );
    }
    
    /**
     * Calculate cosmic web layout
     */
    _calculateCosmicWebLayout(visibleNodes, focusNodeId, positions, config) {
        const webConfig = { ...this.layouts.cosmicWeb, ...config };
        
        // Initialize random positions
        visibleNodes.forEach(node => {
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * webConfig.nodeRadius;
            const height = (Math.random() - 0.5) * webConfig.nodeRadius;
            
            positions.set(node.id, new THREE.Vector3(
                radius * Math.cos(angle),
                height,
                radius * Math.sin(angle)
            ));
        });
        
        // Focus node at center
        positions.set(focusNodeId, new THREE.Vector3(0, 0, 0));
        
        // Apply force-directed adjustments
        for (let iteration = 0; iteration < 10; iteration++) {
            this._applyCosmicForces(visibleNodes, positions, webConfig);
        }
    }
    
    /**
     * Helper: Categorize nodes by relationship to focus
     */
    _categorizeNodesByRelationship(visibleNodes, focusNode) {
        const relationships = {
            parent: null,
            siblings: [],
            children: [],
            others: []
        };
        
        visibleNodes.forEach(node => {
            if (node.id === focusNode.id) return;
            
            if (node.id === focusNode.parentId) {
                relationships.parent = node;
            } else if (focusNode.childIds.includes(node.id)) {
                relationships.children.push(node);
            } else if (node.parentId === focusNode.parentId && node.parentId) {
                relationships.siblings.push(node);
            } else {
                relationships.others.push(node);
            }
        });
        
        return relationships;
    }
    
    /**
     * Helper: Position siblings in arc
     */
    _positionSiblingsInArc(siblings, positions, config) {
        const count = siblings.length;
        if (count === 0) return;
        
        const angleStep = config.arc / Math.max(1, count - 1);
        const startAngle = -config.arc / 2;
        
        siblings.forEach((sibling, index) => {
            const angle = startAngle + angleStep * index;
            const position = new THREE.Vector3(
                config.radius * Math.cos(angle),
                config.height,
                config.radius * Math.sin(angle) - config.radius / 2
            );
            positions.set(sibling.id, position);
        });
    }
    
    /**
     * Helper: Position children in golden spiral
     */
    _positionChildrenInSpiral(children, positions, config) {
        const count = children.length;
        if (count === 0) return;
        
        children.forEach((child, index) => {
            // Vogel's method for sunflower spiral
            const angle = index * this.PHI_ANGLE;
            const radius = config.radius * Math.sqrt(index / count) * config.spiralTightness;
            
            // Add vertical variation based on golden ratio
            const height = (index / count - 0.5) * config.radius * 0.5;
            
            const position = new THREE.Vector3(
                radius * Math.cos(angle),
                height + 2,
                radius * Math.sin(angle) - 3
            );
            
            positions.set(child.id, position);
        });
    }
    
    /**
     * Helper: Position context nodes
     */
    _positionContextNodes(others, positions, focusNode) {
        // Place context nodes in outer ring
        const count = others.length;
        if (count === 0) return;
        
        others.forEach((node, index) => {
            const angle = (index / count) * Math.PI * 2;
            const radius = 15;
            const height = (node.depth - focusNode.depth) * 2;
            
            const position = new THREE.Vector3(
                radius * Math.cos(angle),
                height,
                radius * Math.sin(angle)
            );
            
            positions.set(node.id, position);
        });
    }
    
    /**
     * Helper: Build tree structure for fractal layout
     */
    _buildTreeStructure(visibleNodes, rootNode) {
        const nodeMap = new Map(visibleNodes.map(n => [n.id, n]));
        
        const buildSubtree = (node) => {
            const children = node.childIds
                .map(id => nodeMap.get(id))
                .filter(Boolean)
                .map(child => buildSubtree(child));
            
            return { node, children };
        };
        
        return buildSubtree(rootNode);
    }
    
    /**
     * Helper: Position tree nodes recursively
     */
    _positionTreeNode(tree, position, direction, height, positions, config) {
        positions.set(tree.node.id, position.clone());
        
        const childCount = tree.children.length;
        if (childCount === 0) return;
        
        const angleSpread = config.branchAngle * 2;
        const angleStep = angleSpread / Math.max(1, childCount - 1);
        const startAngle = -angleSpread / 2;
        
        tree.children.forEach((child, index) => {
            const angle = startAngle + angleStep * index;
            
            // Rotate direction
            const newDirection = direction.clone();
            newDirection.applyAxisAngle(new THREE.Vector3(1, 0, 0), angle);
            
            // Calculate child position
            const childPosition = position.clone();
            childPosition.add(newDirection.multiplyScalar(height));
            
            // Recursively position children
            this._positionTreeNode(
                child,
                childPosition,
                newDirection.normalize(),
                height * config.branchScale,
                positions,
                config
            );
        });
    }
    
    /**
     * Helper: Apply cosmic web forces
     */
    _applyCosmicForces(nodes, positions, config) {
        const forces = new Map();
        nodes.forEach(node => forces.set(node.id, new THREE.Vector3()));
        
        // Apply gravitational attraction between connected nodes
        nodes.forEach(node => {
            const nodePos = positions.get(node.id);
            
            // Attraction to connected nodes
            node.childIds.forEach(childId => {
                const childPos = positions.get(childId);
                if (childPos) {
                    const force = childPos.clone().sub(nodePos);
                    const distance = force.length();
                    if (distance > 0) {
                        force.normalize().multiplyScalar(
                            config.gravityConstant * config.connectionStrength / distance
                        );
                        forces.get(node.id).add(force);
                        forces.get(childId).sub(force);
                    }
                }
            });
        });
        
        // Apply repulsion between all nodes
        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                const node1 = nodes[i];
                const node2 = nodes[j];
                const pos1 = positions.get(node1.id);
                const pos2 = positions.get(node2.id);
                
                const force = pos1.clone().sub(pos2);
                const distance = force.length();
                if (distance > 0 && distance < config.nodeRadius) {
                    force.normalize().multiplyScalar(
                        config.gravityConstant / (distance * distance)
                    );
                    forces.get(node1.id).add(force);
                    forces.get(node2.id).sub(force);
                }
            }
        }
        
        // Apply forces
        nodes.forEach(node => {
            if (node.id !== nodes[0].id) { // Don't move focus node
                const pos = positions.get(node.id);
                pos.add(forces.get(node.id));
            }
        });
    }
    
    /**
     * Set active layout type
     */
    setLayout(layoutType) {
        if (!(layoutType in this.layouts)) {
            console.warn(`Unknown layout type: ${layoutType}`);
            return false;
        }
        
        this.activeLayout = layoutType;
        this.clearCache();
        return true;
    }
    
    /**
     * Update layout configuration
     */
    updateLayoutConfig(layoutType, config) {
        if (!(layoutType in this.layouts)) {
            console.warn(`Unknown layout type: ${layoutType}`);
            return false;
        }
        
        Object.assign(this.layouts[layoutType], config);
        this.clearCache();
        return true;
    }
    
    /**
     * Clear layout cache
     */
    clearCache() {
        this.layoutCache.clear();
    }
    
    /**
     * Clean old cache entries
     */
    _cleanCache() {
        const now = Date.now();
        const expiredKeys = [];
        
        this.layoutCache.forEach((value, key) => {
            if (now - value.timestamp > this.cacheTimeout) {
                expiredKeys.push(key);
            }
        });
        
        expiredKeys.forEach(key => this.layoutCache.delete(key));
    }
    
    /**
     * Get available layout types
     */
    getLayoutTypes() {
        return Object.keys(this.layouts);
    }
    
    /**
     * Get current layout configuration
     */
    getLayoutConfig(layoutType = null) {
        if (layoutType) {
            return { ...this.layouts[layoutType] };
        }
        return { ...this.layouts[this.activeLayout] };
    }
    
    /**
     * Get statistics
     */
    getStats() {
        return {
            activeLayout: this.activeLayout,
            availableLayouts: Object.keys(this.layouts),
            cacheSize: this.layoutCache.size,
            goldenRatio: this.PHI,
            goldenAngle: this.PHI_ANGLE
        };
    }
}