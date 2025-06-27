// src/main.js
import { FractalityEngine } from './engine/FractalityEngine.js';
import { dataLoader } from './data/DataLoader.js';
import { config, loadConfig } from './config/config.js';

// Global app instance
let app = null;

/**
 * Initialize the application
 */
async function init() {
    try {
        // Load saved configuration
        loadConfig();
        
        // Show loading indicator
        showLoading('Initializing Fractality Engine...');
        
        // Create engine instance
        app = new FractalityEngine('canvas');
        
        // Initialize subsystems
        await app.init();
        
        // Load initial data
        showLoading('Loading fractal universe...');
        const initialData = await dataLoader.load('test:simple');
        await app.loadData(initialData);
        
        // Set initial focus
        app.setFocus('root');
        
        // Setup UI event handlers
        setupUIHandlers();
        
        // Hide loading
        hideLoading();
        
        // Start the engine
        app.start();
        
        console.log('Fractality Engine v0.2.2 initialized successfully');
        
    } catch (error) {
        console.error('Failed to initialize Fractality:', error);
        showError('Failed to initialize. Please refresh the page.');
    }
}

/**
 * Setup UI event handlers
 */
function setupUIHandlers() {
    // Reset view button
    document.getElementById('reset-view').addEventListener('click', () => {
        app.resetView();
    });
    
    // Toggle quality button
    document.getElementById('toggle-quality').addEventListener('click', (e) => {
        const newQuality = app.toggleQuality();
        e.target.textContent = `Quality: ${newQuality > 0.5 ? 'High' : 'Low'}`;
    });
    
    // Load data button
    document.getElementById('load-data').addEventListener('click', () => {
        showDataDialog();
    });
    
    // Test pattern buttons
    document.querySelectorAll('.test-pattern').forEach(button => {
        button.addEventListener('click', async (e) => {
            const pattern = e.target.dataset.pattern;
            await loadTestPattern(pattern);
        });
    });
    
    // Data dialog handlers
    setupDataDialogHandlers();
    
    // Keyboard shortcuts
    setupKeyboardShortcuts();
}

/**
 * Load test pattern
 */
async function loadTestPattern(pattern) {
    try {
        showLoading(`Loading ${pattern} pattern...`);
        
        const data = await dataLoader.load(`test:${pattern}`);
        await app.loadData(data);
        app.resetView();
        
        hideLoading();
        
        // Show stats
        console.log(`Loaded ${pattern} pattern:`, data.stats);
        
    } catch (error) {
        console.error(`Failed to load ${pattern} pattern:`, error);
        hideLoading();
        showError(`Failed to load ${pattern} pattern`);
    }
}

/**
 * Setup data dialog handlers
 */
function setupDataDialogHandlers() {
    const dialog = document.getElementById('data-dialog');
    const urlInput = document.getElementById('data-url');
    const fileInput = document.getElementById('data-file');
    
    // Load from URL
    document.getElementById('load-url').addEventListener('click', async () => {
        const url = urlInput.value.trim();
        if (!url) return;
        
        try {
            showLoading('Loading data from URL...');
            hideDataDialog();
            
            const data = await dataLoader.load(url);
            await app.loadData(data);
            app.resetView();
            
            hideLoading();
        } catch (error) {
            console.error('Failed to load from URL:', error);
            hideLoading();
            showError('Failed to load data from URL');
        }
    });
    
    // Load from file
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        try {
            showLoading('Loading data from file...');
            hideDataDialog();
            
            const text = await file.text();
            const data = JSON.parse(text);
            const graph = await dataLoader.load(data);
            await app.loadData(graph);
            app.resetView();
            
            hideLoading();
        } catch (error) {
            console.error('Failed to load from file:', error);
            hideLoading();
            showError('Failed to load data from file');
        }
    });
    
    // Load example data
    document.querySelectorAll('.load-example').forEach(button => {
        button.addEventListener('click', async (e) => {
            const source = e.target.dataset.source;
            
            try {
                showLoading('Loading example data...');
                hideDataDialog();
                
                const response = await fetch(source);
                const data = await response.json();
                const graph = await dataLoader.load(data);
                await app.loadData(graph);
                app.resetView();
                
                hideLoading();
            } catch (error) {
                console.error('Failed to load example:', error);
                hideLoading();
                showError('Failed to load example data');
            }
        });
    });
    
    // Close dialog
    document.getElementById('close-dialog').addEventListener('click', hideDataDialog);
    
    // Close on background click
    dialog.addEventListener('click', (e) => {
        if (e.target === dialog) {
            hideDataDialog();
        }
    });
}

/**
 * Setup keyboard shortcuts
 */
function setupKeyboardShortcuts() {
    const shortcuts = config.interaction.keyboard.shortcuts;
    
    document.addEventListener('keydown', (e) => {
        // Ignore if typing in input
        if (e.target.tagName === 'INPUT') return;
        
        switch (e.key) {
            case shortcuts.resetView:
                app.resetView();
                break;
                
            case shortcuts.togglePerformance:
                app.togglePerformanceMonitor();
                break;
                
            case shortcuts.toggleQuality:
                const quality = app.toggleQuality();
                document.getElementById('toggle-quality').textContent = 
                    `Quality: ${quality > 0.5 ? 'High' : 'Low'}`;
                break;
                
            case shortcuts.search:
                e.preventDefault();
                // TODO: Implement search
                console.log('Search not yet implemented');
                break;
                
            case shortcuts.escape:
                hideDataDialog();
                app.clearSelection();
                break;
        }
    });
}

/**
 * UI Helper Functions
 */
function showLoading(message = 'Loading...') {
    const loading = document.getElementById('loading');
    const loadingText = loading.querySelector('.loading-text');
    loadingText.textContent = message;
    loading.style.display = 'block';
}

function hideLoading() {
    document.getElementById('loading').style.display = 'none';
}

function showDataDialog() {
    document.getElementById('data-dialog').style.display = 'flex';
}

function hideDataDialog() {
    document.getElementById('data-dialog').style.display = 'none';
}

function showError(message) {
    // Simple error display - could be enhanced
    alert(`Error: ${message}`);
}

/**
 * Handle window resize
 */
window.addEventListener('resize', () => {
    if (app) {
        app.handleResize();
    }
});

/**
 * Handle visibility change
 */
document.addEventListener('visibilitychange', () => {
    if (app) {
        if (document.hidden) {
            app.pause();
        } else {
            app.resume();
        }
    }
});

/**
 * Start the application when DOM is ready
 */
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Export for debugging
window.fractality = {
    app: () => app,
    config,
    dataLoader,
    version: '0.2.2'
};
