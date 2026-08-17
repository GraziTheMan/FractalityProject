// src/intelligence/ResonanceEngine.js
// Client for the resonance network (the social feed of "pulses").
//
// STATUS: local-only implementation. The network protocol this was meant to
// speak does not exist yet, so this backs onto localStorage and generated
// sample data. The public API below is the contract MobileApp and
// ResonanceFeedController already depend on — keep it stable when a real
// transport is added, and swap the _fetch* internals only.

const STORAGE_KEY = 'fractality:resonance:pulses';

export class ResonanceEngine {
    constructor(options = {}) {
        this.eventBus = options.eventBus || null;
        this.endpoint = options.endpoint || null;

        this.connected = false;
        this.lowPowerMode = false;

        // Latency tracking, reported via getLatency()
        this._latencySamples = [];
        this._maxLatencySamples = 20;

        // Resonances the user has given, so the UI can render state on reload
        this._resonated = new Set();
    }

    /**
     * Connect to the resonance network.
     * With no endpoint configured this resolves immediately in offline mode.
     */
    async connect() {
        const started = performance.now();

        if (!this.endpoint) {
            this.connected = true;
            this._recordLatency(performance.now() - started);
            this.eventBus?.emit('resonance:connected', { offline: true });
            return { offline: true };
        }

        try {
            const res = await fetch(`${this.endpoint}/health`);
            if (!res.ok) throw new Error(`Resonance endpoint returned ${res.status}`);

            this.connected = true;
            this._recordLatency(performance.now() - started);
            this.eventBus?.emit('resonance:connected', { offline: false });
            return { offline: false };
        } catch (error) {
            // Degrade to offline rather than failing app startup
            this.connected = true;
            this._recordLatency(performance.now() - started);
            this.eventBus?.emit('resonance:connected', { offline: true, error });
            return { offline: true, error };
        }
    }

    disconnect() {
        this.connected = false;
        this.eventBus?.emit('resonance:disconnected');
    }

    /**
     * Fetch a page of pulses.
     * @param {{filters?: object, offset?: number, limit?: number}} params
     * @returns {Promise<Array>} pulses, newest first
     */
    async fetchResonantPulses({ filters = {}, offset = 0, limit = 20 } = {}) {
        const started = performance.now();
        const all = this._loadPulses();

        const filtered = all.filter(pulse => {
            if (filters.tag && !(pulse.tags || []).includes(filters.tag)) return false;
            if (filters.author && pulse.author !== filters.author) return false;
            if (typeof filters.minResonance === 'number' &&
                pulse.resonanceCount < filters.minResonance) return false;
            return true;
        });

        const page = filtered
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(offset, offset + limit)
            .map(pulse => ({ ...pulse, hasResonated: this._resonated.has(pulse.id) }));

        this._recordLatency(performance.now() - started);
        return page;
    }

    /**
     * Register the user resonating with a pulse. Idempotent.
     */
    async resonate(pulseId) {
        if (this._resonated.has(pulseId)) return { pulseId, alreadyResonated: true };

        const pulses = this._loadPulses();
        const pulse = pulses.find(p => p.id === pulseId);
        if (!pulse) throw new Error(`Unknown pulse: ${pulseId}`);

        pulse.resonanceCount = (pulse.resonanceCount || 0) + 1;
        this._resonated.add(pulseId);
        this._savePulses(pulses);

        this.eventBus?.emit('resonance:given', { pulseId });
        return { pulseId, resonanceCount: pulse.resonanceCount };
    }

    /**
     * Pulses newer than `latestId`. Returns [] when caller has the newest.
     */
    async checkNewPulses(latestId) {
        const pulses = this._loadPulses().sort((a, b) => b.timestamp - a.timestamp);
        if (!latestId) return [];

        const index = pulses.findIndex(p => p.id === latestId);
        return index <= 0 ? [] : pulses.slice(0, index);
    }

    /**
     * Publish a new pulse locally.
     */
    async publishPulse({ content, author = 'local', tags = [] }) {
        const pulses = this._loadPulses();
        const pulse = {
            id: `pulse-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            content,
            author,
            tags,
            timestamp: Date.now(),
            resonanceCount: 0
        };

        pulses.push(pulse);
        this._savePulses(pulses);
        this.eventBus?.emit('pulse:published', pulse);
        return pulse;
    }

    enterLowPowerMode() {
        this.lowPowerMode = true;
        this.eventBus?.emit('resonance:lowPower', true);
    }

    exitLowPowerMode() {
        this.lowPowerMode = false;
        this.eventBus?.emit('resonance:lowPower', false);
    }

    /**
     * Rolling mean latency in ms, or 0 before any samples.
     */
    getLatency() {
        if (this._latencySamples.length === 0) return 0;
        const sum = this._latencySamples.reduce((a, b) => a + b, 0);
        return Math.round(sum / this._latencySamples.length);
    }

    // --- internals -------------------------------------------------------

    _recordLatency(ms) {
        this._latencySamples.push(ms);
        if (this._latencySamples.length > this._maxLatencySamples) {
            this._latencySamples.shift();
        }
    }

    _loadPulses() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) return JSON.parse(raw);
        } catch (error) {
            console.warn('ResonanceEngine: could not read stored pulses', error);
        }

        // Seed so the feed has something to render on first run
        const seed = this._generateSeedPulses();
        this._savePulses(seed);
        return seed;
    }

    _savePulses(pulses) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(pulses));
        } catch (error) {
            console.warn('ResonanceEngine: could not persist pulses', error);
        }
    }

    _generateSeedPulses() {
        const seeds = [
            { content: 'Consciousness may be what recursion feels like from the inside.', tags: ['consciousness', 'recursion'] },
            { content: 'Every mind map is a compression of a life.', tags: ['mindmap'] },
            { content: 'Resonance is cheaper than agreement.', tags: ['social', 'resonance'] },
            { content: 'The golden angle shows up wherever growth avoids its own history.', tags: ['math', 'fractal'] }
        ];

        const now = Date.now();
        return seeds.map((seed, i) => ({
            id: `pulse-seed-${i}`,
            content: seed.content,
            author: 'fractality',
            tags: seed.tags,
            timestamp: now - i * 3600_000,
            resonanceCount: 0
        }));
    }
}
