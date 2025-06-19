// src/config/config.js

/**
 * Fractality Engine Configuration
 * Central configuration for all subsystems
 */
export const config = {
    // Version
    version: '0.2.2',
    
    // Performance Settings
    performance: {
        targetFPS: 60,
        frameTimeTarget: 16.67, // ms (1000/60)
        
        // Device-specific budgets
        budgets: {
            desktop: {
                frameTime: 16,
                animationTime: 8,
                maxNodes: 1000,
                maxVisibleNodes: 100
            },
            mobile: {
                frameTime: 32,
                animationTime: 4,
                maxNodes: 300,
                maxVisibleNodes: 30
            },
            vr: {
                frameTime: 11,
                animationTime: 3,
                maxNodes: 500,
                maxVisibleNodes: 50
            }
        },
        
        // Adaptive quality settings
        adaptiveQuality: {
            enabled: true,
            minQuality: 0.3,
            maxQuality: 1.0,
            adjustmentRate: 0.05,
            sampleFrames: 60
        }
    },
    
    // Rendering Settings
    rendering: {
        antialias: true,
        pixelRatio: 'auto', // 'auto' or number
        shadowsEnabled: true,
        
        // Camera settings
        camera: {
            fov: 75,
            near: 0.1,
            far: 1000,
            startPosition: [0, 0, 15]
        },
        
        // Fog settings
        fog: {
            enabled: true,
            color: 0x000000,
            near: 10,
            far: 100
        },
        
        // Instance mesh settings
        instances: {
            maxCount: 2000,
            geometry: {
                type: 'sphere',
                segments: 16,
                radius: 1
            }
        }
    },
    
    // Layout Settings
    layout: {
        // Family view constraints
        familyView: {
            maxSiblings: 5,
            maxChildren: 7,
            showParent: true,
            showGrandparent: false
        },
        
        // Positioning
        positions: {
            parent: {
                offset: [0, 0, -10],
                scale: 1.2
            },
            siblings: {
                radius: 8,
                height: -4,
                depth: -5,
                maxAngle: Math.PI
            },
            children: {
                spiralRadius: 5,
                heightRange: 3,
                yOffset: 2,
                zOffset: -2
            }
        },
        
        // Golden ratio settings
        goldenRatio: {
            phi: 1.618033988749895,
            angle: Math.PI * (3 - Math.sqrt(5))
        }
    },
    
    // Animation Settings
    animation: {
        // Transition speeds
        speed: {
            position: 3.0,
            opacity: 4.0,
            scale: 2.5,
            rotation: 2.0
        },
        
        // Easing functions
        easing: {
            position: 'easeInOutCubic',
            opacity: 'easeOutQuad',
            scale: 'easeOutElastic'
        },
        
        // Stagger settings
        stagger: {
            enabled: true,
            childDelay: 0.05, // seconds
            siblingDelay: 0.03
        }
    },
    
    // Data Settings
    data: {
        // Loading
        loading: {
            chunkSize: 50,
            preloadDepth: 2,
            cacheEnabled: true,
            maxCacheSize: 104857600 // 100MB
        },
        
        // Test data
        testData: {
            defaultPattern: 'balanced',
            defaultNodeCount: 100
        }
    },
    
    // UI Settings
    ui: {
        // Performance monitor
        performanceMonitor: {
            enabled: true,
            position: 'top-right',
            updateInterval: 250 // ms
        },
        
        // Node info panel
        nodeInfo: {
            enabled: true,
            position: 'bottom-left',
            showOnHover: true,
            hoverDelay: 200 // ms
        },
        
        // Controls
        controls: {
            enabled: true,
            position: 'top-left'
        },
        
        // Theme
        theme: {
            primary: '#00ffff',
            secondary: '#ff00ff',
            background: '#000000',
            text: '#ffffff',
            panel: 'rgba(0, 0, 0, 0.8)',
            border: '#555555'
        }
    },
    
    // Interaction Settings
    interaction: {
        // Mouse
        mouse: {
            clickThreshold: 200, // ms - max time for click
            doubleClickThreshold: 400 // ms
        },
        
        // Touch
        touch: {
            tapThreshold: 300,
            swipeThreshold: 50, // pixels
            pinchThreshold: 0.1 // scale factor
        },
        
        // Keyboard
        keyboard: {
            enabled: true,
            shortcuts: {
                resetView: 'r',
                togglePerformance: 'p',
                toggleQuality: 'q',
                search: '/',
                escape: 'Escape'
            }
        }
    },
    
    // Debug Settings
    debug: {
        enabled: false,
        logLevel: 'info', // 'error', 'warn', 'info', 'debug'
        showStats: false,
        showBoundingBoxes: false,
        showRaycaster: false
    }
};

/**
 * Get device type
 */
export function getDeviceType() {
    if (navigator.userAgent.match(/Quest|Oculus/i)) {
        return 'vr';
    }
    if (navigator.userAgent.match(/Mobile|Android|iPhone|iPad/i)) {
        return 'mobile';
    }
    return 'desktop';
}

/**
 * Get performance budget for current device
 */
export function getPerformanceBudget() {
    const deviceType = getDeviceType();
    return config.performance.budgets[deviceType];
}

/**
 * Update configuration
 */
export function updateConfig(updates) {
    // Deep merge updates into config
    function deepMerge(target, source) {
        for (const key in source) {
            if (source[key] instanceof Object && key in target) {
                deepMerge(target[key], source[key]);
            } else {
                target[key] = source[key];
            }
        }
    }
    
    deepMerge(config, updates);
    
    // Emit config change event
    window.dispatchEvent(new CustomEvent('configChanged', { detail: updates }));
}

/**
 * Load configuration from localStorage
 */
export function loadConfig() {
    try {
        const saved = localStorage.getItem('fractality-config');
        if (saved) {
            const updates = JSON.parse(saved);
            updateConfig(updates);
        }
    } catch (error) {
        console.warn('Failed to load saved config:', error);
    }
}

/**
 * Save configuration to localStorage
 */
export function saveConfig() {
    try {
        // Only save user-modified values
        const toSave = {
            performance: {
                adaptiveQuality: {
                    enabled: config.performance.adaptiveQuality.enabled
                }
            },
            rendering: {
                shadowsEnabled: config.rendering.shadowsEnabled,
                antialias: config.rendering.antialias
            },
            ui: {
                performanceMonitor: {
                    enabled: config.ui.performanceMonitor.enabled
                },
                theme: config.ui.theme
            },
            debug: config.debug
        };
        
        localStorage.setItem('fractality-config', JSON.stringify(toSave));
    } catch (error) {
        console.warn('Failed to save config:', error);
    }
} 