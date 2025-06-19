// src/intelligence/AnimationSystem.js
import * as THREE from 'three';

/**
 * AnimationSystem - Smooth, Living Transitions
 * Gemini's Domain: Making the universe feel alive through organic animations
 * 
 * Handles all interpolations, transitions, and animated behaviors
 * to create the "living" feel of the fractal universe.
 */
export class AnimationSystem {
    constructor() {
        // Animation configuration
        this.config = {
            // Base animation speeds
            speeds: {
                position: 3.0,      // Units per second
                opacity: 4.0,       // Opacity per second
                scale: 2.5,         // Scale per second
                rotation: 2.0,      // Radians per second
                color: 3.0          // Color transitions per second
            },
            
            // Easing functions
            easings: {
                position: 'easeInOutCubic',
                opacity: 'easeOutQuad',
                scale: 'easeOutElastic',
                rotation: 'easeInOutQuad',
                color: 'easeInOutSine'
            },
            
            // Stagger configuration
            stagger: {
                enabled: true,
                childDelay: 0.05,      // Seconds between children
                siblingDelay: 0.03,    // Seconds between siblings
                maxDelay: 0.5          // Maximum stagger delay
            },
            
            // Spring physics
            spring: {
                stiffness: 0.8,
                damping: 0.7,
                precision: 0.001
            },
            
            // Particle effects
            particles: {
                enabled: false,        // Future feature
                onFocusChange: true,
                particleCount: 50
            }
        };
        
        // Active transitions
        this.transitions = new Map();
        this.transitionId = 0;
        
        // Animation state
        this.isAnimating = false;
        this.totalAnimationTime = 0;
        
        // Easing function library
        this.easingFunctions = {
            linear: t => t,
            easeInQuad: t => t * t,
            easeOutQuad: t => t * (2 - t),
            easeInOutQuad: t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
            easeInCubic: t => t * t * t,
            easeOutCubic: t => (--t) * t * t + 1,
            easeInOutCubic: t => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
            easeInQuart: t => t * t * t * t,
            easeOutQuart: t => 1 - (--t) * t * t * t,
            easeInOutQuart: t => t < 0.5 ? 8 * t * t * t * t : 1 - 8 * (--t) * t * t * t,
            easeOutElastic: t => {
                const p = 0.3;
                return Math.pow(2, -10 * t) * Math.sin((t - p / 4) * (2 * Math.PI) / p) + 1;
            },
            easeOutBounce: t => {
                if (t < (1 / 2.75)) {
                    return 7.5625 * t * t;
                } else if (t < (2 / 2.75)) {
                    return 7.5625 * (t -= (1.5 / 2.75)) * t + 0.75;
                } else if (t < (2.5 / 2.75)) {
                    return 7.5625 * (t -= (2.25 / 2.75)) * t + 0.9375;
                } else {
                    return 7.5625 * (t -= (2.625 / 2.75)) * t + 0.984375;
                }
            },
            easeInOutSine: t => -(Math.cos(Math.PI * t) - 1) / 2
        };
        
        // Temporary objects for calculations
        this._tempVec3 = new THREE.Vector3();
        this._tempColor = new THREE.Color();
    }
    
    /**
     * Start a new transition
     */
    startTransition(nodes, targetPositions, options = {}) {
        const transitionConfig = { ...this.config, ...options };
        
        // Clear existing transitions for these nodes
        nodes.forEach(node => {
            const existingTransition = Array.from(this.transitions.values())
                .find(t => t.node === node);
            if (existingTransition) {
                this.transitions.delete(existingTransition.id);
            }
        });
        
        // Calculate stagger delays if enabled
        const staggerDelays = transitionConfig.stagger.enabled ? 
            this._calculateStaggerDelays(nodes, targetPositions) : 
            new Map();
        
        // Create new transitions
        nodes.forEach(node => {
            const target = targetPositions.get(node.id);
            if (!target) {
                // Fade out nodes without target positions
                this._createFadeOutTransition(node, staggerDelays.get(node.id) || 0);
            } else {
                // Create movement transition
                this._createMovementTransition(
                    node, 
                    target, 
                    staggerDelays.get(node.id) || 0,
                    transitionConfig
                );
            }
        });
        
        this.isAnimating = this.transitions.size > 0;
    }
    
    /**
     * Update all active transitions
     */
    update(nodes, deltaTime, performanceBudget) {
        if (this.transitions.size === 0) {
            this.isAnimating = false;
            return { animating: false, animationTime: 0 };
        }
        
        const startTime = performance.now();
        const timeScale = performanceBudget.scale || 1.0;
        const scaledDelta = deltaTime * timeScale;
        
        // Update each transition
        const completedTransitions = [];
        
        this.transitions.forEach((transition, id) => {
            // Update transition time
            transition.elapsed += scaledDelta;
            
            // Check if still in delay phase
            if (transition.elapsed < transition.delay) {
                return;
            }
            
            // Calculate actual animation progress
            const animationTime = transition.elapsed - transition.delay;
            const progress = Math.min(1, animationTime / transition.duration);
            
            // Apply easing
            const easedProgress = this._applyEasing(progress, transition.easing);
            
            // Update node properties
            this._updateNodeProperties(transition.node, transition, easedProgress);
            
            // Check if complete
            if (progress >= 1) {
                completedTransitions.push(id);
                this._finalizeTransition(transition);
            }
        });
        
        // Remove completed transitions
        completedTransitions.forEach(id => this.transitions.delete(id));
        
        // Update animation state
        this.isAnimating = this.transitions.size > 0;
        
        const animationTime = performance.now() - startTime;
        this.totalAnimationTime = animationTime;
        
        return { animating: this.isAnimating, animationTime };
    }
    
    /**
     * Create a movement transition
     */
    _createMovementTransition(node, targetPosition, delay, config) {
        const transition = {
            id: this.transitionId++,
            node: node,
            type: 'movement',
            delay: delay,
            elapsed: 0,
            duration: 1.0, // Base duration, adjusted by speed
            
            // Starting values
            startPosition: node.position.clone(),
            startOpacity: node.opacity,
            startScale: node.scale,
            startColor: node.color.clone(),
            
            // Target values
            targetPosition: targetPosition.clone(),
            targetOpacity: node.targetOpacity || 1,
            targetScale: node.targetScale || 1,
            targetColor: node.targetColor || node.color.clone(),
            
            // Animation config
            easing: this.easingFunctions[config.easings.position] || this.easingFunctions.easeInOutCubic,
            speeds: { ...config.speeds }
        };
        
        // Calculate duration based on distance
        const distance = transition.startPosition.distanceTo(transition.targetPosition);
        transition.duration = distance / transition.speeds.position;
        
        this.transitions.set(transition.id, transition);
    }
    
    /**
     * Create a fade out transition
     */
    _createFadeOutTransition(node, delay) {
        const transition = {
            id: this.transitionId++,
            node: node,
            type: 'fadeOut',
            delay: delay,
            elapsed: 0,
            duration: 0.5,
            
            startOpacity: node.opacity,
            targetOpacity: 0,
            
            easing: this.easingFunctions.easeOutQuad
        };
        
        node.targetOpacity = 0;
        this.transitions.set(transition.id, transition);
    }
    
    /**
     * Calculate stagger delays for nodes
     */
    _calculateStaggerDelays(nodes, targetPositions) {
        const delays = new Map();
        const config = this.config.stagger;
        
        // Group nodes by type
        const groups = {
            focus: [],
            parents: [],
            children: [],
            siblings: [],
            others: []
        };
        
        // Simple grouping based on position patterns
        nodes.forEach(node => {
            const target = targetPositions.get(node.id);
            if (!target) {
                groups.others.push(node);
                return;
            }
            
            if (target.length() < 0.1) {
                groups.focus.push(node);
            } else if (target.z < -5) {
                groups.parents.push(node);
            } else if (target.y < -2) {
                groups.siblings.push(node);
            } else if (target.y > 1) {
                groups.children.push(node);
            } else {
                groups.others.push(node);
            }
        });
        
        // Assign delays
        let currentDelay = 0;
        
        // Focus animates first
        groups.focus.forEach(node => {
            delays.set(node.id, 0);
        });
        
        // Then parents
        groups.parents.forEach((node, index) => {
            delays.set(node.id, currentDelay + index * config.siblingDelay);
        });
        currentDelay += groups.parents.length * config.siblingDelay;
        
        // Then children with radial delay
        groups.children.forEach((node, index) => {
            const target = targetPositions.get(node.id);
            const angle = Math.atan2(target.x, target.z);
            const normalizedAngle = (angle + Math.PI) / (2 * Math.PI);
            delays.set(node.id, currentDelay + normalizedAngle * config.childDelay * 5);
        });
        currentDelay += config.childDelay * 5;
        
        // Then siblings
        groups.siblings.forEach((node, index) => {
            delays.set(node.id, currentDelay + index * config.siblingDelay);
        });
        
        // Finally others
        groups.others.forEach((node, index) => {
            delays.set(node.id, Math.min(
                currentDelay + index * 0.01,
                config.maxDelay
            ));
        });
        
        return delays;
    }
    
    /**
     * Apply easing function
     */
    _applyEasing(t, easingFn) {
        return easingFn ? easingFn(t) : t;
    }
    
    /**
     * Update node properties based on transition
     */
    _updateNodeProperties(node, transition, progress) {
        // Update position
        if (transition.startPosition && transition.targetPosition) {
            node.position.lerpVectors(
                transition.startPosition,
                transition.targetPosition,
                progress
            );
        }
        
        // Update opacity
        if (transition.startOpacity !== undefined) {
            node.opacity = transition.startOpacity + 
                (transition.targetOpacity - transition.startOpacity) * progress;
        }
        
        // Update scale
        if (transition.startScale !== undefined) {
            node.scale = transition.startScale + 
                (transition.targetScale - transition.startScale) * progress;
                
            // Add bounce effect for scale
            if (transition.easing === this.easingFunctions.easeOutElastic && progress > 0.7) {
                const bounce = Math.sin(progress * Math.PI * 4) * 0.05 * (1 - progress);
                node.scale += bounce;
            }
        }
        
        // Update color
        if (transition.startColor && transition.targetColor) {
            node.color.lerpColors(
                transition.startColor,
                transition.targetColor,
                progress
            );
        }
    }
    
    /**
     * Finalize a completed transition
     */
    _finalizeTransition(transition) {
        const node = transition.node;
        
        // Ensure final values are set precisely
        if (transition.targetPosition) {
            node.position.copy(transition.targetPosition);
        }
        
        if (transition.targetOpacity !== undefined) {
            node.opacity = transition.targetOpacity;
        }
        
        if (transition.targetScale !== undefined) {
            node.scale = transition.targetScale;
        }
        
        if (transition.targetColor) {
            node.color.copy(transition.targetColor);
        }
        
        // Emit transition complete event
        window.dispatchEvent(new CustomEvent('fractality:transitionComplete', {
            detail: {
                nodeId: node.id,
                type: transition.type
            }
        }));
    }
    
    /**
     * Stop all transitions
     */
    stopAll() {
        this.transitions.clear();
        this.isAnimating = false;
    }
    
    /**
     * Stop transitions for specific nodes
     */
    stopForNodes(nodeIds) {
        const idsSet = new Set(nodeIds);
        const toRemove = [];
        
        this.transitions.forEach((transition, id) => {
            if (idsSet.has(transition.node.id)) {
                toRemove.push(id);
            }
        });
        
        toRemove.forEach(id => this.transitions.delete(id));
    }
    
    /**
     * Add pulse effect to a node
     */
    pulseNode(node, options = {}) {
        const config = {
            duration: 0.5,
            scaleMultiplier: 1.2,
            ...options
        };
        
        const startScale = node.scale;
        const pulseScale = startScale * config.scaleMultiplier;
        
        // Create pulse transition
        const transition = {
            id: this.transitionId++,
            node: node,
            type: 'pulse',
            delay: 0,
            elapsed: 0,
            duration: config.duration,
            
            startScale: startScale,
            targetScale: startScale, // Return to original
            pulseScale: pulseScale,
            
            easing: this.easingFunctions.easeInOutSine
        };
        
        // Override the update to create pulse effect
        transition.customUpdate = (progress) => {
            if (progress < 0.5) {
                // Scale up
                const upProgress = progress * 2;
                node.scale = startScale + (pulseScale - startScale) * upProgress;
            } else {
                // Scale down
                const downProgress = (progress - 0.5) * 2;
                node.scale = pulseScale - (pulseScale - startScale) * downProgress;
            }
        };
        
        this.transitions.set(transition.id, transition);
    }
    
    /**
     * Add ripple effect from a node
     */
    rippleFrom(centerNode, affectedNodes, options = {}) {
        const config = {
            speed: 10, // Units per second
            magnitude: 0.2,
            ...options
        };
        
        const centerPos = centerNode.position.clone();
        
        affectedNodes.forEach(node => {
            if (node.id === centerNode.id) return;
            
            const distance = node.position.distanceTo(centerPos);
            const delay = distance / config.speed;
            
            // Create ripple transition
            setTimeout(() => {
                this.pulseNode(node, {
                    duration: 0.3,
                    scaleMultiplier: 1 + config.magnitude * (1 - distance / 20)
                });
            }, delay * 1000);
        });
    }
    
    /**
     * Update configuration
     */
    updateConfig(updates) {
        this._deepMerge(this.config, updates);
    }
    
    /**
     * Deep merge helper
     */
    _deepMerge(target, source) {
        for (const key in source) {
            if (source[key] instanceof Object && key in target) {
                this._deepMerge(target[key], source[key]);
            } else {
                target[key] = source[key];
            }
        }
    }
    
    /**
     * Get animation statistics
     */
    getStats() {
        return {
            activeTransitions: this.transitions.size,
            isAnimating: this.isAnimating,
            totalAnimationTime: this.totalAnimationTime.toFixed(2),
            config: { ...this.config }
        };
    }
}