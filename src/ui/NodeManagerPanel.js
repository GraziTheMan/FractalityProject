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
//
// The second half of the panel is the node's page. Every node stands for a concept
// and the map's value is the writing attached to those concepts, not the shape of
// the tree — the tree is how you get to the writing. So the outline and the page
// sit side by side, and the page gets the larger half: reorganising and writing are
// the same session, and the 3D view is not needed for either.

import { renderMarkdownInto, markdownSummary } from './markdown.js';

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

        /** Whether the page pane is showing the editor or the rendered page. */
        this.editing = false;

        /**
         * Which column a narrow screen is showing.
         *
         * Side by side needs width this does not have on a phone, and the phone is
         * where the panel matters most — it is the device you have when the idea
         * arrives. So a phone gets one column and a switch.
         */
        this.pane = 'tree';

        /** The node whose page is currently in the editor, so a switch can commit. */
        this._editingId = null;
        this._commitTimer = null;

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

        /**
         * Re-render when the engine's graph is replaced or edited elsewhere.
         *
         * Bound once so destroy() can remove it. The outline is rendered and then
         * cached, so without this it keeps showing whichever graph it read last —
         * which is exactly what happened when a saved map was opened: the Cone
         * showed the renamed root and this panel still showed the old name.
         */
        this._onGraphChanged = () => {
            if (!this.container) return;

            // A replaced graph may not contain the previously selected node.
            const graph = this.getGraph();
            if (this.selectedId && !graph?.getNode(this.selectedId)) {
                this.selectedId = null;
            }
            // Collapse state is keyed by node id, and those ids belong to the old
            // graph. Keeping it would hide branches of the new one at random.
            this.collapsed.clear();

            if (this.isOpen) this.render();
        };

        /**
         * Follow a focus change made by another surface.
         *
         * The Cone and the 3D view both change the engine's focus when you tap a
         * node, and this panel used to ignore that: you could pick a node in the
         * cone, switch to the outline, and find it still pointed somewhere else.
         *
         * Returning early when the id already matches is what keeps a click in this
         * panel from rendering twice — the row handler sets selectedId, then calls
         * onFocusNode, which fires this synchronously before the handler's own
         * render. There is genuinely nothing to do in that case.
         */
        this._onFocusChanged = (event) => {
            const nodeId = event?.detail?.nodeId;
            if (!nodeId || nodeId === this.selectedId) return;
            if (!this.getGraph()?.getNode(nodeId)) return;

            this.selectedId = nodeId;
            // Expand whatever was hiding it: a selection nobody can see reads as
            // nothing having happened.
            for (let id = this.getGraph().getNode(nodeId).parentId; id; id = this.getGraph().getNode(id)?.parentId) {
                this.collapsed.delete(id);
            }
            if (this.isOpen) {
                this.render();
                this._scrollSelectionIntoView();
            }
        };
    }

    // --- lifecycle ---------------------------------------------------------

    init() {
        if (this.container) return;

        this.container = document.createElement('div');
        this.container.className = 'nodemgr-panel hidden';
        // Static markup only. Every user-authored value below goes in through
        // textContent or the markdown renderer, never through here.
        this.container.innerHTML = `
            <div class="nodemgr-header">
                <h3>Node Manager</h3>
                <span class="nodemgr-count"></span>
                <div class="nodemgr-tabs" role="tablist">
                    <button class="nodemgr-tab" data-pane="tree" type="button" role="tab">Outline</button>
                    <button class="nodemgr-tab" data-pane="page" type="button" role="tab">Page</button>
                </div>
                <button class="nodemgr-close" title="Close" type="button">×</button>
            </div>
            <div class="nodemgr-body">
                <div class="nodemgr-column nodemgr-column-tree">
                    <div class="nodemgr-tree" role="tree"></div>
                    <div class="nodemgr-toolbar"></div>
                </div>
                <div class="nodemgr-column nodemgr-column-page">
                    <div class="nodemgr-page-head">
                        <span class="nodemgr-page-title"></span>
                        <span class="nodemgr-page-tier"></span>
                        <button class="nodemgr-mode" type="button"></button>
                    </div>
                    <div class="nodemgr-inflow" hidden></div>
                    <div class="nodemgr-page-body">
                        <div class="nodemgr-rendered"></div>
                        <textarea class="nodemgr-editor" spellcheck="true"
                            placeholder="Write this node's page in Markdown.

# Heading

Link to another node with [[its name]].

- a list
- another item"></textarea>
                    </div>
                    <div class="nodemgr-page-foot"></div>
                </div>
            </div>
            <div class="nodemgr-status"></div>
        `;

        document.body.appendChild(this.container);

        this.treeEl = this.container.querySelector('.nodemgr-tree');
        this.toolbarEl = this.container.querySelector('.nodemgr-toolbar');
        this.statusEl = this.container.querySelector('.nodemgr-status');
        this.countEl = this.container.querySelector('.nodemgr-count');
        this.pageTitleEl = this.container.querySelector('.nodemgr-page-title');
        this.pageTierEl = this.container.querySelector('.nodemgr-page-tier');
        this.renderedEl = this.container.querySelector('.nodemgr-rendered');
        this.editorEl = this.container.querySelector('.nodemgr-editor');
        this.modeButton = this.container.querySelector('.nodemgr-mode');
        this.pageFootEl = this.container.querySelector('.nodemgr-page-foot');
        this.inflowEl = this.container.querySelector('.nodemgr-inflow');

        this.container.querySelector('.nodemgr-close')
            .addEventListener('click', () => this.hide());

        for (const tab of this.container.querySelectorAll('.nodemgr-tab')) {
            tab.addEventListener('click', () => this._showPane(tab.dataset.pane));
        }

        this.modeButton.addEventListener('click', () => this._setEditing(!this.editing));

        // Committed on a debounce while typing and again on blur. There is no Save
        // button on purpose: a page you typed and then clicked away from is a page
        // you wrote, and a dialog asking whether you meant it is a trap you have to
        // answer before you are allowed to look at anything else.
        this.editorEl.addEventListener('input', () => {
            this._setStatus('Typing…');
            clearTimeout(this._commitTimer);
            this._commitTimer = setTimeout(() => this._commitContent(), 600);
        });
        this.editorEl.addEventListener('blur', () => {
            clearTimeout(this._commitTimer);
            this._commitContent();
        });

        this._buildToolbar();
        this._injectStyles();

        window.addEventListener('fractality:graphReplaced', this._onGraphChanged);
        window.addEventListener('fractality:graphChanged', this._onGraphChanged);
        window.addEventListener('fractality:focusChanged', this._onFocusChanged);
    }

    show() {
        this.init();
        this.container.classList.remove('hidden');
        this.isOpen = true;
        // Start on whatever the engine is looking at. The engine's focus is the
        // shared selection and this panel's selectedId is a cache of it, so the
        // engine wins — the other way round meant selecting a node in the cone with
        // this panel closed, reopening it, and finding it still pointed at whatever
        // was selected here last. The focusChanged listener only runs from init()
        // onwards, so this is also what covers focus changes made while closed.
        this.selectedId = this.getFocusedNode() ?? this.selectedId;
        this._showPane(this.pane);
        this.render();
        this._scrollSelectionIntoView();
    }

    hide() {
        // Closing the panel is the third way to stop writing, alongside blurring
        // the editor and selecting another node. All three must commit.
        clearTimeout(this._commitTimer);
        this._commitContent();
        if (this.container) this.container.classList.add('hidden');
        this.isOpen = false;
    }

    toggle() {
        this.isOpen ? this.hide() : this.show();
    }

    destroy() {
        window.removeEventListener('fractality:graphReplaced', this._onGraphChanged);
        window.removeEventListener('fractality:graphChanged', this._onGraphChanged);
        window.removeEventListener('fractality:focusChanged', this._onFocusChanged);
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
                id: 'converge',
                label: 'Emerges from',
                icon: '⤵',
                title: 'Add another node this one emerged from',
                disabledReason: () => needsSelection()
                    || (node && this._eligibleContributors(graph, node).length === 0
                        ? 'Nothing can contribute to this node without making a loop'
                        : false),
                run: () => {
                    // The picker is the interesting part. Prompting for an id would be
                    // unusable — nobody knows the ids — and a free-text label match
                    // would silently pick the wrong node when two share a name. So it
                    // offers a numbered list of what is actually eligible, which also
                    // means the illegal choices are never on screen to be made.
                    const eligible = this._eligibleContributors(graph, node);
                    if (eligible.length === 0) {
                        return 'Nothing can contribute to this node without '
                            + 'making a loop. Try a node on a tier above it.';
                    }

                    const menu = eligible
                        .map((n, i) => `${i + 1}. ${n.metadata.label || n.id} (tier ${n.depth})`)
                        .join('\n');
                    const answer = prompt(
                        `What else did "${node.metadata.label || node.id}" emerge from?\n\n`
                        + `${menu}\n\nEnter a number:`
                    );
                    if (!answer) return null;

                    const choice = eligible[Number(answer) - 1];
                    if (!choice) return `"${answer}" is not one of the choices`;

                    if (!graph.addEmergence(node.id, choice.id)) {
                        return `Could not add that: it would make a loop`;
                    }
                    this.onGraphChanged();
                    return `"${node.metadata.label || node.id}" now emerges from `
                        + `"${choice.metadata.label || choice.id}" — tier ${graph.getNode(node.id).depth}`;
                }
            },
            {
                id: 'diverge',
                label: 'Detach',
                icon: '⤴',
                title: 'Remove a node this one emerged from',
                disabledReason: () => needsSelection()
                    || (node && node.emergesFrom.length === 0
                        ? 'This node emerged from nothing else'
                        : false),
                run: () => {
                    const sources = graph.getEmergentParents(node.id);
                    if (sources.length === 0) return 'This node emerged from nothing else';

                    // One source needs no menu; asking anyway is a step of nothing.
                    let choice = sources[0];
                    if (sources.length > 1) {
                        const menu = sources
                            .map((n, i) => `${i + 1}. ${n.metadata.label || n.id}`)
                            .join('\n');
                        const answer = prompt(
                            `Stop "${node.metadata.label || node.id}" emerging from which?\n\n`
                            + `${menu}\n\nEnter a number:`
                        );
                        if (!answer) return null;
                        choice = sources[Number(answer) - 1];
                        if (!choice) return `"${answer}" is not one of the choices`;
                    }

                    if (!graph.removeEmergence(node.id, choice.id)) {
                        return 'Could not remove that';
                    }
                    this.onGraphChanged();
                    return `No longer emerging from "${choice.metadata.label || choice.id}" `
                        + `— now tier ${graph.getNode(node.id).depth}`;
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
            this._renderPage();
            return;
        }

        this.countEl.textContent = `${graph.nodes.size} nodes · ${graph.stats.maxDepth + 1} tiers`;

        // Depth-first from every root, so the outline reads top to bottom in the
        // same order the tiers nest.
        const roots = graph.getRootNodes();
        for (const root of roots) this._renderSubtree(graph, root, 0);

        this._syncToolbar();
        this._renderPage();
    }

    _renderSubtree(graph, node, indent) {
        this.treeEl.appendChild(this._renderRow(graph, node, indent));
        if (this.collapsed.has(node.id)) return;

        for (const child of graph.getChildren(node.id)) {
            this._renderSubtree(graph, child, indent + 1);
        }

        // Reference rows for nodes that emerged from this one but live elsewhere.
        //
        // An outline is a tree and the graph is not, so a node with several parents has
        // to appear once as itself and otherwise as a reference. The alternative —
        // repeating the whole subtree under every contributor — gives N copies of one
        // node, and then the question of which copy is real.
        //
        // Drawn after the real children so the containment tree reads uninterrupted,
        // and only when not collapsed: convergence is detail, and hiding a branch
        // should hide it.
        for (const emergent of graph.getEmergentChildren(node.id)) {
            this.treeEl.appendChild(this._renderReferenceRow(graph, emergent, indent + 1));
        }
    }

    /**
     * A pointer to a node that emerged from this one but is filed somewhere else.
     *
     * Deliberately not a `.nodemgr-row`: it must not look like a second home for the
     * node, and the toolbar must not act on it as though it were. Clicking it navigates
     * to the real row.
     */
    _renderReferenceRow(graph, node, indent) {
        const row = document.createElement('div');
        row.className = 'nodemgr-ref';
        row.dataset.refId = node.id;
        row.style.paddingLeft = `${8 + indent * INDENT_PX}px`;
        row.setAttribute('role', 'link');

        const arrow = document.createElement('span');
        arrow.className = 'nodemgr-ref-arrow';
        arrow.textContent = '↳';
        arrow.setAttribute('aria-hidden', 'true');

        const label = document.createElement('span');
        label.className = 'nodemgr-ref-label';
        label.textContent = node.metadata.label || node.id;

        const where = document.createElement('span');
        where.className = 'nodemgr-ref-where';
        const container = node.parentId ? graph.getNode(node.parentId) : null;
        where.textContent = container
            ? `emerges here · lives in ${container.metadata.label || container.id}`
            : 'emerges here';

        // Marked when it points at the selection, so the outline shows every place the
        // selected node appears rather than only its home.
        if (node.id === this.selectedId) row.classList.add('selected');

        row.append(arrow, label, where);
        const name = node.metadata.label || node.id;
        row.title = `"${name}" emerged partly from this node. Click to go to it.`;
        row.addEventListener('click', () => this.selectNode(node.id));
        return row;
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

        // Which nodes have writing behind them, at a glance. Without this the
        // outline gives no way to tell a concept that has been thought through from
        // one that is still just a word, and finding out means clicking every row.
        const page = document.createElement('span');
        page.className = 'nodemgr-haspage';

        const content = node.metadata.content ?? '';
        if (content.trim()) {
            page.textContent = '◈';
            page.title = markdownSummary(content, 160) || 'Has a page';
        } else {
            page.textContent = '';
            page.setAttribute('aria-hidden', 'true');
        }

        const meta = document.createElement('span');
        meta.className = 'nodemgr-meta';
        meta.textContent = childCount > 0 ? `${childCount}` : '';
        if (childCount > 0) meta.title = `${childCount} child node(s)`;

        row.append(twisty, tier, label, page, meta);

        row.addEventListener('click', () => {
            this.selectedId = node.id;
            // Selecting here also moves the 3D view, so the two surfaces stay
            // pointed at the same thing.
            this.onFocusNode(node.id);
            this.render();
        });

        // On a phone the page is behind a tab, so a tap on the row selects and a
        // second tap opens what it selected. Jumping straight to the page on the
        // first tap would make the outline impossible to browse.
        row.addEventListener('dblclick', () => this._showPane('page'));

        return row;
    }

    // --- the page ----------------------------------------------------------

    /**
     * Show one column on a narrow screen. On a wide one both are visible and this
     * only moves the tab highlight, which is why it does not hide anything itself:
     * the media query decides what is on screen, not this method.
     */
    _showPane(pane) {
        this.pane = pane === 'page' ? 'page' : 'tree';
        this.container.dataset.pane = this.pane;
        for (const tab of this.container.querySelectorAll('.nodemgr-tab')) {
            const active = tab.dataset.pane === this.pane;
            tab.classList.toggle('active', active);
            tab.setAttribute('aria-selected', String(active));
        }
    }

    /**
     * Switch the page pane between reading and writing.
     *
     * A node with no page opens straight into the editor: showing an empty reading
     * pane and making you find the button first is one step of nothing.
     */
    _setEditing(editing) {
        // Leaving the editor commits, so the toggle can never be the thing that
        // loses a paragraph.
        if (this.editing && !editing) {
            clearTimeout(this._commitTimer);
            this._commitContent();
        }

        const changed = this.editing !== Boolean(editing);
        this.editing = Boolean(editing);
        this.container.classList.toggle('editing', this.editing);
        this.modeButton.textContent = this.editing ? '👁 Read' : '✎ Write';
        this.modeButton.title = this.editing
            ? 'Show the page as it reads'
            : 'Edit this page';
        // Only on an actual switch. This method is also called from every render to
        // re-apply the current mode, and focusing there would pull the caret out of
        // the outline whenever anything redrew.
        if (changed && this.editing) this.editorEl.focus();
    }

    /**
     * Write the editor's text into the graph.
     *
     * Guarded on the id the text was loaded for rather than the current selection.
     * Without that, a debounce still pending when the selection changes would write
     * one node's page onto another — the kind of bug that is only noticed later,
     * once the wrong page is the only page.
     */
    _commitContent() {
        const graph = this.getGraph();
        const id = this._editingId;
        if (!graph || !id) return;

        const node = graph.getNode(id);
        if (!node) return;

        const next = this.editorEl.value;
        if ((node.metadata.content ?? '') === next) {
            this._setStatus('');
            return;
        }

        graph.setContent(id, next);
        this._refreshPageMeta(graph, node);
        // The row shows whether a node has a page, so it has to be redrawn — but
        // only the one row, because re-rendering the outline while typing would
        // scroll the tree out from under the cursor.
        this._refreshRow(graph, id);

        // Deliberately NOT onGraphChanged(). That invalidates the family view, the
        // CACE analysis and the layout, none of which depend on a node's text — so
        // on every debounce tick it would be pure waste. It would also announce a
        // graph change, which re-enters render(), which commits again: a loop that
        // only terminates by accident.

        this._setStatus(
            next.trim()
                ? 'Page saved into the map. Use Maps → Overwrite to store the map itself.'
                : 'Page cleared.'
        );
    }

    /**
     * Load the selected node's page into the pane.
     *
     * Commits the outgoing page first: changing the selection is one of the ways
     * you stop writing, and the least expected way to lose text.
     */
    _renderPage() {
        const graph = this.getGraph();
        const node = this.selectedId ? graph?.getNode(this.selectedId) : null;

        if (this._editingId && this._editingId !== this.selectedId) {
            clearTimeout(this._commitTimer);
            this._commitContent();
        }

        if (!node) {
            this._editingId = null;
            this.pageTitleEl.textContent = 'No node selected';
            this.pageTierEl.textContent = '';
            this.editorEl.value = '';
            this.editorEl.disabled = true;
            this.modeButton.classList.add('unavailable');
            this.renderedEl.replaceChildren(
                this._placeholder('Pick a node in the outline to read or write its page.')
            );
            this.pageFootEl.textContent = '';
            if (this.inflowEl) this.inflowEl.hidden = true;
            return;
        }

        this._editingId = node.id;
        this.editorEl.disabled = false;
        this.modeButton.classList.remove('unavailable');
        this.editorEl.value = node.metadata.content ?? '';

        this._refreshPageMeta(graph, node);

        // A node with nothing written opens ready to write.
        if (!this.editorEl.value.trim() && !this.editing) this._setEditing(true);
        else this._setEditing(this.editing);
    }

    /** The title line, the rendered page, and the footer note. */
    _refreshPageMeta(graph, node) {
        this.pageTitleEl.textContent = node.metadata.label || node.id;

        // Tier and branch are metadata, so they are stated quietly beside the name
        // rather than being the heading. The concept is the subject of the page.
        const siblings = node.parentId ? (graph.getNode(node.parentId)?.childIds ?? []) : graph.getRootNodes().map((n) => n.id);
        const position = siblings.indexOf(node.id);
        const parts = [`Tier ${node.depth}`];
        if (position >= 0 && siblings.length > 1) parts.push(`${position + 1} of ${siblings.length}`);
        if (node.childIds.length) parts.push(`${node.childIds.length} below`);
        this.pageTierEl.textContent = parts.join(' · ');

        this._refreshInflow(graph, node);

        const content = node.metadata.content ?? '';
        if (content.trim()) {
            renderMarkdownInto(this.renderedEl, content, {
                resolveWikiLink: (target) => this._resolveWikiLink(graph, target),
                onWikiLink: (nodeId) => this.selectNode(nodeId),
            });
        } else {
            this.renderedEl.replaceChildren(
                this._placeholder(`"${node.metadata.label || node.id}" has no page yet.`)
            );
        }

        this.pageFootEl.textContent = content.trim()
            ? `${content.length} characters · linked with [[node name]]`
            : 'Markdown. Link to another node with [[its name]].';
    }

    /**
     * What flows into the selected node, above its page.
     *
     * The counterpart of the outline's reference rows: there you see convergence from
     * the contributor's side, here from the emergent node's. Both are needed, because
     * an emergent node's contributors are the most interesting fact about it and the
     * outline can only ever file it under one of them.
     */
    _refreshInflow(graph, node) {
        if (!this.inflowEl) return;
        this.inflowEl.replaceChildren();

        const sources = graph.getEmergentParents(node.id);
        if (sources.length === 0) {
            this.inflowEl.hidden = true;
            return;
        }
        this.inflowEl.hidden = false;

        const caption = document.createElement('span');
        caption.className = 'nodemgr-inflow-caption';
        caption.textContent = sources.length === 1 ? 'Emerges from' : `Emerges from ${sources.length}`;
        this.inflowEl.appendChild(caption);

        for (const source of sources) {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'nodemgr-inflow-chip';
            chip.textContent = source.metadata.label || source.id;
            chip.title = `Tier ${source.depth} · click to go to it`;
            chip.addEventListener('click', () => this.selectNode(source.id));
            this.inflowEl.appendChild(chip);
        }

        // The containing parent, stated last and differently. It is a parent too, but
        // it is the one that decides where the node is filed rather than one of the
        // streams that made it, and showing them identically would erase the
        // distinction the whole model rests on.
        if (node.parentId) {
            const container = graph.getNode(node.parentId);
            if (container) {
                const chip = document.createElement('button');
                chip.type = 'button';
                chip.className = 'nodemgr-inflow-chip container';
                chip.textContent = `inside ${container.metadata.label || container.id}`;
                chip.title = 'The containing scale — where this node is filed';
                chip.addEventListener('click', () => this.selectNode(container.id));
                this.inflowEl.appendChild(chip);
            }
        }
    }

    /**
     * Find the node a [[wiki link]] names.
     *
     * By label first, because that is what a person types, and case-insensitively
     * for the same reason. Falls back to the id so a link written against an
     * exported file still resolves.
     */
    _resolveWikiLink(graph, target) {
        if (!graph) return null;
        const wanted = String(target).trim().toLowerCase();
        if (!wanted) return null;

        for (const node of graph.nodes.values()) {
            if ((node.metadata.label ?? '').trim().toLowerCase() === wanted) return node.id;
        }
        for (const node of graph.nodes.values()) {
            if (node.id.toLowerCase() === wanted) return node.id;
        }
        return null;
    }

    _placeholder(text) {
        const el = document.createElement('p');
        el.className = 'nodemgr-page-empty';
        el.textContent = text;
        return el;
    }

    /**
     * Select a node from outside the outline — a wiki link, or another surface.
     *
     * Expands whatever was hiding it, because selecting a row nobody can see looks
     * like nothing happened.
     */
    selectNode(nodeId) {
        const graph = this.getGraph();
        if (!graph?.getNode(nodeId)) return false;

        for (let id = graph.getNode(nodeId).parentId; id; id = graph.getNode(id)?.parentId) {
            this.collapsed.delete(id);
        }

        this.selectedId = nodeId;
        this.onFocusNode(nodeId);
        if (this.isOpen) {
            this.render();
            this._scrollSelectionIntoView();
        }
        return true;
    }

    _scrollSelectionIntoView() {
        const row = this.treeEl?.querySelector('.nodemgr-row.selected');
        // Guarded: jsdom and older browsers have no scrollIntoView on every element.
        row?.scrollIntoView?.({ block: 'nearest' });
    }

    /** Redraw one row in place, so typing does not scroll the outline. */
    _refreshRow(graph, nodeId) {
        const row = this.treeEl?.querySelector(`.nodemgr-row[data-node-id="${CSS.escape(nodeId)}"]`);
        const node = graph.getNode(nodeId);
        if (!row || !node) return;
        const indent = Math.round((parseFloat(row.style.paddingLeft) - 8) / INDENT_PX);
        row.replaceWith(this._renderRow(graph, node, Number.isFinite(indent) ? indent : 0));
    }

    /**
     * Nodes that could legally become contributors to `node`.
     *
     * Computed rather than filtered after the fact, so an illegal choice is never on
     * screen to be made. The rules are the model's, restated here only to build the
     * list: not itself, not already a parent by either relation, and not something
     * below it — which would close a loop.
     *
     * Sorted by tier then label. Tier first because a contributor is nearly always
     * something above the node, so the likely answers come first.
     */
    _eligibleContributors(graph, node) {
        if (!graph || !node) return [];

        return [...graph.nodes.values()]
            .filter((candidate) => candidate.id !== node.id)
            .filter((candidate) => candidate.id !== node.parentId)
            .filter((candidate) => !node.emergesFrom.includes(candidate.id))
            .filter((candidate) => !graph.wouldCreateCycle(node.id, candidate.id))
            .sort((a, b) => (a.depth - b.depth)
                || String(a.metadata.label ?? a.id)
                    .localeCompare(String(b.metadata.label ?? b.id)));
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
            /* Full width, between the two docks. Viewing the 3D map while
               reorganising is not useful — you cannot move a node to somewhere the
               3D view will not show you — and the page needs room to be read. The
               inset uses both dock variables from shell.css so the panel can never
               cover the controls, which is how the Cone view came to hide the dock. */
            .nodemgr-panel {
                position: fixed;
                top: calc(var(--dock-top-height, 0px) + 8px);
                left: 12px;
                right: 12px;
                bottom: calc(var(--dock-height, 0px) + 8px);
                width: auto;
                max-height: none;
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

            /* Two columns, the page taking the larger share. */
            .nodemgr-body {
                flex: 1;
                display: flex;
                min-height: 0;   /* lets the children scroll instead of growing */
                overflow: hidden;
            }
            .nodemgr-column {
                display: flex;
                flex-direction: column;
                min-height: 0;
                min-width: 0;
            }
            .nodemgr-column-tree {
                flex: 0 0 340px;
                border-right: 1px solid #222;
            }
            .nodemgr-column-page { flex: 1 1 auto; }

            /* The tabs only matter on a narrow screen. */
            .nodemgr-tabs { display: none; }
            .nodemgr-tab {
                background: rgba(255,255,255,0.06);
                border: 1px solid #333;
                color: #bbb;
                font-family: inherit;
                font-size: 11px;
                min-height: 32px;
                padding: 4px 10px;
                cursor: pointer;
            }
            .nodemgr-tab:first-child { border-radius: 6px 0 0 6px; }
            .nodemgr-tab:last-child { border-radius: 0 6px 6px 0; }
            .nodemgr-tab.active { background: rgba(0,255,255,0.16); border-color: #0ff; color: #fff; }

            /* --- convergence in the outline ------------------------------ */
            /* Not a .nodemgr-row: it must not read as a second home for the node,
               and the toolbar must not act on it as though it were one. */
            .nodemgr-ref {
                display: flex;
                align-items: center;
                gap: 6px;
                min-height: 26px;
                padding-right: 8px;
                font-size: 11px;
                color: #7a7a7a;
                cursor: pointer;
                border-left: 2px solid transparent;
            }
            .nodemgr-ref:hover { background: rgba(0,255,255,0.05); color: #bbb; }
            .nodemgr-ref.selected { border-left-color: #0ff6; color: #9dd; }
            .nodemgr-ref-arrow { flex: 0 0 auto; color: #0ff8; }
            .nodemgr-ref-label {
                flex: 0 1 auto;
                min-width: 0;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                font-style: italic;
            }
            .nodemgr-ref-where {
                flex: 1 1 auto;
                min-width: 0;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                color: #555;
                font-size: 10px;
            }

            /* --- what flows into the selected node ----------------------- */
            .nodemgr-inflow {
                display: flex;
                align-items: center;
                flex-wrap: wrap;
                gap: 5px;
                padding: 7px 14px;
                border-bottom: 1px solid #222;
                background: rgba(0,255,255,0.03);
            }
            .nodemgr-inflow[hidden] { display: none; }
            .nodemgr-inflow-caption {
                color: #666;
                font-size: 10px;
                letter-spacing: 0.5px;
                text-transform: uppercase;
            }
            .nodemgr-inflow-chip {
                background: rgba(0,255,255,0.10);
                border: 1px solid #0ff4;
                border-radius: 999px;
                color: #0ff;
                font-family: inherit;
                font-size: 11px;
                min-height: 24px;
                padding: 2px 9px;
                cursor: pointer;
            }
            .nodemgr-inflow-chip:hover { background: rgba(0,255,255,0.2); }
            /* The containing parent is a parent too, but it decides where the node is
               filed rather than being one of the streams that made it. Showing them
               identically would erase the distinction the model rests on. */
            .nodemgr-inflow-chip.container {
                background: none;
                border-color: #444;
                border-style: dashed;
                color: #888;
            }

            /* --- the page ------------------------------------------------- */
            .nodemgr-page-head {
                display: flex;
                align-items: baseline;
                gap: 10px;
                padding: 10px 14px;
                border-bottom: 1px solid #222;
            }
            .nodemgr-page-title {
                flex: 0 1 auto;
                min-width: 0;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                font-size: 16px;
                color: #fff;
            }
            /* Tier and branch are metadata: stated, not headlined. The concept's
               name is the subject of the page. */
            .nodemgr-page-tier {
                flex: 1 1 auto;
                color: #666;
                font-size: 11px;
                font-family: 'Consolas', 'Monaco', monospace;
                white-space: nowrap;
            }
            .nodemgr-mode {
                flex: 0 0 auto;
                background: rgba(255,255,255,0.06);
                border: 1px solid #333;
                border-radius: 6px;
                color: #eee;
                font-family: inherit;
                font-size: 11px;
                min-height: 32px;
                padding: 4px 10px;
                cursor: pointer;
            }
            .nodemgr-mode:hover { border-color: #0ff; }
            .nodemgr-mode.unavailable { opacity: 0.45; }

            .nodemgr-page-body {
                flex: 1;
                min-height: 0;
                display: flex;
                overflow: hidden;
            }
            /* One of the two is shown; .editing on the panel decides which. */
            .nodemgr-rendered {
                flex: 1;
                overflow-y: auto;
                padding: 4px 18px 18px;
                line-height: 1.6;
            }
            .nodemgr-editor {
                display: none;
                flex: 1;
                min-width: 0;
                margin: 0;
                padding: 12px 16px;
                background: rgba(255,255,255,0.03);
                border: none;
                color: #eee;
                font-family: 'Consolas', 'Monaco', monospace;
                font-size: 13px;
                line-height: 1.6;
                resize: none;
                outline: none;
            }
            .nodemgr-panel.editing .nodemgr-rendered { display: none; }
            .nodemgr-panel.editing .nodemgr-editor { display: block; }
            .nodemgr-editor:disabled { opacity: 0.4; }

            .nodemgr-page-foot {
                padding: 6px 14px;
                border-top: 1px solid #222;
                color: #666;
                font-size: 11px;
                min-height: 22px;
            }
            .nodemgr-page-empty { color: #777; font-style: italic; }

            /* --- rendered markdown --------------------------------------- */
            .nodemgr-rendered h1,
            .nodemgr-rendered h2,
            .nodemgr-rendered h3,
            .nodemgr-rendered h4,
            .nodemgr-rendered h5,
            .nodemgr-rendered h6 {
                margin: 1.1em 0 0.4em;
                color: #0ff;
                line-height: 1.3;
            }
            .nodemgr-rendered h1 { font-size: 20px; }
            .nodemgr-rendered h2 { font-size: 17px; }
            .nodemgr-rendered h3 { font-size: 15px; }
            .nodemgr-rendered h4,
            .nodemgr-rendered h5,
            .nodemgr-rendered h6 { font-size: 13px; color: #7dd3fc; }
            .nodemgr-rendered p { margin: 0 0 0.9em; }
            .nodemgr-rendered ul,
            .nodemgr-rendered ol { margin: 0 0 0.9em; padding-left: 1.5em; }
            .nodemgr-rendered li { margin: 0.2em 0; }
            .nodemgr-rendered li.md-task { list-style: none; margin-left: -1.2em; }
            .nodemgr-rendered blockquote {
                margin: 0 0 0.9em;
                padding: 2px 0 2px 12px;
                border-left: 3px solid #0ff4;
                color: #bbb;
            }
            .nodemgr-rendered code {
                background: rgba(255,255,255,0.08);
                border-radius: 3px;
                padding: 1px 4px;
                font-family: 'Consolas', 'Monaco', monospace;
                font-size: 0.92em;
            }
            .nodemgr-rendered pre {
                margin: 0 0 0.9em;
                padding: 10px 12px;
                background: rgba(255,255,255,0.05);
                border: 1px solid #222;
                border-radius: 6px;
                /* Its own scroller. A long code line must not widen the page. */
                overflow-x: auto;
            }
            .nodemgr-rendered pre code { background: none; padding: 0; }
            .nodemgr-rendered hr { border: none; border-top: 1px solid #333; margin: 1.2em 0; }
            .nodemgr-rendered a { color: #7dd3fc; }
            .nodemgr-rendered table {
                border-collapse: collapse;
                margin: 0 0 0.9em;
                display: block;
                overflow-x: auto;
                max-width: 100%;
            }
            .nodemgr-rendered th,
            .nodemgr-rendered td {
                border: 1px solid #2a2a2a;
                padding: 4px 8px;
                text-align: left;
            }
            .nodemgr-rendered th { background: rgba(255,255,255,0.05); }

            /* A link to another node. A button, not an anchor: it navigates this
               app's own state and has no URL to point at. */
            .nodemgr-rendered .md-wikilink {
                background: rgba(0,255,255,0.10);
                border: 1px solid #0ff4;
                border-radius: 4px;
                color: #0ff;
                font: inherit;
                padding: 0 5px;
                cursor: pointer;
            }
            .nodemgr-rendered .md-wikilink:hover { background: rgba(0,255,255,0.2); }
            /* A reference to a node that does not exist yet, which is a normal
               thing to write. Shown, and marked as going nowhere. */
            .nodemgr-rendered .md-wikilink.md-unresolved {
                background: none;
                border-style: dashed;
                border-color: #555;
                color: #888;
                cursor: default;
            }

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
            .nodemgr-haspage {
                flex: 0 0 auto;
                width: 12px;
                color: #0ff;
                font-size: 10px;
                text-align: center;
            }

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

            /* --- a narrower desktop window ------------------------------- */
            @media (max-width: 1100px) and (min-width: 721px) {
                .nodemgr-column-tree { flex: 0 0 280px; }
            }

            /* --- phones -------------------------------------------------- */
            @media (max-width: 720px), (max-height: 500px) {
                .nodemgr-panel {
                    top: calc(var(--dock-top-height, 0px) + 8px);
                    left: 8px;
                    right: 8px;
                    /* Clears the dock; --dock-height comes from shell.css. */
                    bottom: calc(var(--dock-height, 0px) + 8px);
                }

                /* One column at a time. 340px of outline plus a page is not
                   readable on a phone, and a page squeezed to half a phone is not
                   a page — so the tabs choose, and both get the whole width. */
                .nodemgr-tabs { display: flex; }
                .nodemgr-column-tree {
                    flex: 1 1 auto;
                    border-right: none;
                }
                .nodemgr-panel[data-pane="page"] .nodemgr-column-tree { display: none; }
                .nodemgr-panel[data-pane="tree"] .nodemgr-column-page { display: none; }
                /* The header has to give the tabs room. */
                .nodemgr-header h3 { display: none; }
                .nodemgr-count { flex: 1; }

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
                .nodemgr-rendered { padding: 4px 12px 14px; }
                .nodemgr-page-head { padding: 8px 12px; }
                .nodemgr-page-title { font-size: 15px; }
            }
        `;
        document.head.appendChild(style);
    }
}
