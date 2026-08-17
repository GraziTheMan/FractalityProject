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

        pulse.resonators = (pulse.resonators || 0) + 1;
        // `resonance` is the 0..1 strength the feed renders as a ring; derive it
        // from the resonator count with diminishing returns so it saturates
        // rather than clipping at 1 after a handful of votes.
        pulse.resonance = 1 - Math.pow(0.9, pulse.resonators);

        this._resonated.add(pulseId);
        this._savePulses(pulses);

        this.eventBus?.emit('resonance:given', { pulseId });
        return { pulseId, resonators: pulse.resonators, resonance: pulse.resonance };
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
     *
     * The field names here are dictated by ResonanceFeedController, which
     * renders them — see the schema note at the bottom of this file.
     */
    async publishPulse({ title, preview = '', author, tags = [], media = null }) {
        const pulses = this._loadPulses();
        const pulse = {
            id: `pulse-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            title,
            preview,
            author: this._normalizeAuthor(author),
            tags,
            media,
            timestamp: Date.now(),
            resonance: 0,
            resonators: 0
        };

        pulses.push(pulse);
        this._savePulses(pulses);
        this.eventBus?.emit('pulse:published', pulse);
        return pulse;
    }

    /**
     * Accept either a bare name or a full author object; the feed UI always
     * reads `author.name` and `author.avatar`.
     */
    _normalizeAuthor(author) {
        if (!author) return { id: 'local', name: 'You', avatar: null };
        if (typeof author === 'string') return { id: author, name: author, avatar: null };
        return {
            id: author.id ?? author.name ?? 'unknown',
            name: author.name ?? 'Unknown',
            avatar: author.avatar ?? null
        };
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
            {
                title: 'Recursion from the inside',
                preview: 'Consciousness may be what recursion feels like from the inside.',
                tags: ['consciousness', 'recursion']
            },
            {
                title: 'Maps as compression',
                preview: 'Every mind map is a compression of a life.',
                tags: ['mindmap']
            },
            {
                title: 'Resonance over agreement',
                preview: 'Resonance is cheaper than agreement, and travels further.',
                tags: ['social', 'resonance']
            },
            {
                title: 'The golden angle',
                preview: 'It shows up wherever growth needs to avoid its own history.',
                tags: ['math', 'fractal']
            }
        ];

        const now = Date.now();
        return seeds.map((seed, i) => ({
            id: `pulse-seed-${i}`,
            title: seed.title,
            preview: seed.preview,
            author: { id: 'fractality', name: 'Fractality', avatar: null },
            tags: seed.tags,
            media: null,
            timestamp: now - i * 3600_000,
            resonance: 0,
            resonators: 0
        }));
    }
}

// --- Pulse schema ----------------------------------------------------------
//
// Defined by what ResonanceFeedController._createPulseElement() renders. When
// this moves to a real backend, this is the shape the API must return, and a
// reasonable basis for the Neo4j (:Pulse) node plus its [:POSTED_BY] and
// [:RESONATED_WITH] relationships.
//
//   id         string   stable identifier
//   title      string   headline, rendered as <h3>
//   preview    string   body text / excerpt
//   author     object   { id, name, avatar }  — avatar may be null
//   tags       string[] rendered as clickable #tag filters
//   media      object   null, or { type: 'image', url, alt }
//                             or { type: 'glyph', glyphId, render }
//   timestamp  number   epoch ms, rendered as "time ago"
//   resonance  number   0..1 strength, drawn as a progress ring
//   resonators number   count of users who resonated
//
// Server-side additions to expect: visibility (see PrivacyLevel in
// core/users/consciousness_user.py), a moderation/report state, and an
// edited/deleted marker.

