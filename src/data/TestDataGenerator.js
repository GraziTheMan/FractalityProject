// src/data/TestDataGenerator.js
import { NodeData, NodeGraph } from './NodeData.js';

/**
 * Generate various types of test fractal data
 */
export class TestDataGenerator {
    constructor() {
        this.nodeCounter = 0;
    }
    
    /**
     * Generate a balanced tree structure
     */
    generateBalancedTree(options = {}) {
        const {
            depth = 4,
            childrenPerNode = 3,
            maxNodes = 1000,
            rootId = 'root'
        } = options;
        
        const graph = new NodeGraph();
        this.nodeCounter = 0;
        
        // Create root
        const root = new NodeData(rootId, 0, {
            label: 'Root Universe',
            type: 'root',
            tags: ['origin', 'genesis']
        });
        graph.addNode(root);
        
        // Generate tree recursively
        this._generateTreeLevel(graph, root, depth - 1, childrenPerNode, maxNodes);
        
        // Update sibling relationships
        this._updateSiblings(graph);
        
        return graph;
    }
    
    /**
     * Generate a golden ratio spiral structure
     */
    generateGoldenSpiral(options = {}) {
        const {
            branches = 5,
            levelsPerBranch = 4,
            fibonacciScaling = true,
            rootId = 'spiral-root'
        } = options;
        
        const graph = new NodeGraph();
        this.nodeCounter = 0;
        
        // Create root
        const root = new NodeData(rootId, 0, {
            label: 'Spiral Center',
            type: 'spiral-root',
            tags: ['golden', 'fibonacci']
        });
        graph.addNode(root);
        
        // Generate spiral branches
        const fibonacci = [1, 1, 2, 3, 5, 8, 13, 21];
        
        for (let branch = 0; branch < branches; branch++) {
            let parent = root;
            
            for (let level = 0; level < levelsPerBranch; level++) {
                const childCount = fibonacciScaling ? 
                    fibonacci[level % fibonacci.length] : 
                    Math.floor(Math.random() * 3) + 1;
                
                for (let i = 0; i < childCount; i++) {
                    const child = new NodeData(`spiral-${this.nodeCounter++}`, level + 1, {
                        label: `Branch ${branch} Level ${level}`,
                        type: 'spiral-node',
                        spiralAngle: (branch / branches) * Math.PI * 2,
                        spiralRadius: level + 1
                    });
                    
                    child.parentId = parent.id;
                    parent.childIds.push(child.id);
                    graph.addNode(child);
                    
                    // First child becomes the parent for next level
                    if (i === 0) parent = child;
                }
            }
        }
        
        this._updateSiblings(graph);
        return graph;
    }
    
    /**
     * Generate a random organic structure
     */
    generateOrganic(options = {}) {
        const {
            nodeCount = 100,
            maxDepth = 6,
            branchingFactor = 0.7, // Probability of having children
            rootId = 'organic-root'
        } = options;
        
        const graph = new NodeGraph();
        this.nodeCounter = 0;
        
        // Create root
        const root = new NodeData(rootId, 0, {
            label: 'Organic Origin',
            type: 'organic-root',
            tags: ['natural', 'growth']
        });
        graph.addNode(root);
        
        // Queue for breadth-first generation
        const queue = [root];
        
        while (queue.length > 0 && graph.nodes.size < nodeCount) {
            const parent = queue.shift();
            
            // Skip if too deep
            if (parent.depth >= maxDepth) continue;
            
            // Randomly decide if this node has children
            if (Math.random() < branchingFactor) {
                const childCount = this._randomChildCount();
                
                for (let i = 0; i < childCount && graph.nodes.size < nodeCount; i++) {
                    const child = new NodeData(`organic-${this.nodeCounter++}`, parent.depth + 1, {
                        label: `Organic Node ${this.nodeCounter}`,
                        type: 'organic-node',
                        growthRate: Math.random(),
                        energy: Math.random() * 100
                    });
                    
                    child.parentId = parent.id;
                    parent.childIds.push(child.id);
                    graph.addNode(child);
                    
                    queue.push(child);
                }
            }
        }
        
        this._updateSiblings(graph);
        return graph;
    }
    
    /**
     * Generate a specific test pattern
     */
    generateTestPattern(pattern = 'simple') {
        switch (pattern) {
            case 'simple':
                return this._generateSimpleTest();
            case 'stress':
                return this.generateBalancedTree({ 
                    depth: 5, 
                    childrenPerNode: 4, 
                    maxNodes: 500 
                });
            case 'deep':
                return this.generateBalancedTree({ 
                    depth: 10, 
                    childrenPerNode: 2, 
                    maxNodes: 1000 
                });
            case 'wide':
                return this.generateBalancedTree({ 
                    depth: 3, 
                    childrenPerNode: 10, 
                    maxNodes: 1000 
                });
            default:
                return this._generateSimpleTest();
        }
    }
    
    /**
     * Helper: Generate tree level recursively
     */
    _generateTreeLevel(graph, parent, remainingDepth, childrenPerNode, maxNodes) {
        if (remainingDepth <= 0 || graph.nodes.size >= maxNodes) return;
        
        for (let i = 0; i < childrenPerNode && graph.nodes.size < maxNodes; i++) {
            const child = new NodeData(
                `node-${this.nodeCounter++}`, 
                parent.depth + 1,
                {
                    label: `Node ${this.nodeCounter}`,
                    type: 'tree-node',
                    branchIndex: i
                }
            );
            
            child.parentId = parent.id;
            parent.childIds.push(child.id);
            graph.addNode(child);
            
            // Recursively generate children
            this._generateTreeLevel(graph, child, remainingDepth - 1, childrenPerNode, maxNodes);
        }
    }
    
    /**
     * Helper: Update sibling relationships
     */
    _updateSiblings(graph) {
        graph.nodes.forEach(node => {
            if (node.parentId) {
                const siblings = graph.getSiblings(node.id);
                node.siblingIds = siblings.map(s => s.id);
            }
        });
    }
    
    /**
     * Helper: Generate simple test structure
     */
    _generateSimpleTest() {
        const graph = new NodeGraph();
        
        // Root with 3 children
        const root = new NodeData('root', 0, { label: 'Test Root' });
        graph.addNode(root);
        
        for (let i = 0; i < 3; i++) {
            const child = new NodeData(`child-${i}`, 1, { 
                label: `Child ${i + 1}` 
            });
            child.parentId = root.id;
            root.childIds.push(child.id);
            graph.addNode(child);
            
            // Each child has 2 grandchildren
            for (let j = 0; j < 2; j++) {
                const grandchild = new NodeData(`grandchild-${i}-${j}`, 2, {
                    label: `Grandchild ${i + 1}-${j + 1}`
                });
                grandchild.parentId = child.id;
                child.childIds.push(grandchild.id);
                graph.addNode(grandchild);
            }
        }
        
        this._updateSiblings(graph);
        return graph;
    }
    
    /**
     * Helper: Random child count with bias toward smaller numbers
     */
    _randomChildCount() {
        const rand = Math.random();
        if (rand < 0.4) return 2;
        if (rand < 0.7) return 3;
        if (rand < 0.85) return 4;
        if (rand < 0.95) return 5;
        return Math.floor(Math.random() * 3) + 6;
    }
}

/**
 * Export singleton instance
 */
export const testDataGenerator = new TestDataGenerator();