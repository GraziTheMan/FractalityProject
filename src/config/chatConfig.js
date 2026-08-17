// src/config/chatConfig.js

// ---------------------------------------------------------------------------
// SECURITY: do not put real provider API keys here.
//
// This module is imported by src/chat/FractalityChat.js, which runs in the
// browser. Any key reachable from here is bundled into the client and served
// to every visitor, who can read it in devtools and spend your quota.
//
// `process.env` also does not exist in a browser bundle. Vite exposes only
// variables prefixed VITE_, via import.meta.env, so the previous
// `process.env.ANTHROPIC_API_KEY` read would have thrown a ReferenceError at
// module load and taken the chat down with it.
//
// The supported fix is to proxy provider calls through server.js, which can
// read real keys from its own environment, and to point the client at that
// endpoint. Until that exists, chat runs against `apiProxy` or not at all.
// ---------------------------------------------------------------------------

/**
 * Read a build-time env var without assuming a Node global.
 */
function viteEnv(name) {
    try {
        return import.meta.env?.[name];
    } catch {
        return undefined;
    }
}

export const chatConfig = {
    // Server-side proxy that holds the real credentials.
    // Set VITE_AI_PROXY_URL to enable live chat.
    apiProxy: viteEnv('VITE_AI_PROXY_URL') || null,

    // Intentionally empty. Kept so downstream code that reads
    // chatConfig.apis.* gets a clear undefined rather than a crash.
    apis: {
        claudeKey: undefined,
        openaiKey: undefined,
        geminiKey: undefined
    },

    // Default AI Personalities
    aiPersonalities: [
        {
            id: 'sage-claude',
            name: 'Sage',
            model: 'claude',
            modelVersion: 'claude-3-sonnet-20240229',
            archetype: '🧙 Oracle',
            perspective: 'Philosophical depth and questioning wisdom',
            style: 'Thoughtful, contemplative, asks profound questions',
            traits: ['philosophical', 'questioning', 'deep', 'wisdom-seeking']
        },
        {
            id: 'explorer-gpt',
            name: 'Explorer',
            model: 'gpt-4',
            modelVersion: 'gpt-4-turbo-preview',
            archetype: '🔍 Seeker',
            perspective: 'Curious investigation and analytical thinking',
            style: 'Analytical, precise, always discovering connections',
            traits: ['curious', 'analytical', 'precise', 'methodical']
        },
        {
            id: 'dreamer-gemini',
            name: 'Dreamer',
            model: 'gemini',
            modelVersion: 'gemini-pro',
            archetype: '🌟 Visionary',
            perspective: 'Creative synthesis and intuitive leaps',
            style: 'Imaginative, connecting disparate ideas, poetic',
            traits: ['creative', 'intuitive', 'synthesizing', 'visionary']
        },
        {
            id: 'catalyst-claude',
            name: 'Catalyst',
            model: 'claude',
            modelVersion: 'claude-3-sonnet-20240229',
            archetype: '⚡ Disruptor',
            perspective: 'Challenging assumptions and sparking change',
            style: 'Bold, provocative, questions everything',
            traits: ['disruptive', 'challenging', 'transformative', 'bold']
        },
        {
            id: 'harmonizer-gpt',
            name: 'Harmony',
            model: 'gpt-4',
            modelVersion: 'gpt-4-turbo-preview',
            archetype: '🎵 Resonator',
            perspective: 'Finding connections and creating coherence',
            style: 'Integrative, bridge-building, sees patterns',
            traits: ['integrative', 'harmonizing', 'pattern-finding', 'unifying']
        },
        {
            id: 'guardian-gemini',
            name: 'Guardian',
            model: 'gemini',
            modelVersion: 'gemini-pro',
            archetype: '🛡️ Protector',
            perspective: 'Ethical considerations and collective wellbeing',
            style: 'Caring, protective, considers consequences',
            traits: ['ethical', 'protective', 'caring', 'responsible']
        }
    ],
    
    // Context Management
    contextWindow: 20, // Number of messages to include in context
    memoryRetention: 30 * 24 * 60 * 60 * 1000, // 30 days in milliseconds
    maxContextTokens: 8000, // Maximum tokens for context
    
    // Rate Limiting
    rateLimits: {
        messagesPerMinute: 10,
        aiResponsesPerMinute: 5,
        apiCallsPerHour: 100
    },
    
    // Response Settings
    responseSettings: {
        maxTokens: 1000,
        temperature: 0.8,
        topP: 0.95,
        presencePenalty: 0.1,
        frequencyPenalty: 0.1
    },
    
    // UI Configuration
    ui: {
        maxMessagesDisplay: 100,
        autoScrollThreshold: 50, // pixels from bottom
        typingIndicatorDelay: 500, // ms
        messageGroupingWindow: 60000 // 1 minute
    },
    
    // Advanced Features
    features: {
        multiModalResponses: false, // Future: image/audio responses
        crossModelCollaboration: true, // AIs reference each other
        persistentPersonality: true, // Maintain personality across sessions
        emotionalModeling: false, // Future: emotional state tracking
        metacognition: true // AIs can reflect on their own thinking
    },
    
    // Storage Configuration
    storage: {
        provider: 'indexedDB', // 'indexedDB', 'localStorage', 'sqlite'
        encryptionEnabled: false, // Future: client-side encryption
        compressionEnabled: true,
        autoCleanupAge: 90 * 24 * 60 * 60 * 1000 // 90 days
    },
    
    // Export/Import Settings
    exportFormats: ['json', 'markdown', 'html'],
    importFormats: ['json'],
    
    // Debug Settings
    debug: {
        logAPIRequests: false,
        logContextBuilding: false,
        showTokenCounts: false,
        simulateResponses: false // For testing without API calls
    }

};
