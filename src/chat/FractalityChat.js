// src/chat/FractalityChat.js
import { EventEmitter } from 'events';
import { OpenAI } from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ContextManager } from './ContextManager.js';
import { ChatMemoryStore } from './ChatMemoryStore.js';
import { AIResponseHandler } from './AIResponseHandler.js';
import { ChatSession } from './ChatSession.js';
import { generateId } from '../utils/helpers.js';

export class FractalityChat extends EventEmitter {
    constructor(config) {
        super();
        this.sessions = new Map();
        this.activeSession = null;
        
        // Initialize API clients
        this.apis = {
            claude: new Anthropic({ apiKey: config.claudeKey }),
            gpt: new OpenAI({ apiKey: config.openaiKey }),
            gemini: new GoogleGenerativeAI(config.geminiKey),
            // Add more as needed
        };
        
        // Context management
        this.contextManager = new ContextManager();
        this.memoryStore = new ChatMemoryStore();
        this.responseHandler = new AIResponseHandler(this.apis, this.contextManager);
    }
    
    async createSession(sessionId, participants) {
        const session = new ChatSession(sessionId, participants);
        this.sessions.set(sessionId, session);
        
        // Initialize context for each AI participant
        for (const participant of participants) {
            if (participant.type === 'ai') {
                await this.contextManager.initializeContext(
                    sessionId, 
                    participant.id,
                    participant.personality
                );
            }
        }
        
        this.emit('sessionCreated', session);
        return session;
    }
    
    async sendMessage(sessionId, senderId, message) {
        const session = this.sessions.get(sessionId);
        if (!session) throw new Error('Session not found');
        
        // Store the message
        const msg = {
            id: generateId(),
            sessionId,
            senderId,
            senderName: this.getParticipantName(session, senderId),
            content: message,
            timestamp: Date.now(),
            type: 'human'
        };
        
        session.addMessage(msg);
        await this.memoryStore.save(msg);
        
        this.emit('messageSent', msg);
        
        // Get AI responses
        const responses = await this.getAIResponses(session, msg);
        
        return { message: msg, responses };
    }
    
    async getAIResponses(session, humanMessage) {
        const responses = [];
        
        for (const participant of session.participants) {
            if (participant.type === 'ai' && participant.active) {
                try {
                    const response = await this.responseHandler.getResponse(
                        session,
                        participant,
                        humanMessage
                    );
                    responses.push(response);
                    
                    await this.memoryStore.save(response);
                    this.emit('aiResponse', response);
                    
                } catch (error) {
                    console.error(`Error getting response from ${participant.id}:`, error);
                    this.emit('aiError', { participant, error });
                }
            }
        }
        
        return responses;
    }
    
    getParticipantName(session, participantId) {
        const participant = session.participants.find(p => p.id === participantId);
        if (!participant) return participantId;
        
        if (participant.type === 'human') {
            return participant.name || 'Human';
        } else {
            return participant.personality?.name || participant.id;
        }
    }
    
    async getSessionHistory(sessionId) {
        return await this.memoryStore.getSessionHistory(sessionId);
    }
    
    async searchSimilarConversations(query) {
        return await this.memoryStore.searchSimilarConversations(query);
    }
    
    getActiveSession() {
        return this.activeSession;
    }
    
    setActiveSession(sessionId) {
        this.activeSession = this.sessions.get(sessionId);
        this.emit('activeSessionChanged', this.activeSession);
    }
    
    async closeSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) return;
        
        session.endTime = Date.now();
        await this.memoryStore.saveSessionMetadata(session);
        
        this.sessions.delete(sessionId);
        this.emit('sessionClosed', sessionId);
    }
}