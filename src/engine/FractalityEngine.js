// src/engine/FractalityEngine.js

import * as THREE from 'three';
import { loadThreeJS, getEnvironmentInfo } from '../utils/ThreeJSLoader.js';
import { FractalityState } from './FractalityState.js';
import { PerformanceMonitor } from './PerformanceMonitor.js';
import { FamilyViewController } from '../intelligence/FamilyViewController.js';
import { LayoutEngine } from '../intelligence/LayoutEngine.js';
import { AnimationSystem } from '../visualization/AnimationSystem.js';
import { CACEEngine } from '../intelligence/CACEEngine.js';
import { FractalityRenderer } from '../visualization/FractalityRenderer.js';
import { QualityManager } from '../visualization/QualityManager.js';
import { PerformanceDashboard } from '../ui/PerformanceDashboard.js';
import { NodeInfoPanel } from '../ui/NodeInfoPanel.js';
import { NodeLabels } from '../ui/NodeLabels.js';
import { config } from '../config/config.js';

/**
 * The CACE Genesis Engine - Main Orchestrator
 * Bringing together Performance, Beauty, and Intelligence
 */
export class FractalityEngine {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);

        // Defensive: the 3D canvas must exist for the renderer. If the host
        // page swapped it out (e.g. a view change cleared its container),
        // recreate it so the engine can never crash on a null canvas.
        if (!this.canvas) {
            this.canvas = document.createElement('canvas');
            this.canvas.id = canvasId;
            this.canvas.className = 'fractality-canvas';
            document.body.appendChild(this.canvas);
        }

        // Core Systems
        this.state = new FractalityState();
        this.performance = new PerformanceMonitor();
        
        // Data Layer
        this.nodeGraph = null; // Will be loaded
        
        // Intelligence Layer (FUDGE & CACE)
        this.familyView = new FamilyViewController();
        this.layout = new LayoutEngine();
        this.animation = new AnimationSystem();
        this.cace = new CACEEngine(); // Context And Complexity Engine
        
        // Visualization Layer
        this.renderer = new FractalityRenderer(this.canvas);
        this.quality = new QualityManager(this.renderer, this.performance);
        
        // UI Layer
        this.dashboard = new PerformanceDashboard(this.performance);
        this.nodeInfo = new NodeInfoPanel();
        this.nodeLabels = new NodeLabels();
        
        // Interaction
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        
        // Runtime
        this.clock = new THREE.Clock();
        this.running = false;
        this.paused = false;
    }
    
    /**
     * Initialize all subsystems
     */
    async init() {
        console.log('🎂 Initializing CACE Genesis Engine v0.3.0...');
        
        // Initialize renderer
        await this.renderer.init();
        
        // Initialize UI
        this.dashboard.init();
        this.nodeInfo.init();
        this.nodeLabels.init();
        
        // Setup event listeners
        this._setupEventListeners();
        
        // Performance baseline
        await this.performance.calibrate();
        
        console.log('✨ CACE Engine initialized successfully');
    }
    
    /**
     * Load fractal data
     */
    async loadData(nodeGraph) {
        console.log('📊 Loading fractal data...', nodeGraph.stats);
        
        this.nodeGraph = nodeGraph;
        this.familyView.setNodeGraph(nodeGraph);
        this.cace.analyzeGraph(nodeGraph);
        
        // Reset state
        this.state.reset();
        
        // Find root node (depth 0)
        const rootNodes = nodeGraph.getNodesAtDepth(0);
        if (rootNodes.length > 0) {
            this.state.setFocus(rootNodes[0].id);
        }
        
        console.log('✅ Data loaded successfully');
    }
    
    /**
     * Main update loop
     */
    update() {
        if (!this.running || this.paused) return;
        
        this.performance.startFrame();
        
        const deltaTime = this.clock.getDelta();
        const frameStart = performance.now();
        
        // 1. Check performance budget
        if (!this.performance.canContinue()) {
            this.quality.decreaseQuality();
        }
        
        // 2. Update visible nodes based on focus
        const visibleNodes = this.familyView.getVisibleNodes(
            this.state.focusNode,
            this.state.viewConfig
        );
        
        // 3. Calculate CACE context scores
        const contextScores = this.cace.calculateContext(
            visibleNodes,
            this.state.focusNode
        );
        
        // 4. Apply context to nodes
        visibleNodes.forEach(node => {
            const context = contextScores.get(node.id) || 0;
            node.contextScore = context;
            node.priority = this.familyView.getNodePriority(node.id, this.state.focusNode);
        });
        
        // 5. Calculate layout if needed
        if (this.state.needsLayout) {
            const layoutPositions = this.layout.calculateLayout(
                visibleNodes,
                this.state.focusNode,
                this.state.layoutConfig
            );
            
            this.animation.startTransition(visibleNodes, layoutPositions);
            this.state.needsLayout = false;
        }
        
        // 6. Update animations
        const animationResult = this.animation.update(
            visibleNodes,
            deltaTime,
            this.performance.getAnimationBudget()
        );
        
        this.state.animationState = animationResult.animating ? 
            'transitioning' : 'idle';
        
        // 7. Update visual properties based on context
        this._applyContextualVisuals(visibleNodes);
        
        // 8. Update renderer
        const renderCount = this.renderer.updateInstances(visibleNodes);

        // 8b. Update connection lines (hierarchy + wikilink edges)
        this._updateConnections(visibleNodes);

        // 8c. Update floating node labels
        this.nodeLabels.update(visibleNodes, this.renderer.camera);

        // 9. Render frame
        this.renderer.render();
        
        // 10. Update UI
        this._updateUI(renderCount, animationResult.animationTime);
        
        // 11. Performance tracking
        this.performance.endFrame();
        
        // 12. Adaptive quality
        this.quality.update();
    }

    /**
     * Build edge segments among the currently-visible nodes and hand them to
     * the renderer. Two kinds of edges, colored differently:
     *   - hierarchy (parent <-> child): the structural tree
     *   - wikilinks (node.metadata.links): cross-references from e.g. Obsidian
     * Only edges whose BOTH endpoints are visible are drawn, so lines always
     * connect nodes actually on screen in the Family View.
     */
    _updateConnections(visibleNodes) {
        if (!this.renderer.updateConnections) return;

        const visible = new Map(visibleNodes.map(n => [n.id, n]));
        const segments = [];
        const seen = new Set();
        const HIERARCHY = { r: 0.35, g: 0.5, b: 0.85 }; // structural blue
        const WIKILINK = { r: 0.9, g: 0.3, b: 0.75 };   // magenta

        const edgeKey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);

        for (const node of visibleNodes) {
            // hierarchy edge to a visible parent
            if (node.parentId && visible.has(node.parentId)) {
                const key = 'h:' + edgeKey(node.id, node.parentId);
                if (!seen.has(key)) {
                    seen.add(key);
                    segments.push({
                        from: node.position,
                        to: visible.get(node.parentId).position,
                        color: HIERARCHY,
                    });
                }
            }

            // wikilink edges to visible targets
            const links = node.metadata && node.metadata.links;
            if (Array.isArray(links)) {
                for (const targetId of links) {
                    if (!visible.has(targetId)) continue;
                    const key = 'l:' + edgeKey(node.id, targetId);
                    if (seen.has(key)) continue;
                    seen.add(key);
                    segments.push({
                        from: node.position,
                        to: visible.get(targetId).position,
                        color: WIKILINK,
                    });
                }
            }
        }

        this.renderer.updateConnections(segments);
    }

    /**
     * Apply CACE context scores to visual properties
     */
    _applyContextualVisuals(nodes) {
        nodes.forEach(node => {
            // Context affects opacity and scale
            const contextFactor = 1 - (node.contextScore * 0.3); // Higher context = more transparent
            
            // Focus node is always full opacity
            if (node.id === this.state.focusNode) {
                node.targetOpacity = 1.0;
                node.targetScale = 1.2;
            } else {
                node.targetOpacity = 0.3 + (0.7 * contextFactor);
                node.targetScale = 0.5 + (0.5 * node.priority / 3);
            }
            
            // Color based on depth and context
            const hue = (node.depth * 0.15) % 1;
            const saturation = 0.3 + (0.4 * contextFactor);
            const lightness = 0.4 + (0.2 * node.priority / 3);
            
            node.color.setHSL(hue, saturation, lightness);
        });
    }
    
    /**
     * Set focus to a node
     */
    setFocus(nodeId) {
        console.log(`🎯 Setting focus to: ${nodeId}`);
        
        if (!this.nodeGraph.getNode(nodeId)) {
            console.warn(`Node ${nodeId} not found`);
            return;
        }
        
        this.state.setFocus(nodeId);
        this.state.needsLayout = true;

        // Emit focus change event
        this._emitEvent('focusChanged', { nodeId });
    }

    /**
     * Navigate to a node — focuses it and re-centers the Family View.
     * Alias used by the UI (node clicks, "Navigate Here", pending navigation).
     */
    navigateToNode(nodeId) {
        this.setFocus(nodeId);
    }
    
    /**
     * Reset view to root
     */
    resetView() {
        const rootNodes = this.nodeGraph.getNodesAtDepth(0);
        if (rootNodes.length > 0) {
            this.setFocus(rootNodes[0].id);
        }
    }
    
    /**
     * Start the engine
     */
    start() {
        if (this.running) return;
        
        console.log('🚀 Starting CACE Engine...');
        this.running = true;
        this.clock.start();
        
        const animate = () => {
            if (!this.running) return;
            requestAnimationFrame(animate);
            this.update();
        };
        
        animate();
    }
    
    /**
     * Stop the engine
     */
    stop() {
        console.log('🛑 Stopping CACE Engine...');
        this.running = false;
    }
    
    /**
     * Pause rendering
     */
    pause() {
        this.paused = true;
        this.clock.stop();
    }
    
    /**
     * Resume rendering
     */
    resume() {
        this.paused = false;
        this.clock.start();
    }
    
    /**
     * Toggle quality
     */
    toggleQuality() {
        return this.quality.toggle();
    }
    
    /**
     * Toggle performance monitor
     */
    togglePerformanceMonitor() {
        this.dashboard.toggle();
    }
    
    /**
     * Clear selection
     */
    clearSelection() {
        // TODO: Implement selection system
    }
    
    /**
     * Handle window resize
     */
    handleResize() {
        this.renderer.resize();
    }
    
    /**
     * Setup event listeners
     */
    _setupEventListeners() {
        // Mouse interactions
        this.canvas.addEventListener('click', (e) => this._handleClick(e));
        this.canvas.addEventListener('mousemove', (e) => this._handleMouseMove(e));
        
        // Touch interactions
        this.canvas.addEventListener('touchstart', (e) => this._handleTouch(e));
        
        // Window events
        window.addEventListener('resize', () => this.handleResize());
    }
    
    /**
     * Handle mouse click
     */
    _handleClick(event) {
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        
        this.raycaster.setFromCamera(this.mouse, this.renderer.camera);
        const intersects = this.raycaster.intersectObject(this.renderer.instancedMesh);
        
        if (intersects.length > 0) {
            const instanceId = intersects[0].instanceId;
            const visibleNodes = this.familyView.getVisibleNodes(
                this.state.focusNode,
                this.state.viewConfig
            );
            
            if (instanceId < visibleNodes.length) {
                const clickedNode = visibleNodes[instanceId];
                this.setFocus(clickedNode.id);
            }
        }
    }
    
    /**
     * Handle mouse move
     */
    _handleMouseMove(event) {
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        
        this.raycaster.setFromCamera(this.mouse, this.renderer.camera);
        const intersects = this.raycaster.intersectObject(this.renderer.instancedMesh);
        
        if (intersects.length > 0) {
            const instanceId = intersects[0].instanceId;
            const visibleNodes = this.familyView.getVisibleNodes(
                this.state.focusNode,
                this.state.viewConfig
            );
            
            if (instanceId < visibleNodes.length) {
                const hoveredNode = visibleNodes[instanceId];
                this.nodeInfo.show(hoveredNode);
                this.canvas.style.cursor = 'pointer';
            }
        } else {
            this.nodeInfo.hide();
            this.canvas.style.cursor = 'default';
        }
    }
    
    /**
     * Handle touch events
     */
    _handleTouch(event) {
        if (event.touches.length === 1) {
            const touch = event.touches[0];
            const mockEvent = {
                clientX: touch.clientX,
                clientY: touch.clientY
            };
            this._handleClick(mockEvent);
        }
    }
    
    /**
     * Update UI elements
     */
    _updateUI(nodeCount, animationTime) {
        this.dashboard.update({
            fps: this.performance.currentFPS,
            frameTime: this.performance.frameTime,
            nodeCount: nodeCount,
            animationTime: animationTime,
            memory: this.performance.getMemoryUsage(),
            quality: this.quality.currentQuality
        });
    }
    
    /**
     * Emit custom event
     */
    _emitEvent(eventName, detail) {
        window.dispatchEvent(new CustomEvent(`fractality:${eventName}`, { detail }));
    }
    
    /**
     * Destroy the engine
     */
    destroy() {
        this.stop();
        this.renderer.destroy();
        this.dashboard.destroy();
        this.nodeInfo.destroy();
        this.nodeLabels.destroy();
    }
}
