/**
 * ST2110 BCC - Main Application
 * Broadcast Control Center for NMOS patching
 */

import { NMOSClient } from './nmos-api.js';
import { StorageManager } from './storage.js';

class BCCApplication {
    constructor() {
        this.storage = new StorageManager();
        this.senderNode = null;
        this.senderClient = null;
        this.receiverNode = null;
        this.receiverClient = null;
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
        // Connect RDS button
        document.getElementById('connectRdsBtn').addEventListener('click', () => {
            this.openConnectRdsModal();
        });

        // Add Node button
        document.getElementById('addNodeBtn').addEventListener('click', () => {
            this.openAddNodeModal();
        });

        // Sender node selector
        document.getElementById('senderNodeSelect').addEventListener('change', (e) => {
            this.selectSenderNode(e.target.value);
        });

        // Receiver node selector
        document.getElementById('receiverNodeSelect').addEventListener('change', (e) => {
            this.selectReceiverNode(e.target.value);
        });

        // Refresh buttons
        document.getElementById('refreshSenderBtn').addEventListener('click', () => {
            this.refreshSenderNode();
        });

        document.getElementById('refreshReceiverBtn').addEventListener('click', () => {
            this.refreshReceiverNode();
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
        document.getElementById('senderFilter').addEventListener('input', () => {
            this.filterSenders();
        });

        document.getElementById('senderFormatFilter').addEventListener('change', () => {
            this.filterSenders();
        });

        document.getElementById('receiverFilter').addEventListener('input', () => {
            this.filterReceivers();
        });

        document.getElementById('receiverFormatFilter').addEventListener('change', () => {
            this.filterReceivers();
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
     * Load nodes from storage and populate selectors
     */
    loadNodes() {
        const nodes = this.storage.getAllNodes();
        const senderSelect = document.getElementById('senderNodeSelect');
        const receiverSelect = document.getElementById('receiverNodeSelect');

        // Clear both selects
        senderSelect.innerHTML = '<option value="">Select sender node...</option>';
        receiverSelect.innerHTML = '<option value="">Select receiver node...</option>';

        if (nodes.length === 0) {
            return;
        }

        // Populate both selects with same nodes
        nodes.forEach(node => {
            const senderOption = document.createElement('option');
            senderOption.value = node.id;
            senderOption.textContent = `${node.name} (${node.is04_url})`;
            senderSelect.appendChild(senderOption);

            const receiverOption = document.createElement('option');
            receiverOption.value = node.id;
            receiverOption.textContent = `${node.name} (${node.is04_url})`;
            receiverSelect.appendChild(receiverOption);
        });

        // Auto-select first node for both if only one node exists
        if (nodes.length === 1) {
            senderSelect.value = nodes[0].id;
            receiverSelect.value = nodes[0].id;
            this.selectSenderNode(nodes[0].id);
            this.selectReceiverNode(nodes[0].id);
        }
    }

    /**
     * Select and load sender node
     */
    async selectSenderNode(nodeId) {
        if (!nodeId) {
            this.senderNode = null;
            this.senderClient = null;
            this.renderSenders([]);
            this.selectedSender = null;
            this.updateTakeButton();
            return;
        }

        const node = this.storage.getNode(nodeId);
        if (!node) {
            this.showToast('Sender node not found', 'error');
            return;
        }

        this.senderNode = node;

        try {
            // Create NMOS client
            this.senderClient = new NMOSClient(node.is04_url);

            // Show loading state
            this.setLoadingState(true, 'sender');

            // Initialize client (if not already initialized)
            if (!node.version) {
                await this.senderClient.initialize();

                // Update node with discovered info
                this.storage.updateNode(nodeId, {
                    is05_url: this.senderClient.is05BaseUrl,
                    version: this.senderClient.version,
                    is05_version: this.senderClient.is05Version
                });
            } else {
                // Use cached info
                this.senderClient.version = node.version;
                this.senderClient.is05BaseUrl = node.is05_url;
                this.senderClient.is05Version = node.is05_version;
            }

            // Load senders
            const senders = await this.senderClient.getSenders();
            this.storage.updateNode(nodeId, { senders });
            this.senderNode.senders = senders;
            this.renderSenders(senders);

            this.showToast(`Sender node connected: ${node.name}`, 'success');

        } catch (error) {
            console.error('Failed to select sender node:', error);
            this.showToast(`Failed to connect sender node: ${error.message}`, 'error');
            this.renderSenders([]);
        } finally {
            this.setLoadingState(false, 'sender');
        }
    }

    /**
     * Select and load receiver node
     */
    async selectReceiverNode(nodeId) {
        if (!nodeId) {
            this.receiverNode = null;
            this.receiverClient = null;
            this.renderReceivers([]);
            this.selectedReceiver = null;
            this.updateTakeButton();
            return;
        }

        const node = this.storage.getNode(nodeId);
        if (!node) {
            this.showToast('Receiver node not found', 'error');
            return;
        }

        this.receiverNode = node;

        try {
            // Create NMOS client
            this.receiverClient = new NMOSClient(node.is04_url);

            // Show loading state
            this.setLoadingState(true, 'receiver');

            // Initialize client (if not already initialized)
            if (!node.version) {
                await this.receiverClient.initialize();

                // Update node with discovered info
                this.storage.updateNode(nodeId, {
                    is05_url: this.receiverClient.is05BaseUrl,
                    version: this.receiverClient.version,
                    is05_version: this.receiverClient.is05Version
                });
            } else {
                // Use cached info
                this.receiverClient.version = node.version;
                this.receiverClient.is05BaseUrl = node.is05_url;
                this.receiverClient.is05Version = node.is05_version;
            }

            // Load receivers
            const receivers = await this.receiverClient.getReceivers();
            this.storage.updateNode(nodeId, { receivers });
            this.receiverNode.receivers = receivers;
            this.renderReceivers(receivers);

            this.showToast(`Receiver node connected: ${node.name}`, 'success');

        } catch (error) {
            console.error('Failed to select receiver node:', error);
            this.showToast(`Failed to connect receiver node: ${error.message}`, 'error');
            this.renderReceivers([]);
        } finally {
            this.setLoadingState(false, 'receiver');
        }
    }

    /**
     * Refresh sender node
     */
    async refreshSenderNode() {
        if (!this.senderNode) return;

        const refreshBtn = document.getElementById('refreshSenderBtn');
        refreshBtn.disabled = true;

        try {
            const senders = await this.senderClient.getSenders();
            this.storage.updateNode(this.senderNode.id, { senders });
            this.senderNode.senders = senders;
            this.renderSenders(senders);
            this.showToast('Senders refreshed', 'success');
        } catch (error) {
            this.showToast(`Refresh failed: ${error.message}`, 'error');
        } finally {
            refreshBtn.disabled = false;
        }
    }

    /**
     * Refresh receiver node
     */
    async refreshReceiverNode() {
        if (!this.receiverNode) return;

        const refreshBtn = document.getElementById('refreshReceiverBtn');
        refreshBtn.disabled = true;

        try {
            const receivers = await this.receiverClient.getReceivers();
            this.storage.updateNode(this.receiverNode.id, { receivers });
            this.receiverNode.receivers = receivers;
            this.renderReceivers(receivers);
            this.showToast('Receivers refreshed', 'success');
        } catch (error) {
            this.showToast(`Refresh failed: ${error.message}`, 'error');
        } finally {
            refreshBtn.disabled = false;
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
            <div class="item" data-id="${sender.id}" data-type="sender" data-format="${sender.format}">
                <div class="item-label">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="2"/>
                        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                    </svg>
                    ${this.escapeHtml(sender.label)}
                </div>
                <div class="item-id">${sender.id}</div>
                ${sender.format ? `<div class="item-format">${this.escapeHtml(sender.format).toUpperCase()}</div>` : ''}
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
            <div class="item" data-id="${receiver.id}" data-type="receiver" data-format="${receiver.format}">
                <div class="item-label">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="2" y="7" width="20" height="14" rx="2"/>
                        <circle cx="8" cy="14" r="1"/>
                        <circle cx="12" cy="14" r="1"/>
                    </svg>
                    ${this.escapeHtml(receiver.label)}
                </div>
                <div class="item-id">${receiver.id}</div>
                ${receiver.format ? `<div class="item-format">${this.escapeHtml(receiver.format).toUpperCase()}</div>` : ''}
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
        if (!this.senderNode || !this.senderNode.senders) return;

        const sender = this.senderNode.senders.find(s => s.id === senderId);
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
        if (!this.receiverNode || !this.receiverNode.receivers) return;

        const receiver = this.receiverNode.receivers.find(r => r.id === receiverId);
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
        if (!this.selectedSender || !this.selectedReceiver || !this.senderClient || !this.receiverClient) {
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
            statusEl.textContent = 'Fetching SDP from sender...';
            const sdp = await this.senderClient.getSenderSDP(this.selectedSender);

            // Get receiver port count (using receiver's client)
            statusEl.textContent = 'Checking receiver...';
            const paths = await this.receiverClient.testPatchPath(this.selectedReceiver.id);
            const { portCount } = await this.receiverClient.getStagedParams(
                this.selectedReceiver.id,
                paths.stagedPath
            );

            // Execute patch on receiver
            statusEl.textContent = 'Executing patch...';
            const result = await this.receiverClient.patchReceiver(
                this.selectedReceiver.id,
                this.selectedSender.id,
                sdp,
                portCount
            );

            // Save to history
            this.storage.addHistory({
                node_id: this.receiverNode.id,
                node_name: `${this.senderNode.name} → ${this.receiverNode.name}`,
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
                node_id: this.receiverNode.id,
                node_name: `${this.senderNode.name} → ${this.receiverNode.name}`,
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
    filterSenders() {
        const searchQuery = document.getElementById('senderFilter').value.toLowerCase();
        const formatFilter = document.getElementById('senderFormatFilter').value.toLowerCase();
        const items = document.querySelectorAll('#senderList .item');

        items.forEach(item => {
            const label = item.querySelector('.item-label').textContent.toLowerCase();
            const id = item.querySelector('.item-id').textContent.toLowerCase();
            const format = item.dataset.format ? item.dataset.format.toLowerCase() : '';

            // Check search query match
            const searchMatch = !searchQuery ||
                label.includes(searchQuery) ||
                id.includes(searchQuery);

            // Check format filter match
            const formatMatch = !formatFilter || format === formatFilter;

            // Show only if both conditions match
            item.style.display = (searchMatch && formatMatch) ? 'block' : 'none';
        });
    }

    /**
     * Filter receivers
     */
    filterReceivers() {
        const searchQuery = document.getElementById('receiverFilter').value.toLowerCase();
        const formatFilter = document.getElementById('receiverFormatFilter').value.toLowerCase();
        const items = document.querySelectorAll('#receiverList .item');

        items.forEach(item => {
            const label = item.querySelector('.item-label').textContent.toLowerCase();
            const id = item.querySelector('.item-id').textContent.toLowerCase();
            const format = item.dataset.format ? item.dataset.format.toLowerCase() : '';

            // Check search query match
            const searchMatch = !searchQuery ||
                label.includes(searchQuery) ||
                id.includes(searchQuery);

            // Check format filter match
            const formatMatch = !formatFilter || format === formatFilter;

            // Show only if both conditions match
            item.style.display = (searchMatch && formatMatch) ? 'block' : 'none';
        });
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

            // Reload nodes
            this.loadNodes();

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
     * Set loading state
     */
    setLoadingState(loading, type = 'both') {
        const senderList = document.getElementById('senderList');
        const receiverList = document.getElementById('receiverList');
        const spinner = '<div class="empty-state"><div class="spinner"></div><p>Loading...</p></div>';

        if (loading) {
            if (type === 'sender' || type === 'both') {
                senderList.innerHTML = spinner;
            }
            if (type === 'receiver' || type === 'both') {
                receiverList.innerHTML = spinner;
            }
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
