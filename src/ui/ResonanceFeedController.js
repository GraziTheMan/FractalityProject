// src/ui/ResonanceFeedController.js

import { EventBus } from '../core/EventBus.js';
import { HapticFeedback } from './HapticFeedback.js';
import { AnimationEngine } from '../intelligence/AnimationEngine.js';
import { ResonanceEngine } from '../intelligence/ResonanceEngine.js';

export class ResonanceFeedController {
    constructor(options = {}) {
        this.config = {
            container: options.container || document.getElementById('resonance-feed'),
            feedContainer: options.feedContainer || document.getElementById('feed-container'),
            maxItems: options.maxItems || 50,
            refreshInterval: options.refreshInterval || 30000, // 30 seconds
            ...options
        };

        // Services
        this.eventBus = options.eventBus || new EventBus();
        this.haptic = new HapticFeedback();
        this.animator = new AnimationEngine();
        this.resonanceEngine = options.resonanceEngine || new ResonanceEngine();
        
        // State
        this.state = {
            isOpen: false,
            pulses: [],
            filters: {
                tags: [],
                minResonance: 0,
                timeRange: 'all'
            },
            scrollPosition: 0
        };

        // Refs
        this.refreshTimer = null;

        this._init();
    }

    _init() {
        this._setupEventListeners();
        this._setupSwipeGestures();
        this._createDOMStructure();
    }

    _setupEventListeners() {
        // Close button
        const closeBtn = this.config.container.querySelector('.feed-close');
        closeBtn?.addEventListener('click', () => this.close());

        // Event bus listeners
        this.eventBus.on('feed:open', () => this.open());
        this.eventBus.on('pulse:new', (pulse) => this._handleNewPulse(pulse));
        this.eventBus.on('resonance:update', (data) => this._updateResonance(data));

        // Scroll handling for infinite loading
        this.config.feedContainer.addEventListener('scroll', () => {
            this._handleScroll();
        });
    }

    _setupSwipeGestures() {
        let touchStartY = 0;
        let touchStartTime = 0;
        
        this.config.container.addEventListener('touchstart', (e) => {
            touchStartY = e.touches[0].clientY;
            touchStartTime = Date.now();
        }, { passive: true });
        
        this.config.container.addEventListener('touchend', (e) => {
            const touchEndY = e.changedTouches[0].clientY;
            const touchDuration = Date.now() - touchStartTime;
            const swipeDistance = touchEndY - touchStartY;
            
            // Swipe down to close
            if (swipeDistance > 100 && touchDuration < 500 && this.state.scrollPosition < 50) {
                this.close();
            }
        }, { passive: true });
    }

    _createDOMStructure() {
        if (!this.config.container.querySelector('.feed-header')) {
            this.config.container.innerHTML = `
                <div class="feed-header">
                    <h1 class="feed-title">
                        <span class="feed-icon">🌀</span>
                        <span class="feed-text">Resonance Feed</span>
                    </h1>
                    <div class="feed-filters">
                        <button class="filter-chip active" data-filter="all">All</button>
                        <button class="filter-chip" data-filter="personal">Personal</button>
                        <button class="filter-chip" data-filter="collective">Collective</button>
                        <button class="filter-chip" data-filter="quantum">Quantum</button>
                    </div>
                    <button class="feed-close" aria-label="Close feed">
                        <span>✕</span>
                    </button>
                </div>
                <div class="feed-container" id="feed-container">
                    <div class="feed-loading">
                        <div class="spinner"></div>
                    </div>
                </div>
                <div class="feed-compose">
                    <button class="compose-button">
                        <span class="compose-icon">✨</span>
                        <span class="compose-text">Share Pulse</span>
                    </button>
                </div>
            `;

            this._setupFilterListeners();
            this._setupComposeButton();
        }
    }

    _setupFilterListeners() {
        const filters = this.config.container.querySelectorAll('.filter-chip');
        filters.forEach(filter => {
            filter.addEventListener('click', () => {
                // Update active state
                filters.forEach(f => f.classList.remove('active'));
                filter.classList.add('active');
                
                // Apply filter
                const filterType = filter.dataset.filter;
                this._applyFilter(filterType);
                
                this.haptic.trigger('light');
            });
        });
    }

    _setupComposeButton() {
        const composeBtn = this.config.container.querySelector('.compose-button');
        composeBtn?.addEventListener('click', () => {
            this.haptic.trigger('medium');
            this.eventBus.emit('compose:open', { type: 'pulse' });
        });
    }

    async open() {
        this.state.isOpen = true;
        this.config.container.classList.add('active');
        this.haptic.trigger('medium');
        
        // Reset scroll position
        this.config.feedContainer.scrollTop = 0;
        this.state.scrollPosition = 0;
        
        // Load initial feed
        await this.loadFeed();
        
        // Start auto-refresh
        this._startAutoRefresh();
        
        this.eventBus.emit('feed:opened');
    }

    close() {
        this.state.isOpen = false;
        this.config.container.classList.remove('active');
        this.haptic.trigger('light');
        
        // Stop auto-refresh
        this._stopAutoRefresh();
        
        this.eventBus.emit('feed:closed');
    }

    async loadFeed(append = false) {
        if (!append) {
            this._showLoading();
        }

        try {
            // Fetch pulses from resonance engine
            const pulses = await this.resonanceEngine.fetchResonantPulses({
                filters: this.state.filters,
                offset: append ? this.state.pulses.length : 0,
                limit: 20
            });

            if (append) {
                this.state.pulses.push(...pulses);
            } else {
                this.state.pulses = pulses;
            }

            this._renderFeed(append);
        } catch (error) {
            console.error('Failed to load feed:', error);
            this._showError();
        }
    }

    _renderFeed(append = false) {
        if (!append) {
            this.config.feedContainer.innerHTML = '';
        }

        const fragment = document.createDocumentFragment();
        const startIndex = append ? this.state.pulses.length - 20 : 0;
        
        this.state.pulses.slice(startIndex).forEach((pulse, index) => {
            const element = this._createPulseElement(pulse);
            fragment.appendChild(element);
            
            // Animate in
            setTimeout(() => {
                this.animator.fadeInUp(element, index * 50);
            }, 0);
        });

        this.config.feedContainer.appendChild(fragment);
        
        // Add intersection observer for last item (infinite scroll)
        this._observeLastItem();
    }

    _createPulseElement(pulse) {
        const element = document.createElement('article');
        element.className = 'pulse-item';
        element.dataset.pulseId = pulse.id;
        
        const timeAgo = this._formatTimeAgo(pulse.timestamp);
        const resonancePercent = Math.round(pulse.resonance * 100);
        
        element.innerHTML = `
            <div class="pulse-header">
                <div class="pulse-author">
                    <img class="author-avatar" src="${pulse.author.avatar || '/default-avatar.png'}" alt="${pulse.author.name}">
                    <span class="author-name">${pulse.author.name}</span>
                    <span class="pulse-time">${timeAgo}</span>
                </div>
                <div class="pulse-resonance" title="Resonance strength">
                    <svg class="resonance-icon" width="16" height="16" viewBox="0 0 16 16">
                        <circle cx="8" cy="8" r="7" stroke="currentColor" fill="none" stroke-width="1" opacity="0.3"/>
                        <circle cx="8" cy="8" r="7" stroke="currentColor" fill="none" stroke-width="1" 
                                stroke-dasharray="${resonancePercent * 0.44} 44" 
                                transform="rotate(-90 8 8)"/>
                    </svg>
                    <span class="resonance-value">${resonancePercent}%</span>
                </div>
            </div>
            
            <div class="pulse-content">
                <h3 class="pulse-title">${pulse.title}</h3>
                <p class="pulse-preview">${pulse.preview}</p>
                ${pulse.media ? this._renderMedia(pulse.media) : ''}
            </div>
            
            <div class="pulse-footer">
                <div class="pulse-tags">
                    ${pulse.tags.map(tag => `
                        <button class="pulse-tag" data-tag="${tag}">#${tag}</button>
                    `).join('')}
                </div>
                <div class="pulse-actions">
                    <button class="action-resonate" data-pulse-id="${pulse.id}" title="Resonate">
                        <span class="action-icon">🔄</span>
                        <span class="action-count">${pulse.resonators || 0}</span>
                    </button>
                    <button class="action-amplify" data-pulse-id="${pulse.id}" title="Amplify">
                        <span class="action-icon">📡</span>
                    </button>
                    <button class="action-entangle" data-pulse-id="${pulse.id}" title="Quantum Entangle">
                        <span class="action-icon">🔗</span>
                    </button>
                </div>
            </div>
        `;

        // Add event listeners
        this._attachPulseListeners(element, pulse);
        
        return element;
    }

    _attachPulseListeners(element, pulse) {
        // Click on pulse to view details
        element.addEventListener('click', (e) => {
            if (!e.target.closest('button')) {
                this.haptic.trigger('light');
                this.eventBus.emit('pulse:view', pulse);
            }
        });

        // Tag clicks
        element.querySelectorAll('.pulse-tag').forEach(tag => {
            tag.addEventListener('click', (e) => {
                e.stopPropagation();
                this.haptic.trigger('light');
                this._applyTagFilter(tag.dataset.tag);
            });
        });

        // Action buttons
        element.querySelector('.action-resonate')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._handleResonate(pulse);
        });

        element.querySelector('.action-amplify')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._handleAmplify(pulse);
        });

        element.querySelector('.action-entangle')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._handleEntangle(pulse);
        });
    }

    _renderMedia(media) {
        if (media.type === 'image') {
            return `<img class="pulse-media" src="${media.url}" alt="${media.alt || ''}" loading="lazy">`;
        } else if (media.type === 'glyph') {
            return `<div class="pulse-glyph" data-glyph-id="${media.glyphId}">${media.render}</div>`;
        }
        return '';
    }

    async _handleResonate(pulse) {
        this.haptic.trigger('success');
        
        // Optimistic UI update
        const button = document.querySelector(`.action-resonate[data-pulse-id="${pulse.id}"]`);
        const count = button.querySelector('.action-count');
        count.textContent = parseInt(count.textContent) + 1;
        button.classList.add('active');
        
        // Animate resonance effect
        this._animateResonance(button);
        
        // Send to backend
        try {
            await this.resonanceEngine.resonate(pulse.id);
            this.eventBus.emit('pulse:resonated', pulse);
        } catch (error) {
            // Revert on error
            count.textContent = parseInt(count.textContent) - 1;
            button.classList.remove('active');
        }
    }

    async _handleAmplify(pulse) {
        this.haptic.trigger('medium');
        this.eventBus.emit('pulse:amplify', pulse);
    }

    async _handleEntangle(pulse) {
        this.haptic.trigger('heavy');
        this.eventBus.emit('pulse:entangle', pulse);
    }

    _animateResonance(button) {
        const ripple = document.createElement('div');
        ripple.className = 'resonance-ripple';
        button.appendChild(ripple);
        
        setTimeout(() => ripple.remove(), 1000);
    }

    _handleScroll() {
        const container = this.config.feedContainer;
        this.state.scrollPosition = container.scrollTop;
        
        // Infinite scroll
        if (container.scrollTop + container.clientHeight >= container.scrollHeight - 100) {
            this._loadMore();
        }
    }

    async _loadMore() {
        if (this.state.loading) return;
        
        this.state.loading = true;
        await this.loadFeed(true);
        this.state.loading = false;
    }

    _observeLastItem() {
        const items = this.config.feedContainer.querySelectorAll('.pulse-item');
        const lastItem = items[items.length - 1];
        
        if (lastItem && this.intersectionObserver) {
            this.intersectionObserver.disconnect();
            this.intersectionObserver.observe(lastItem);
        }
    }

    _applyFilter(filterType) {
        this.state.filters.type = filterType;
        this.loadFeed();
    }

    _applyTagFilter(tag) {
        if (!this.state.filters.tags.includes(tag)) {
            this.state.filters.tags.push(tag);
        } else {
            this.state.filters.tags = this.state.filters.tags.filter(t => t !== tag);
        }
        this.loadFeed();
    }

    _handleNewPulse(pulse) {
        // Add to top of feed if open
        if (this.state.isOpen) {
            this.state.pulses.unshift(pulse);
            const element = this._createPulseElement(pulse);
            this.config.feedContainer.prepend(element);
            this.animator.slideInTop(element);
        }
    }

    _updateResonance(data) {
        // Update resonance values in real-time
        const element = document.querySelector(`[data-pulse-id="${data.pulseId}"]`);
        if (element) {
            const resonanceValue = element.querySelector('.resonance-value');
            const resonanceCircle = element.querySelector('.resonance-icon circle:last-child');
            
            if (resonanceValue) {
                resonanceValue.textContent = `${Math.round(data.resonance * 100)}%`;
            }
            
            if (resonanceCircle) {
                resonanceCircle.setAttribute('stroke-dasharray', `${data.resonance * 44} 44`);
            }
        }
    }

    _startAutoRefresh() {
        this._stopAutoRefresh();
        this.refreshTimer = setInterval(() => {
            this._checkForNewPulses();
        }, this.config.refreshInterval);
    }

    _stopAutoRefresh() {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = null;
        }
    }

    async _checkForNewPulses() {
        try {
            const latestId = this.state.pulses[0]?.id;
            const newPulses = await this.resonanceEngine.checkNewPulses(latestId);
            
            if (newPulses.length > 0) {
                this._showNewPulsesIndicator(newPulses.length);
            }
        } catch (error) {
            console.error('Failed to check for new pulses:', error);
        }
    }

    _showNewPulsesIndicator(count) {
        const indicator = document.createElement('button');
        indicator.className = 'new-pulses-indicator';
        indicator.innerHTML = `
            <span class="indicator-icon">↓</span>
            <span class="indicator-text">${count} new pulse${count > 1 ? 's' : ''}</span>
        `;
        
        indicator.addEventListener('click', () => {
            this.loadFeed();
            indicator.remove();
        });
        
        this.config.container.querySelector('.feed-header').appendChild(indicator);
        this.animator.bounceIn(indicator);
    }

    _formatTimeAgo(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const seconds = Math.floor((now - date) / 1000);
        
        if (seconds < 60) return 'just now';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h`;
        const days = Math.floor(hours / 24);
        if (days < 7) return `${days}d`;
        const weeks = Math.floor(days / 7);
        return `${weeks}w`;
    }

    _showLoading() {
        this.config.feedContainer.innerHTML = `
            <div class="feed-loading">
                <div class="spinner"></div>
                <p class="loading-text">Tuning into the resonance field...</p>
            </div>
        `;
    }

    _showError() {
        this.config.feedContainer.innerHTML = `
            <div class="feed-error">
                <span class="error-icon">⚠️</span>
                <p class="error-text">Unable to connect to the resonance field</p>
                <button class="retry-button">Try Again</button>
            </div>
        `;
        
        this.config.feedContainer.querySelector('.retry-button')?.addEventListener('click', () => {
            this.loadFeed();
        });
    }

    destroy() {
        this._stopAutoRefresh();
        this.eventBus.off('feed:open');
        this.eventBus.off('pulse:new');
        this.eventBus.off('resonance:update');
        
        if (this.intersectionObserver) {
            this.intersectionObserver.disconnect();
        }
    }
}
