// src/ui/PerformanceDashboard.js

/**
 * PerformanceDashboard - Real-time Performance Monitoring UI
 * Claude's Domain: Clear, efficient performance visualization
 * 
 * Displays FPS, memory usage, and other performance metrics
 * in a clean, non-intrusive overlay.
 */
export class PerformanceDashboard {
    constructor(performanceMonitor) {
        this.performanceMonitor = performanceMonitor;
        
        // UI elements
        this.container = null;
        this.elements = {
            fps: null,
            frameTime: null,
            nodeCount: null,
            drawCalls: null,
            memory: null,
            animationTime: null,
            quality: null,
            status: null
        };
        
        // Chart canvases
        this.charts = {
            fps: null,
            frameTime: null
        };
        
        // Configuration
        this.config = {
            position: 'top-right',
            updateInterval: 250, // ms
            chartWidth: 180,
            chartHeight: 40,
            chartSamples: 60,
            visible: true
        };
        
        // Update state
        this.lastUpdate = 0;
        
        // Chart data
        this.chartData = {
            fps: [],
            frameTime: []
        };
        
        // Color scheme
        this.colors = {
            good: '#0f0',
            warning: '#ff0',
            critical: '#f00',
            text: '#fff',
            dim: '#888',
            background: 'rgba(0, 0, 0, 0.85)',
            border: '#333'
        };
    }
    
    /**
     * Initialize the dashboard
     */
    init() {
        // Check if already exists
        if (this.container) return;
        
        // Create container
        this._createContainer();
        
        // Create metrics display
        this._createMetricsDisplay();
        
        // Create charts
        this._createCharts();
        
        // Setup styles
        this._applyStyles();
        
        // Initial update
        this.update({});
    }
    
    /**
     * Create container element
     */
    _createContainer() {
        this.container = document.createElement('div');
        this.container.id = 'perf-dashboard';
        this.container.className = 'perf-dashboard';
        
        // Add to UI overlay or body
        const overlay = document.getElementById('ui-overlay') || document.body;
        overlay.appendChild(this.container);
    }
    
    /**
     * Create metrics display
     */
    _createMetricsDisplay() {
        // Title
        const title = document.createElement('h3');
        title.textContent = 'Performance';
        this.container.appendChild(title);
        
        // Metrics container
        const metricsContainer = document.createElement('div');
        metricsContainer.className = 'metrics-container';
        
        // Create metric rows
        const metrics = [
            { key: 'fps', label: 'FPS', suffix: '' },
            { key: 'frameTime', label: 'Frame', suffix: ' ms' },
            { key: 'nodeCount', label: 'Nodes', suffix: '' },
            { key: 'drawCalls', label: 'Draws', suffix: '' },
            { key: 'memory', label: 'Memory', suffix: ' MB' },
            { key: 'animationTime', label: 'Anim', suffix: ' ms' },
            { key: 'quality', label: 'Quality', suffix: '%' },
            { key: 'status', label: 'Status', suffix: '' }
        ];
        
        metrics.forEach(metric => {
            const row = document.createElement('div');
            row.className = 'metric-row';
            
            const label = document.createElement('span');
            label.className = 'metric-label';
            label.textContent = metric.label + ':';
            
            const value = document.createElement('span');
            value.className = 'metric-value';
            value.id = `perf-${metric.key}`;
            value.textContent = '0' + metric.suffix;
            
            row.appendChild(label);
            row.appendChild(value);
            metricsContainer.appendChild(row);
            
            this.elements[metric.key] = value;
        });
        
        this.container.appendChild(metricsContainer);
    }
    
    /**
     * Create performance charts
     */
    _createCharts() {
        const chartsContainer = document.createElement('div');
        chartsContainer.className = 'charts-container';
        
        // FPS Chart
        const fpsChartContainer = this._createChart('FPS', 'fps');
        chartsContainer.appendChild(fpsChartContainer);
        
        // Frame Time Chart
        const frameTimeChartContainer = this._createChart('Frame Time', 'frameTime');
        chartsContainer.appendChild(frameTimeChartContainer);
        
        this.container.appendChild(chartsContainer);
    }
    
    /**
     * Create individual chart
     */
    _createChart(label, key) {
        const container = document.createElement('div');
        container.className = 'chart-container';
        
        const chartLabel = document.createElement('div');
        chartLabel.className = 'chart-label';
        chartLabel.textContent = label;
        container.appendChild(chartLabel);
        
        const canvas = document.createElement('canvas');
        canvas.width = this.config.chartWidth;
        canvas.height = this.config.chartHeight;
        canvas.className = 'chart-canvas';
        container.appendChild(canvas);
        
        this.charts[key] = {
            canvas: canvas,
            ctx: canvas.getContext('2d')
        };
        
        return container;
    }
    
    /**
     * Apply styles
     */
    _applyStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .perf-dashboard {
                position: fixed;
                ${this._getPositionStyles()}
                background: ${this.colors.background};
                border: 1px solid ${this.colors.border};
                border-radius: 8px;
                padding: 15px;
                font-family: 'Consolas', 'Monaco', monospace;
                font-size: 12px;
                color: ${this.colors.text};
                pointer-events: auto;
                z-index: 1000;
                min-width: 220px;
                backdrop-filter: blur(10px);
                transition: opacity 0.3s;
            }
            
            .perf-dashboard.hidden {
                opacity: 0;
                pointer-events: none;
            }
            
            .perf-dashboard h3 {
                margin: 0 0 10px 0;
                color: #0ff;
                font-size: 14px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 1px;
            }
            
            .metrics-container {
                margin-bottom: 10px;
            }
            
            .metric-row {
                display: flex;
                justify-content: space-between;
                margin: 4px 0;
                align-items: center;
            }
            
            .metric-label {
                color: ${this.colors.dim};
                min-width: 60px;
            }
            
            .metric-value {
                color: ${this.colors.good};
                font-weight: bold;
                text-align: right;
                min-width: 60px;
            }
            
            .metric-value.warning {
                color: ${this.colors.warning};
            }
            
            .metric-value.critical {
                color: ${this.colors.critical};
            }
            
            .charts-container {
                margin-top: 15px;
                padding-top: 10px;
                border-top: 1px solid ${this.colors.border};
            }
            
            .chart-container {
                margin: 8px 0;
            }
            
            .chart-label {
                color: ${this.colors.dim};
                font-size: 10px;
                margin-bottom: 4px;
            }
            
            .chart-canvas {
                width: 100%;
                height: ${this.config.chartHeight}px;
                background: rgba(0, 0, 0, 0.5);
                border: 1px solid ${this.colors.border};
                border-radius: 2px;
            }
        `;
        
        document.head.appendChild(style);
    }
    
    /**
     * Get position styles based on config
     */
    _getPositionStyles() {
        switch (this.config.position) {
            case 'top-left':
                return 'top: 10px; left: 10px;';
            case 'top-right':
                return 'top: 10px; right: 10px;';
            case 'bottom-left':
                return 'bottom: 10px; left: 10px;';
            case 'bottom-right':
                return 'bottom: 10px; right: 10px;';
            default:
                return 'top: 10px; right: 10px;';
        }
    }
    
    /**
     * Update dashboard with new data
     */
    update(data) {
        const now = performance.now();
        
        // Throttle updates
        if (now - this.lastUpdate < this.config.updateInterval) {
            return;
        }
        
        this.lastUpdate = now;
        
        // Update FPS
        if (data.fps !== undefined) {
            this.elements.fps.textContent = Math.round(data.fps);
            this._setColorByValue(this.elements.fps, data.fps, 60, 30);
            this._addChartData('fps', data.fps);
        }
        
        // Update frame time
        if (data.frameTime !== undefined) {
            this.elements.frameTime.textContent = data.frameTime.toFixed(1) + ' ms';
            this._setColorByValue(this.elements.frameTime, data.frameTime, 16.67, 33.33, true);
        }
        
        // Update node count
        if (data.nodeCount !== undefined) {
            this.elements.nodeCount.textContent = data.nodeCount;
        }
        
        // Update draw calls
        if (data.drawCalls !== undefined) {
            this.elements.drawCalls.textContent = data.drawCalls || '1';
        }
        
        // Update memory
        if (data.memory !== undefined) {
            this.elements.memory.textContent = data.memory + ' MB';
            const memoryPercent = this.performanceMonitor.getMemoryPercentage();
            this._setColorByValue(this.elements.memory, memoryPercent, 70, 90);
        }
        
        // Update animation time
        if (data.animationTime !== undefined) {
            this.elements.animationTime.textContent = data.animationTime.toFixed(1) + ' ms';
            this._setColorByValue(this.elements.animationTime, data.animationTime, 4, 8, true);
        }
        
        // Update quality
        if (data.quality !== undefined) {
            const qualityPercent = Math.round(data.quality * 100);
            this.elements.quality.textContent = qualityPercent + '%';
        }
        
        // Update status
        const status = this.performanceMonitor._getPerformanceStatus();
        this.elements.status.textContent = status;
        this._setStatusColor(this.elements.status, status);
        
        // Update charts
        this._updateCharts();
    }
    
    /**
     * Set color based on value thresholds
     */
    _setColorByValue(element, value, goodThreshold, badThreshold, inverse = false) {
        element.classList.remove('warning', 'critical');
        
        if (inverse) {
            // Lower is better (like frame time)
            if (value > badThreshold) {
                element.classList.add('critical');
            } else if (value > goodThreshold) {
                element.classList.add('warning');
            }
        } else {
            // Higher is better (like FPS)
            if (value < badThreshold) {
                element.classList.add('critical');
            } else if (value < goodThreshold) {
                element.classList.add('warning');
            }
        }
    }
    
    /**
     * Set status color
     */
    _setStatusColor(element, status) {
        element.classList.remove('warning', 'critical');
        
        switch (status) {
            case 'optimal':
            case 'good':
                // Default green color
                break;
            case 'fair':
                element.classList.add('warning');
                break;
            case 'poor':
            case 'critical':
                element.classList.add('critical');
                break;
        }
    }
    
    /**
     * Add data to chart
     */
    _addChartData(key, value) {
        if (!this.chartData[key]) {
            this.chartData[key] = [];
        }
        
        this.chartData[key].push(value);
        
        // Keep only recent samples
        if (this.chartData[key].length > this.config.chartSamples) {
            this.chartData[key].shift();
        }
    }
    
    /**
     * Update charts
     */
    _updateCharts() {
        // Update FPS chart
        if (this.charts.fps && this.chartData.fps.length > 0) {
            this._drawChart(this.charts.fps, this.chartData.fps, 0, 120, 60);
        }
        
        // Update frame time chart
        if (this.charts.frameTime && this.chartData.frameTime) {
            const frameTimeData = this.performanceMonitor.history.frameTime.getAll();
            this._drawChart(this.charts.frameTime, frameTimeData, 0, 50, 16.67, true);
        }
    }
    
    /**
     * Draw chart
     */
    _drawChart(chart, data, minValue, maxValue, targetValue, inverse = false) {
        const ctx = chart.ctx;
        const width = chart.canvas.width;
        const height = chart.canvas.height;
        
        // Clear canvas
        ctx.clearRect(0, 0, width, height);
        
        if (data.length === 0) return;
        
        // Draw target line
        if (targetValue !== undefined) {
            ctx.strokeStyle = this.colors.dim;
            ctx.lineWidth = 1;
            ctx.setLineDash([2, 2]);
            ctx.beginPath();
            const targetY = height - ((targetValue - minValue) / (maxValue - minValue)) * height;
            ctx.moveTo(0, targetY);
            ctx.lineTo(width, targetY);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        
        // Draw data line
        ctx.strokeStyle = this.colors.good;
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        data.forEach((value, index) => {
            const x = (index / (this.config.chartSamples - 1)) * width;
            const normalizedValue = (value - minValue) / (maxValue - minValue);
            const y = height - (normalizedValue * height);
            
            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
            
            // Color based on value
            if (inverse ? value > targetValue : value < targetValue) {
                ctx.strokeStyle = this.colors.warning;
            }
            if (inverse ? value > targetValue * 2 : value < targetValue * 0.5) {
                ctx.strokeStyle = this.colors.critical;
            }
        });
        
        ctx.stroke();
    }
    
    /**
     * Show/hide dashboard
     */
    toggle() {
        this.config.visible = !this.config.visible;
        if (this.container) {
            this.container.classList.toggle('hidden', !this.config.visible);
        }
    }
    
    /**
     * Set position
     */
    setPosition(position) {
        this.config.position = position;
        if (this.container) {
            this.container.style.cssText = this._getPositionStyles();
        }
    }
    
    /**
     * Destroy dashboard
     */
    destroy() {
        if (this.container) {
            this.container.remove();
            this.container = null;
        }
    }
}