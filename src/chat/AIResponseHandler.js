// src/chat/AIResponseHandler.js
import { generateId } from '../utils/helpers.js';

export class AIResponseHandler {
    constructor(apis, contextManager) {
        this.apis = apis;
        this.contextManager = contextManager;
    }
    
    async getResponse(session, participant, triggerMessage) {
        const context = await this.contextManager.buildMessageContext(
            session,
            participant,
            session.messages
        );
        
        try {
            let response;
            
            switch (participant.model) {
                case 'claude':
                    response = await this.getClaudeResponse(context, participant);
                    break;
                case 'gpt-4':
                case 'gpt-3.5':
                    response = await this.getGPTResponse(context, participant);
                    break;
                case 'gemini':
                    response = await this.getGeminiResponse(context, participant);
                    break;
                default:
                    throw new Error(`Unknown model: ${participant.model}`);
            }
            
            // Store the response
            const aiMessage = {
                id: generateId(),
                sessionId: session.id,
                senderId: participant.id,
                senderName: participant.personality.name,
                content: response,
                timestamp: Date.now(),
                type: 'ai',
                model: participant.model,
                modelVersion: participant.modelVersion
            };
            
            session.addMessage(aiMessage);
            
            // Update context
            await this.contextManager.updateContext(
                session.id,
                participant.id,
                aiMessage
            );
            
            // Update relationships
            this.updateRelationships(session, participant, triggerMessage);
            
            return aiMessage;
            
        } catch (error) {
            console.error(`Error getting ${participant.model} response:`, error);
            throw error;
        }
    }
    
    async getClaudeResponse(context, participant) {
        const messages = this.formatMessagesForClaude(context);
        
        const response = await this.apis.claude.messages.create({
            model: participant.modelVersion || 'claude-3-sonnet-20240229',
            max_tokens: 1000,
            messages: messages,
            system: context.systemPrompt,
            metadata: {
                user_id: context.sessionId
            }
        });
        
        return response.content[0].text;
    }
    
    async getGPTResponse(context, participant) {
        const messages = [
            { role: 'system', content: this.buildGPTSystemPrompt(context) },
            ...this.formatMessagesForGPT(context)
        ];
        
        const response = await this.apis.gpt.chat.completions.create({
            model: participant.modelVersion || 'gpt-4-turbo-preview',
            messages: messages,
            max_tokens: 1000,
            temperature: 0.8,
            user: context.sessionId
        });
        
        return response.choices[0].message.content;
    }
    
    async getGeminiResponse(context, participant) {
        const model = this.apis.gemini.getGenerativeModel({ 
            model: participant.modelVersion || 'gemini-pro' 
        });
        
        const prompt = this.buildGeminiPrompt(context);
        
        const result = await model.generateContent(prompt);
        const response = await result.response;
        
        return response.text();
    }
    
    formatMessagesForClaude(context) {
        // Claude expects user/assistant alternation
        const messages = [];
        let lastRole = null;
        
        context.conversationHistory.forEach(msg => {
            // Claude format extracts the actual content without the [sender] prefix
            const content = msg.content.replace(/^\[[^\]]+\]:\s*/, '');
            const role = msg.role === 'assistant' ? 'assistant' : 'user';
            
            // Ensure alternation
            if (role === lastRole) {
                // Combine with previous message
                messages[messages.length - 1].content += '\n\n' + content;
            } else {
                messages.push({ role, content });
                lastRole = role;
            }
        });
        
        // Ensure we end with a user message
        if (messages.length > 0 && messages[messages.length - 1].role === 'assistant') {
            messages.push({ role: 'user', content: 'Please continue the conversation.' });
        }
        
        return messages;
    }
    
    formatMessagesForGPT(context) {
        // GPT can handle the format as-is
        return context.conversationHistory;
    }
    
    buildGPTSystemPrompt(context) {
        let prompt = context.systemPrompt + '\n\n';
        
        if (context.metadata.otherAIs.length > 0) {
            prompt += 'Other AI participants in this conversation:\n';
            context.metadata.otherAIs.forEach(ai => {
                prompt += `- ${ai.name} (${ai.archetype})\n`;
            });
            prompt += '\n';
        }
        
        if (context.relationships.length > 0) {
            prompt += 'Your relationships with other participants:\n';
            context.relationships.forEach(rel => {
                prompt += `- ${rel.name}: ${rel.interactionCount} interactions`;
                if (rel.sharedTopics.length > 0) {
                    prompt += ` (topics: ${rel.sharedTopics.join(', ')})`;
                }
                prompt += '\n';
            });
        }
        
        return prompt;
    }
    
    buildGeminiPrompt(context) {
        let prompt = context.systemPrompt + '\n\n';
        prompt += 'Current conversation:\n\n';
        
        context.conversationHistory.forEach(msg => {
            prompt += msg.content + '\n\n';
        });
        
        prompt += '\nYour response:';
        
        return prompt;
    }
    
    updateRelationships(session, aiParticipant, triggerMessage) {
        // Update relationship with the human who triggered this response
        this.contextManager.updateRelationship(
            session.id,
            aiParticipant.id,
            triggerMessage.senderId,
            triggerMessage
        );
        
        // If the message references other AIs, update those relationships too
        session.participants.forEach(otherParticipant => {
            if (otherParticipant.type === 'ai' && 
                otherParticipant.id !== aiParticipant.id &&
                triggerMessage.content.includes(otherParticipant.personality.name)) {
                
                this.contextManager.updateRelationship(
                    session.id,
                    aiParticipant.id,
                    otherParticipant.id,
                    triggerMessage
                );
            }
        });
    }
}