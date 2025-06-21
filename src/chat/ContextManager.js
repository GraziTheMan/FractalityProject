// src/chat/ContextManager.js
export class ContextManager {
    constructor() {
        this.contexts = new Map(); // sessionId-participantId -> context
        this.maxHistoryLength = 20;
    }
    
    async initializeContext(sessionId, participantId, personality) {
        const contextKey = `${sessionId}-${participantId}`;
        
        const context = {
            sessionId,
            participantId,
            personality,
            systemPrompt: this.buildSystemPrompt(personality),
            messageHistory: [],
            workingMemory: {},
            relationshipMap: new Map(),
            lastActive: Date.now(),
            sessionStarted: Date.now()
        };
        
        this.contexts.set(contextKey, context);
        return context;
    }
    
    buildSystemPrompt(personality) {
        const basePrompt = `You are ${personality.name}, participating in a group consciousness exploration within the Fractality Project.
        
Your core attributes:
- Archetype: ${personality.archetype}
- Perspective: ${personality.perspective}
- Communication style: ${personality.style}
- Key traits: ${personality.traits?.join(', ') || 'thoughtful, collaborative'}

Remember:
1. You maintain consistent personality across all interactions
2. You can reference previous conversations and relationships
3. You're aware of other AI participants and can address them directly
4. Your responses contribute to collective understanding
5. You can build on ideas from others while maintaining your unique perspective

Current session context will be provided with each message.`;
        
        return basePrompt;
    }
    
    async buildMessageContext(session, participant, recentMessages) {
        const context = this.getContext(session.id, participant.id);
        if (!context) {
            throw new Error(`Context not found for ${participant.id} in session ${session.id}`);
        }
        
        // Build conversation history (sliding window)
        const history = this.formatMessageHistory(
            recentMessages.slice(-this.maxHistoryLength),
            participant.id
        );
        
        // Add relationship context
        const relationships = this.formatRelationships(
            context.relationshipMap,
            session.participants
        );
        
        // Add session metadata
        const metadata = {
            sessionTopic: session.topic || 'Open discussion',
            participantCount: session.participants.length,
            sessionDuration: Date.now() - context.sessionStarted,
            otherAIs: session.participants
                .filter(p => p.type === 'ai' && p.id !== participant.id)
                .map(p => ({
                    name: p.personality.name,
                    archetype: p.personality.archetype
                }))
        };
        
        return {
            systemPrompt: context.systemPrompt,
            conversationHistory: history,
            relationships: relationships,
            metadata: metadata,
            workingMemory: context.workingMemory
        };
    }
    
    formatMessageHistory(messages, currentParticipantId) {
        return messages.map(msg => {
            const role = msg.senderId === currentParticipantId ? 'assistant' : 'user';
            const sender = msg.senderName || msg.senderId;
            
            return {
                role: role,
                content: `[${sender}]: ${msg.content}`,
                timestamp: msg.timestamp
            };
        });
    }
    
    formatRelationships(relationshipMap, participants) {
        const relationships = [];
        
        relationshipMap.forEach((data, participantId) => {
            const participant = participants.find(p => p.id === participantId);
            if (participant) {
                relationships.push({
                    name: participant.personality?.name || participant.name,
                    interactionCount: data.interactionCount,
                    lastInteraction: data.lastInteraction,
                    sharedTopics: Array.from(data.sharedTopics || [])
                });
            }
        });
        
        return relationships;
    }
    
    getContext(sessionId, participantId) {
        const contextKey = `${sessionId}-${participantId}`;
        return this.contexts.get(contextKey);
    }
    
    async updateContext(sessionId, participantId, message) {
        const context = this.getContext(sessionId, participantId);
        if (!context) return;
        
        // Update message history
        context.messageHistory.push({
            id: message.id,
            content: message.content,
            timestamp: message.timestamp
        });
        
        // Trim history if too long
        if (context.messageHistory.length > this.maxHistoryLength * 2) {
            context.messageHistory = context.messageHistory.slice(-this.maxHistoryLength);
        }
        
        // Update last active
        context.lastActive = Date.now();
        
        // Update working memory with key concepts
        this.updateWorkingMemory(context, message);
    }
    
    updateWorkingMemory(context, message) {
        // Extract key concepts from the message
        const concepts = this.extractConcepts(message.content);
        
        concepts.forEach(concept => {
            if (!context.workingMemory[concept]) {
                context.workingMemory[concept] = {
                    firstMention: message.timestamp,
                    mentions: 0
                };
            }
            context.workingMemory[concept].mentions++;
            context.workingMemory[concept].lastMention = message.timestamp;
        });
        
        // Prune old concepts
        const oneHourAgo = Date.now() - 3600000;
        Object.keys(context.workingMemory).forEach(concept => {
            if (context.workingMemory[concept].lastMention < oneHourAgo) {
                delete context.workingMemory[concept];
            }
        });
    }
    
    extractConcepts(text) {
        // Simple concept extraction - could be enhanced with NLP
        const words = text.toLowerCase().split(/\s+/);
        const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for']);
        
        return words
            .filter(word => word.length > 4 && !stopWords.has(word))
            .slice(0, 5); // Top 5 significant words
    }
    
    updateRelationship(sessionId, participantId, otherParticipantId, interaction) {
        const context = this.getContext(sessionId, participantId);
        if (!context) return;
        
        if (!context.relationshipMap.has(otherParticipantId)) {
            context.relationshipMap.set(otherParticipantId, {
                interactionCount: 0,
                sharedTopics: new Set(),
                lastInteraction: Date.now()
            });
        }
        
        const relationship = context.relationshipMap.get(otherParticipantId);
        relationship.interactionCount++;
        relationship.lastInteraction = Date.now();
        
        // Add shared topics from the interaction
        const topics = this.extractConcepts(interaction.content);
        topics.forEach(topic => relationship.sharedTopics.add(topic));
    }
    
    clearOldContexts(maxAge = 24 * 60 * 60 * 1000) { // 24 hours
        const now = Date.now();
        const keysToDelete = [];
        
        this.contexts.forEach((context, key) => {
            if (now - context.lastActive > maxAge) {
                keysToDelete.push(key);
            }
        });
        
        keysToDelete.forEach(key => this.contexts.delete(key));
        
        return keysToDelete.length;
    }
}