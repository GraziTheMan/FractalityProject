// src/utils/ThreeJSLoader.js
// Robust Three.js loader with local → CDN fallback

export class ThreeJSLoader {
    constructor() {
        this.THREE = null;
        this.OrbitControls = null;
        this.loadedFrom = null;
        this.loadStartTime = null;
        
        // Configuration
        this.config = {
            // Try local files first
            local: {
                three: './vendor/three/three.module.js',
                orbitControls: './vendor/three/OrbitControls.js'
            },
            // Fallback to CDN
            cdn: {
                version: '0.158.0',
                three: 'https://unpkg.com/three@0.158.0/build/three.module.js',
                orbitControls: 'https://unpkg.com/three@0.158.0/examples/jsm/controls/OrbitControls.js'
            },
            // Timeout for loading attempts
            timeout: 5000
        };
    }
    
    /**
     * Load Three.js with automatic fallback
     */
    async loadThreeJS() {
        if (this.THREE && this.OrbitControls) {
            console.log('✅ Three.js already loaded from:', this.loadedFrom);
            return { THREE: this.THREE, OrbitControls: this.OrbitControls };
        }
        
        this.loadStartTime = performance.now();
        console.log('🔄 Loading Three.js...');
        
        // Try local files first
        try {
            const result = await this.tryLocalLoad();
            this.logLoadSuccess('local');
            return result;
        } catch (localError) {
            console.warn('⚠️ Local Three.js failed:', localError.message);
            
            // Fallback to CDN
            try {
                const result = await this.tryCDNLoad();
                this.logLoadSuccess('CDN');
                return result;
            } catch (cdnError) {
                console.error('❌ CDN Three.js failed:', cdnError.message);
                throw new Error(`Failed to load Three.js from both local and CDN sources`);
            }
        }
    }
    
    /**
     * Try loading from local files
     */
    async tryLocalLoad() {
        console.log('🏠 Attempting local Three.js load...');
        
        const [THREE, { OrbitControls }] = await Promise.all([
            this.loadWithTimeout(import(this.getLocalPath('three'))),
            this.loadWithTimeout(import(this.getLocalPath('orbitControls')))
        ]);
        
        this.THREE = THREE;
        this.OrbitControls = OrbitControls;
        this.loadedFrom = 'local';
        
        return { THREE, OrbitControls };
    }
    
    /**
     * Try loading from CDN
     */
    async tryCDNLoad() {
        console.log('🌐 Attempting CDN Three.js load...');
        
        const [THREE, { OrbitControls }] = await Promise.all([
            this.loadWithTimeout(import(this.config.cdn.three)),
            this.loadWithTimeout(import(this.config.cdn.orbitControls))
        ]);
        
        this.THREE = THREE;
        this.OrbitControls = OrbitControls;
        this.loadedFrom = 'CDN';
        
        return { THREE, OrbitControls };
    }
    
    /**
     * Load with timeout to prevent hanging
     */
    async loadWithTimeout(importPromise) {
        return Promise.race([
            importPromise,
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Import timeout')), this.config.timeout)
            )
        ]);
    }
    
    /**
     * Get local path relative to current file location
     */
    getLocalPath(library) {
        // Adjust path based on where this is called from
        const currentPath = window.location.pathname;
        const basePath = currentPath.includes('/src/') ? '../..' : '.';
        
        return `${basePath}/${this.config.local[library]}`;
    }
    
    /**
     * Log successful load with performance info
     */
    logLoadSuccess(source) {
        const loadTime = (performance.now() - this.loadStartTime).toFixed(2);
        console.log(`✅ Three.js loaded from ${source} in ${loadTime}ms`);
        
        // Store performance info for debugging
        this.loadPerformance = {
            source,
            loadTime: parseFloat(loadTime),
            timestamp: new Date().toISOString()
        };
    }
    
    /**
     * Get load performance information
     */
    getLoadInfo() {
        return {
            loadedFrom: this.loadedFrom,
            performance: this.loadPerformance,
            version: this.getThreeVersion()
        };
    }
    
    /**
     * Get Three.js version info
     */
    getThreeVersion() {
        if (!this.THREE) return null;
        return this.THREE.REVISION || 'unknown';
    }
    
    /**
     * Check if local files are available (optional pre-check)
     */
    async checkLocalAvailability() {
        try {
            const response = await fetch(this.getLocalPath('three'), { method: 'HEAD' });
            return response.ok;
        } catch (error) {
            return false;
        }
    }
    
    /**
     * Force reload from specific source
     */
    async forceLoad(source = 'auto') {
        this.THREE = null;
        this.OrbitControls = null;
        this.loadedFrom = null;
        
        switch (source) {
            case 'local':
                return await this.tryLocalLoad();
            case 'cdn':
                return await this.tryCDNLoad();
            default:
                return await this.loadThreeJS();
        }
    }
}

// Singleton instance for global use
export const threeLoader = new ThreeJSLoader();

// Convenience function for quick loading
export async function loadThreeJS() {
    return await threeLoader.loadThreeJS();
}

// Environment detection helper
export function getEnvironmentInfo() {
    return {
        isLocal: window.location.protocol === 'file:' || 
                window.location.hostname === 'localhost' || 
                window.location.hostname === '127.0.0.1',
        isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
        connection: navigator.connection ? {
            effectiveType: navigator.connection.effectiveType,
            downlink: navigator.connection.downlink
        } : null
    };
}