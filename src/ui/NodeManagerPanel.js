// src/ui/NodeManagerPanel.js
//
// The Node Manager: a file-system-style organiser for the graph's structure.
//
// It exists because the 3D view deliberately shows you very little. Children
// live inside their parent and only appear once that parent is visited, so even
// within one tier you only ever see the children of the node you selected. That
// is the point of the visualisation, and it is useless for reorganising — you
// cannot move a node somewhere you cannot see.
//
// So this panel shows the whole tree at once and edits it directly: add, delete,
// rename, reorder, and move between tiers. It is the editing surface; the 3D
// view is the reading surface.
//
// Not to be confused with the Node *inspector* (NodeDebugPanel), which reports
// context scores and energy for one node and changes nothing.

const INDENT_PX = 14;

export class NodeManagerPanel {
    /**
     * @param {object} options
     * @param {() => object|null} options.getGraph       the live NodeGraph
     * @param {() => void} [options.onGraphChanged]      called after any edit
     * @param {(nodeId: string) => void} [options.onFocusNode]  reveal in the 3D view
     * @param {() => string|null} [options.getFocusedNode]
     * @param {(msg: string, type?: string) => void} [options.notify]
     */
    constructor(options = {}) {
        this.getGraph = options.getGraph ?? (() => null);
        this.onGraphChanged = options.onGraphChanged ?? (() => {});
        this.onFocusNode = options.onFocusNode ?? (() => {});
        this.getFocusedNode = options.getFocusedNode ?? (() => null);
        this.notify = options.notify ?? ((m) => console.log(m));

        this.container = null;
        this.isOpen = false;

        /** Currently selected row — what the toolbar acts on. */
        this.selectedId = null;

        /**
         * Ids whose children are hidden.
         *
         * Collapsed rather than expanded is stored so a newly created node is
         * visible by default: an outline that hides new work is worse than one
         * that shows too much.
         */
        this.collapsed = new Set();
    }

    // --- lifecycle ---------------------------------------------------------

    init() {
        if (this.container) return;

        this.container = document.createElement('div');
        this.container.className = 'nodemgr-panel hidden';
        this.container.innerHTML = `
            <div class="nodemgr-header">
                <h3>Node Manager</h3>
                <span class="nodemgr-count"></span>
                <button class="nodemgr-close" title="Close" type="button">×</button>
            </div>
            <div class="nodemgr-tree" role="tree"></div>
            <div class="nodemgr-toolbar"></div>
            <div class="nodemgr-status"></div>
        `;

        document.body.appendChild(this.container);

        this.treeEl = this.container.querySelector('.nodemgr-tree');
        this.toolbarEl = this.container.querySelector('.nodemgr-toolbar');
        this.statusEl = this.container.querySelector('.nodemgr-status');
        this.countEl = this.container.querySelector('.nodemgr-count');

        this.container.querySelector('.nodemgr-close')
            .addEventListener('click', () => this.hide());

        this._buildToolbar();
        this._injectStyles();
    }

    show() {
        this.init();
        this.container.classList.remove('hidden');
        this.isOpen = true;
        // Start on whatever the 3D view is looking at, so the two surfaces agree.
        this.selectedId = this.selectedId ?? this.getFocusedNode();
        this.render();
    }

    hide() {
        if (this.container) this.container.classList.add('hidden');
        this.isOpen = false;
    }

    toggle() {
        this.isOpen ? this.hide() : this.show();
    }

    destroy() {
        this.container?.remove();
        this.container = null;
    }

    // --- toolbar -----------------------------------------------------------

    /**
     * The edit actions.
     *
     * Each declares when it is possible, so a button that cannot work says why
     * instead of doing nothing — the same rule the dock follows.
     */
    _actions() {
        const graph = this.getGraph();
        const node = graph && this.selectedId ? graph.getNode(this.selectedId) : null;

        const needsSelection = () => (node ? false : 'Select a node first');

        return [
            {
                id: 'add-child',
                label: 'Child',
                icon: '➕',
                title: 'Add a child inside the selected node',
                disabledReason: needsSelection,
                run: () => {
                    const label = prompt('Name for the new child node:', 'New node');
                    if (!label) return null;
                    const created = graph.createNode({ parentId: node.id, label });
                    if (!created) return 'Could not create that node';
                    // Reveal it: a new child inside a collapsed parent would
                    // otherwise appear to do nothing.
                    this.collapsed.delete(node.id);
                    this.selectedId = created.id;
                    return `Added "${label}" at tier ${created.depth}`;
                }
            },
            {
                id: 'add-sibling',
                label: 'Sibling',
                icon: '➕',
                title: 'Add a node beside the selected one, at the same tier',
                disabledReason: needsSelection,
                run: () => {
                    const label = prompt('Name for the new node:', 'New node');
                    if (!label) return null;
                    const parent = node.parentId ? graph.getNode(node.parentId) : null;
                    const index = parent ? parent.childIds.indexOf(node.id) + 1 : undefined;
                    const created = graph.createNode({
                        parentId: node.parentId ?? null, label, index
                    });
                    if (!created) return 'Could not create that node';
                    this.selectedId = created.id;
                    return `Added "${label}" at tier ${created.depth}`;
                }
            },
            {
                id: 'rename',
                label: 'Rename',
                icon: '✏️',
                disabledReason: needsSelection,
                run: () => {
                    const label = prompt('Rename node:', node.metadata.label);
                    if (!label) return null;
                    graph.renameNode(node.id, label);
                    return `Renamed to "${label}"`;
                }
            },
            {
                id: 'promote',
                label: 'Out',
                icon: '⬅️',
                title: 'Move up one tier, out of its parent',
                disabledReason: () =>
                    needsSelection() || (node.parentId ? false : 'Already at tier 0'),
                run: () => {
                    if (!graph.promote(node.id)) return 'Cannot move that node out';
                    return `Moved to tier ${graph.getNode(node.id).depth}`;
                }
            },
            {
                id: 'demote',
                label: 'In',
                icon: '➡️',
                title: 'Move down one tier, inside the node above it',
                disabledReason: () => {
                    const blocked = needsSelection();
                    if (blocked) return blocked;
                    if (!node.parentId) return 'A tier-0 node has no sibling to move into';
                    const parent = graph.getNode(node.parentId);
                    return parent && parent.childIds.indexOf(node.id) > 0
                        ? false
                        : 'Nothing above it to move into';
                },
                run: () => {
                    if (!graph.demote(node.id)) return 'Cannot move that node in';
                    return `Moved to tier ${graph.getNode(node.id).depth}`;
                }
            },
            {
                id: 'move-up',
                label: 'Up',
                icon: '⬆️',
                title: 'Move earlier among its siblings',
                disabledReason: () => needsSelection() || this._siblingBlock(graph, node, -1),
                run: () => {
                    graph.moveWithinSiblings(node.id, -1);
                    return null;   // reordering is its own feedback
                }
            },
            {
                id: 'move-down',
                label: 'Down',
                icon: '⬇️',
                title: 'Move later among its siblings',
                disabledReason: () => needsSelection() || this._siblingBlock(graph, node, 1),
                run: () => {
                    graph.moveWithinSiblings(node.id, 1);
                    return null;
                }
            },
            {
                id: 'delete',
                label: 'Delete',
                icon: '🗑️',
                danger: true,
                disabledReason: needsSelection,
                run: () => {
                    const descendants = graph.getDescendantIds(node.id);
                    const name = node.metadata.label;

                    // Deleting a node with children is two different intentions,
                    // and guessing wrong loses work either way.
                    if (descendants.length > 0) {
                        const keep = confirm(
                            `"${name}" contains ${descendants.length} node(s).\n\n`
                            + 'OK — keep them, moving them up a tier\n'
                            + 'Cancel — delete them too'
                        );
                        const removed = graph.removeNode(node.id, {
                            strategy: keep ? 'promote' : 'cascade'
                        });
                        this.selectedId = null;
                        return keep
                            ? `Deleted "${name}", kept ${descendants.length} node(s)`
                            : `Deleted "${name}" and ${removed.length - 1} descendant(s)`;
                    }

                    if (!confirm(`Delete "${name}"?`)) return null;
                    graph.removeNode(node.id);
                    this.selectedId = null;
                    return `Deleted "${name}"`;
                }
            }
        ];
    }

    _siblingBlock(graph, node, offset) {
        if (!node.parentId) return 'Reordering needs a parent';
        const parent = graph.getNode(node.parentId);
        if (!parent) return 'Reordering needs a parent';
        const at = parent.childIds.indexOf(node.id);
        if (offset < 0 && at <= 0) return 'Already first';
        if (offset > 0 && at >= parent.childIds.length - 1) return 'Already last';
        return false;
    }

    _buildToolbar() {
        this.toolbarEl.innerHTML = '';

        for (const action of this._actions()) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'nodemgr-action';
            button.dataset.action = action.id;
            if (action.danger) button.classList.add('danger');

            const icon = document.createElement('span');
            icon.textContent = action.icon;
            icon.setAttribute('aria-hidden', 'true');

            const label = document.createElement('span');
            label.className = 'nodemgr-action-label';
            label.textContent = action.label;

            button.append(icon, label);
            button.setAttribute('aria-label', action.title ?? action.label);
            button.addEventListener('click', () => this._run(action.id));
            this.toolbarEl.appendChild(button);
        }
    }

    /**
     * Run an action by id, re-reading it first.
     *
     * The closures in _actions() capture the node that was selected when the
     * toolbar was built, so they are rebuilt on use rather than reused.
     */
    _run(actionId) {
        const action = this._actions().find((a) => a.id === actionId);
        if (!action) return;

        const reason = action.disabledReason?.() || false;
        if (reason) {
            this._setStatus(reason, 'warning');
            return;
        }

        let message;
        try {
            message = action.run();
        } catch (error) {
            console.error(`NodeManagerPanel: "${actionId}" failed:`, error);
            this._setStatus(`${action.label} failed: ${error.message}`, 'error');
            return;
        }

        // null means the action was cancelled at a prompt; nothing happened, so
        // do not claim the graph changed.
        if (message === null) {
            this.render();
            return;
        }

        this.onGraphChanged();
        this.render();
        if (message) this._setStatus(message);
    }

    // --- rendering ---------------------------------------------------------

    render() {
        if (!this.container) return;

        const graph = this.getGraph();
        this.treeEl.innerHTML = '';

        if (!graph || graph.nodes.size === 0) {
            const empty = document.createElement('div');
            empty.className = 'nodemgr-empty';
            empty.textContent = 'No map loaded. Open a map first.';
            this.treeEl.appendChild(empty);
            this.countEl.textContent = '';
            this._syncToolbar();
            return;
        }

        this.countEl.textContent = `${graph.nodes.size} nodes · ${graph.stats.maxDepth + 1} tiers`;

        // Depth-first from every root, so the outline reads top to bottom in the
        // same order the tiers nest.
        const roots = graph.getRootNodes();
        for (const root of roots) this._renderSubtree(graph, root, 0);

        this._syncToolbar();
    }

    _renderSubtree(graph, node, indent) {
        this.treeEl.appendChild(this._renderRow(graph, node, indent));
        if (this.collapsed.has(node.id)) return;
        for (const child of graph.getChildren(node.id)) {
            this._renderSubtree(graph, child, indent + 1);
        }
    }

    _renderRow(graph, node, indent) {
        const row = document.createElement('div');
        row.className = 'nodemgr-row';
        row.dataset.nodeId = node.id;
        row.setAttribute('role', 'treeitem');
        row.style.paddingLeft = `${8 + indent * INDENT_PX}px`;
        if (node.id === this.selectedId) row.classList.add('selected');
        if (node.id === this.getFocusedNode()) row.classList.add('focused');

        const childCount = node.childIds.length;

        // Expand/collapse. A leaf gets a spacer so labels stay aligned.
        const twisty = document.createElement('button');
        twisty.type = 'button';
        twisty.className = 'nodemgr-twisty';
        if (childCount > 0) {
            const isCollapsed = this.collapsed.has(node.id);
            twisty.textContent = isCollapsed ? '▸' : '▾';
            twisty.setAttribute('aria-label', isCollapsed ? 'Expand' : 'Collapse');
            row.setAttribute('aria-expanded', String(!isCollapsed));
            twisty.addEventListener('click', (event) => {
                event.stopPropagation();   // expanding is not selecting
                if (this.collapsed.has(node.id)) this.collapsed.delete(node.id);
                else this.collapsed.add(node.id);
                this.render();
            });
        } else {
            twisty.classList.add('leaf');
            twisty.textContent = '·';
            twisty.disabled = true;
            twisty.setAttribute('aria-hidden', 'true');
        }

        const tier = document.createElement('span');
        tier.className = 'nodemgr-tier';
        tier.textContent = `T${node.depth}`;
        tier.title = `Tier ${node.depth}`;

        const label = document.createElement('span');
        label.className = 'nodemgr-label';
        // textContent: labels are user-authored.
        label.textContent = node.metadata.label || node.id;

        const meta = document.createElement('span');
        meta.className = 'nodemgr-meta';
        meta.textContent = childCount > 0 ? `${childCount}` : '';
        if (childCount > 0) meta.title = `${childCount} child node(s)`;

        row.append(twisty, tier, label, meta);

        row.addEventListener('click', () => {
            this.selectedId = node.id;
            // Selecting here also moves the 3D view, so the two surfaces stay
            // pointed at the same thing.
            this.onFocusNode(node.id);
            this.render();
        });

        return row;
    }

    /** Reflect the current selection into the toolbar's enabled states. */
    _syncToolbar() {
        const actions = this._actions();
        for (const action of actions) {
            const button = this.toolbarEl.querySelector(`[data-action="${action.id}"]`);
            if (!button) continue;
            const reason = action.disabledReason?.() || false;
            button.classList.toggle('unavailable', Boolean(reason));
            button.setAttribute('aria-disabled', reason ? 'true' : 'false');
            button.title = reason || action.title || action.label;
        }
    }

    _setStatus(text, type = 'info') {
        if (!this.statusEl) return;
        this.statusEl.textContent = text || '';
        this.statusEl.className = `nodemgr-status ${type}`;
    }

    // --- styles ------------------------------------------------------------

    _injectStyles() {
        if (document.getElementById('nodemgr-styles')) return;

        const style = document.createElement('style');
        style.id = 'nodemgr-styles';
        // Prefixed selectors, every edge stated. Two stylesheets each supplying
        // half of one component's position is how a toast ended up 814px tall.
        style.textContent = `
            .nodemgr-panel {
                position: fixed;
                top: 64px;
                left: 16px;
                bottom: auto;
                width: 380px;
                max-height: 70vh;
                display: flex;
                flex-direction: column;
                background: rgba(0, 0, 0, 0.94);
                border: 1px solid #333;
                border-radius: 10px;
                backdrop-filter: blur(12px);
                color: #fff;
                font-size: 13px;
                z-index: 1001;
            }
            .nodemgr-panel.hidden { display: none; }

            .nodemgr-header {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 10px 12px;
                border-bottom: 1px solid #222;
            }
            .nodemgr-header h3 {
                margin: 0;
                flex: 1;
                font-size: 13px;
                color: #0ff;
                text-transform: uppercase;
                letter-spacing: 1px;
            }
            .nodemgr-count { color: #888; font-size: 11px; }
            .nodemgr-close {
                background: rgba(255,255,255,0.06);
                border: 1px solid #333;
                border-radius: 6px;
                color: #fff;
                font-size: 18px;
                line-height: 1;
                padding: 2px 8px;
                cursor: pointer;
            }

            .nodemgr-tree {
                flex: 1;
                overflow-y: auto;
                min-height: 120px;
                padding: 4px 0;
            }

            .nodemgr-row {
                display: flex;
                align-items: center;
                gap: 6px;
                /* 34px is tight for a thumb but this is a dense list; the mobile
                   block below raises it. */
                min-height: 34px;
                padding-right: 8px;
                cursor: pointer;
                border-left: 2px solid transparent;
            }
            .nodemgr-row:hover { background: rgba(255,255,255,0.05); }
            .nodemgr-row.selected {
                background: rgba(0,255,255,0.12);
                border-left-color: #0ff;
            }
            /* What the 3D view is looking at, which may not be the selection. */
            .nodemgr-row.focused .nodemgr-label { color: #0ff; }

            .nodemgr-twisty {
                flex: 0 0 auto;
                width: 20px;
                height: 20px;
                padding: 0;
                background: none;
                border: none;
                color: #999;
                font-size: 11px;
                cursor: pointer;
            }
            .nodemgr-twisty.leaf { color: #444; cursor: default; }

            .nodemgr-tier {
                flex: 0 0 auto;
                color: #666;
                font-size: 10px;
                font-family: 'Consolas', 'Monaco', monospace;
            }
            .nodemgr-label {
                flex: 1;
                min-width: 0;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .nodemgr-meta { flex: 0 0 auto; color: #666; font-size: 11px; }

            .nodemgr-toolbar {
                display: flex;
                flex-wrap: wrap;
                gap: 4px;
                padding: 8px;
                border-top: 1px solid #222;
            }
            .nodemgr-action {
                display: flex;
                align-items: center;
                gap: 4px;
                min-height: 34px;
                padding: 5px 8px;
                background: rgba(255,255,255,0.06);
                border: 1px solid #333;
                border-radius: 6px;
                color: #eee;
                font-family: inherit;
                font-size: 11px;
                cursor: pointer;
            }
            .nodemgr-action:hover { border-color: #0ff; }
            .nodemgr-action.danger:hover { border-color: #ef4444; }
            /* Clickable while unavailable, so a press can explain itself. */
            .nodemgr-action.unavailable { opacity: 0.45; }

            .nodemgr-status {
                padding: 6px 12px;
                border-top: 1px solid #222;
                color: #888;
                font-size: 11px;
                min-height: 24px;
                word-break: break-word;
            }
            .nodemgr-status.warning { color: #fcd34d; }
            .nodemgr-status.error { color: #f87171; }
            .nodemgr-empty { padding: 20px 12px; color: #777; text-align: center; }

            /* --- phones -------------------------------------------------- */
            @media (max-width: 720px), (max-height: 500px) {
                .nodemgr-panel {
                    top: 44px;
                    left: 8px;
                    right: 8px;
                    width: auto;
                    /* Clears the dock; --dock-height comes from shell.css. */
                    bottom: calc(var(--dock-height, 0px) + 8px);
                    max-height: none;
                }
                .nodemgr-row { min-height: 40px; }
                .nodemgr-action {
                    min-height: 40px;
                    padding: 6px 8px;
                    font-size: 11px;
                }
                /* Labels stay. Eight buttons do not fit one phone row, so the
                   toolbar wraps to two — which is the right trade here, because
                   "Child" and "Sibling" are both a plus sign and icon-only made
                   the two most-used actions indistinguishable. */
                .nodemgr-toolbar { padding: 6px; }
            }
        `;
        document.head.appendChild(style);
    }
}
