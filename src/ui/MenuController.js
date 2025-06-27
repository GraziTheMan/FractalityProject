// src/ui/MenuController.js

export class MenuController {
    constructor(options = {}) {
        this.handedness = options.handedness || 'right'; // or 'left'
        this.menuRoot = options.menuRoot || document.getElementById('menu-root');
        this.reverseToggle = options.reverseToggle || document.getElementById('reverse-toggle');
        this.categories = options.categories || [];
        this.state = {
            expanded: false
        };

        this._setupListeners();
        this._renderMenu();
    }

    _setupListeners() {
        this.menuRoot.addEventListener('click', () => this.toggleMenu());
        if (this.reverseToggle) {
            this.reverseToggle.addEventListener('click', () => this.toggleHandedness());
        }
    }

    toggleHandedness() {
        this.handedness = this.handedness === 'right' ? 'left' : 'right';
        this._renderMenu();
    }

    toggleMenu() {
        this.state.expanded = !this.state.expanded;
        this._renderMenu();
    }

    _renderMenu() {
        const container = document.getElementById('menu-category-container');
        container.innerHTML = '';

        if (!this.state.expanded) return;

        const centerX = this.handedness === 'right' ? window.innerWidth - 80 : 80;
        const centerY = window.innerHeight - 80;
        const radiusX = 120;
        const radiusY = 80;
        const angleSpan = Math.PI / 2;
        const angleStart = this.handedness === 'right' ? -Math.PI / 2 : -Math.PI;

        const points = this._calculateEllipticalArc(
            { x: centerX, y: centerY },
            this.categories.length,
            radiusX, radiusY,
            angleStart, angleSpan
        );

        this.categories.forEach((cat, i) => {
            const node = document.createElement('div');
            node.className = 'menu-node';
            node.innerText = cat.icon || '?';
            node.title = cat.label || '';
            node.style.position = 'absolute';
            node.style.left = `${points[i].x}px`;
            node.style.top = `${points[i].y}px`;
            node.style.transform = 'translate(-50%, -50%)';
            node.addEventListener('click', () => {
                if (cat.onClick) cat.onClick();
                if (cat.subnodes) {
                    this._renderSubnodes(points[i], cat.subnodes);
                }
            });
            container.appendChild(node);
        });
    }

    _renderSubnodes(origin, subnodes) {
        const container = document.getElementById('menu-category-container');
        const radius = 60;
        const angleStep = (2 * Math.PI) / subnodes.length;

        subnodes.forEach((sn, i) => {
            const angle = i * angleStep;
            const x = origin.x + radius * Math.cos(angle);
            const y = origin.y + radius * Math.sin(angle);

            const node = document.createElement('div');
            node.className = 'submenu-node';
            node.innerText = sn.icon || '•';
            node.title = sn.label || '';
            node.style.position = 'absolute';
            node.style.left = `${x}px`;
            node.style.top = `${y}px`;
            node.style.transform = 'translate(-50%, -50%)';
            node.addEventListener('click', () => {
                if (sn.onClick) sn.onClick();
            });
            container.appendChild(node);
        });
    }

    _calculateEllipticalArc(center, count, radiusX, radiusY, angleStart, angleSpan) {
        const points = [];
        const angleStep = count > 1 ? angleSpan / (count - 1) : 0;
        for (let i = 0; i < count; i++) {
            const angle = angleStart + i * angleStep;
            points.push({
                x: center.x + radiusX * Math.cos(angle),
                y: center.y + radiusY * Math.sin(angle)
            });
        }
        return points;
    }
}