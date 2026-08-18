// src/ui/DockMenu.js
//
// The app's primary navigation: a row of buttons pinned to one edge, where a
// button either performs an action directly or expands into a sheet of related
// actions.
//
// This replaces the Fibonacci radial menu. Two things were wrong with that, and
// only one of them was the spiral:
//
//   1. Nine text labels fanned across an arc are hard to hit, and need a
//      560x380 box to avoid overlapping themselves.
//   2. Eight of its nine buttons did nothing. They called AppState.setView()
//      with names no view had been built for, and the router answered by
//      printing "Switched to: <name>". A tidier arrangement of buttons that do
//      nothing is not an improvement, so this component takes the opposite
//      stance: an item either works or it says why it cannot.
//
// The item list is plain data. Rearranging the menu, renaming a group, or moving
// an entry between groups is an edit to that list, not to this file — which
// matters because the set of destinations is expected to keep changing.

/**
 * @typedef {object} DockItem
 * @property {string} id                      stable identity, used for state
 * @property {string} icon                    one emoji
 * @property {string|(() => string)} label   short; shown on wide screens and as
 *                                            the accessible name everywhere. A
 *                                            function is re-evaluated on every
 *                                            refresh(), which is how one entry
 *                                            can read "Sign in" or "Account"
 *                                            depending on session state.
 * @property {() => void} [onSelect]          action items
 * @property {DockItem[]} [items]             group items: children for the sheet
 * @property {boolean} [exclusive]
 *           Group items only: the children are a radio set, exactly one of which
 *           is always chosen. Such a group is never highlighted on the basis of
 *           having an active child, because that would be true permanently and
 *           so would carry no information. Groups of independent toggles leave
 *           this false, where "something in here is on" is worth showing.
 * @property {() => boolean} [isActive]       renders as the current choice
 * @property {() => string|false} [disabledReason]
 *           When it returns a string the item is disabled and the string
 *           explains why. This is the honest alternative to a button that
 *           looks live and silently does nothing.
 */

/** Resolve a value that may be a plain string or a function returning one. */
function text(value) {
    return typeof value === 'function' ? value() : value;
}

export class DockMenu {
    /**
     * @param {object} options
     * @param {HTMLElement} options.container
     * @param {DockItem[]} options.items
     * @param {(message: string, type?: string) => void} [options.notify]
     *   Used to surface a disabled item's reason when it is tapped.
     */
    constructor({ container, items = [], notify } = {}) {
        if (!container) throw new Error('DockMenu: a container element is required');

        this.container = container;
        this.items = items;
        this.notify = notify ?? ((message) => console.log(message));

        /** id of the group whose sheet is open, or null. */
        this.openGroupId = null;

        this.sheet = null;
        this._buttons = new Map();

        // Bound once so they can be removed again in destroy(). Anonymous
        // handlers here would leak a listener per DockMenu, and MenuController's
        // failure to do this is a known outstanding item in the audit.
        this._onDocumentPointerDown = (event) => {
            if (!this.openGroupId) return;
            // A tap inside the dock or the open sheet is not "outside".
            if (this.container.contains(event.target)) return;
            if (this.sheet?.contains(event.target)) return;
            this.closeAll();
        };

        this._onKeyDown = (event) => {
            if (event.key === 'Escape' && this.openGroupId) {
                this.closeAll();
                // Return focus to the button that opened the sheet, or the user
                // is left with no idea where they are in the tab order.
                this._buttons.get(this.openGroupId)?.focus();
            }
        };

        this._injectStyles();
        this.render();

        document.addEventListener('pointerdown', this._onDocumentPointerDown);
        document.addEventListener('keydown', this._onKeyDown);
    }

    // --- data ---------------------------------------------------------------

    /** Replace the whole menu. */
    setItems(items) {
        this.items = items ?? [];
        this.closeAll();
        this.render();
    }

    /**
     * Re-evaluate isActive/disabledReason without rebuilding the DOM.
     *
     * Called after anything that changes what the menu reports — switching
     * layout, the engine booting, signing in. Kept separate from render() so
     * refreshing state cannot close an open sheet under the user's finger.
     */
    refresh() {
        for (const [id, button] of this._buttons) {
            const item = this._find(id);
            if (!item) continue;
            this._applyState(button, item);
        }
    }

    _find(id, items = this.items) {
        for (const item of items) {
            if (item.id === id) return item;
            if (item.items) {
                const hit = this._find(id, item.items);
                if (hit) return hit;
            }
        }
        return null;
    }

    /** True when any child of a group is the active choice. */
    _groupHasActiveChild(item) {
        return Boolean(item.items?.some((child) => child.isActive?.()));
    }

    // --- rendering ----------------------------------------------------------

    render() {
        this.container.innerHTML = '';
        this._buttons.clear();

        const row = document.createElement('div');
        row.className = 'dock-row';
        row.setAttribute('role', 'toolbar');
        row.setAttribute('aria-label', 'Main navigation');

        for (const item of this.items) {
            const button = this._createButton(item, { isGroup: Boolean(item.items) });
            row.appendChild(button);
        }

        this.container.appendChild(row);
    }

    _createButton(item, { isGroup }) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'dock-button';
        button.dataset.dockId = item.id;

        const icon = document.createElement('span');
        icon.className = 'dock-icon';
        icon.textContent = item.icon ?? '';
        // The emoji is decoration: the label below is the accessible name, so a
        // screen reader should not announce "chart increasing Perf".
        icon.setAttribute('aria-hidden', 'true');

        const label = document.createElement('span');
        label.className = 'dock-label';
        label.textContent = text(item.label);

        button.append(icon, label);
        button.setAttribute('aria-label', text(item.label));

        if (isGroup) {
            button.setAttribute('aria-expanded', 'false');
            button.setAttribute('aria-haspopup', 'true');
            button.addEventListener('click', () => this.toggleGroup(item.id));
        } else {
            button.addEventListener('click', () => this._activate(item));
        }

        this._applyState(button, item);
        this._buttons.set(item.id, button);
        return button;
    }

    _applyState(button, item) {
        // Dynamic labels are re-resolved here so refresh() updates them. Without
        // this, a label that depends on session state would only change on a full
        // rebuild — and rebuilding closes any open sheet.
        if (typeof item.label === 'function') {
            const resolved = text(item.label);
            const labelEl = button.querySelector('.dock-label');
            if (labelEl && labelEl.textContent !== resolved) labelEl.textContent = resolved;
            button.setAttribute('aria-label', resolved);

            const nameEl = button.querySelector('.dock-sheet-name');
            if (nameEl && nameEl.textContent !== resolved) nameEl.textContent = resolved;
        }
        if (typeof item.description === 'function') {
            const descEl = button.querySelector('.dock-sheet-description');
            const resolved = text(item.description);
            if (descEl && descEl.textContent !== resolved) descEl.textContent = resolved;
        }

        const reason = item.disabledReason?.() || false;

        // Deliberately NOT the `disabled` attribute. A disabled button swallows
        // its own click, so the user gets no feedback at all — which is the
        // "nothing happens" problem again. It stays clickable and explains
        // itself; aria-disabled carries the state to assistive tech.
        button.classList.toggle('unavailable', Boolean(reason));
        button.setAttribute('aria-disabled', reason ? 'true' : 'false');
        button.title = reason || text(item.label);

        const active = item.items
            ? (!item.exclusive && this._groupHasActiveChild(item))
            : Boolean(item.isActive?.());

        button.classList.toggle('active', active);
        // aria-pressed only means something for a toggle, and only action items
        // that report activeness are one.
        if (!item.items && item.isActive) {
            button.setAttribute('aria-pressed', active ? 'true' : 'false');
        }
    }

    _activate(item) {
        const reason = item.disabledReason?.() || false;
        if (reason) {
            this.notify(reason, 'warning');
            return;
        }

        this.closeAll();
        try {
            item.onSelect?.();
        } catch (error) {
            console.error(`DockMenu: "${item.id}" failed:`, error);
            this.notify(`${text(item.label)} failed: ${error.message}`, 'error');
        }
        this.refresh();
    }

    // --- groups -------------------------------------------------------------

    toggleGroup(id) {
        if (this.openGroupId === id) {
            this.closeAll();
            return;
        }
        this.openGroup(id);
    }

    openGroup(id) {
        const item = this._find(id);
        if (!item?.items) return;

        this.closeAll();

        const sheet = document.createElement('div');
        sheet.className = 'dock-sheet';
        // A radio set is a radiogroup, not a menu: its rows already carry
        // aria-checked, and the two roles read very differently aloud.
        sheet.setAttribute('role', item.exclusive ? 'radiogroup' : 'menu');
        sheet.setAttribute('aria-label', text(item.label));

        const heading = document.createElement('div');
        heading.className = 'dock-sheet-heading';
        heading.textContent = text(item.label);
        sheet.appendChild(heading);

        for (const child of item.items) {
            if (child.separator) {
                const rule = document.createElement('div');
                rule.className = 'dock-sheet-separator';
                sheet.appendChild(rule);
                continue;
            }
            sheet.appendChild(this._createSheetRow(child));
        }

        this.container.appendChild(sheet);
        this.sheet = sheet;
        this.openGroupId = id;

        this._buttons.get(id)?.setAttribute('aria-expanded', 'true');
        this._buttons.get(id)?.classList.add('open');

        // Focus the first row so the sheet is usable from a keyboard as well as
        // a thumb.
        sheet.querySelector('.dock-sheet-row:not(.unavailable)')?.focus();
    }

    _createSheetRow(child) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'dock-sheet-row';
        row.dataset.dockId = child.id;
        row.setAttribute('role', child.isActive ? 'menuitemradio' : 'menuitem');

        const icon = document.createElement('span');
        icon.className = 'dock-sheet-icon';
        icon.textContent = child.icon ?? '';
        icon.setAttribute('aria-hidden', 'true');

        // Named textWrap, not text: the module-level text() helper resolves
        // callable labels, and a local of the same name would shadow it.
        const textWrap = document.createElement('span');
        textWrap.className = 'dock-sheet-text';

        const name = document.createElement('span');
        name.className = 'dock-sheet-name';
        name.textContent = text(child.label);
        textWrap.appendChild(name);

        // A one-line description earns its space here in a way it would not on
        // the dock itself: these are choices the user is making deliberately.
        if (child.description) {
            const description = document.createElement('span');
            description.className = 'dock-sheet-description';
            description.textContent = text(child.description);
            textWrap.appendChild(description);
        }

        const check = document.createElement('span');
        check.className = 'dock-sheet-check';
        check.textContent = '✓';
        check.setAttribute('aria-hidden', 'true');

        row.append(icon, textWrap, check);

        const reason = child.disabledReason?.() || false;
        row.classList.toggle('unavailable', Boolean(reason));
        row.setAttribute('aria-disabled', reason ? 'true' : 'false');
        row.title = reason || text(child.label);

        const active = Boolean(child.isActive?.());
        row.classList.toggle('active', active);
        row.setAttribute('aria-checked', active ? 'true' : 'false');

        row.addEventListener('click', () => this._activate(child));

        this._buttons.set(child.id, row);
        return row;
    }

    closeAll() {
        if (this.openGroupId) {
            const button = this._buttons.get(this.openGroupId);
            button?.setAttribute('aria-expanded', 'false');
            button?.classList.remove('open');
        }
        this.sheet?.remove();
        this.sheet = null;
        this.openGroupId = null;
    }

    destroy() {
        document.removeEventListener('pointerdown', this._onDocumentPointerDown);
        document.removeEventListener('keydown', this._onKeyDown);
        this.closeAll();
        this.container.innerHTML = '';
        this._buttons.clear();
    }

    // --- styles -------------------------------------------------------------

    _injectStyles() {
        if (document.getElementById('dock-menu-styles')) return;

        const style = document.createElement('style');
        style.id = 'dock-menu-styles';
        // Every selector here is prefixed `dock-`, and each rule states the
        // edges it depends on. A `.notification` styled from two stylesheets at
        // once once produced an 814px-tall toast 175px off the left of the
        // screen; nothing here should be reachable by a stylesheet written for
        // some other DOM.
        style.textContent = `
            .dock-row {
                display: flex;
                align-items: stretch;
                gap: 6px;
                width: 100%;
            }

            .dock-button {
                flex: 1 1 0;
                min-width: 0;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 2px;
                /* 44px is the smallest comfortable touch target, and it is
                   stated on the base rule so no breakpoint can lose it. A
                   landscape phone previously fell through to the wide-screen
                   rule below and rendered 33px buttons. */
                min-height: 44px;
                padding: 6px 4px;
                background: rgba(255, 255, 255, 0.04);
                border: 1px solid #333;
                border-radius: 10px;
                color: #ddd;
                font-family: inherit;
                font-size: 10px;
                line-height: 1.2;
                cursor: pointer;
                transition: border-color 0.15s, background 0.15s;
                -webkit-tap-highlight-color: transparent;
            }

            .dock-button .dock-icon { font-size: 19px; line-height: 1; }

            .dock-button .dock-label {
                max-width: 100%;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .dock-button:hover { border-color: #555; }

            .dock-button.active,
            .dock-button.open {
                border-color: #0ff;
                background: rgba(0, 255, 255, 0.10);
                color: #fff;
            }

            /* Visibly inert, still clickable, so tapping it can explain itself. */
            .dock-button.unavailable { opacity: 0.45; }

            .dock-button:focus-visible,
            .dock-sheet-row:focus-visible {
                outline: 2px solid #0ff;
                outline-offset: 2px;
            }

            /* The sheet opens from the dock's own edge. bottom is set by the
               dock's stylesheet, which knows whether the dock is top or bottom
               anchored; --dock-sheet-offset is that hook. */
            .dock-sheet {
                position: absolute;
                left: 8px;
                right: 8px;
                bottom: var(--dock-sheet-offset, 100%);
                max-height: 60vh;
                overflow-y: auto;
                margin-bottom: 8px;
                padding: 6px;
                background: rgba(8, 8, 10, 0.97);
                border: 1px solid #333;
                border-radius: 12px;
                backdrop-filter: blur(14px);
                box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.6);
                z-index: 40;
            }

            .dock-sheet-heading {
                padding: 6px 10px 8px;
                color: #0ff;
                font-size: 10px;
                text-transform: uppercase;
                letter-spacing: 1px;
            }

            .dock-sheet-separator {
                height: 1px;
                margin: 6px 4px;
                background: #262626;
            }

            .dock-sheet-row {
                display: flex;
                align-items: center;
                gap: 10px;
                width: 100%;
                /* 44px is the smallest comfortable touch target; these are the
                   rows a thumb aims at. */
                min-height: 44px;
                padding: 8px 10px;
                background: none;
                border: none;
                border-radius: 8px;
                color: #eee;
                font-family: inherit;
                font-size: 13px;
                text-align: left;
                cursor: pointer;
            }

            .dock-sheet-row:hover { background: rgba(255, 255, 255, 0.06); }
            .dock-sheet-row.active { background: rgba(0, 255, 255, 0.10); color: #fff; }
            .dock-sheet-row.unavailable { opacity: 0.45; }

            .dock-sheet-icon { flex: 0 0 auto; font-size: 17px; line-height: 1; }
            .dock-sheet-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
            .dock-sheet-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

            .dock-sheet-description {
                color: #888;
                font-size: 11px;
                line-height: 1.3;
            }

            .dock-sheet-check {
                flex: 0 0 auto;
                color: #0ff;
                opacity: 0;
            }
            .dock-sheet-row.active .dock-sheet-check { opacity: 1; }

            /* Wider screens have room for the labels to sit beside the icons.
             *
             * The condition is the exact inverse of shell.css's compact
             * breakpoint (max-width: 720px, max-height: 500px). A bare
             * 'min-width: 721px' also caught landscape phones — 844px wide but
             * only 390px tall — which put a desktop row layout inside a bottom
             * bar and produced 33px buttons. */
            @media (min-width: 721px) and (min-height: 501px) {
                .dock-button {
                    flex: 0 0 auto;
                    flex-direction: row;
                    gap: 6px;
                    padding: 8px 12px;
                    font-size: 12px;
                }
                .dock-button .dock-icon { font-size: 15px; }
                .dock-sheet { left: auto; right: 8px; min-width: 280px; }
            }
        `;
        document.head.appendChild(style);
    }
}
