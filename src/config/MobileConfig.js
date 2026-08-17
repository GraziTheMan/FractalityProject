// src/config/MobileConfig.js
// Centralized mobile theme + behaviour configuration.

export class MobileConfig {
    constructor() {
        this.theme = {
            colors: {
                primary: '#8b5cf6',
                secondary: '#6ee7b7',
                background: {
                    dark: '#0a0a0a',
                    medium: '#1a1a1a',
                    light: '#2a2a2a'
                },
                text: {
                    primary: '#e4e4e7',
                    secondary: '#a1a1aa'
                }
            }
        };

        this.animations = {
            duration: 300,
            easing: 'cubic-bezier(0.4, 0, 0.2, 1)'
        };

        this.feed = {
            refreshInterval: 30000,
            itemsPerPage: 20
        };

        this.menuCategories = [
            {
                id: 'bubble_view',
                icon: '🌐',
                label: 'Bubble View',
                color: this.theme.colors.primary,
                subnodes: [
                    { id: 'resonance_map', label: '🔮 Resonance', action: 'view:resonance' },
                    { id: 'gravity_map', label: '🌌 Gravity', action: 'view:gravity' },
                    { id: 'energy_field', label: '⚡ Energy', action: 'view:energy' }
                ]
            },
            {
                id: 'editor',
                icon: '🧠',
                label: 'Node Editor',
                color: this.theme.colors.secondary,
                subnodes: [
                    { id: 'ai_drawer', label: '🤖 AI Assist', action: 'editor:ai' },
                    { id: 'manual_entry', label: '✍️ Manual', action: 'editor:manual' },
                    { id: 'voice_input', label: '🎤 Voice', action: 'editor:voice' }
                ]
            },
            {
                id: 'resonance_feed',
                icon: '📡',
                label: 'Feed',
                color: '#f59e0b',
                action: 'openFeed'
            },
            {
                id: 'consciousness',
                icon: '🌟',
                label: 'Consciousness',
                color: '#ec4899',
                subnodes: [
                    { id: 'personal_field', label: '👤 Personal', action: 'consciousness:personal' },
                    { id: 'collective_field', label: '🌍 Collective', action: 'consciousness:collective' },
                    { id: 'quantum_state', label: '⚛️ Quantum', action: 'consciousness:quantum' }
                ]
            }
        ];

        this.debug = {
            performanceMonitoring: true,
            eventLogging: false
        };
    }

    getHandedness() {
        return localStorage.getItem('handedness') || 'right';
    }

    setHandedness(hand) {
        localStorage.setItem('handedness', hand);
    }
}
