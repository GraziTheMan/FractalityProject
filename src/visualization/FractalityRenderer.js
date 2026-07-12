// src/visualization/FractalityRenderer.js
import * as THREE from 'three';
import { loadThreeJS, getEnvironmentInfo } from '../utils/ThreeJSLoader.js';
import { config } from '../config/config.js';

/**
 * FractalityRenderer - High-Performance Three.js Rendering
 * 
 * Handles all WebGL rendering with instanced meshes for maximum performance.
 * Single draw call for thousands of nodes.
 */
export class FractalityRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        
        // Three.js core objects
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        
        // Instanced mesh for nodes
        this.instancedMesh = null;
        this.instanceCount = 0;
        this.maxInstances = 2000;
        
        // Geometry and materials
        this.nodeGeometry = null;
        this.nodeMaterial = null;
        
        // Lighting
        this.lights = {
            ambient: null,
            key: null,
            fill: null,
            rim: null
        };
        
        // Effects
        this.fog = null;
        this.bloomPass = null; // Future: post-processing
        
        // Camera controls
        this.cameraTarget = new THREE.Vector3();
        this.cameraOffset = new THREE.Vector3(0, 5, 15);
        this.cameraLerpFactor = 0.1;
        
        // Render settings
        this.quality = 1.0;
        this.shadowsEnabled = true;
        this.antialias = true;
        this._lowPoly = false;          // current geometry detail state
        this._appliedPixelRatio = undefined;
        
        // Helper objects
        this.dummy = new THREE.Object3D();
        this.tempColor = new THREE.Color();
        this.tempMatrix = new THREE.Matrix4();
        
        // Performance
        this.drawCalls = 0;
        this.triangleCount = 0;
    }
    
    /**
     * Initialize the renderer
     */
    async init() {
        console.log('🎨 Initializing Fractality Renderer...');
        
        // Create scene
        this._createScene();
        
        // Create camera
        this._createCamera();
        
        // Create renderer
        this._createRenderer();
        
        // Create geometry and materials
        this._createGeometry();
        
        // Create instanced mesh
        this._createInstancedMesh();

        // Create connection lines (hierarchy + wikilink edges)
        this._createConnectionLines();

        // Setup lighting
        this._createLighting();
        
        // Setup effects
        this._createEffects();
        
        // Handle resize
        this._handleResize();
        
        console.log('✅ Renderer initialized');
    }
    
    /**
     * Create Three.js scene
     */
    _createScene() {
        this.scene = new THREE.Scene();
        
        // Set background
        const bgColor = new THREE.Color(config.rendering.fog.color);
        this.scene.background = bgColor;
        
        // Add some ambient particles for atmosphere (future feature)
        // this._createAmbientParticles();
    }
    
    /**
     * Create camera
     */
    _createCamera() {
        const aspect = window.innerWidth / window.innerHeight;
        const cameraConfig = config.rendering.camera;
        
        this.camera = new THREE.PerspectiveCamera(
            cameraConfig.fov,
            aspect,
            cameraConfig.near,
            cameraConfig.far
        );
        
        // Set initial position
        this.camera.position.fromArray(cameraConfig.startPosition);
        this.camera.lookAt(0, 0, 0);
    }
    
    /**
     * Create WebGL renderer
     */
    _createRenderer() {
        const renderConfig = config.rendering;
        
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: this.antialias && renderConfig.antialias,
            alpha: false,
            powerPreference: 'high-performance'
        });
        
        // Set size
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        
        // Set pixel ratio
        const pixelRatio = renderConfig.pixelRatio === 'auto' ? 
            window.devicePixelRatio : renderConfig.pixelRatio;
        this.renderer.setPixelRatio(Math.min(pixelRatio * this.quality, 2));
        
        // Enable shadows if configured
        if (this.shadowsEnabled && renderConfig.shadowsEnabled) {
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        }
        
        // Set tone mapping for better colors
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.2;
        
        // Enable color management (three r152+: outputColorSpace replaces the
        // removed outputEncoding/sRGBEncoding API).
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    }
    
    /**
     * Create node geometry
     */
    _createGeometry() {
        const geoConfig = config.rendering.instances.geometry;
        
        switch (geoConfig.type) {
            case 'sphere':
                this.nodeGeometry = new THREE.SphereGeometry(
                    geoConfig.radius,
                    geoConfig.segments,
                    geoConfig.segments
                );
                break;
                
            case 'box':
                this.nodeGeometry = new THREE.BoxGeometry(
                    geoConfig.radius * 2,
                    geoConfig.radius * 2,
                    geoConfig.radius * 2
                );
                break;
                
            case 'octahedron':
                this.nodeGeometry = new THREE.OctahedronGeometry(
                    geoConfig.radius,
                    0
                );
                break;
                
            default:
                // Default to sphere
                this.nodeGeometry = new THREE.SphereGeometry(
                    geoConfig.radius,
                    geoConfig.segments,
                    geoConfig.segments
                );
        }
        
        // Calculate triangle count for performance metrics
        this.triangleCount = this.nodeGeometry.attributes.position.count / 3;
        
        // Create material
        this.nodeMaterial = new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            metalness: 0.2,
            roughness: 0.4,
            emissive: 0x111111,
            emissiveIntensity: 0.5,
            transparent: true,
            opacity: 1.0,
            envMapIntensity: 0.5,
            clearcoat: 0.3,
            clearcoatRoughness: 0.4
        });
    }
    
    /**
     * Create instanced mesh
     */
    _createInstancedMesh() {
        this.maxInstances = config.rendering.instances.maxCount;
        
        this.instancedMesh = new THREE.InstancedMesh(
            this.nodeGeometry,
            this.nodeMaterial,
            this.maxInstances
        );
        
        // Enable dynamic updates
        this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.instancedMesh.instanceColor = new THREE.InstancedBufferAttribute(
            new Float32Array(this.maxInstances * 3),
            3
        );
        this.instancedMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
        
        // Set initial count to 0
        this.instancedMesh.count = 0;
        
        // Enable shadows
        if (this.shadowsEnabled) {
            this.instancedMesh.castShadow = true;
            this.instancedMesh.receiveShadow = true;
        }
        
        // Add to scene
        this.scene.add(this.instancedMesh);
    }
    
    /**
     * Create lighting setup
     */
    _createLighting() {
        // Ambient light for base illumination
        this.lights.ambient = new THREE.AmbientLight(0x404050, 0.4);
        this.scene.add(this.lights.ambient);
        
        // Key light (main directional light)
        this.lights.key = new THREE.DirectionalLight(0x00ffff, 0.8);
        this.lights.key.position.set(10, 20, 10);
        this.lights.key.lookAt(0, 0, 0);
        
        if (this.shadowsEnabled) {
            this.lights.key.castShadow = true;
            this.lights.key.shadow.mapSize.width = 2048;
            this.lights.key.shadow.mapSize.height = 2048;
            this.lights.key.shadow.camera.near = 0.5;
            this.lights.key.shadow.camera.far = 50;
            this.lights.key.shadow.camera.left = -20;
            this.lights.key.shadow.camera.right = 20;
            this.lights.key.shadow.camera.top = 20;
            this.lights.key.shadow.camera.bottom = -20;
        }
        
        this.scene.add(this.lights.key);
        
        // Fill light (softer, opposite side)
        this.lights.fill = new THREE.DirectionalLight(0xff00ff, 0.4);
        this.lights.fill.position.set(-10, 10, -10);
        this.scene.add(this.lights.fill);
        
        // Rim light (back light for depth)
        this.lights.rim = new THREE.PointLight(0xffffff, 0.5, 100);
        this.lights.rim.position.set(0, 15, -20);
        this.scene.add(this.lights.rim);
        
        // Add light helpers in debug mode
        if (config.debug.enabled) {
            this._addLightHelpers();
        }
    }
    
    /**
     * Create visual effects
     */
    _createEffects() {
        // Fog for depth
        if (config.rendering.fog.enabled) {
            this.fog = new THREE.Fog(
                config.rendering.fog.color,
                config.rendering.fog.near,
                config.rendering.fog.far
            );
            this.scene.fog = this.fog;
        }
        
        // Future: Add post-processing effects
        // this._createPostProcessing();
    }
    
    /**
     * Update instances with node data
     */
    /**
     * Create the line layer used to draw edges between nodes. A single
     * LineSegments with a dynamic, pre-allocated buffer and per-vertex colors
     * (so hierarchy and wikilink edges can differ) — one draw call.
     */
    _createConnectionLines() {
        this.maxConnections = 4000;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position',
            new THREE.BufferAttribute(new Float32Array(this.maxConnections * 2 * 3), 3));
        geo.setAttribute('color',
            new THREE.BufferAttribute(new Float32Array(this.maxConnections * 2 * 3), 3));
        geo.setDrawRange(0, 0);

        const mat = new THREE.LineBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0.55,
            depthWrite: false,
        });

        this.connectionLines = new THREE.LineSegments(geo, mat);
        this.connectionLines.frustumCulled = false; // endpoints move every frame
        this.scene.add(this.connectionLines);
    }

    /**
     * Update the edge lines from a list of segments.
     * @param {{from:{x,y,z}, to:{x,y,z}, color:{r,g,b}}[]} segments
     * @returns {number} segments drawn
     */
    updateConnections(segments) {
        if (!this.connectionLines) return 0;
        const geo = this.connectionLines.geometry;
        const pos = geo.attributes.position.array;
        const col = geo.attributes.color.array;

        const n = Math.min(segments.length, this.maxConnections);
        for (let i = 0; i < n; i++) {
            const s = segments[i];
            const o = i * 6;
            pos[o] = s.from.x;     pos[o + 1] = s.from.y; pos[o + 2] = s.from.z;
            pos[o + 3] = s.to.x;   pos[o + 4] = s.to.y;   pos[o + 5] = s.to.z;
            const c = s.color;
            col[o] = c.r;     col[o + 1] = c.g; col[o + 2] = c.b;
            col[o + 3] = c.r; col[o + 4] = c.g; col[o + 5] = c.b;
        }

        geo.setDrawRange(0, n * 2);
        geo.attributes.position.needsUpdate = true;
        geo.attributes.color.needsUpdate = true;
        return n;
    }

    updateInstances(nodes) {
        let instanceIndex = 0;

        // Sort nodes by distance from camera for better transparency
        const cameraPos = this.camera.position;
        const sortedNodes = [...nodes].sort((a, b) => {
            const distA = a.position.distanceToSquared(cameraPos);
            const distB = b.position.distanceToSquared(cameraPos);
            return distB - distA; // Far to near
        });

        // Map instance index -> node so raycast hits resolve to the right node
        // (instances are drawn in sorted order and skip invisible nodes).
        this.instanceNodes = [];
        
        // Update each instance
        sortedNodes.forEach(node => {
            if (instanceIndex >= this.maxInstances) return;
            if (node.opacity <= 0.01) return; // Skip invisible nodes
            
            // Set position
            this.dummy.position.copy(node.position);
            
            // Set scale with opacity influence
            const scale = node.scale * (0.5 + node.opacity * 0.5);
            this.dummy.scale.setScalar(scale);
            
            // Add subtle rotation based on node ID for variety
            const rotationSeed = this._hashCode(node.id);
            this.dummy.rotation.y = rotationSeed * Math.PI * 2;
            
            // Update matrix
            this.dummy.updateMatrix();
            this.instancedMesh.setMatrixAt(instanceIndex, this.dummy.matrix);
            
            // Set color with opacity
            this.tempColor.copy(node.color);
            
            // Add emissive glow based on priority
            if (node.priority > 2) {
                this.tempColor.multiplyScalar(1.2);
            }
            
            // Apply CACE context score to color intensity
            if (node.contextScore !== undefined) {
                const intensity = 0.7 + (1 - node.contextScore) * 0.3;
                this.tempColor.multiplyScalar(intensity);
            }
            
            // Set instance color
            this.instancedMesh.setColorAt(instanceIndex, this.tempColor);

            // Record which node this drawn instance corresponds to.
            this.instanceNodes[instanceIndex] = node;

            instanceIndex++;
        });
        
        // Update instance count
        this.instancedMesh.count = instanceIndex;
        this.instancedMesh.instanceMatrix.needsUpdate = true;

        // Recompute the bounding sphere so raycasting (node selection) tests the
        // instances at their CURRENT positions, not a stale sphere around origin.
        this.instancedMesh.computeBoundingSphere();
        
        if (this.instancedMesh.instanceColor) {
            this.instancedMesh.instanceColor.needsUpdate = true;
        }
        
        // Update material opacity for all instances
        this.nodeMaterial.opacity = 0.9;
        
        // Update draw call count
        this.drawCalls = 1; // Single instanced draw call
        
        return instanceIndex;
    }
    
    /**
     * Update camera to follow focus
     */
    updateCamera(focusPosition, deltaTime) {
        if (!focusPosition) return;
        
        // Update camera target
        this.cameraTarget.lerp(focusPosition, this.cameraLerpFactor);
        
        // Update camera position
        const idealPosition = this.cameraTarget.clone().add(this.cameraOffset);
        this.camera.position.lerp(idealPosition, this.cameraLerpFactor);
        
        // Look at target
        this.camera.lookAt(this.cameraTarget);
    }
    
    /**
     * Render the scene
     */
    render() {
        // Update any animated properties
        this._updateAnimatedProperties();
        
        // Render
        this.renderer.render(this.scene, this.camera);
    }
    
    /**
     * Update animated properties
     */
    _updateAnimatedProperties() {
        const time = performance.now() * 0.001;
        
        // Animate lights slightly for living feel
        if (this.lights.key) {
            this.lights.key.intensity = 0.8 + Math.sin(time * 0.5) * 0.1;
        }
        
        if (this.lights.rim) {
            this.lights.rim.position.x = Math.sin(time * 0.3) * 5;
            this.lights.rim.position.z = Math.cos(time * 0.3) * 5 - 20;
        }
    }
    
    /**
     * Set render quality
     */
    setQuality(quality) {
        this.quality = Math.max(0.1, Math.min(1.0, quality));

        // Pixel ratio — reallocating the drawing buffer is expensive and causes
        // a visible flash, so only do it when the ratio meaningfully changes.
        const basePixelRatio = config.rendering.pixelRatio === 'auto' ?
            window.devicePixelRatio : config.rendering.pixelRatio;
        const newRatio = Math.min(basePixelRatio * this.quality, 2);
        if (this._appliedPixelRatio === undefined ||
            Math.abs(this._appliedPixelRatio - newRatio) > 0.05) {
            this.renderer.setPixelRatio(newRatio);
            this._appliedPixelRatio = newRatio;
        }

        // Update shadows
        this.shadowsEnabled = this.quality > 0.5 && config.rendering.shadowsEnabled;
        this.renderer.shadowMap.enabled = this.shadowsEnabled;

        // Geometry detail — only swap when crossing the low/high boundary, so we
        // don't rebuild the mesh (and flash) on every quality tweak.
        const wantLow = this.quality < 0.4;
        if (this._lowPoly !== wantLow) {
            this._lowPoly = wantLow;
            if (wantLow) this._createLowPolyGeometry();
            else this._createGeometry();
        }

        // Update material quality
        if (this.nodeMaterial) this.nodeMaterial.clearcoat = this.quality > 0.7 ? 0.3 : 0;

        return this.quality;
    }

    /**
     * Create low poly geometry for performance. An icosahedron (1 subdivision)
     * still reads as a round bubble — much nicer than a faceted octahedron.
     */
    _createLowPolyGeometry() {
        this.nodeGeometry = new THREE.IcosahedronGeometry(
            config.rendering.instances.geometry.radius,
            1
        );

        // Update instanced mesh geometry
        if (this.instancedMesh) {
            this.instancedMesh.geometry = this.nodeGeometry;
        }
    }
    
    /**
     * Handle window resize
     */
    resize() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        
        this.renderer.setSize(width, height);
    }
    
    /**
     * Set camera offset
     */
    setCameraOffset(offset) {
        this.cameraOffset.copy(offset);
    }
    
    /**
     * Add debug helpers
     */
    _addLightHelpers() {
        // Add light helpers
        const keyHelper = new THREE.DirectionalLightHelper(this.lights.key, 5);
        this.scene.add(keyHelper);
        
        const fillHelper = new THREE.DirectionalLightHelper(this.lights.fill, 5);
        this.scene.add(fillHelper);
        
        // Add axes helper
        const axesHelper = new THREE.AxesHelper(10);
        this.scene.add(axesHelper);
        
        // Add grid
        const gridHelper = new THREE.GridHelper(50, 50, 0x444444, 0x222222);
        this.scene.add(gridHelper);
    }
    
    /**
     * Simple hash function for consistent randomization
     */
    _hashCode(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash) / 2147483647; // Normalize to 0-1
    }
    
    /**
     * Handle window resize
     */
    _handleResize() {
        window.addEventListener('resize', () => {
            this.resize();
        });
    }
    
    /**
     * Get renderer statistics
     */
    getStats() {
        return {
            drawCalls: this.drawCalls,
            triangles: this.triangleCount * this.instancedMesh.count,
            instances: this.instancedMesh.count,
            maxInstances: this.maxInstances,
            quality: this.quality,
            shadowsEnabled: this.shadowsEnabled
        };
    }
    
    /**
     * Destroy renderer
     */
    destroy() {
        // Dispose of geometries
        if (this.nodeGeometry) this.nodeGeometry.dispose();
        
        // Dispose of materials
        if (this.nodeMaterial) this.nodeMaterial.dispose();

        // Dispose connection lines
        if (this.connectionLines) {
            this.connectionLines.geometry.dispose();
            this.connectionLines.material.dispose();
        }
        
        // Dispose of textures
        // ...
        
        // Remove event listeners
        window.removeEventListener('resize', this.resize);
        
        // Dispose renderer
        this.renderer.dispose();
    }
}
