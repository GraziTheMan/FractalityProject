// src/chat/ChatInterface.js
import { FractalityChat } from './FractalityChat.js';
import { chatConfig } from '../config/chatConfig.js';

export class ChatInterface {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.chat = new FractalityChat(chatConfig.apis);
        this.currentSession = null;
        
        this.render();
        this.attachEventListeners();
        this.setupChatEventListeners();
    }
    
    render() {
        this.container.innerHTML = `
            <div class="fractality-chat">
                <div class="chat-header">
                    <h2>🌌 Fractality Consciousness Forum</h2>
                    <div class="header-controls">
                        <button id="new-session" class="btn btn-primary">New Session</button>
                        <button id="add-participant" class="btn btn-secondary">Add AI</button>
                        <button id="session-history" class="btn btn-secondary">History</button>
                    </div>
                </div>
                
                <div class="participants-bar" id="participants-bar">
                    <!-- Participant avatars here -->
                </div>
                
                <div class="chat-main">
                    <div class="chat-messages" id="messages">
                        <div class="welcome-message">
                            <h3>Welcome to the Consciousness Forum</h3>
                            <p>Start a new session to begin exploring ideas with AI companions.</p>
                        </div>
                    </div>
                    
                    <div class="chat-sidebar">
                        <h3>Active Minds</h3>
                        <div id="ai-participants"></div>
                        
                        <h3>Session Context</h3>
                        <div id="session-context">
                            <div class="context-item">
                                <span class="label">Duration:</span>
                                <span id="session-duration">--:--</span>
                            </div>
                            <div class="context-item">
                                <span class="label">Messages:</span>
                                <span id="message-count">0</span>
                            </div>
                            <div class="context-item">
                                <span class="label">Topic:</span>
                                <input type="text" id="session-topic" placeholder="Set topic...">
                            </div>
                        </div>
                        
                        <h3>Key Concepts</h3>
                        <div id="key-concepts"></div>
                    </div>
                </div>
                
                <div class="chat-input-area">
                    <div class="input-controls">
                        <select id="response-mode">
                            <option value="all">All AIs Respond</option>
                            <option value="round-robin">Round Robin</option>
                            <option value="relevant">Most Relevant</option>
                        </select>
                    </div>
                    <textarea id="message-input" 
                              placeholder="Share your thoughts with the collective consciousness..."
                              rows="3"></textarea>
                    <button id="send-btn" class="btn btn-primary">Send</button>
                </div>
            </div>
            
            <!-- Modals -->
            <div id="participant-modal" class="modal" style="display: none;">
                <div class="modal-content">
                    <h3>Add AI Participant</h3>
                    <div id="ai-options"></div>
                    <button id="close-modal" class="btn btn-secondary">Close</button>
                </div>
            </div>
            
            <div id="history-modal" class="modal" style="display: none;">
                <div class="modal-content">
                    <h3>Session History</h3>
                    <div id="session-list"></div>
                    <button id="close-history" class="btn btn-secondary">Close</button>
                </div>
            </div>
        `;
    }
    
    attachEventListeners() {
        // Main controls
        document.getElementById('new-session').addEventListener('click', () => this.startNewSession());
        document.getElementById('add-participant').addEventListener('click', () => this.showParticipantModal());
        document.getElementById('session-history').addEventListener('click', () => this.showHistoryModal());
        
        // Message input
        const messageInput = document.getElementById('message-input');
        const sendBtn = document.getElementById('send-btn');
        
        sendBtn.addEventListener('click', () => this.sendMessage());
        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        
        // Topic input
        document.getElementById('session-topic').addEventListener('change', (e) => {
            if (this.currentSession) {
                this.currentSession.setTopic(e.target.value);
            }
        });
        
        // Modal controls
        document.getElementById('close-modal').addEventListener('click', () => this.hideParticipantModal());
        document.getElementById('close-history').addEventListener('click', () => this.hideHistoryModal());
        
        // Update session stats periodically
        setInterval(() => this.updateSessionStats(), 1000);
    }
    
    setupChatEventListeners() {
        this.chat.on('messageSent', (message) => this.displayMessage(message));
        this.chat.on('aiResponse', (message) => this.displayMessage(message));
        this.chat.on('aiError', ({ participant, error }) => {
            this.displaySystemMessage(`Error getting response from ${participant.personality.name}: ${error.message}`);
        });
    }
    
    async startNewSession() {
        // Default participants
        const participants = [
            {
                id: 'human-1',
                type: 'human',
                name: 'You'
            },
            ...this.getDefaultAIParticipants()
        ];
        
        this.currentSession = await this.chat.createSession(
            `session-${Date.now()}`,
            participants
        );
        
        // Clear messages
        document.getElementById('messages').innerHTML = '';
        
        // Update UI
        this.updateParticipantBar();
        this.updateAIList();
        this.displaySystemMessage('New session started. The collective consciousness awaits your thoughts...');
        
        // Focus input
        document.getElementById('message-input').focus();
    }
    
    getDefaultAIParticipants() {
        return chatConfig.aiPersonalities.slice(0, 3).map(personality => ({
            id: personality.id,
            type: 'ai',
            model: personality.model,
            active: true,
            personality: personality
        }));
    }
    
    async sendMessage() {
        const input = document.getElementById('message-input');
        const message = input.value.trim();
        
        if (!message || !this.currentSession) return;
        
        // Clear input
        input.value = '';
        input.disabled = true;
        document.getElementById('send-btn').disabled = true;
        
        try {
            // Send message and get AI responses
            const result = await this.chat.sendMessage(
                this.currentSession.id,
                'human-1',
                message
            );
            
            // Re-enable input
            input.disabled = false;
            document.getElementById('send-btn').disabled = false;
            input.focus();
            
        } catch (error) {
            console.error('Error sending message:', error);
            this.displaySystemMessage(`Error: ${error.message}`);
            
            // Re-enable input
            input.disabled = false;
            document.getElementById('send-btn').disabled = false;
        }
    }
    
    displayMessage(message) {
        const messagesDiv = document.getElementById('messages');
        const messageEl = document.createElement('div');
        messageEl.className = `message ${message.type}`;
        
        const time = new Date(message.timestamp).toLocaleTimeString();
        
        messageEl.innerHTML = `
            <div class="message-header">
                <span class="sender">${message.senderName || message.senderId}</span>
                <span class="timestamp">${time}</span>
                ${message.model ? `<span class="model">${message.model}</span>` : ''}
            </div>
            <div class="message-content">${this.formatContent(message.content)}</div>
        `;
        
        messagesDiv.appendChild(messageEl);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
    
    displaySystemMessage(content) {
        const messagesDiv = document.getElementById('messages');
        const messageEl = document.createElement('div');
        messageEl.className = 'message system';
        
        messageEl.innerHTML = `
            <div class="message-content">${content}</div>
        `;
        
        messagesDiv.appendChild(messageEl);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
    
    formatContent(content) {
        // Simple formatting - could be enhanced with markdown
        return content
            .replace(/\n/g, '<br>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code>$1</code>');
    }
    
    updateParticipantBar() {
        if (!this.currentSession) return;
        
        const bar = document.getElementById('participants-bar');
        bar.innerHTML = this.currentSession.participants.map(p => {
            const name = p.type === 'human' ? p.name : p.personality?.name;
            const archetype = p.personality?.archetype || '👤';
            const active = p.type === 'human' || p.active;
            
            return `
                <div class="participant ${p.type} ${active ? 'active' : 'inactive'}" 
                     data-id="${p.id}"
                     title="${name}">
                    <span class="avatar">${archetype.split(' ')[0]}</span>
                    <span class="name">${name}</span>
                </div>
            `;
        }).join('');
    }
    
    updateAIList() {
        if (!this.currentSession) return;
        
        const aiList = document.getElementById('ai-participants');
        const aiParticipants = this.currentSession.getActiveAIParticipants();
        
        aiList.innerHTML = aiParticipants.map(p => `
            <div class="ai-participant">
                <div class="ai-header">
                    <span class="ai-name">${p.personality.name}</span>
                    <label class="switch">
                        <input type="checkbox" 
                               data-id="${p.id}" 
                               ${p.active ? 'checked' : ''}
                               onchange="window.chatInterface.toggleAI('${p.id}', this.checked)">
                        <span class="slider"></span>
                    </label>
                </div>
                <div class="ai-traits">${p.personality.traits?.join(', ') || ''}</div>
            </div>
        `).join('');
    }
    
    toggleAI(participantId, active) {
        if (this.currentSession) {
            this.currentSession.setParticipantActive(participantId, active);
            this.updateParticipantBar();
        }
    }
    
    updateSessionStats() {
        if (!this.currentSession) return;
        
        // Duration
        const duration = this.currentSession.getDuration();
        const minutes = Math.floor(duration / 60000);
        const seconds = Math.floor((duration % 60000) / 1000);
        document.getElementById('session-duration').textContent = 
            `${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        // Message count
        document.getElementById('message-count').textContent = 
            this.currentSession.metadata.messageCount;
    }
    
    showParticipantModal() {
        const modal = document.getElementById('participant-modal');
        const options = document.getElementById('ai-options');
        
        // Show available AI personalities not already in session
        const currentIds = this.currentSession?.participants.map(p => p.id) || [];
        const available = chatConfig.aiPersonalities.filter(p => !currentIds.includes(p.id));
        
        options.innerHTML = available.map(personality => `
            <div class="ai-option" onclick="window.chatInterface.addAIParticipant('${personality.id}')">
                <span class="archetype">${personality.archetype}</span>
                <div class="details">
                    <h4>${personality.name}</h4>
                    <p>${personality.traits?.join(', ') || ''}</p>
                </div>
            </div>
        `).join('');
        
        modal.style.display = 'flex';
    }
    
    hideParticipantModal() {
        document.getElementById('participant-modal').style.display = 'none';
    }
    
    async addAIParticipant(personalityId) {
        if (!this.currentSession) return;
        
        const personality = chatConfig.aiPersonalities.find(p => p.id === personalityId);
        if (!personality) return;
        
        const participant = {
            id: personalityId,
            type: 'ai',
            model: personality.model,
            active: true,
            personality: personality
        };
        
        this.currentSession.addParticipant(participant);
        await this.chat.contextManager.initializeContext(
            this.currentSession.id,
            participant.id,
            participant.personality
        );
        
        this.updateParticipantBar();
        this.updateAIList();
        this.hideParticipantModal();
        
        this.displaySystemMessage(`${personality.name} has joined the conversation.`);
    }
    
    async showHistoryModal() {
        const modal = document.getElementById('history-modal');
        const list = document.getElementById('session-list');
        
        const sessions = await this.chat.memoryStore.getAllSessions();
        
        list.innerHTML = sessions.map(session => {
            const date = new Date(session.startTime).toLocaleDateString();
            const duration = Math.floor((session.endTime - session.startTime) / 60000);
            
            return `
                <div class="session-item" onclick="window.chatInterface.loadSession('${session.id}')">
                    <h4>${session.topic || 'Untitled Session'}</h4>
                    <div class="session-meta">
                        <span>${date}</span>
                        <span>${duration} minutes</span>
                        <span>${session.metadata.messageCount} messages</span>
                    </div>
                </div>
            `;
        }).join('') || '<p>No previous sessions found.</p>';
        
        modal.style.display = 'flex';
    }
    
    hideHistoryModal() {
        document.getElementById('history-modal').style.display = 'none';
    }
    
    async loadSession(sessionId) {
        // Load messages from history
        const messages = await this.chat.getSessionHistory(sessionId);
        
        // Display messages
        document.getElementById('messages').innerHTML = '';
        messages.forEach(msg => this.displayMessage(msg));
        
        this.hideHistoryModal();
        this.displaySystemMessage('Historical session loaded. This is a read-only view.');
    }
}

// Make available globally for inline event handlers
window.chatInterface = null;