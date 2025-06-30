// src/ui/SearchInterface.js
// Mobile-first search interface for resonance engine

export class SearchInterface {
    constructor() {
        this.searchPanel = null;
        this.isVisible = false;
        this.searchHistory = [];
        this.currentResults = [];
        this.isSearching = false;
    }
    
    init() {
        this.createSearchPanel();
        this.setupEventListeners();
    }
    
    createSearchPanel() {
        this.searchPanel = document.createElement('div');
        this.searchPanel.id = 'search-interface';
        this.searchPanel.className = 'search-panel';
        
        this.searchPanel.innerHTML = `
            <div class="search-header">
                <div class="search-input-container">
                    <input 
                        type="text" 
                        id="search-input" 
                        placeholder="Search nodes by content, tags, or concepts..."
                        autocomplete="off"
                    >
                    <button id="search-btn" class="search-btn">
                        <span class="search-icon">🔍</span>
                        <span class="search-spinner hidden">⟳</span>
                    </button>
                </div>
                <div class="search-controls">
                    <select id="search-type" class="search-select">
                        <option value="hybrid">🔬 Hybrid</option>
                        <option value="semantic">🧠 Semantic</option>
                        <option value="tfidf">📊 TF-IDF</option>
                    </select>
                    <button id="search-close" class="control-btn">✕</button>
                </div>
            </div>
            
            <div class="search-body">
                <div class="search-suggestions" id="search-suggestions">
                    <div class="suggestion-category">
                        <h4>💡 Quick Searches</h4>
                        <div class="suggestion-pills">
                            <button class="suggestion-pill" data-query="consciousness">consciousness</button>
                            <button class="suggestion-pill" data-query="artificial intelligence">AI</button>
                            <button class="suggestion-pill" data-query="quantum">quantum</button>
                            <button class="suggestion-pill" data-query="fractality">fractality</button>
                        </div>
                    </div>
                    <div class="suggestion-category" id="recent-searches" style="display: none;">
                        <h4>📜 Recent Searches</h4>
                        <div class="suggestion-pills" id="recent-pills"></div>
                    </div>
                </div>
                
                <div class="search-results" id="search-results" style="display: none;">
                    <div class="results-header">
                        <h4 id="results-title">Search Results</h4>
                        <div class="results-stats">
                            <span id="results-count">0 results</span>
                            <span id="search-time"></span>
                        </div>
                    </div>
                    <div class="results-list" id="results-list">
                        <!-- Dynamic results -->
                    </div>
                </div>
                
                <div class="search-empty" id="search-empty">
                    <div class="empty-icon">🔍</div>
                    <h3>Explore Your Mind Map</h3>
                    <p>Search for concepts, connections, and insights across your knowledge network.</p>
                    <div class="search-tips">
                        <h4>💡 Search Tips:</h4>
                        <ul>
                            <li><strong>Semantic:</strong> "meaning of life" finds conceptually related nodes</li>
                            <li><strong>TF-IDF:</strong> "quantum computing" finds exact keyword matches</li>
                            <li><strong>Hybrid:</strong> Combines both for best results</li>
                        </ul>
                    </div>
                </div>
            </div>
        `;
        
        this.addSearchStyles();
        document.body.appendChild(this.searchPanel);
    }
    
    addSearchStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .search-panel {
                position: fixed;
                top: 80px;
                left: 10px;
                right: 10px;
                max-height: 70vh;
                background: rgba(0, 0, 0, 0.95);
                border: 2px solid #3b82f6;
                border-radius: 12px;
                color: #fff;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                z-index: 1001;
                display: none;
                box-shadow: 0 8px 32px rgba(59, 130, 246, 0.3);
                backdrop-filter: blur(10px);
                overflow: hidden;
            }
            
            .search-panel.visible {
                display: flex;
                flex-direction: column;
            }
            
            .search-header {
                padding: 16px;
                border-bottom: 2px solid #3b82f6;
                background: rgba(59, 130, 246, 0.1);
                flex-shrink: 0;
            }
            
            .search-input-container {
                display: flex;
                gap: 8px;
                margin-bottom: 12px;
            }
            
            #search-input {
                flex: 1;
                padding: 12px 16px;
                background: rgba(59, 130, 246, 0.1);
                border: 2px solid #3b82f6;
                border-radius: 8px;
                color: #fff;
                font-size: 16px;
                outline: none;
                transition: all 0.2s ease;
            }
            
            #search-input:focus {
                border-color: #60a5fa;
                box-shadow: 0 0 20px rgba(59, 130, 246, 0.4);
            }
            
            #search-input::placeholder {
                color: #94a3b8;
            }
            
            .search-btn {
                background: #3b82f6;
                border: none;
                color: white;
                padding: 12px 16px;
                border-radius: 8px;
                cursor: pointer;
                font-size: 16px;
                min-width: 50px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s ease;
            }
            
            .search-btn:hover {
                background: #2563eb;
                transform: scale(0.98);
            }
            
            .search-btn:disabled {
                opacity: 0.6;
                cursor: not-allowed;
            }
            
            .search-spinner {
                animation: spin 1s linear infinite;
            }
            
            @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }
            
            .search-controls {
                display: flex;
                gap: 8px;
                align-items: center;
            }
            
            .search-select {
                background: rgba(59, 130, 246, 0.1);
                border: 1px solid #3b82f6;
                color: #fff;
                padding: 8px 12px;
                border-radius: 6px;
                font-size: 14px;
                outline: none;
                cursor: pointer;
            }
            
            .control-btn {
                background: rgba(59, 130, 246, 0.2);
                border: 1px solid #3b82f6;
                color: #fff;
                padding: 8px 12px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 14px;
                min-width: 36px;
                min-height: 36px;
            }
            
            .control-btn:hover {
                background: rgba(59, 130, 246, 0.3);
            }
            
            .search-body {
                flex: 1;
                overflow-y: auto;
                padding: 16px;
            }
            
            .suggestion-category {
                margin-bottom: 20px;
            }
            
            .suggestion-category h4 {
                margin: 0 0 12px 0;
                color: #60a5fa;
                font-size: 14px;
                font-weight: bold;
            }
            
            .suggestion-pills {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
            }
            
            .suggestion-pill {
                background: rgba(59, 130, 246, 0.2);
                border: 1px solid #3b82f6;
                color: #60a5fa;
                padding: 6px 12px;
                border-radius: 16px;
                cursor: pointer;
                font-size: 13px;
                transition: all 0.2s ease;
            }
            
            .suggestion-pill:hover {
                background: rgba(59, 130, 246, 0.3);
                color: #93c5fd;
                transform: scale(1.05);
            }
            
            .results-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 16px;
                padding-bottom: 8px;
                border-bottom: 1px solid rgba(59, 130, 246, 0.3);
            }
            
            .results-header h4 {
                margin: 0;
                color: #60a5fa;
                font-size: 16px;
            }
            
            .results-stats {
                display: flex;
                flex-direction: column;
                align-items: flex-end;
                font-size: 12px;
                color: #94a3b8;
            }
            
            .results-list {
                display: grid;
                gap: 12px;
            }
            
            .result-item {
                background: rgba(59, 130, 246, 0.05);
                border: 1px solid rgba(59, 130, 246, 0.3);
                border-radius: 8px;
                padding: 16px;
                cursor: pointer;
                transition: all 0.2s ease;
                position: relative;
            }
            
            .result-item:hover {
                background: rgba(59, 130, 246, 0.1);
                border-color: #3b82f6;
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(59, 130, 246, 0.2);
            }
            
            .result-header {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                margin-bottom: 8px;
            }
            
            .result-title {
                font-weight: bold;
                color: #60a5fa;
                font-size: 16px;
                margin: 0;
            }
            
            .result-score {
                background: #3b82f6;
                color: white;
                padding: 2px 8px;
                border-radius: 12px;
                font-size: 11px;
                font-weight: bold;
            }
            
            .result-content {
                color: #e2e8f0;
                font-size: 14px;
                line-height: 1.4;
                margin-bottom: 8px;
            }
            
            .result-meta {
                display: flex;
                gap: 12px;
                font-size: 12px;
                color: #94a3b8;
            }
            
            .result-type {
                background: rgba(59, 130, 246, 0.2);
                padding: 2px 6px;
                border-radius: 4px;
                font-size: 11px;
            }
            
            .search-empty {
                text-align: center;
                padding: 40px 20px;
                color: #94a3b8;
            }
            
            .empty-icon {
                font-size: 48px;
                margin-bottom: 16px;
                opacity: 0.5;
            }
            
            .search-empty h3 {
                margin: 0 0 8px 0;
                color: #60a5fa;
                font-size: 20px;
            }
            
            .search-empty p {
                margin: 0 0 24px 0;
                font-size: 16px;
                line-height: 1.5;
            }
            
            .search-tips {
                text-align: left;
                background: rgba(59, 130, 246, 0.05);
                border: 1px solid rgba(59, 130, 246, 0.3);
                border-radius: 8px;
                padding: 16px;
                margin: 0 auto;
                max-width: 400px;
            }
            
            .search-tips h4 {
                margin: 0 0 12px 0;
                color: #60a5fa;
                font-size: 14px;
            }
            
            .search-tips ul {
                margin: 0;
                padding-left: 20px;
            }
            
            .search-tips li {
                margin-bottom: 6px;
                font-size: 13px;
                line-height: 1.4;
            }
            
            .hidden {
                display: none !important;
            }
            
            /* Mobile responsiveness */
            @media (min-width: 768px) {
                .search-panel {
                    left: 50px;
                    right: 50px;
                    max-width: 700px;
                    margin: 0 auto;
                }
                
                .results-list {
                    grid-template-columns: 1fr;
                }
            }
            
            @media (min-width: 1024px) {
                .search-panel {
                    left: 20%;
                    right: 20%;
                    top: 120px;
                }
            }
        `;
        document.head.appendChild(style);
    }
    
    setupEventListeners() {
        const searchInput = document.getElementById('search-input');
        const searchBtn = document.getElementById('search-btn');
        const searchClose = document.getElementById('search-close');
        const searchType = document.getElementById('search-type');
        
        // Search button click
        searchBtn.addEventListener('click', () => {
            this.performSearch();
        });
        
        // Enter key in search input
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.performSearch();
            }
        });
        
        // Close button
        searchClose.addEventListener('click', () => {
            this.hide();
        });
        
        // Suggestion pills
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('suggestion-pill')) {
                const query = e.target.dataset.query;
                searchInput.value = query;
                this.performSearch();
            }
        });
        
        // Result item clicks
        document.addEventListener('click', (e) => {
            if (e.target.closest('.result-item')) {
                const resultItem = e.target.closest('.result-item');
                const nodeId = resultItem.dataset.nodeId;
                this.selectNode(nodeId);
            }
        });
        
        // Global keyboard shortcut (Ctrl+F or Cmd+F)
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault();
                this.show();
            }
            
            // Escape to close
            if (e.key === 'Escape' && this.isVisible) {
                this.hide();
            }
        });
        
        // Search type change
        searchType.addEventListener('change', () => {
            if (searchInput.value.trim()) {
                this.performSearch();
            }
        });
    }
    
    show() {
        this.isVisible = true;
        this.searchPanel.classList.add('visible');
        
        // Focus search input
        setTimeout(() => {
            document.getElementById('search-input').focus();
        }, 100);
        
        this.updateRecentSearches();
        this.showSuggestions();
    }
    
    hide() {
        this.isVisible = false;
        this.searchPanel.classList.remove('visible');
        this.clearSearch();
    }
    
    async performSearch() {
        const query = document.getElementById('search-input').value.trim();
        const searchType = document.getElementById('search-type').value;
        
        if (!query) return;
        
        // Update UI state
        this.setSearching(true);
        this.hideSuggestions();
        
        try {
            const startTime = Date.now();
            
            // Perform search via NodeBridge
            const results = await window.nodeBridge.searchNodes(query, {
                type: searchType,
                limit: 20
            });
            
            const searchTime = Date.now() - startTime;
            
            // Store search in history
            this.addToHistory(query);
            
            // Display results
            this.displayResults(query, results, searchTime);
            
        } catch (error) {
            console.error('Search failed:', error);
            this.showError('Search failed. Please try again.');
        } finally {
            this.setSearching(false);
        }
    }
    
    displayResults(query, results, searchTime) {
        const resultsContainer = document.getElementById('search-results');
        const resultsList = document.getElementById('results-list');
        const resultsTitle = document.getElementById('results-title');
        const resultsCount = document.getElementById('results-count');
        const searchTimeEl = document.getElementById('search-time');
        
        // Update header
        resultsTitle.textContent = `Results for "${query}"`;
        resultsCount.textContent = `${results.length} results`;
        searchTimeEl.textContent = `${searchTime}ms`;
        
        // Clear previous results
        resultsList.innerHTML = '';
        
        if (results.length === 0) {
            resultsList.innerHTML = `
                <div class="no-results">
                    <div class="empty-icon">🤷‍♂️</div>
                    <h3>No matches found</h3>
                    <p>Try a different search term or use a different search type.</p>
                </div>
            `;
        } else {
            results.forEach(result => {
                const resultEl = this.createResultElement(result);
                resultsList.appendChild(resultEl);
            });
        }
        
        // Show results
        resultsContainer.style.display = 'block';
        this.currentResults = results;
    }
    
    createResultElement(result) {
        const div = document.createElement('div');
        div.className = 'result-item';
        div.dataset.nodeId = result.node.id;
        
        const score = (result.score * 100).toFixed(1);
        const content = result.node.metadata?.description || 
                       result.node.content?.substring(0, 150) || 
                       'No content preview available';
        
        div.innerHTML = `
            <div class="result-header">
                <h3 class="result-title">${result.node.metadata?.label || result.node.id}</h3>
                <span class="result-score">${score}%</span>
            </div>
            <div class="result-content">${content}${content.length > 150 ? '...' : ''}</div>
            <div class="result-meta">
                <span class="result-type">${result.node.metadata?.type || 'node'}</span>
                <span>Depth: ${result.node.depth || 0}</span>
                <span>Children: ${result.node.children?.length || 0}</span>
            </div>
        `;
        
        return div;
    }
    
    selectNode(nodeId) {
        // Hide search panel
        this.hide();
        
        // Emit event for main app to handle
        window.dispatchEvent(new CustomEvent('nodeSelected', {
            detail: { nodeId }
        }));
        
        console.log('🎯 Selected node from search:', nodeId);
    }
    
    addToHistory(query) {
        // Remove if already exists
        this.searchHistory = this.searchHistory.filter(q => q !== query);
        
        // Add to beginning
        this.searchHistory.unshift(query);
        
        // Keep only last 10 searches
        this.searchHistory = this.searchHistory.slice(0, 10);
        
        // Store in localStorage
        try {
            localStorage.setItem('fractality_search_history', JSON.stringify(this.searchHistory));
        } catch (e) {
            // localStorage not available
        }
    }
    
    loadHistory() {
        try {
            const stored = localStorage.getItem('fractality_search_history');
            if (stored) {
                this.searchHistory = JSON.parse(stored);
            }
        } catch (e) {
            // localStorage not available
        }
    }
    
    updateRecentSearches() {
        const recentContainer = document.getElementById('recent-searches');
        const recentPills = document.getElementById('recent-pills');
        
        if (this.searchHistory.length > 0) {
            recentPills.innerHTML = '';
            this.searchHistory.slice(0, 5).forEach(query => {
                const pill = document.createElement('button');
                pill.className = 'suggestion-pill';
                pill.dataset.query = query;
                pill.textContent = query;
                recentPills.appendChild(pill);
            });
            recentContainer.style.display = 'block';
        } else {
            recentContainer.style.display = 'none';
        }
    }
    
    showSuggestions() {
        document.getElementById('search-suggestions').style.display = 'block';
        document.getElementById('search-results').style.display = 'none';
        document.getElementById('search-empty').style.display = 'block';
    }
    
    hideSuggestions() {
        document.getElementById('search-suggestions').style.display = 'none';
        document.getElementById('search-empty').style.display = 'none';
    }
    
    setSearching(isSearching) {
        this.isSearching = isSearching;
        const searchBtn = document.getElementById('search-btn');
        const searchIcon = searchBtn.querySelector('.search-icon');
        const searchSpinner = searchBtn.querySelector('.search-spinner');
        
        if (isSearching) {
            searchBtn.disabled = true;
            searchIcon.classList.add('hidden');
            searchSpinner.classList.remove('hidden');
        } else {
            searchBtn.disabled = false;
            searchIcon.classList.remove('hidden');
            searchSpinner.classList.add('hidden');
        }
    }
    
    clearSearch() {
        document.getElementById('search-input').value = '';
        this.showSuggestions();
        this.currentResults = [];
    }
    
    showError(message) {
        const resultsList = document.getElementById('results-list');
        resultsList.innerHTML = `
            <div class="search-error">
                <div class="error-icon">⚠️</div>
                <h3>Search Error</h3>
                <p>${message}</p>
            </div>
        `;
        document.getElementById('search-results').style.display = 'block';
    }
}

// Initialize search interface
export const searchInterface = new SearchInterface();