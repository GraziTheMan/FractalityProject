// src/ui/MenuController.js

import { HapticFeedback } from './HapticFeedback.js';
import { AnimationEngine } from '../intelligence/AnimationEngine.js';
import { EventBus } from '../core/EventBus.js';

export class MenuController {
    constructor(options = {}) {
        // Configuration
        this.config = {
            handedness: localStorage.getItem('handedness') || options.handedness || 'right',
            animationDuration: options.animationDuration || 300,
            hapticEnabled: options.hapticEnabled !== false,
            categories: options.categories || [],
            ...options
        };

        // DOM elements
        this.menuRoot = options.menuRoot || document.getElementById('menu-root');
        this.reverseToggle = options.reverseToggle || document.getElementById('reverse-toggle');
        this.container = options.container || document.getElementById('menu-container');
        
        // Services
        this.haptic = new HapticFeedback(this.config.hapticEnabled);
        this.animator = new AnimationEngine();
        this.eventBus = options.eventBus || new EventBus();
        
        // State
        this.state = {
            expanded: false,
            activeCategory: null,
            nodes: new Map(),
            connections: new Map()
        };

        this._init();
    }

    _init() {
        this._setupEventListeners();
        this._createHapticRing();
        this._setupTouchHandlers();
    }

    _setupEventListeners() {
        this.menuRoot.addEventListener('click', () => this.toggleMenu());
        this.reverseToggle?.addEventListener('click', () => this.toggleHandedness());
        
        // Listen for external events
        this.eventBus.on('node:focus', (nodeId) => this.handleNodeFocus(nodeId));
        this.eventBus.on('feed:open', () => this.closemenu());
    }

    _setupTouchHandlers() {
        let touchStartTime;
        let touchStartPos;
        
        this.menuRoot.addEventListener('touchstart', (e) => {
            touchStartTime = Date.now();
            touchStartPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }, { passive: true });
        
        this.menuRoot.addEventListener('touchend', (e) => {
            e.preventDefault();
            const touchDuration = Date.now() - touchStartTime;
            const touchEndPos = { 
                x: e.changedTouches[0].clientX, 
                y: e.changedTouches[0].clientY 
            };
            
            // Check if it's a tap (not a swipe)
            const distance = Math.hypot(
                touchEndPos.x - touchStartPos.x, 
                touchEndPos.y - touchStartPos.y
            );
            
            if (touchDuration < 500 && distance < 10) {
                this.toggleMenu();
            }
        });
    }

    _createHapticRing() {
        const ring = document.createElement('div');
        ring.className = 'haptic-ring';
        this.menuRoot.appendChild(ring);
        
        if (this.reverseToggle) {
            const reverseRing = ring.cloneNode();
            this.reverseToggle.appendChild(reverseRing);
        }
    }

    toggleMenu() {
        this.state.expanded = !this.state.expanded;
        this.menuRoot.classList.toggle('expanded', this.state.expanded);
        
        if (this.state.expanded) {
            this.haptic.trigger('medium');
            this.showMenu();
            this._animateHapticRing(this.menuRoot);
        } else {
            this.haptic.trigger('light');
            this.hideMenu();
        }
        
        this.eventBus.emit('menu:toggle', this.state.expanded);
    }

    toggleHandedness() {
        this.config.handedness = this.config.handedness === 'right' ? 'left' : 'right';
        localStorage.setItem('handedness', this.config.handedness);
        this.haptic.trigger('double');
        this._animateHapticRing(this.reverseToggle);
        
        if (this.state.expanded) {
            this.hideMenu();
            setTimeout(() => this.showMenu(), 100);
        }
        
        this.eventBus.emit('handedness:change', this.config.handedness);
    }

    showMenu() {
        this._clearContainer();
        
        const menuRect = this.menuRoot.getBoundingClientRect();
        const center = {
            x: menuRect.left + menuRect.width / 2,
            y: menuRect.top + menuRect.height / 2
        };
        
        const positions = this._calculateEllipticalArc(
            center,
            this.config.categories.length,
            this._getRadiusX(),
            this._getRadiusY(),
            this._getAngleStart(),
            Math.PI / 2
        );

        this.config.categories.forEach((category, index) => {
            // Create node
            const node = this._createNode(category, positions[index], index);
            this.state.nodes.set(category.id, node);
            this.container.appendChild(node);
            
            // Create connection line
            const connection = this._createConnection(center, positions[index]);
            this.state.connections.set(category.id, connection);
            this.container.appendChild(connection);
            
            // Animate in
            this.animator.staggerIn([connection, node], index * 50);
        });
    }

    hideMenu() {
        const elements = [
            ...this.state.connections.values(),
            ...this.state.nodes.values()
        ];
        
        // Clear submenus first
        this._clearSubmenus();
        
        // Animate out
        elements.forEach((element, index) => {
            this.animator.fadeOut(element, index * 30);
        });
        
        // Clean up after animation
        setTimeout(() => {
            this._clearContainer();
            this.state.activeCategory = null;
        }, this.config.animationDuration);
    }

    _createNode(category, position, index) {
        const node = document.createElement('div');
        node.className = 'menu-node';
        node.dataset.categoryId = category.id;
        node.style.left = `${position.x}px`;
        node.style.top = `${position.y}px`;
        
        if (category.color) {
            node.style.setProperty('--node-color', category.color);
        }
        
        node.innerHTML = `
            <span class="menu-node-icon">${category.icon}</span>
            <span class="menu-node-label">${category.label}</span>
        `;
        
        node.addEventListener('click', (e) => {
            e.stopPropagation();
            this._handleNodeClick(category, position, node);
        });
        
        return node;
    }

    _handleNodeClick(category, position, node) {
        this.haptic.trigger('medium');
        this._animateHapticRing(node);
        
        if (category.action) {
            this._executeAction(category.action, category);
        } else if (category.subnodes) {
            this._toggleSubmenu(category, position, node);
        }
        
        this.eventBus.emit('menu:select', category);
    }

    _toggleSubmenu(category, parentPos, parentNode) {
        this._clearSubmenus();
        
        if (this.state.activeCategory === category.id) {
            this.state.activeCategory = null;
            return;
        }
        
        this.state.activeCategory = category.id;
        parentNode.classList.add('active');
        
        const submenuContainer = document.createElement('div');
        submenuContainer.className = 'submenu-container';
        submenuContainer.dataset.parentId = category.id;
        
        const radius = 60;
        const angleStep = (Math.PI * 2) / category.subnodes.length;
        
        category.subnodes.forEach((subnode, index) => {
            const angle = index * angleStep - Math.PI / 2;
            const pos = {
                x: parentPos.x + radius * Math.cos(angle),
                y: parentPos.y + radius * Math.sin(angle)
            };
            
            const element = this._createSubmenuNode(subnode, pos);
            submenuContainer.appendChild(element);
            
            // Animate in
            this.animator.scaleIn(element, index * 30);
        });
        
        this.container.appendChild(submenuContainer);
    }

    _createSubmenuNode(subnode, position) {
        const node = document.createElement('div');
        node.className = 'submenu-node';
        node.style.left = `${position.x}px`;
        node.style.top = `${position.y}px`;
        
        // Extract emoji and text
        const parts = subnode.label.split(' ');
        const emoji = parts[0];
        const text = parts.slice(1).join(' ');
        
        node.innerHTML = `
            <span class="submenu-icon">${emoji}</span>
            <span class="submenu-text">${text}</span>
        `;
        
        node.addEventListener('click', (e) => {
            e.stopPropagation();
            this.haptic.trigger('light');
            this._executeAction(subnode.action, subnode);
        });
        
        return node;
    }

    _createConnection(from, to) {
        const connection = document.createElement('div');
        connection.className = 'connection-line';
        
        const distance = Math.hypot(to.x - from.x, to.y - from.y);
        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        
        connection.style.width = `${distance}px`;
        connection.style.left = `${from.x}px`;
        connection.style.top = `${from.y}px`;
        connection.style.transform = `rotate(${angle}rad)`;
        
        return connection;
    }

    _executeAction(action, data) {
        this.eventBus.emit('action:execute', { action, data });
        
        // Special handling for certain actions
        if (action === 'openFeed') {
            this.eventBus.emit('feed:open');
        }
        
        // Close menu after action
        setTimeout(() => this.toggleMenu(), 100);
    }

    _calculateEllipticalArc(center, count, radiusX, radiusY, angleStart, angleSpan) {
        const points = [];
        const angleStep = count > 1 ? angleSpan / (count - 1) : 0;
        
        for (let i = 0; i < count; i++) {
            const angle = angleStart + i * angleStep;
            points.push({
                x: center.x + radiusX * Math.cos(angle),
                y: center.y + radiusY * Math.sin(angle)
            });
        }
        
        return points;
    }

    _getRadiusX() {
        return window.innerWidth < 400 ? 80 : 100;
    }

    _getRadiusY() {
        return window.innerWidth < 400 ? 60 : 70;
    }

    _getAngleStart() {
        return this.config.handedness === 'right' ? -Math.PI / 2 : -Math.PI;
    }

    _animateHapticRing(element) {
        const ring = element.querySelector('.haptic-ring');
        if (ring) {
            ring.classList.remove('pulse');
            void ring.offsetWidth; // Force reflow
            ring.classList.add('pulse');
        }
    }

    _clearSubmenus() {
        this.container.querySelectorAll('.submenu-container').forEach(el => el.remove());
        this.container.querySelectorAll('.menu-node.active').forEach(el => {
            el.classList.remove('active');
        });
    }

    _clearContainer() {
        this.container.innerHTML = '';
        this.state.nodes.clear();
        this.state.connections.clear();
    }

    // Public API
    closeMenu() {
        if (this.state.expanded) {
            this.toggleMenu();
        }
    }

    handleNodeFocus(nodeId) {
        // Handle focus changes from the main visualization
        const category = this.config.categories.find(cat => 
            cat.relatedNodes?.includes(nodeId)
        );
        
        if (category) {
            this._highlightCategory(category.id);
        }
    }

    _highlightCategory(categoryId) {
        const node = this.state.nodes.get(categoryId);
        if (node) {
            node.classList.add('highlight');
            setTimeout(() => node.classList.remove('highlight'), 2000);
        }
    }

    destroy() {
        this._clearContainer();
        this.eventBus.off('node:focus');
        this.eventBus.off('feed:open');
        // Remove event listeners
    }
}