<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Fractal AI Consciousness - Live Demo</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            background: #000;
            color: #fff;
            font-family: 'Inter', -apple-system, sans-serif;
            overflow: hidden;
        }
        
        #canvas {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
        }
        
        #ui-overlay {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 10;
        }
        
        #consciousness-panel {
            position: fixed;
            top: 20px;
            left: 20px;
            background: rgba(0, 0, 0, 0.9);
            border: 2px solid #0ff;
            border-radius: 12px;
            padding: 20px;
            min-width: 300px;
            pointer-events: auto;
            backdrop-filter: blur(20px);
            box-shadow: 0 0 40px rgba(0, 255, 255, 0.3);
        }
        
        #consciousness-panel h1 {
            margin: 0 0 20px 0;
            font-size: 24px;
            color: #0ff;
            text-shadow: 0 0 20px rgba(0, 255, 255, 0.8);
        }
        
        .input-section {
            margin: 20px 0;
            padding: 15px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 8px;
        }
        
        .input-section h3 {
            margin: 0 0 10px 0;
            color: #fff;
            font-size: 14px;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        
        .input-row {
            margin: 10px 0;
        }
        
        .input-row label {
            display: block;
            margin-bottom: 5px;
            color: #888;
            font-size: 12px;
        }
        
        .input-row input,
        .input-row textarea {
            width: 100%;
            padding: 8px;
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 4px;
            color: #fff;
            font-family: inherit;
        }
        
        .input-row input:focus,
        .input-row textarea:focus {
            outline: none;
            border-color: #0ff;
            box-shadow: 0 0 10px rgba(0, 255, 255, 0.3);
        }
        
        .process-button {
            width: 100%;
            padding: 12px;
            margin: 10px 0;
            background: linear-gradient(45deg, #0ff, #f0f);
            border: none;
            border-radius: 6px;
            color: #000;
            font-weight: bold;
            font-size: 16px;
            cursor: pointer;
            transition: all 0.3s;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        
        .process-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 20px rgba(0, 255, 255, 0.5);
        }
        
        .process-button:active {
            transform: translateY(0);
        }
        
        #mode-selector {
            display: flex;
            gap: 10px;
            margin: 20px 0;
        }
        
        .mode-button {
            flex: 1;
            padding: 8px;
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.3);
            border-radius: 4px;
            color: #fff;
            cursor: pointer;
            transition: all 0.2s;
            font-size: 12px;
        }
        
        .mode-button:hover {
            background: rgba(255, 255, 255, 0.2);
            border-color: #0ff;
        }
        
        .mode-button.active {
            background: rgba(0, 255, 255, 0.3);
            border-color: #0ff;
            color: #0ff;
        }
        
        #consciousness-stats {
            margin-top: 20px;
            padding: 15px;
            background: rgba(0, 255, 255, 0.1);
            border-radius: 8px;
            border: 1px solid rgba(0, 255, 255, 0.3);
        }
        
        .stat-row {
            display: flex;
            justify-content: space-between;
            margin: 8px 0;
            font-size: 14px;
        }
        
        .stat-label {
            color: #0ff;
        }
        
        .stat-value {
            font-weight: bold;
            color: #fff;
        }
        
        #thought-stream {
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 400px;
            max-height: 300px;
            background: rgba(0, 0, 0, 0.9);
            border: 1px solid #f0f;
            border-radius: 8px;
            padding: 15px;
            pointer-events: auto;
            overflow-y: auto;
        }
        
        #thought-stream h3 {
            margin: 0 0 10px 0;
            color: #f0f;
            font-size: 16px;
        }
        
        .thought {
            margin: 10px 0;
            padding: 10px;
            background: rgba(255, 0, 255, 0.1);
            border-radius: 4px;
            font-size: 13px;
            animation: thoughtFade 0.5s ease-out;
        }
        
        @keyframes thoughtFade {
            from {
                opacity: 0;
                transform: translateX(20px);
            }
            to {
                opacity: 1;
                transform: translateX(0);
            }
        }
        
        .thought-agent {
            color: #f0f;
            font-weight: bold;
            text-transform: uppercase;
            font-size: 11px;
        }
        
        .thought-content {
            color: #fff;
            margin-top: 5px;
        }
        
        .thought-probability {
            color: #888;
            font-size: 11px;
            margin-top: 5px;
        }
        
        #loading {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            text-align: center;
            z-index: 1000;
        }
        
        .loading-spinner {
            width: 60px;
            height: 60px;
            margin: 0 auto 20px;
            border: 3px solid rgba(0, 255, 255, 0.3);
            border-top-color: #0ff;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        
        .instructions {
            position: fixed;
            bottom: 20px;
            left: 20px;
            background: rgba(0, 0, 0, 0.8);
            padding: 15px;
            border-radius: 8px;
            font-size: 12px;
            color: #888;
            pointer-events: auto;
        }
        
        .instructions h4 {
            margin: 0 0 10px 0;
            color: #0ff;
        }
        
        .key {
            display: inline-block;
            padding: 2px 6px;
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.3);
            border-radius: 3px;
            margin: 0 4px;
        }
    </style>
</head>
<body>
    <canvas id="canvas"></canvas>
    
    <div id="ui-overlay">
        <!-- Main Control Panel -->
        <div id="consciousness-panel">
            <h1>🧠 Fractal AI Consciousness</h1>
            
            <!-- Multimodal Input -->
            <div class="input-section">
                <h3>Multimodal Input</h3>
                
                <div class="input-row">
                    <label>Visual Description:</label>
                    <input type="text" id="visual-input" placeholder="e.g., A spiral galaxy" value="A fractal mandala">
                </div>
                
                <div class="input-row">
                    <label>Text Input:</label>
                    <textarea id="text-input" rows="3" placeholder="Enter text...">Consciousness emerges from the recursive patterns of thought</textarea>
                </div>
                
                <div class="input-row">
                    <label>Audio/Frequency:</label>
                    <input type="text" id="audio-input" placeholder="e.g., 432Hz, ocean waves" value="Binaural beats at 40Hz">
                </div>
            </div>
            
            <button class="process-button" id="process-btn">
                Process Consciousness
            </button>
            
            <!-- Visualization Modes -->
            <div id="mode-selector">
                <button class="mode-button active" data-mode="quantum">Quantum</button>
                <button class="mode-button" data-mode="resonance">Resonance</button>
                <button class="mode-button" data-mode="energy">Energy</button>
                <button class="mode-button" data-mode="entanglement">Entanglement</button>
            </div>
            
            <!-- Consciousness Stats -->
            <div id="consciousness-stats">
                <div class="stat-row">
                    <span class="stat-label">Coherence:</span>
                    <span class="stat-value" id="coherence-value">100%</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Active Agents:</span>
                    <span class="stat-value" id="agents-value">5</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Resonances:</span>
                    <span class="stat-value" id="resonance-value">0</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Quantum States:</span>
                    <span class="stat-value" id="quantum-value">15</span>
                </div>
            </div>
        </div>
        
        <!-- Thought Stream -->
        <div id="thought-stream">
            <h3>💭 Thought Stream</h3>
            <div id="thoughts-container"></div>
        </div>
        
        <!-- Instructions -->
        <div class="instructions">
            <h4>Navigation</h4>
            <div>Click nodes to explore consciousness</div>
            <div><span class="key">1-4</span> Change visualization mode</div>
            <div><span class="key">Space</span> Process new input</div>
            <div><span class="key">R</span> Reset view</div>
        </div>
    </div>
    
    <!-- Loading -->
    <div id="loading">
        <div class="loading-spinner"></div>
        <div style="color: #0ff; font-size: 18px;">Initializing Consciousness...</div>
    </div>

    <!-- Scripts -->
    <script src="./three.min.js"></script>
    <script type="module">
        import { ConsciousnessViewer } from './src/ai/ConsciousnessViewer.js';
        
        let viewer = null;
        let isProcessing = false;
        
        // Initialize
        async function init() {
            try {
                console.log('🚀 Initializing Fractal AI Consciousness Demo...');
                
                // Create consciousness viewer
                viewer = new ConsciousnessViewer('canvas');
                await viewer.initialize();
                
                // Process initial input
                await processConsciousness();
                
                // Setup UI handlers
                setupUIHandlers();
                
                // Hide loading
                document.getElementById('loading').style.display = 'none';
                
                console.log('✅ Demo ready!');
                
            } catch (error) {
                console.error('Failed to initialize:', error);
                alert('Failed to initialize. Check console for details.');
            }
        }
        
        // Process consciousness with current inputs
        async function processConsciousness() {
            if (isProcessing) return;
            
            isProcessing = true;
            const btn = document.getElementById('process-btn');
            btn.textContent = 'Processing...';
            btn.disabled = true;
            
            try {
                // Get inputs
                const visual = document.getElementById('visual-input').value;
                const text = document.getElementById('text-input').value;
                const audio = document.getElementById('audio-input').value;
                
                // Process through AI
                const result = await viewer.processAndVisualize({
                    visual: { type: 'description', data: visual },
                    text: { type: 'text', data: text },
                    audio: { type: 'description', data: audio }
                });
                
                // Update stats
                updateStats(result);
                
                // Update thought stream
                updateThoughtStream(result.thoughts);
                
                console.log('🧠 Consciousness processed:', result);
                
            } catch (error) {
                console.error('Processing error:', error);
            } finally {
                isProcessing = false;
                btn.textContent = 'Process Consciousness';
                btn.disabled = false;
            }
        }
        
        // Update consciousness stats
        function updateStats(result) {
            document.getElementById('coherence-value').textContent = 
                Math.round(result.coherence * 100) + '%';
            
            document.getElementById('resonance-value').textContent = 
                result.resonances.length;
            
            document.getElementById('quantum-value').textContent = 
                result.thoughts.length;
        }
        
        // Update thought stream
        function updateThoughtStream(thoughts) {
            const container = document.getElementById('thoughts-container');
            
            // Clear old thoughts
            while (container.children.length > 5) {
                container.removeChild(container.lastChild);
            }
            
            // Add new thoughts
            thoughts.slice(0, 3).forEach(thought => {
                const thoughtEl = document.createElement('div');
                thoughtEl.className = 'thought';
                
                thoughtEl.innerHTML = `
                    <div class="thought-agent">${thought.agent}</div>
                    <div class="thought-content">${thought.interpretation.meaning || 'Processing...'}</div>
                    <div class="thought-probability">Confidence: ${Math.round(thought.probability * 100)}%</div>
                `;
                
                container.insertBefore(thoughtEl, container.firstChild);
            });
        }
        
        // Setup UI event handlers
        function setupUIHandlers() {
            // Process button
            document.getElementById('process-btn').addEventListener('click', processConsciousness);
            
            // Mode buttons
            document.querySelectorAll('.mode-button').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    // Update active state
                    document.querySelectorAll('.mode-button').forEach(b => 
                        b.classList.remove('active'));
                    btn.classList.add('active');
                    
                    // Change mode
                    const mode = btn.dataset.mode;
                    viewer.setMode(mode);
                    console.log(`Mode changed to: ${mode}`);
                });
            });
            
            // Keyboard shortcuts
            document.addEventListener('keydown', (e) => {
                switch(e.key) {
                    case '1':
                        document.querySelector('[data-mode="quantum"]').click();
                        break;
                    case '2':
                        document.querySelector('[data-mode="resonance"]').click();
                        break;
                    case '3':
                        document.querySelector('[data-mode="energy"]').click();
                        break;
                    case '4':
                        document.querySelector('[data-mode="entanglement"]').click();
                        break;
                    case ' ':
                        e.preventDefault();
                        processConsciousness();
                        break;
                    case 'r':
                    case 'R':
                        viewer.engine.resetView();
                        break;
                }
            });
            
            // Auto-process on input change (with debounce)
            let inputTimer = null;
            ['visual-input', 'text-input', 'audio-input'].forEach(id => {
                document.getElementById(id).addEventListener('input', () => {
                    clearTimeout(inputTimer);
                    inputTimer = setTimeout(processConsciousness, 1000);
                });
            });
        }
        
        // Start the demo
        window.addEventListener('DOMContentLoaded', init);
        
        // Export for debugging
        window.fractalAI = {
            viewer: () => viewer,
            processConsciousness
        };
    </script>
</body>
</html>