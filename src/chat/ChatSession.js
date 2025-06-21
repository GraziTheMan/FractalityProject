// src/chat/ChatSession.js
export class ChatSession {
    constructor(id, participants) {
        this.id = id;
        this.participants = participants;
        this.messages = [];
        this.startTime = Date.now();
        this.endTime = null;
        this.topic = null;
        this.metadata = {
            messageCount: 0,
            aiResponseCount: 0,
            humanMessageCount: 0,
            totalTokens: 0
        };
    }
    
    addMessage(message) {
        this.messages.push(message);
        this.metadata.messageCount++;
        
        if (message.type === 'ai') {
            this.metadata.aiResponseCount++;
        } else if (message.type === 'human') {
            this.metadata.humanMessageCount++;
        }
        
        // Estimate tokens (rough approximation)
        this.metadata.totalTokens += Math.ceil(message.content.length / 4);
    }
    
    getParticipant(participantId) {
        return this.participants.find(p => p.id === participantId);
    }
    
    setParticipantActive(participantId, active) {
        const participant = this.getParticipant(participantId);
        if (participant) {
            participant.active = active;
        }
    }
    
    addParticipant(participant) {
        if (!this.participants.find(p => p.id === participant.id)) {
            this.participants.push(participant);
        }
    }
    
    removeParticipant(participantId) {
        this.participants = this.participants.filter(p => p.id !== participantId);
    }
    
    getActiveAIParticipants() {
        return this.participants.filter(p => p.type === 'ai' && p.active);
    }
    
    getHumanParticipants() {
        return this.participants.filter(p => p.type === 'human');
    }
    
    setTopic(topic) {
        this.topic = topic;
    }
    
    getDuration() {
        const endTime = this.endTime || Date.now();
        return endTime - this.startTime;
    }
    
    getLastMessages(count = 10) {
        return this.messages.slice(-count);
    }
    
    getMessagesSince(timestamp) {
        return this.messages.filter(m => m.timestamp > timestamp);
    }
    
    toJSON() {
        return {
            id: this.id,
            participants: this.participants,
            messages: this.messages,
            startTime: this.startTime,
            endTime: this.endTime,
            topic: this.topic,
            metadata: this.metadata
        };
    }
    
    static fromJSON(data) {
        const session = new ChatSession(data.id, data.participants);
        session.messages = data.messages;
        session.startTime = data.startTime;
        session.endTime = data.endTime;
        session.topic = data.topic;
        session.metadata = data.metadata;
        return session;
    }
}