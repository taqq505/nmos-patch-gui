/**
 * ST2110 BCC - Main Application
 * Broadcast Control Center for NMOS patching
 */

import { NMOSClient } from './nmos-api.js';
import { StorageManager } from './storage.js';

class BCCApplication {
    constructor() {
        this.storage = new StorageManager();
        this.currentNode = null;
        this.currentClient = null;
        this.selectedSender = null;
        this.selectedReceiver = null;

        this.init();
    }

    /**
     * Initialize application
     */
    async init() {
        this.setupEventListeners();
        this.loadNodes();
        this.showWelcomeIfNeeded();
    }

    /**
     * Setup all event listeners
     */
    setupEventListeners() {
        // Add Node button
        document.getElementById('addNodeBtn').addEventListener('click', () => {
            this.openAddNodeModal();
        });

        // Node selector
        document.getElementById('nodeSelect').addEventListener('change', (e) => {
            this.selectNode(e.target.value);
        });

        // Refresh button
        document.getElementById('refreshBtn').addEventListener('click', () => {
            this.refreshCurrentNode();
        });

        // Remove node button
        document.getElementById('removeNodeBtn').addEventListener('click', () => {
            this.removeCurrentNode();
        });

        // History button
        document.getElementById('historyBtn').addEventListener('click', () => {
            this.openHistoryModal();
        });

        // TAKE button
        document.getElementById('takeBtn').addEventListener('click', () => {
            this.executePatch();
        });

        // Filter inputs
        document.getElementById('senderFilter').addEventListener('input', (e) => {
            this.filterSenders(e.target.value);
        });

        document.getElementById('receiverFilter').addEventListener('input', (e) => {
            this.filterReceivers(e.target.value);
        });

        // Add Node Modal
        document.getElementById('addNodeForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleAddNode();
        });

        document.getElementById('cancelAddNode').addEventListener('click', () => {
            this.closeAddNodeModal();
        });

        // Modal close buttons
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.target.closest('.modal').classList.remove('active');
            });
        });

        // Close modals on background click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('active');
                }
            });
        });
    }

    /**
     * Load nodes from storage and populate selector
     */
    loadNodes() {
        const nodes = this.storage.getAllNodes();
        const select = document.getElementById('nodeSelect');

        select.innerHTML = '';

        if (nodes.length === 0) {
            select.innerHTML = '<option value="">No nodes available - Add a node to get started</option>';
            return;
        }

        nodes.forEach(node => {
            const option = document.createElement('option');
            option.value = node.id;
            option.textContent = `${node.name} (${node.is04_url})`;
            select.appendChild(option);
        });

        // Select first node
        if (nodes.length > 0) {
            select.value = nodes[0].id;
            this.selectNode(nodes[0].id);
        }
    }

    /**
     * Select and load a node
     */
    async selectNode(nodeId) {
        if (!nodeId) {
            this.currentNode = null;
            this.currentClient = null;
            this.clearLists();
            return;
        }

        const node = this.storage.getNode(nodeId);
        if (!node) {
            this.showToast('Node not found', 'error');
            return;
        }

        this.currentNode = node;

        try {
            // Create NMOS client
            this.currentClient = new NMOSClient(node.is04_url);

            // Show loading state
            this.setLoadingState(true);

            // Initialize client (if not already initialized)
            if (!node.version) {
                await this.currentClient.initialize();

                // Update node with discovered info
                this.storage.updateNode(nodeId, {
                    is05_url: this.currentClient.is05BaseUrl,
                    version: this.currentClient.version,
                    is05_version: this.currentClient.is05Version
                });
            } else {
                // Use cached info
                this.currentClient.version = node.version;
                this.currentClient.is05BaseUrl = node.is05_url;
                this.currentClient.is05Version = node.is05_version;
            }

            // Load senders and receivers
            await this.loadDevices();

            this.showToast(`Connected to ${node.name}`, 'success');

        } catch (error) {
            console.error('Failed to select node:', error);
            this.showToast(`Failed to connect: ${error.message}`, 'error');
            this.clearLists();
        } finally {
            this.setLoadingState(false);
        }
    }

    /**
     * Load senders and receivers from current node
     */
    async loadDevices() {
        if (!this.currentClient) return;

        try {
            const [senders, receivers] = await Promise.all([
                this.currentClient.getSenders(),
                this.currentClient.getReceivers()
            ]);

            // Update node in storage
            this.storage.updateNodeDevices(this.currentNode.id, senders, receivers);

            // Update current node reference
            this.currentNode.senders = senders;
            this.currentNode.receivers = receivers;

            // Render lists
            this.renderSenders(senders);
            this.renderReceivers(receivers);

        } catch (error) {
            console.error('Failed to load devices:', error);
            throw error;
        }
    }

    /**
     * Render senders list
     */
    renderSenders(senders) {
        const listEl = document.getElementById('senderList');

        if (!senders || senders.length === 0) {
            listEl.innerHTML = `
                <div class="empty-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="2" y="7" width="20" height="14" rx="2"/>
                        <path d="M16 3h4v4M8 3H4v4"/>
                    </svg>
                    <p>No senders found</p>
                </div>
            `;
            return;
        }

        listEl.innerHTML = senders.map(sender => `
            <div class="item" data-id="${sender.id}" data-type="sender">
                <div class="item-label">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="2"/>
                        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                    </svg>
                    ${this.escapeHtml(sender.label)}
                </div>
                <div class="item-id">${sender.id}</div>
                ${sender.format ? `<div class="item-format">${this.escapeHtml(sender.format)}</div>` : ''}
            </div>
        `).join('');

        // Add click listeners
        listEl.querySelectorAll('.item').forEach(item => {
            item.addEventListener('click', () => {
                this.selectSender(item.dataset.id);
            });
        });
    }

    /**
     * Render receivers list
     */
    renderReceivers(receivers) {
        const listEl = document.getElementById('receiverList');

        if (!receivers || receivers.length === 0) {
            listEl.innerHTML = `
                <div class="empty-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="2" y="7" width="20" height="14" rx="2"/>
                        <path d="M16 21v-2M8 21v-2"/>
                    </svg>
                    <p>No receivers found</p>
                </div>
            `;
            return;
        }

        listEl.innerHTML = receivers.map(receiver => `
            <div class="item" data-id="${receiver.id}" data-type="receiver">
                <div class="item-label">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="2" y="7" width="20" height="14" rx="2"/>
                        <circle cx="8" cy="14" r="1"/>
                        <circle cx="12" cy="14" r="1"/>
                    </svg>
                    ${this.escapeHtml(receiver.label)}
                </div>
                <div class="item-id">${receiver.id}</div>
                ${receiver.format ? `<div class="item-format">${this.escapeHtml(receiver.format)}</div>` : ''}
            </div>
        `).join('');

        // Add click listeners
        listEl.querySelectorAll('.item').forEach(item => {
            item.addEventListener('click', () => {
                this.selectReceiver(item.dataset.id);
            });
        });
    }

    /**
     * Select a sender
     */
    selectSender(senderId) {
        const sender = this.currentNode.senders.find(s => s.id === senderId);
        if (!sender) return;

        // Update UI
        document.querySelectorAll('#senderList .item').forEach(item => {
            item.classList.toggle('selected', item.dataset.id === senderId);
        });

        this.selectedSender = sender;
        this.updateTakeButton();
    }

    /**
     * Select a receiver
     */
    selectReceiver(receiverId) {
        const receiver = this.currentNode.receivers.find(r => r.id === receiverId);
        if (!receiver) return;

        // Update UI
        document.querySelectorAll('#receiverList .item').forEach(item => {
            item.classList.toggle('selected', item.dataset.id === receiverId);
        });

        this.selectedReceiver = receiver;
        this.updateTakeButton();
    }

    /**
     * Update TAKE button state
     */
    updateTakeButton() {
        const takeBtn = document.getElementById('takeBtn');
        const statusEl = document.getElementById('statusText');
        const statusContainer = statusEl.parentElement;

        if (this.selectedSender && this.selectedReceiver) {
            takeBtn.disabled = false;
            statusEl.textContent = 'Ready to patch';
            statusContainer.classList.add('ready');
        } else if (this.selectedSender) {
            takeBtn.disabled = true;
            statusEl.textContent = 'Select a receiver';
            statusContainer.classList.remove('ready');
        } else if (this.selectedReceiver) {
            takeBtn.disabled = true;
            statusEl.textContent = 'Select a sender';
            statusContainer.classList.remove('ready');
        } else {
            takeBtn.disabled = true;
            statusEl.textContent = 'Select sender and receiver';
            statusContainer.classList.remove('ready');
        }
    }

    /**
     * Execute patch operation
     */
    async executePatch() {
        if (!this.selectedSender || !this.selectedReceiver || !this.currentClient) {
            return;
        }

        const takeBtn = document.getElementById('takeBtn');
        const statusEl = document.getElementById('statusText');
        const statusContainer = statusEl.parentElement;

        try {
            // Update UI
            takeBtn.disabled = true;
            statusEl.textContent = 'Patching...';
            statusContainer.classList.add('active');
            statusContainer.classList.remove('ready');

            // Get SDP from sender
            statusEl.textContent = 'Fetching SDP...';
            const sdp = await this.currentClient.getSenderSDP(this.selectedSender);

            // Get receiver port count
            statusEl.textContent = 'Checking receiver...';
            const paths = await this.currentClient.testPatchPath(this.selectedReceiver.id);
            const { portCount } = await this.currentClient.getStagedParams(
                this.selectedReceiver.id,
                paths.stagedPath
            );

            // Execute patch
            statusEl.textContent = 'Executing patch...';
            const result = await this.currentClient.patchReceiver(
                this.selectedReceiver.id,
                this.selectedSender.id,
                sdp,
                portCount
            );

            // Save to history
            this.storage.addHistory({
                node_id: this.currentNode.id,
                node_name: this.currentNode.name,
                sender: this.selectedSender,
                receiver: this.selectedReceiver,
                status: 'success',
                patch_body: result.patchBody,
                active_state: result.activeState
            });

            // Success
            this.showToast(`✅ Patched: ${this.selectedSender.label} → ${this.selectedReceiver.label}`, 'success');
            statusEl.textContent = 'Patch successful!';

            // Reset after delay
            setTimeout(() => {
                statusEl.textContent = 'Select sender and receiver';
                statusContainer.classList.remove('active');
            }, 3000);

        } catch (error) {
            console.error('Patch failed:', error);

            // Save to history
            this.storage.addHistory({
                node_id: this.currentNode.id,
                node_name: this.currentNode.name,
                sender: this.selectedSender,
                receiver: this.selectedReceiver,
                status: 'failed',
                error: error.message
            });

            this.showToast(`Failed to patch: ${error.message}`, 'error');
            statusEl.textContent = 'Patch failed';
            statusContainer.classList.remove('active');

        } finally {
            takeBtn.disabled = false;
            this.updateTakeButton();
        }
    }

    /**
     * Filter senders
     */
    filterSenders(query) {
        const items = document.querySelectorAll('#senderList .item');
        const lowerQuery = query.toLowerCase();

        items.forEach(item => {
            const label = item.querySelector('.item-label').textContent.toLowerCase();
            const id = item.querySelector('.item-id').textContent.toLowerCase();
            const match = label.includes(lowerQuery) || id.includes(lowerQuery);
            item.style.display = match ? 'block' : 'none';
        });
    }

    /**
     * Filter receivers
     */
    filterReceivers(query) {
        const items = document.querySelectorAll('#receiverList .item');
        const lowerQuery = query.toLowerCase();

        items.forEach(item => {
            const label = item.querySelector('.item-label').textContent.toLowerCase();
            const id = item.querySelector('.item-id').textContent.toLowerCase();
            const match = label.includes(lowerQuery) || id.includes(lowerQuery);
            item.style.display = match ? 'block' : 'none';
        });
    }

    /**
     * Refresh current node
     */
    async refreshCurrentNode() {
        if (!this.currentNode) return;

        const refreshBtn = document.getElementById('refreshBtn');
        refreshBtn.disabled = true;

        try {
            await this.loadDevices();
            this.showToast('Refreshed successfully', 'success');
        } catch (error) {
            this.showToast(`Refresh failed: ${error.message}`, 'error');
        } finally {
            refreshBtn.disabled = false;
        }
    }

    /**
     * Remove current node
     */
    async removeCurrentNode() {
        if (!this.currentNode) return;

        if (!confirm(`Remove node "${this.currentNode.name}"?`)) {
            return;
        }

        this.storage.removeNode(this.currentNode.id);
        this.currentNode = null;
        this.currentClient = null;
        this.loadNodes();
        this.showToast('Node removed', 'info');
    }

    /**
     * Open add node modal
     */
    openAddNodeModal() {
        const modal = document.getElementById('addNodeModal');
        const form = document.getElementById('addNodeForm');
        const progress = document.getElementById('addNodeProgress');

        form.reset();
        form.style.display = 'block';
        progress.style.display = 'none';
        modal.classList.add('active');
    }

    /**
     * Close add node modal
     */
    closeAddNodeModal() {
        document.getElementById('addNodeModal').classList.remove('active');
    }

    /**
     * Handle add node form submission
     */
    async handleAddNode() {
        const form = document.getElementById('addNodeForm');
        const progress = document.getElementById('addNodeProgress');
        const formData = new FormData(form);

        const nodeName = formData.get('nodeName');
        const is04Url = formData.get('is04Url');

        form.style.display = 'none';
        progress.style.display = 'flex';

        try {
            // Create and initialize client
            const client = new NMOSClient(is04Url);
            await client.initialize();

            // Load devices
            const [senders, receivers] = await Promise.all([
                client.getSenders(),
                client.getReceivers()
            ]);

            // Save node
            const node = this.storage.addNode({
                name: nodeName,
                is04_url: is04Url,
                is05_url: client.is05BaseUrl,
                version: client.version,
                is05_version: client.is05Version,
                senders,
                receivers
            });

            // Reload nodes and select new one
            this.loadNodes();
            document.getElementById('nodeSelect').value = node.id;
            await this.selectNode(node.id);

            this.closeAddNodeModal();
            this.showToast(`Node "${nodeName}" added successfully`, 'success');

        } catch (error) {
            console.error('Failed to add node:', error);
            this.showToast(`Failed to add node: ${error.message}`, 'error');

            // Show form again
            form.style.display = 'block';
            progress.style.display = 'none';
        }
    }

    /**
     * Open history modal
     */
    openHistoryModal() {
        const modal = document.getElementById('historyModal');
        const content = document.getElementById('historyContent');

        const history = this.storage.getAllHistory();

        if (history.length === 0) {
            content.innerHTML = `
                <div class="empty-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <polyline points="12 6 12 12 16 14"/>
                    </svg>
                    <p>No patch history</p>
                </div>
            `;
        } else {
            content.innerHTML = history.map(entry => {
                const date = new Date(entry.timestamp);
                const timeStr = date.toLocaleString();

                return `
                    <div class="history-item">
                        <div class="history-header">
                            <div class="history-time">${timeStr}</div>
                            <div class="history-status ${entry.status}">${entry.status.toUpperCase()}</div>
                        </div>
                        <div class="history-details">
                            <strong>${this.escapeHtml(entry.node_name)}</strong><br>
                            ${this.escapeHtml(entry.sender.label)} → ${this.escapeHtml(entry.receiver.label)}
                            ${entry.error ? `<br><span style="color: var(--error);">Error: ${this.escapeHtml(entry.error)}</span>` : ''}
                        </div>
                    </div>
                `;
            }).join('');
        }

        modal.classList.add('active');
    }

    /**
     * Clear lists
     */
    clearLists() {
        this.renderSenders([]);
        this.renderReceivers([]);
        this.selectedSender = null;
        this.selectedReceiver = null;
        this.updateTakeButton();
    }

    /**
     * Set loading state
     */
    setLoadingState(loading) {
        const senderList = document.getElementById('senderList');
        const receiverList = document.getElementById('receiverList');

        if (loading) {
            const spinner = '<div class="empty-state"><div class="spinner"></div><p>Loading...</p></div>';
            senderList.innerHTML = spinner;
            receiverList.innerHTML = spinner;
        }
    }

    /**
     * Show welcome message for first-time users
     */
    showWelcomeIfNeeded() {
        const nodes = this.storage.getAllNodes();
        if (nodes.length === 0) {
            setTimeout(() => {
                this.showToast('Welcome! Add your first NMOS node to get started.', 'info');
            }, 500);
        }
    }

    /**
     * Show toast notification
     */
    showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = `toast ${type} active`;

        setTimeout(() => {
            toast.classList.remove('active');
        }, 4000);
    }

    /**
     * Escape HTML
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new BCCApplication();
});
