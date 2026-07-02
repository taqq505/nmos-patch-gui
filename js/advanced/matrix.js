/**
 * MTX — X-Y Crosspoint Matrix View
 * Advanced Mode module. Loaded lazily via dynamic import() when Advanced Mode is first activated.
 *
 * Deps (passed from app.js): storage (StorageManager instance)
 * NMOSClient is imported directly to keep this module self-contained.
 */

import { NMOSClient } from '../nmos-api.js';
import { ComboManager } from '../combo-manager.js';

const FORMAT_FILTER = {
    video: (fmt) => !!fmt && fmt.includes('video'),
    audio: (fmt) => !!fmt && fmt.includes('audio'),
    data:  (fmt) => !!fmt && fmt.includes('data'),
    combo: null, // handled directly in _collectSenders / _collectReceivers
};

export class MatrixView {
    constructor(container, storage) {
        this.container = container;
        this.storage = storage;
        this._combo = new ComboManager(storage);
        this.activeTab = 'video';
        this._clientCache = new Map();
        this._activeStates = new Map();
        this._toastTimer = null;
        this._expandedNodes = new Set();
        this._leftCollapsed  = false;
        this._rightCollapsed = false;
        // patch_mode: 'take' | 'oneclick' | 'bulk'
        this._patchMode   = storage.getMatrixSettings().patch_mode || 'take';
        this._bulkPending = new Map(); // td → {sender, receiver}
        this._zoom        = storage.getMatrixSettings().zoom || 1.0;

        // Auto re-render when nodes are updated (debounced)
        const debouncedRender = this._debounce(() => {
            if (document.getElementById('advancedMode')?.style.display !== 'none') {
                this.render();
            }
        }, 400);
        document.addEventListener('nmos:nodes-updated', debouncedRender);
    }

    open() {
        this.render();
        this._autoRefresh();
    }

    setTab(tab) {
        this.activeTab = tab;
        this.render();
        this._autoRefresh();
    }

    _autoRefresh() {
        const settings = this.storage.getMatrixSettings();
        const hiddenR   = new Set(settings.hidden_receivers || []);
        const receivers = this._collectReceivers().filter(r => !hiddenR.has(r.key));
        this._refreshActiveStates(receivers);
    }

    render() {
        const settings = this.storage.getMatrixSettings();
        const hiddenS = new Set(settings.hidden_senders || []);
        const hiddenR = new Set(settings.hidden_receivers || []);

        const allSenders   = this._collectSenders();
        const allReceivers = this._collectReceivers();
        const visSenders   = allSenders.filter(s => !hiddenS.has(s.key));
        const visReceivers = allReceivers.filter(r => !hiddenR.has(r.key));

        this.container.innerHTML = '';

        // Status bar
        const statusBar = document.createElement('div');
        statusBar.className = 'mtx-status-bar';
        statusBar.innerHTML = `
            <span class="mtx-status-info">
                <span class="mtx-stat-num">${visSenders.length}</span> senders &nbsp;×&nbsp;
                <span class="mtx-stat-num">${visReceivers.length}</span> receivers
            </span>
            <div class="mtx-status-actions">
                <div class="mtx-mode-seg" id="mtxModeSeg" role="group" aria-label="Patch mode">
                    <button class="mtx-mode-seg-btn${this._patchMode === 'take'     ? ' active' : ''}" data-mode="take"
                        title="Click a cell → confirm in the bottom bar → TAKE">TAKE</button>
                    <button class="mtx-mode-seg-btn${this._patchMode === 'oneclick' ? ' active' : ''}" data-mode="oneclick"
                        title="Click a cell → patch immediately (no confirmation)">1-CLICK</button>
                    <button class="mtx-mode-seg-btn${this._patchMode === 'bulk'     ? ' active' : ''}" data-mode="bulk"
                        title="Select multiple cells → TAKE ALL to patch at once">BULK</button>
                </div>
                <div class="mtx-zoom-ctrl" title="Ctrl+Wheel also zooms. Double-click the value to reset.">
                    <button class="mtx-zoom-btn" id="mtxZoomOut" title="Zoom out">−</button>
                    <span class="mtx-zoom-val" id="mtxZoomVal">${Math.round(this._zoom * 100)}%</span>
                    <button class="mtx-zoom-btn" id="mtxZoomIn"  title="Zoom in">+</button>
                </div>
                <button class="btn btn-secondary mtx-refresh-btn" id="mtxRefreshBtn"
                    title="Fetch current connection state from IS-05">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
                        <polyline points="23 4 23 10 17 10"/>
                        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                    </svg>
                    Refresh
                </button>
            </div>
        `;
        this.container.appendChild(statusBar);

        // Three-column layout
        const layout = document.createElement('div');
        layout.className = 'mtx-layout';

        const leftPanel  = this._buildSidePanel('sender',   allSenders,   hiddenS);
        const rightPanel = this._buildSidePanel('receiver', allReceivers, hiddenR);

        const center = document.createElement('div');
        center.className = 'mtx-center';
        const gridEl = this._buildGrid(visSenders, visReceivers);
        // Apply zoom to grid wrapper
        const gw = gridEl.querySelector ? gridEl : gridEl;
        gridEl.style.zoom = this._zoom;
        center.appendChild(gridEl);

        layout.append(leftPanel, center, rightPanel);
        this.container.appendChild(layout);

        // Confirm / bulk bar
        const confirmBar = document.createElement('div');
        confirmBar.className = 'mtx-confirm-bar';
        confirmBar.id = 'mtxConfirmBar';
        this.container.appendChild(confirmBar);

        // Refresh button
        document.getElementById('mtxRefreshBtn')?.addEventListener('click', () => {
            this._refreshActiveStates(visReceivers);
        });

        // Mode selector
        document.getElementById('mtxModeSeg')?.addEventListener('click', e => {
            const btn = e.target.closest('.mtx-mode-seg-btn');
            if (!btn) return;
            const mode = btn.dataset.mode;
            if (mode === this._patchMode) return;
            this._clearPendingState();
            this._patchMode = mode;
            const s = this.storage.getMatrixSettings();
            s.patch_mode = mode;
            this.storage.saveMatrixSettings(s);
            document.querySelectorAll('.mtx-mode-seg-btn').forEach(b =>
                b.classList.toggle('active', b.dataset.mode === mode));
            const labels = { take: 'TAKE mode', oneclick: '1-CLICK mode', bulk: 'BULK mode' };
            this._showToast(labels[mode], 'success');
        });

        // Zoom controls
        document.getElementById('mtxZoomIn') ?.addEventListener('click', () => this._applyZoom(this._zoom + 0.1));
        document.getElementById('mtxZoomOut')?.addEventListener('click', () => this._applyZoom(this._zoom - 0.1));
        document.getElementById('mtxZoomVal')?.addEventListener('dblclick', () => this._applyZoom(1.0));

        // Ctrl+Wheel zoom on matrix area
        center.addEventListener('wheel', e => {
            if (!e.ctrlKey) return;
            e.preventDefault();
            this._applyZoom(this._zoom + (e.deltaY < 0 ? 0.1 : -0.1));
        }, { passive: false });
    }

    // ── Data collection ──────────────────────────────────────────────────────

    _collectSenders() {
        if (this.activeTab === 'combo') return this._combo.collectComboSenders();
        const match = FORMAT_FILTER[this.activeTab];
        const result = [];
        for (const node of this.storage.getAllNodes()) {
            if (node.type === 'combo') continue; // combos only in COMBO tab
            for (const s of (node.senders || [])) {
                if (match && !match(s.format || '')) continue;
                const localLabel = this.storage.getSenderLocalLabel(node.id, s.id);
                const displayLabel = localLabel || s.label || s.id;
                result.push({
                    ...s,
                    nodeId:       node.id,
                    nodeName:     node.name,
                    nodeType:     node.type || 'is04',
                    key:          `${node.id}:${s.id}`,
                    displayLabel,
                    is04Label:    s.label,
                });
            }
        }
        return result;
    }

    _collectReceivers() {
        if (this.activeTab === 'combo') return this._combo.collectComboReceivers();
        const match = FORMAT_FILTER[this.activeTab];
        const result = [];
        for (const node of this.storage.getAllNodes()) {
            if (node.type === 'sdp' || node.type === 'combo') continue;
            for (const r of (node.receivers || [])) {
                if (match && !match(r.format || '')) continue;
                const lock = this.storage.getReceiverLock(node.id, r.id);
                const displayLabel = lock.local_label || r.label || r.id;
                result.push({
                    ...r,
                    nodeId:       node.id,
                    nodeName:     node.name,
                    key:          `${node.id}:${r.id}`,
                    locked:       lock.locked,
                    displayLabel,
                    is04Label:    r.label,
                });
            }
        }
        return result;
    }

    // ── Side panels ───────────────────────────────────────────────────────────

    _buildSidePanel(type, items, hiddenSet) {
        const isSender    = type === 'sender';
        const isCollapsed = isSender ? this._leftCollapsed : this._rightCollapsed;
        const label       = isSender ? 'SENDERS' : 'RECEIVERS';

        const panel = document.createElement('div');
        panel.className = `mtx-side-panel mtx-${isSender ? 'left' : 'right'}-panel${isCollapsed ? ' panel-collapsed' : ''}`;

        // ── Strip (always visible narrow bar) ──
        const strip = document.createElement('div');
        strip.className = 'mtx-panel-strip';

        const chevronDir = isSender
            ? (isCollapsed ? 'right' : 'left')
            : (isCollapsed ? 'left' : 'right');

        const toggleBtn = document.createElement('div');
        toggleBtn.className = 'mtx-panel-toggle-btn';
        toggleBtn.innerHTML = this._chevronSvg(chevronDir);

        const stripLabel = document.createElement('span');
        stripLabel.className = 'mtx-panel-strip-label';
        stripLabel.textContent = label;

        strip.append(toggleBtn, stripLabel);

        // Whole strip is the click target
        strip.addEventListener('click', () => {
            if (isSender) this._leftCollapsed  = !this._leftCollapsed;
            else          this._rightCollapsed = !this._rightCollapsed;
            this.render();
        });

        // ── Body (tree content) ──
        const body = document.createElement('div');
        body.className = 'mtx-panel-body';
        body.innerHTML = this._buildTreeHTML(type, items, hiddenSet);

        if (isSender) panel.append(strip, body);
        else          panel.append(body, strip); // strip on the right for receiver panel

        this._wireTreePanel(body, type);
        return panel;
    }

    _chevronSvg(dir) {
        const pts = dir === 'left'  ? '15 18 9 12 15 6' : '9 18 15 12 9 6';
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" width="16" height="16"><polyline points="${pts}"/></svg>`;
    }

    _buildTreeHTML(type, items, hiddenSet) {
        const byNode = new Map();
        for (const item of items) {
            if (!byNode.has(item.nodeId)) byNode.set(item.nodeId, { name: item.nodeName, items: [] });
            byNode.get(item.nodeId).items.push(item);
        }

        const title = type === 'sender' ? 'Senders' : 'Receivers';

        if (byNode.size === 0) {
            return `<div class="mtx-panel-title">${title}</div>
                    <div class="mtx-panel-empty">No ${this.activeTab} ${type}s found</div>`;
        }

        const arrowSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="10" height="10"><polyline points="6 9 12 15 18 9"/></svg>`;
        const lockSvg  = `<svg class="mtx-lock-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;

        let html = `<div class="mtx-panel-title">${title}</div>`;

        for (const [nodeId, group] of byNode) {
            const onCount  = group.items.filter(i => !hiddenSet.has(i.key)).length;
            const total    = group.items.length;
            const allOn    = onCount === total;
            const allOff   = onCount === 0;
            const indet    = !allOn && !allOff ? ' data-indet' : '';
            const nodeChk  = allOn ? ' checked' : '';
            const collapsed = !this._expandedNodes.has(nodeId);

            html += `<div class="mtx-tree-group">
                <div class="mtx-tree-node-header">
                    <button class="mtx-tree-arrow${collapsed ? ' collapsed' : ''}" data-node-id="${nodeId}">${arrowSvg}</button>
                    <input type="checkbox" class="mtx-node-cb" data-node-id="${nodeId}" data-type="${type}"${nodeChk}${indet}>
                    <span class="mtx-tree-node-label" title="${this._esc(group.name)}">${this._esc(group.name)}</span>
                    <span class="mtx-tree-node-count">${onCount}/${total}</span>
                </div>
                <div class="mtx-tree-items${collapsed ? ' collapsed' : ''}" data-node-id="${nodeId}">`;

            for (const item of group.items) {
                const chk        = hiddenSet.has(item.key) ? '' : ' checked';
                const lockedCls  = (type === 'receiver' && item.locked) ? ' mtx-tree-item--locked' : '';
                const icon       = (type === 'receiver' && item.locked) ? lockSvg : '';
                const tooltipExtra = item.is04Label && item.is04Label !== item.displayLabel
                    ? ` [${this._esc(item.is04Label)}]` : '';
                html += `<label class="mtx-tree-item${lockedCls}" title="${this._esc(item.displayLabel)} (${this._esc(item.nodeName)})${tooltipExtra}">
                    <input type="checkbox" class="mtx-item-cb" data-key="${item.key}" data-node-id="${nodeId}"${chk}>
                    <span class="mtx-tree-label">${this._esc(item.displayLabel)}</span>
                    ${icon}
                </label>`;
            }

            html += `</div></div>`;
        }
        return html;
    }

    _wireTreePanel(panel, type) {
        const setVis = type === 'sender'
            ? (k, v) => this.storage.setMatrixSenderVisible(k, v)
            : (k, v) => this.storage.setMatrixReceiverVisible(k, v);

        // Apply indeterminate state (can't be set in HTML)
        panel.querySelectorAll('.mtx-node-cb[data-indet]').forEach(cb => { cb.indeterminate = true; });

        // Arrow: collapse / expand
        panel.querySelectorAll('.mtx-tree-arrow').forEach(btn => {
            btn.addEventListener('click', () => {
                const nid = btn.dataset.nodeId;
                if (this._expandedNodes.has(nid)) this._expandedNodes.delete(nid);
                else this._expandedNodes.add(nid);
                this.render();
            });
        });

        // Node checkbox: toggle all children
        panel.querySelectorAll('.mtx-node-cb').forEach(nodeCb => {
            nodeCb.addEventListener('change', () => {
                const nid = nodeCb.dataset.nodeId;
                nodeCb.indeterminate = false;
                panel.querySelectorAll(`.mtx-item-cb[data-node-id="${nid}"]`).forEach(cb => {
                    cb.checked = nodeCb.checked;
                    setVis(cb.dataset.key, nodeCb.checked);
                });
                this.render();
            });
        });

        // Item checkbox: update storage
        panel.querySelectorAll('.mtx-item-cb').forEach(cb => {
            cb.addEventListener('change', () => {
                setVis(cb.dataset.key, cb.checked);
                this.render();
            });
        });
    }

    // ── Grid ─────────────────────────────────────────────────────────────────
    // Layout: rows = Senders (left headers), columns = Receivers (top headers)

    _buildGrid(senders, receivers) {
        const wrapper = document.createElement('div');
        wrapper.className = 'mtx-grid-wrapper';

        if (senders.length === 0 || receivers.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'mtx-empty-state';
            empty.innerHTML = senders.length === 0
                ? `No ${this.activeTab} senders visible.<br>Enable senders in the left panel.`
                : `No ${this.activeTab} receivers visible.<br>Enable receivers in the right panel.`;
            wrapper.appendChild(empty);
            return wrapper;
        }

        const table = document.createElement('table');
        table.className = 'mtx-table';

        // ── Column header row: RECEIVERS ──
        const thead = document.createElement('thead');
        const htr = document.createElement('tr');

        const corner = document.createElement('th');
        corner.className = 'mtx-corner';
        htr.appendChild(corner);

        const lockBadgeSvg = `<div class="mtx-col-lock-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="10" height="10"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div>`;

        const colHeaders = [];
        receivers.forEach((r, colIdx) => {
            const isComboR = this._combo.isCombo(r);
            const th = document.createElement('th');
            th.className = 'mtx-col-header'
                + (r.locked ? ' mtx-col-header--locked' : '')
                + (isComboR ? ' mtx-col-header--combo' : '');
            th.dataset.colIdx = colIdx;
            const is04Note = r.is04Label && r.is04Label !== r.displayLabel ? ` [${r.is04Label}]` : '';
            const hint = `${r.nodeName} / ${r.displayLabel}${is04Note}${r.locked ? ' [LOCKED]' : ''}`;
            const badges = isComboR ? `<div class="mtx-col-combo-badges">${this._combo.streamBadgesHtml(r)}</div>` : '';
            th.innerHTML = `<div class="mtx-col-label" title="${this._esc(hint)}">${this._esc(r.displayLabel)}</div>${badges}${r.locked ? lockBadgeSvg : ''}`;
            htr.appendChild(th);
            colHeaders.push(th);
        });

        thead.appendChild(htr);
        table.appendChild(thead);

        // ── Body rows: SENDERS ──
        const tbody = document.createElement('tbody');
        const rowHeaders = [];

        senders.forEach((s) => {
            const tr = document.createElement('tr');
            tr.dataset.senderId = s.id;
            tr.dataset.senderNodeId = s.nodeId;

            // Row header on the LEFT = Sender name
            const isComboS = this._combo.isCombo(s);
            const th = document.createElement('th');
            th.className = 'mtx-row-header' + (isComboS ? ' mtx-row-header--combo' : '');
            const sIs04Note = s.is04Label && s.is04Label !== s.displayLabel ? ` [${s.is04Label}]` : '';
            th.title = `${s.nodeName} / ${s.displayLabel}${sIs04Note}`;
            if (isComboS) {
                th.innerHTML = `<span class="mtx-row-label">${this._esc(s.displayLabel)}</span>`
                    + `<span class="mtx-row-combo-badges">${this._combo.streamBadgesHtml(s)}</span>`;
            } else {
                th.textContent = s.displayLabel;
            }
            tr.appendChild(th);
            rowHeaders.push(th);

            receivers.forEach((r, colIdx) => {
                const td = document.createElement('td');
                td.className = 'mtx-cell';
                td.dataset.receiverId = r.id;
                td.dataset.senderId = s.id;
                td.dataset.colIdx = colIdx;

                const activeSenderId = this._activeStates.get(r.id) ?? r.subscription?.sender_id ?? null;
                if (activeSenderId && activeSenderId === s.id) {
                    td.classList.add('mtx-cell--active');
                }

                const isComboPair = this._combo.isCombo(s) && this._combo.isCombo(r);
                const isComboCell = this._combo.isCombo(s) || this._combo.isCombo(r);
                if (isComboPair) td.classList.add('mtx-cell--combo-pair');
                else if (isComboCell) td.classList.add('mtx-cell--combo-single');

                if (r.locked) {
                    td.classList.add('mtx-cell--locked');
                    td.title = 'Receiver is locked';
                } else {
                    td.title = `${s.displayLabel} → ${r.displayLabel}`;
                    td.addEventListener('click', () => this._onCellClick(td, s, r));
                }

                tr.appendChild(td);
            });

            tbody.appendChild(tr);
        });
        table.appendChild(tbody);

        // ── Crosshair hover ──
        table.addEventListener('mouseover', e => {
            const cell = e.target.closest('.mtx-cell');
            if (!cell) return;
            const colIdx = cell.dataset.colIdx;
            const tr = cell.closest('tr');
            colHeaders.forEach((th, i) => th.classList.toggle('mtx-col-highlight', String(i) === colIdx));
            rowHeaders.forEach(th => th.classList.toggle('mtx-row-highlight', th.closest('tr') === tr));
            table.querySelectorAll('.mtx-cell').forEach(c => {
                c.classList.toggle('mtx-cross-hover', c.dataset.colIdx === colIdx || c.closest('tr') === tr);
            });
        });
        table.addEventListener('mouseleave', () => {
            colHeaders.forEach(th => th.classList.remove('mtx-col-highlight'));
            rowHeaders.forEach(th => th.classList.remove('mtx-row-highlight'));
            table.querySelectorAll('.mtx-cross-hover').forEach(c => c.classList.remove('mtx-cross-hover'));
        });

        wrapper.appendChild(table);
        return wrapper;
    }

    // ── Interaction ───────────────────────────────────────────────────────────

    _onCellClick(td, sender, receiver) {
        switch (this._patchMode) {
            case 'oneclick':
                this._executePatch(sender, receiver, td);
                break;
            case 'bulk':
                this._toggleBulkCell(td, sender, receiver);
                break;
            default: // 'take'
                this._showTakeConfirm(td, sender, receiver);
        }
    }

    _showTakeConfirm(td, sender, receiver) {
        this.container.querySelectorAll('.mtx-cell--pending').forEach(c => c.classList.remove('mtx-cell--pending'));
        td.classList.add('mtx-cell--pending');

        const bar = document.getElementById('mtxConfirmBar');
        if (!bar) return;

        // Remove any previous keyboard handler before installing a new one
        if (this._confirmKeyHandler) {
            document.removeEventListener('keydown', this._confirmKeyHandler);
            this._confirmKeyHandler = null;
        }

        const isSC = this._combo.isCombo(sender);
        const isRC = this._combo.isCombo(receiver);
        const isComboTake = isSC || isRC;
        let streamCount = 0;
        if (isSC && isRC) streamCount = this._combo.countMatchingStreams(sender, receiver);
        else if (isSC)    streamCount = this._combo.resolvePatchPairs(sender, receiver).length;
        else if (isRC)    streamCount = this._combo.resolvePatchPairs(sender, receiver).length;

        const labelHtml = isComboTake
            ? `<span class="mtx-confirm-label mtx-confirm-label--combo">COMBO</span>`
            : `<span class="mtx-confirm-label">TAKE</span>`;
        const countHtml = isComboTake && streamCount > 0
            ? `<span class="mtx-combo-stream-count">${streamCount} stream${streamCount > 1 ? 's' : ''}</span>`
            : '';
        const takeLabel = isComboTake ? 'TAKE ALL' : 'TAKE';

        bar.innerHTML = `
            <span class="mtx-confirm-info${isComboTake ? ' mtx-confirm-info--combo' : ''}">
                ${labelHtml}
                <span class="mtx-confirm-sender">${this._esc(sender.displayLabel)}</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14">
                    <polyline points="9 18 15 12 9 6"/>
                </svg>
                <span class="mtx-confirm-receiver">${this._esc(receiver.displayLabel)}</span>
                ${countHtml}
            </span>
            <div class="mtx-confirm-actions">
                <button class="btn btn-secondary mtx-btn-cancel">Cancel <kbd class="mtx-kbd">Esc</kbd></button>
                <button class="btn btn-primary mtx-btn-take${isComboTake ? ' mtx-btn-take--combo' : ''}">${takeLabel} <kbd class="mtx-kbd">↵</kbd></button>
            </div>
        `;
        bar.classList.add('active');

        const doCancel = () => {
            document.removeEventListener('keydown', this._confirmKeyHandler);
            this._confirmKeyHandler = null;
            td.classList.remove('mtx-cell--pending');
            bar.classList.remove('active');
        };
        const doTake = async () => {
            document.removeEventListener('keydown', this._confirmKeyHandler);
            this._confirmKeyHandler = null;
            bar.classList.remove('active');
            td.classList.remove('mtx-cell--pending');
            await this._executePatch(sender, receiver, td);
        };

        bar.querySelector('.mtx-btn-cancel').onclick = doCancel;
        bar.querySelector('.mtx-btn-take').onclick = doTake;

        this._confirmKeyHandler = (e) => {
            if (e.key === 'Enter')  { e.preventDefault(); doTake(); }
            if (e.key === 'Escape') { e.preventDefault(); doCancel(); }
        };
        document.addEventListener('keydown', this._confirmKeyHandler);
    }

    // ── Bulk mode ─────────────────────────────────────────────────────────────

    _toggleBulkCell(td, sender, receiver) {
        // Clicking already-selected cell → deselect
        if (this._bulkPending.has(td)) {
            this._bulkPending.delete(td);
            td.classList.remove('mtx-cell--bulk-sel');
            this._updateBulkBar();
            return;
        }

        // If another cell in the same receiver column is already selected, replace it
        for (const [prevTd, entry] of this._bulkPending) {
            if (entry.receiver.id === receiver.id) {
                this._bulkPending.delete(prevTd);
                prevTd.classList.remove('mtx-cell--bulk-sel');
                break;
            }
        }

        this._bulkPending.set(td, { sender, receiver });
        td.classList.add('mtx-cell--bulk-sel');
        this._updateBulkBar();
    }

    _updateBulkBar() {
        const bar = document.getElementById('mtxConfirmBar');
        if (!bar) return;
        const count = this._bulkPending.size;

        if (count === 0) {
            bar.classList.remove('active');
            return;
        }

        const lines = [...this._bulkPending.values()]
            .map(({ sender: s, receiver: r }) =>
                `<span class="mtx-bulk-item">${this._esc(s.displayLabel)} → ${this._esc(r.displayLabel)}</span>`)
            .join('');

        bar.innerHTML = `
            <span class="mtx-confirm-info mtx-bulk-info">
                <span class="mtx-confirm-label mtx-bulk-label">BULK</span>
                <span class="mtx-bulk-count">${count} patch${count > 1 ? 'es' : ''}</span>
                <span class="mtx-bulk-list">${lines}</span>
            </span>
            <div class="mtx-confirm-actions">
                <button class="btn btn-secondary mtx-btn-cancel">Clear</button>
                <button class="btn btn-primary mtx-btn-take">TAKE ALL (${count})</button>
            </div>
        `;
        bar.classList.add('active');

        bar.querySelector('.mtx-btn-cancel').onclick = () => this._clearBulk();
        bar.querySelector('.mtx-btn-take').onclick   = () => this._executeBulkPatch();
    }

    _clearBulk() {
        this._bulkPending.forEach((_, td) => td.classList.remove('mtx-cell--bulk-sel'));
        this._bulkPending.clear();
        const bar = document.getElementById('mtxConfirmBar');
        bar?.classList.remove('active');
    }

    async _executeBulkPatch() {
        const entries = [...this._bulkPending.entries()];
        this._clearBulk();

        const results = await Promise.allSettled(
            entries.map(([td, { sender, receiver }]) => this._executePatch(sender, receiver, td))
        );

        const failed = results.filter(r => r.status === 'rejected').length;
        if (failed === 0) {
            this._showToast(`BULK TAKE: ${entries.length} patches applied`, 'success');
        } else {
            this._showToast(`BULK TAKE: ${entries.length - failed} ok, ${failed} failed`, 'error');
        }
    }

    _clearPendingState() {
        this.container.querySelectorAll('.mtx-cell--pending').forEach(c => c.classList.remove('mtx-cell--pending'));
        this._clearBulk();
        document.getElementById('mtxConfirmBar')?.classList.remove('active');
    }

    async _executePatch(sender, receiver, td) {
        // Route combo patches through multi-stream handler
        if (this._combo.isCombo(sender) || this._combo.isCombo(receiver)) {
            return this._executeComboPatches(sender, receiver, td);
        }

        // ── Single-stream patch ───────────────────────────────────────────────
        const receiverNode = this.storage.getNode(receiver.nodeId);
        if (!receiverNode?.is05_url) {
            this._showToast('Receiver node has no IS-05 URL — load the node first.', 'error');
            return;
        }

        td.classList.add('mtx-cell--patching');

        try {
            const sdpText = await this._fetchSdp(sender);
            const client = this._getClient(receiverNode);
            const result = await client.patchReceiver(receiver.id, sender.id, sdpText);

            td.classList.remove('mtx-cell--patching');
            const colIdx = td.dataset.colIdx;
            this.container.querySelectorAll(`.mtx-cell[data-col-idx="${colIdx}"]`).forEach(c => c.classList.remove('mtx-cell--active'));
            td.classList.add('mtx-cell--active');
            this._activeStates.set(receiver.id, sender.id);

            this.storage.addHistory({
                node_id: receiver.nodeId,
                node_name: `${sender.nodeName} → ${receiverNode.name}`,
                sender: { id: sender.id, label: sender.displayLabel },
                receiver: { id: receiver.id, label: receiver.displayLabel },
                status: 'success', patch_body: result.patchBody, active_state: result.activeState
            });
            this._showToast(`TAKE: ${sender.displayLabel} → ${receiver.displayLabel}`, 'success');
        } catch (e) {
            td.classList.remove('mtx-cell--patching');
            td.classList.add('mtx-cell--error');
            setTimeout(() => td.classList.remove('mtx-cell--error'), 2500);
            this.storage.addHistory({
                node_id: receiver.nodeId,
                node_name: `? → ${this.storage.getNode(receiver.nodeId)?.name || '?'}`,
                sender: { id: sender.id, label: sender.displayLabel },
                receiver: { id: receiver.id, label: receiver.displayLabel },
                status: 'failed', error: e.message
            });
            this._showToast(`Patch failed: ${e.message}`, 'error');
            console.error('[MTX] Patch failed:', e);
        }
    }

    async _executeComboPatches(sender, receiver, td) {
        const pairs = this._combo.resolvePatchPairs(sender, receiver);
        if (pairs.length === 0) {
            this._showToast('No matching streams to patch', 'error');
            return;
        }

        td.classList.add('mtx-cell--patching');

        const results = await Promise.allSettled(
            pairs.map(({ sender: s, receiver: r }) => this._patchSingleStream(s, r))
        );

        td.classList.remove('mtx-cell--patching');
        const failed = results.filter(r => r.status === 'rejected').length;

        if (failed === 0) {
            const colIdx = td.dataset.colIdx;
            this.container.querySelectorAll(`.mtx-cell[data-col-idx="${colIdx}"]`).forEach(c => {
                c.classList.remove('mtx-cell--active', 'mtx-cell--combo-active');
            });
            td.classList.add('mtx-cell--active', 'mtx-cell--combo-active');
            this._showToast(`COMBO PATCH: ${pairs.length} stream${pairs.length > 1 ? 's' : ''}`, 'success');
        } else {
            td.classList.add('mtx-cell--error');
            setTimeout(() => td.classList.remove('mtx-cell--error'), 2500);
            this._showToast(`COMBO PATCH: ${pairs.length - failed} ok, ${failed} failed`, 'error');
        }
    }

    async _patchSingleStream(sender, receiver) {
        const receiverNode = this.storage.getNode(receiver.nodeId);
        if (!receiverNode?.is05_url) throw new Error(`No IS-05 URL for receiver node`);
        const sdpText = await this._fetchSdp(sender);
        const client = this._getClient(receiverNode);
        return client.patchReceiver(receiver.id, sender.id, sdpText);
    }

    async _fetchSdp(sender) {
        if (sender.nodeType === 'sdp' || sender.type === 'sdp') {
            if (!sender.sdp_raw) throw new Error('SDP sender has no sdp_raw');
            return sender.sdp_raw;
        }
        if (!sender.manifest_href) throw new Error('Sender has no manifest_href');
        const resp = await fetch(sender.manifest_href);
        if (!resp.ok) throw new Error(`SDP fetch failed: ${resp.status}`);
        return resp.text();
    }

    // ── Refresh active states from IS-05 ─────────────────────────────────────

    async _refreshActiveStates(receivers) {
        const btn = document.getElementById('mtxRefreshBtn');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Refreshing…';
        }

        let loaded = 0;
        await Promise.allSettled(receivers.map(async (r) => {
            const node = this.storage.getNode(r.nodeId);
            if (!node?.is05_url) return;
            try {
                const version = node.is05_version || 'v1.1';
                const url = `${node.is05_url.replace(/\/$/, '')}/x-nmos/connection/${version}/single/receivers/${r.id}/active/`;
                const resp = await fetch(url);
                if (!resp.ok) return;
                const active = await resp.json();
                if (active?.sender_id !== undefined) {
                    this._activeStates.set(r.id, active.sender_id);
                    loaded++;
                }
            } catch {
                // Silent per-receiver failure
            }
        }));

        // Update cell display without full re-render
        this._applyActiveStatesToGrid();

        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <polyline points="23 4 23 10 17 10"/>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg> Refresh`;
        }

        this._showToast(`Refreshed ${loaded} receiver${loaded !== 1 ? 's' : ''}`, 'success');
    }

    _applyActiveStatesToGrid() {
        // Each cell stores both data-receiver-id and data-sender-id
        this.container.querySelectorAll('.mtx-cell').forEach(td => {
            const activeSenderId = this._activeStates.get(td.dataset.receiverId);
            td.classList.toggle('mtx-cell--active', !!activeSenderId && activeSenderId === td.dataset.senderId);
        });
    }

    // ── Zoom ─────────────────────────────────────────────────────────────────

    _applyZoom(zoom) {
        this._zoom = Math.round(Math.max(0.4, Math.min(2.0, zoom)) * 10) / 10;
        const gw = this.container.querySelector('.mtx-grid-wrapper');
        if (gw) gw.style.zoom = this._zoom;
        const val = document.getElementById('mtxZoomVal');
        if (val) val.textContent = `${Math.round(this._zoom * 100)}%`;
        const s = this.storage.getMatrixSettings();
        s.zoom = this._zoom;
        this.storage.saveMatrixSettings(s);
    }

    // ── Utilities ─────────────────────────────────────────────────────────────

    _getClient(node) {
        if (this._clientCache.has(node.id)) return this._clientCache.get(node.id);
        const client = new NMOSClient(node.is04_url || 'http://localhost');
        if (node.is05_url) {
            client.is05BaseUrl = node.is05_url;
            client.is05Version = node.is05_version || 'v1.1';
            client.version = node.version || 'v1.3';
        }
        this._clientCache.set(node.id, client);
        return client;
    }

    _showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        if (!toast) return;
        toast.textContent = message;
        toast.className = `toast ${type} active`;
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => toast.classList.remove('active'), 4000);
    }

    _debounce(fn, ms) {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), ms);
        };
    }

    _esc(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
}
