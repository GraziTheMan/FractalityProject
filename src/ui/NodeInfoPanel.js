// src/ui/NodeInfoPanel.js

/**
 * NodeInfoPanel - Interactive Node Information Display
 * Gemini's Domain: Intuitive, beautiful UI for exploring node details
 * 
 * Shows contextual information about nodes on hover/selection
 * with smooth animations and rich metadata display.
 */
export class NodeInfoPanel {
    constructor() {
        // UI elements
        this.container = null;
        this.elements = {
            title: null,
            id: null,
            type: null,
            depth: null,
            children: null,
            metadata: null,
            contextScore: null,
            relationship: null,
            actions: null
        };
        
        // State
        this.currentNode = null;
        this.isVisible = false;
        this.isPinned = false;
        
        // Configuration
        this.config = {
            position: 'bottom-left',
            showOnHover: true,
            hoverDelay: 200,
            fadeTime: 300,
            maxMetadataItems: 10
        };
        
        // Timers
        this.hoverTimer = null;
        this.hideTimer = null;
        
        // Animation state
        this.animationFrame = null;
        this.targetOpacity = 0;
        this.currentOpacity = 0;
    }
    
    /**
     * Initialize the info panel
     */
    init() {
        // Check if already exists
        if (this.container) return;
        
        // Create container
        this._createContainer();
        
        // Create content sections
        this._createHeader();
        this._createBasicInfo();
        this._createMetadataSection();
        this._createRelationshipSection();
        this._createActions();
        
        // Apply styles
        this._applyStyles();
        
        // Setup event listeners
        this._setupEventListeners();
    }
    
    /**
     * Create container element
     */
    _createContainer() {
        this.container = document.createElement('div');
        this.container.id = 'node-info-panel';
        this.container.className = 'node-info-panel';
        this.container.style.opacity = '0';
        this.container.style.display = 'none';
        
        // Add to UI overlay or body
        const overlay = document.getElementById('ui-overlay') || document.body;
        overlay.appendChild(this.container);
    }
    
    /**
     * Create header section
     */
    _createHeader() {
        const header = document.createElement('div');
        header.className = 'info-header';
        
        // Title
        this.elements.title = document.createElement('h2');
        this.elements.title.className = 'info-title';
        header.appendChild(this.elements.title);
        
        // Pin button
        const pinButton = document.createElement('button');
        pinButton.className = 'pin-button';
        pinButton.innerHTML = '📌';
        pinButton.title = 'Pin panel';
        pinButton.addEventListener('click', () => this.togglePin());
        header.appendChild(pinButton);
        
        this.container.appendChild(header);
    }
    
    /**
     * Create basic info section
     */
    _createBasicInfo() {
        const basicInfo = document.createElement('div');
        basicInfo.className = 'info-section basic-info';
        
        // Create info rows
        const infoItems = [
            { key: 'id', label: 'ID', icon: '🔑' },
            { key: 'type', label: 'Type', icon: '📦' },
            { key: 'depth', label: 'Depth', icon: '📊' },
            { key: 'children', label: 'Children', icon: '👶' },
            { key: 'contextScore', label: 'Context', icon: '🎯' },
            { key: 'relationship', label: 'Relation', icon: '🔗' }
        ];
        
        infoItems.forEach(item => {
            const row = document.createElement('div');
            row.className = 'info-row';
            
            const label = document.createElement('span');
            label.className = 'info-label';
            label.innerHTML = `${item.icon} ${item.label}:`;
            
            const value = document.createElement('span');
            value.className = 'info-value';
            value.id = `info-${item.key}`;
            
            row.appendChild(label);
            row.appendChild(value);
            basicInfo.appendChild(row);
            
            this.elements[item.key] = value;
        });
        
        this.container.appendChild(basicInfo);
    }
    
    /**
     * Create metadata section
     */
    _createMetadataSection() {
        const section = document.createElement('div');
        section.className = 'info-section metadata-section';
        
        const header = document.createElement('h3');
        header.className = 'section-header';
        header.innerHTML = '📋 Metadata';
        section.appendChild(header);
        
        this.elements.metadata = document.createElement('div');
        this.elements.metadata.className = 'metadata-content';
        section.appendChild(this.elements.metadata);
        
        this.container.appendChild(section);
    }
    
    /**
     * Create relationship section
     */
    _createRelationshipSection() {
        const section = document.createElement('div');
        section.className = 'info-section relationship-section';
        
        const header = document.createElement('h3');
        header.className = 'section-header';
        header.innerHTML = '🌳 Family Tree';
        section.appendChild(header);
        
        const tree = document.createElement('div');
        tree.className = 'family-tree';
        tree.id = 'family-tree';
        section.appendChild(tree);
        
        this.container.appendChild(section);
    }
    
    /**
     * Create actions section
     */
    _createActions() {
        const actions = document.createElement('div');
        actions.className = 'info-actions';
        
        // Navigate button
        const navigateBtn = document.createElement('button');
        navigateBtn.className = 'action-button primary';
        navigateBtn.innerHTML = '🚀 Navigate Here';
        navigateBtn.addEventListener('click', () => this._navigateToNode());
        actions.appendChild(navigateBtn);
        
        // Expand button
        const expandBtn = document.createElement('button');
        expandBtn.className = 'action-button';
        expandBtn.innerHTML = '🔍 Expand';
        expandBtn.addEventListener('click', () => this._expandNode());
        actions.appendChild(expandBtn);
        
        // Info hint
        const hint = document.createElement('div');
        hint.className = 'action-hint';
        hint.textContent = 'Click node to navigate';
        actions.appendChild(hint);
        
        this.elements.actions = actions;
        this.container.appendChild(actions);
    }
    
    /**
     * Apply styles
     */
    _applyStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .node-info-panel {
                position: fixed;
                bottom: 20px;
                left: 20px;
                width: 320px;
                max-width: 90vw;
                max-height: 70vh;
                background: rgba(0, 0, 0, 0.9);
                border: 1px solid #444;
                border-radius: 12px;
                padding: 20px;
                color: #fff;
                font-family: 'Inter', -apple-system, sans-serif;
                backdrop-filter: blur(20px);
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
                overflow-y: auto;
                pointer-events: auto;
                z-index: 100;
                transition: transform 0.3s ease, box-shadow 0.3s ease;
            }
            
            .node-info-panel:hover {
                transform: translateY(-2px);
                box-shadow: 0 15px 50px rgba(0, 0, 0, 0.6);
            }
            
            .node-info-panel.pinned {
                border-color: #0ff;
                box-shadow: 0 0 30px rgba(0, 255, 255, 0.3);
            }
            
            .info-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 20px;
                padding-bottom: 15px;
                border-bottom: 1px solid #333;
            }
            
            .info-title {
                margin: 0;
                font-size: 20px;
                font-weight: 600;
                color: #fff;
                text-shadow: 0 0 10px rgba(255, 255, 255, 0.3);
            }
            
            .pin-button {
                background: none;
                border: 1px solid #444;
                border-radius: 4px;
                padding: 4px 8px;
                cursor: pointer;
                font-size: 16px;
                transition: all 0.2s;
            }
            
            .pin-button:hover {
                border-color: #0ff;
                transform: scale(1.1);
            }
            
            .node-info-panel.pinned .pin-button {
                background: #0ff;
                color: #000;
            }
            
            .info-section {
                margin: 20px 0;
            }
            
            .section-header {
                margin: 0 0 10px 0;
                font-size: 14px;
                font-weight: 600;
                color: #0ff;
                text-transform: uppercase;
                letter-spacing: 1px;
            }
            
            .info-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin: 8px 0;
                padding: 4px 0;
                border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            }
            
            .info-label {
                color: #888;
                font-size: 13px;
            }
            
            .info-value {
                color: #fff;
                font-weight: 500;
                font-size: 14px;
                text-align: right;
            }
            
            .metadata-content {
                background: rgba(255, 255, 255, 0.05);
                border-radius: 6px;
                padding: 10px;
                max-height: 150px;
                overflow-y: auto;
            }
            
            .metadata-item {
                display: flex;
                justify-content: space-between;
                margin: 4px 0;
                font-size: 12px;
            }
            
            .metadata-key {
                color: #0ff;
                text-transform: capitalize;
            }
            
            .metadata-value {
                color: #ccc;
                text-align: right;
                max-width: 60%;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            
            .family-tree {
                background: rgba(255, 255, 255, 0.05);
                border-radius: 6px;
                padding: 15px;
                text-align: center;
                font-size: 13px;
            }
            
            .tree-node {
                display: inline-block;
                margin: 4px;
                padding: 4px 8px;
                background: rgba(0, 255, 255, 0.1);
                border: 1px solid #0ff;
                border-radius: 4px;
                cursor: pointer;
                transition: all 0.2s;
            }
            
            .tree-node:hover {
                background: rgba(0, 255, 255, 0.3);
                transform: scale(1.05);
            }
            
            .tree-node.current {
                background: #0ff;
                color: #000;
                font-weight: bold;
            }
            
            .info-actions {
                margin-top: 20px;
                padding-top: 15px;
                border-top: 1px solid #333;
            }
            
            .action-button {
                display: block;
                width: 100%;
                margin: 8px 0;
                padding: 10px;
                background: rgba(255, 255, 255, 0.1);
                border: 1px solid #444;
                border-radius: 6px;
                color: #fff;
                font-size: 14px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s;
            }
            
            .action-button:hover {
                background: rgba(255, 255, 255, 0.2);
                border-color: #666;
                transform: translateY(-1px);
            }
            
            .action-button.primary {
                background: rgba(0, 255, 255, 0.2);
                border-color: #0ff;
            }
            
            .action-button.primary:hover {
                background: rgba(0, 255, 255, 0.3);
                box-shadow: 0 0 20px rgba(0, 255, 255, 0.4);
            }
            
            .action-hint {
                text-align: center;
                font-size: 11px;
                color: #666;
                font-style: italic;
                margin-top: 10px;
            }
            
            /* Scrollbar styling */
            .node-info-panel::-webkit-scrollbar,
            .metadata-content::-webkit-scrollbar {
                width: 6px;
            }
            
            .node-info-panel::-webkit-scrollbar-track,
            .metadata-content::-webkit-scrollbar-track {
                background: rgba(255, 255, 255, 0.05);
                border-radius: 3px;
            }
            
            .node-info-panel::-webkit-scrollbar-thumb,
            .metadata-content::-webkit-scrollbar-thumb {
                background: rgba(0, 255, 255, 0.3);
                border-radius: 3px;
            }
            
            .node-info-panel::-webkit-scrollbar-thumb:hover,
            .metadata-content::-webkit-scrollbar-thumb:hover {
                background: rgba(0, 255, 255, 0.5);
            }
            
            /* Animations */
            @keyframes slideIn {
                from {
                    transform: translateY(20px);
                    opacity: 0;
                }
                to {
                    transform: translateY(0);
                    opacity: 1;
                }
            }
            
            .node-info-panel.showing {
                animation: slideIn 0.3s ease-out;
            }
        `;
        
        document.head.appendChild(style);
    }
    
    /**
     * Show panel with node data
     */
    show(node) {
        if (!node) return;
        
        // Clear hover timer
        if (this.hoverTimer) {
            clearTimeout(this.hoverTimer);
            this.hoverTimer = null;
        }
        
        // Set delay if hover mode
        if (this.config.showOnHover && !this.isPinned) {
            this.hoverTimer = setTimeout(() => {
                this._showNode(node);
            }, this.config.hoverDelay);
        } else {
            this._showNode(node);
        }
    }
    
    /**
     * Actually show the node
     */
    _showNode(node) {
        this.currentNode = node;
        
        // Update content
        this._updateContent(node);
        
        // Show panel
        if (!this.isVisible) {
            this.container.style.display = 'block';
            this.container.classList.add('showing');
            this._animateOpacity(1);
            this.isVisible = true;
        }
    }
    
    /**
     * Hide panel
     */
    hide() {
        if (this.isPinned) return;
        
        // Clear timers
        if (this.hoverTimer) {
            clearTimeout(this.hoverTimer);
            this.hoverTimer = null;
        }
        
        // Add hide delay
        if (this.hideTimer) {
            clearTimeout(this.hideTimer);
        }
        
        this.hideTimer = setTimeout(() => {
            this._animateOpacity(0, () => {
                this.container.style.display = 'none';
                this.container.classList.remove('showing');
                this.isVisible = false;
                this.currentNode = null;
            });
        }, 100);
    }
    
    /**
     * Update panel content
     */
    _updateContent(node) {
        // Title
        this.elements.title.textContent = node.metadata?.label || `Node ${node.id}`;
        
        // Basic info
        this.elements.id.textContent = node.id;
        this.elements.type.textContent = node.metadata?.type || 'default';
        this.elements.depth.textContent = node.depth;
        this.elements.children.textContent = node.childIds.length;
        
        // Context score
        if (node.contextScore !== undefined) {
            const score = Math.round(node.contextScore * 100);
            this.elements.contextScore.textContent = `${score}%`;
            this.elements.contextScore.style.color = this._getScoreColor(node.contextScore);
        } else {
            this.elements.contextScore.textContent = 'N/A';
        }
        
        // Relationship
        this.elements.relationship.textContent = this._getRelationshipLabel(node);
        
        // Metadata
        this._updateMetadata(node.metadata);
        
        // Family tree
        this._updateFamilyTree(node);
    }
    
    /**
     * Update metadata display
     */
    _updateMetadata(metadata) {
        this.elements.metadata.innerHTML = '';
        
        if (!metadata) {
            this.elements.metadata.innerHTML = '<div class="metadata-item">No metadata</div>';
            return;
        }
        
        let count = 0;
        for (const [key, value] of Object.entries(metadata)) {
            if (count >= this.config.maxMetadataItems) break;
            if (key === 'label' || key === 'type') continue; // Already shown
            
            const item = document.createElement('div');
            item.className = 'metadata-item';
            
            const keyEl = document.createElement('span');
            keyEl.className = 'metadata-key';
            keyEl.textContent = key + ':';
            
            const valueEl = document.createElement('span');
            valueEl.className = 'metadata-value';
            valueEl.textContent = this._formatValue(value);
            valueEl.title = String(value); // Full value on hover
            
            item.appendChild(keyEl);
            item.appendChild(valueEl);
            this.elements.metadata.appendChild(item);
            
            count++;
        }
    }
    
    /**
     * Update family tree visualization
     */
    _updateFamilyTree(node) {
        const tree = document.getElementById('family-tree');
        tree.innerHTML = '';
        
        // Parent
        if (node.parentId) {
            const parentEl = document.createElement('div');
            parentEl.className = 'tree-node';
            parentEl.textContent = '👆 Parent';
            parentEl.dataset.nodeId = node.parentId;
            parentEl.addEventListener('click', () => this._onTreeNodeClick(node.parentId));
            tree.appendChild(parentEl);
            
            tree.appendChild(document.createElement('br'));
        }
        
        // Current node
        const currentEl = document.createElement('div');
        currentEl.className = 'tree-node current';
        currentEl.textContent = '👁 Current';
        tree.appendChild(currentEl);
        
        // Siblings
        if (node.siblingIds && node.siblingIds.length > 0) {
            tree.appendChild(document.createElement('br'));
            
            const siblingCount = Math.min(3, node.siblingIds.length);
            for (let i = 0; i < siblingCount; i++) {
                const siblingId = node.siblingIds[i];
                const siblingEl = document.createElement('div');
                siblingEl.className = 'tree-node';
                siblingEl.textContent = '👥 Sibling';
                siblingEl.dataset.nodeId = siblingId;
                siblingEl.addEventListener('click', () => this._onTreeNodeClick(siblingId));
                tree.appendChild(siblingEl);
            }

            if (node.siblingIds.length > siblingCount) {
                const moreEl = document.createElement('div');
                moreEl.className = 'tree-node more';
                moreEl.textContent = `… +${node.siblingIds.length - siblingCount} more`;
                tree.appendChild(moreEl);
            }
        }

        // Children
        if (node.childIds && node.childIds.length > 0) {
            tree.appendChild(document.createElement('br'));

            const childEl = document.createElement('div');
            const n = node.childIds.length;
            childEl.className = 'tree-node';
            childEl.textContent = `👶 ${n} ${n === 1 ? 'child' : 'children'}`;
            tree.appendChild(childEl);
        }
    }

    /**
     * Format a metadata value for compact display.
     */
    _formatValue(value) {
        if (value === null || value === undefined) return '—';
        if (typeof value === 'number') {
            return Number.isInteger(value) ? String(value) : value.toFixed(3);
        }
        if (typeof value === 'boolean') return value ? 'yes' : 'no';
        if (Array.isArray(value)) return `[${value.length}]`;
        if (typeof value === 'object') {
            try { return JSON.stringify(value); } catch { return '{…}'; }
        }
        const str = String(value);
        return str.length > 40 ? str.slice(0, 37) + '…' : str;
    }

    /**
     * Map a 0..1 context score to a readable color.
     */
    _getScoreColor(score) {
        if (score >= 0.75) return '#4ade80'; // green  - highly relevant
        if (score >= 0.5)  return '#facc15'; // yellow - relevant
        if (score >= 0.25) return '#fb923c'; // orange - loosely related
        return '#f87171';                     // red    - weak
    }

    /**
     * Human-readable label describing the node's role in the graph.
     */
    _getRelationshipLabel(node) {
        if (!node) return 'Unknown';
        if (node.metadata?.relationship) return node.metadata.relationship;
        if (!node.parentId) return 'Root';
        if (node.childIds && node.childIds.length > 0) return 'Branch';
        return 'Leaf';
    }

    /**
     * Navigate to a node clicked in the family tree.
     * Decoupled navigation: the app listens for this event and calls
     * fractalityEngine.navigateToNode (see FractalityEngine's `fractality:`
     * event convention and public/main.js).
     */
    _onTreeNodeClick(nodeId) {
        if (!nodeId) return;
        window.dispatchEvent(new CustomEvent('fractality:navigate', { detail: { nodeId } }));
    }

    /**
     * Navigate to the currently displayed node.
     */
    _navigateToNode() {
        if (this.currentNode) this._onTreeNodeClick(this.currentNode.id);
    }

    /**
     * Request the app to expand the current node's children.
     */
    _expandNode() {
        if (!this.currentNode) return;
        window.dispatchEvent(new CustomEvent('fractality:expand', { detail: { nodeId: this.currentNode.id } }));
    }

    /**
     * Wire up panel-level interactions (hover retention, pin toggle).
     */
    _setupEventListeners() {
        if (!this.container) return;

        // Keep the panel open while the pointer is over it.
        this.container.addEventListener('mouseenter', () => {
            if (this.hideTimer) {
                clearTimeout(this.hideTimer);
                this.hideTimer = null;
            }
        });
        this.container.addEventListener('mouseleave', () => this.hide());

        // Double-click pins the panel so it stays visible.
        this.container.addEventListener('dblclick', () => {
            this.isPinned = !this.isPinned;
            this.container.classList.toggle('pinned', this.isPinned);
        });
    }

    /**
     * Animate the panel opacity toward a target, then run an optional callback.
     */
    _animateOpacity(target, onComplete) {
        this.targetOpacity = target;
        if (this.animationFrame) cancelAnimationFrame(this.animationFrame);

        const step = () => {
            const diff = this.targetOpacity - this.currentOpacity;
            if (Math.abs(diff) < 0.01) {
                this.currentOpacity = this.targetOpacity;
                this.container.style.opacity = String(this.currentOpacity);
                this.animationFrame = null;
                if (typeof onComplete === 'function') onComplete();
                return;
            }
            this.currentOpacity += diff * 0.2;
            this.container.style.opacity = String(this.currentOpacity);
            this.animationFrame = requestAnimationFrame(step);
        };
        this.animationFrame = requestAnimationFrame(step);
    }

    /**
     * Tear down the panel and release timers / animation frames.
     */
    destroy() {
        if (this.hoverTimer) clearTimeout(this.hoverTimer);
        if (this.hideTimer) clearTimeout(this.hideTimer);
        if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
        this.container = null;
        this.isVisible = false;
        this.currentNode = null;
    }
}