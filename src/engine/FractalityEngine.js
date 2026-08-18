// src/engine/FractalityEngine.js

import * as THREE from 'three';
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
import { config } from '../config/config.js';

/**
 * The CACE Genesis Engine - Main Orchestrator
 * Bringing together Performance, Beauty, and Intelligence
 */
export class FractalityEngine {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        
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

        // Normalise depths against the parent links before anything reads them.
        //
        // depth IS the tier: the cone view's rings, the Node Manager's tier
        // numbers and the family layout all take it literally. Graphs arrive from
        // three places — the generator, an imported file, the API — and any of
        // them can carry a depth that disagrees with its parentId. The default
        // generated map did exactly that for 15 of its 36 nodes.
        //
        // Cheap, and it makes one guarantee hold everywhere downstream instead of
        // being re-checked by every consumer.
        nodeGraph.rebuildIndices();

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

        // Announce the swap.
        //
        // loadData() REPLACES this.nodeGraph with a different object. Anything
        // that renders once and caches — the Node Manager's outline, for
        // instance — keeps showing the graph it read earlier, with no way to
        // know it is now stale. The Cone view never showed this because it
        // redraws from getGraph() every frame.
        //
        // The visible symptom: open a saved map and the Cone shows the renamed
        // root while the Node Manager still shows the old name.
        this._announce('fractality:graphReplaced');
    }

    /**
     * Tell the page the graph changed.
     *
     * A window event because this class has no emitter, matching the existing
     * `fractality:nodeFocused` and `fractality:expandNode` convention.
     */
    _announce(type) {
        if (typeof window === 'undefined') return;
        window.dispatchEvent(new CustomEvent(type, {
            detail: { nodeCount: this.nodeGraph?.nodes?.size ?? 0 }
        }));
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
     * Tell the engine its graph was edited underneath it.
     *
     * Needed because loadData() is the only thing that analyses the graph, and
     * it also resets focus and view state — which is wrong after an edit, since
     * it would throw the user back to the root every time they add a node.
     *
     * Three caches would otherwise serve stale answers:
     *   - FamilyViewController keeps visible-node selections for 1 second
     *   - CACEEngine's analysis is computed once, in loadData()
     *   - LayoutEngine only recalculates when state.needsLayout is set
     *
     * If the focused node was deleted, focus moves to a root rather than
     * pointing at something that no longer exists.
     */
    notifyGraphChanged() {
        if (!this.nodeGraph) return;

        this.familyView.clearCache();
        this.cace.clearCache();
        this.cace.analyzeGraph(this.nodeGraph);

        if (this.state.focusNode && !this.nodeGraph.getNode(this.state.focusNode)) {
            const roots = this.nodeGraph.getRootNodes();
            if (roots.length > 0) this.state.setFocus(roots[0].id);
        }

        this.state.needsLayout = true;

        // Same reasoning as loadData(): panels that cache a render need telling.
        // This fires for in-place edits, where the graph object is the same but
        // its contents are not.
        this._announce('fractality:graphChanged');
    }

    /**
     * The CACE context score for one node, 0 if unknown.
     *
     * The score is recomputed for every visible node on each frame and stored
     * on the node (see step 4 of update()), so this reads the same number the
     * visuals are already using rather than recomputing it.
     *
     * There is no single-node scoring method on CACEEngine to call instead:
     * calculateContext() normalizes across the whole visible set, so asking it
     * about one node in isolation would return a meaningless 1.0. Two callers
     * used to invoke a `calculateContextScore()` that does not exist on it at
     * all — via a `caceEngine` property that does not exist either, so the
     * error was never even reached.
     *
     * @param {string} nodeId
     * @returns {number}
     */
    getContextScore(nodeId) {
        return this.nodeGraph?.getNode(nodeId)?.contextScore ?? 0;
    }

    /**
     * Switch the layout algorithm and re-run positioning.
     *
     * Exists so the UI does not have to reach into engine internals: setting
     * `engine.layout.activeLayout` alone changes nothing visible, because
     * positions are only recalculated when `state.needsLayout` is set. Both
     * halves belong together, and forgetting the second is exactly the kind of
     * "the button does nothing" bug this replaces.
     *
     * @param {string} name one of getAvailableLayouts()
     * @returns {boolean} false if the layout is not implemented
     */
    setLayout(name) {
        if (!this.layout.setActiveLayout(name)) {
            console.warn(`Layout "${name}" is not implemented`);
            return false;
        }
        this.state.needsLayout = true;
        return true;
    }

    /** The active layout's name. */
    getLayout() {
        return this.layout.activeLayout;
    }

    /** Layout names this engine can actually render. */
    getAvailableLayouts() {
        return this.layout.getAvailableLayouts();
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
                // Show details on click as well as on hover. Hover was the
                // only trigger, which meant the node info panel could never
                // appear on a touch device — there is no mousemove to fire.
                // immediate: skip the hover delay and hold the panel open.
                this.nodeInfo.show(clickedNode, { immediate: true });

                // Announce it for anything else that tracks the selection.
                //
                // A window event, matching the existing `fractality:expandNode`
                // convention, because this class has no event emitter — it never
                // had one, yet main.js called `engine.on('nodeSelected', …)`.
                // That threw, and was only invisible because the listener was
                // registered inside a branch that never ran.
                //
                // The name is deliberately not `nodeSelected`: that event means
                // "please focus this node" and main.js answers it by calling
                // setFocus(), so reusing it here would loop straight back in.
                window.dispatchEvent(new CustomEvent('fractality:nodeFocused', {
                    detail: { nodeId: clickedNode.id, node: clickedNode }
                }));
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
    }
}
