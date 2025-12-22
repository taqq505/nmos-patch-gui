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
        this.discoveredNodes = []; // For RDS discovery

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

        // Settings button
        document.getElementById('settingsBtn').addEventListener('click', () => {
            this.openSettingsModal();
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

        // Connect RDS Modal
        document.getElementById('connectRdsForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleConnectRds();
        });

        document.getElementById('cancelConnectRds').addEventListener('click', () => {
            this.closeConnectRdsModal();
        });

        document.getElementById('cancelRdsSelection').addEventListener('click', () => {
            this.closeConnectRdsModal();
        });

        document.getElementById('addSelectedNodes').addEventListener('click', () => {
            this.handleAddSelectedNodes();
        });

        // Select all nodes checkbox
        document.getElementById('selectAllNodes').addEventListener('change', (e) => {
            this.handleSelectAllNodes(e.target.checked);
        });

        // Settings tabs
        document.querySelectorAll('.settings-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                this.switchSettingsTab(e.target.closest('.settings-tab').dataset.tab);
            });
        });

        // Copy buttons in CORS tab
        document.querySelectorAll('.copy-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const text = btn.dataset.copy || '';
                if (!text) return;

                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(text).then(() => {
                        this.showToast('Copied to clipboard', 'success');
                    }).catch(() => {
                        this.showToast('Copy failed', 'error');
                    });
                } else {
                    this.showToast('Clipboard not available', 'error');
                }
            });
        });

        // CORS help link
        document.getElementById('corsHelpLink').addEventListener('click', (e) => {
            e.preventDefault();
            this.openSettingsModal('cors');
        });

        // CORS alert popup
        const corsAlert = document.getElementById('corsAlert');
        const corsAlertClose = document.getElementById('corsAlertClose');
        corsAlert.addEventListener('click', () => {
            this.openSettingsModal('cors');
        });
        corsAlertClose.addEventListener('click', (e) => {
            e.stopPropagation();
            corsAlert.classList.add('hidden');
        });

        // Reset buttons
        document.getElementById('clearHistoryBtn').addEventListener('click', () => {
            this.handleClearHistory();
        });

        document.getElementById('resetAllBtn').addEventListener('click', () => {
            this.handleResetAll();
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
        const corsHelpLink = document.getElementById('corsHelpLink');
        const corsAlert = document.getElementById('corsAlert');

        try {
            // Update UI
            takeBtn.disabled = true;
            statusEl.textContent = 'Patching...';
            statusContainer.classList.add('active');
            statusContainer.classList.remove('ready');
            corsHelpLink.classList.add('hidden');
            corsAlert.classList.add('hidden');

            // Get SDP from sender
            statusEl.textContent = 'Fetching SDP from sender...';
            const sdp = await this.senderClient.getSenderSDP(this.selectedSender);

            // Execute patch on receiver (will check receiver state internally)
            statusEl.textContent = 'Executing patch...';
            const result = await this.receiverClient.patchReceiver(
                this.selectedReceiver.id,
                this.selectedSender.id,
                sdp
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

            // Try to capture partial patch information for debugging
            let partialPatchBody = null;
            try {
                // Import SDP parser to show what we attempted
                const { SDPParser } = await import('./sdp-parser.js');
                const parser = new SDPParser();
                const sdp = await this.senderClient.getSenderSDP(this.selectedSender);
                partialPatchBody = parser.parseToJSON(sdp, this.selectedSender.id, 2);
            } catch (parseError) {
                // If we can't even parse SDP, just note that
                partialPatchBody = { error: 'Could not generate PATCH body', details: parseError.message };
            }

            // Save to history with attempted patch body
            this.storage.addHistory({
                node_id: this.receiverNode.id,
                node_name: `${this.senderNode.name} → ${this.receiverNode.name}`,
                sender: this.selectedSender,
                receiver: this.selectedReceiver,
                status: 'failed',
                error: error.message,
                patch_body: partialPatchBody
            });

            this.showToast(`Failed to patch: ${error.message}`, 'error');
            statusEl.textContent = 'Patch failed';
            statusContainer.classList.remove('active');
            if (this.isCorsError(error)) {
                corsHelpLink.classList.remove('hidden');
                corsAlert.classList.remove('hidden');
            }

        } finally {
            takeBtn.disabled = false;
            this.updateTakeButton();
        }
    }

    isCorsError(error) {
        const message = (error && error.message) ? error.message : '';
        return message.includes('CORS') || message.includes('Failed to fetch') || message.includes('Network error');
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
     * Open settings modal
     */
    openSettingsModal(tabName = 'history') {
        const modal = document.getElementById('settingsModal');

        this.switchSettingsTab(tabName);
        if (tabName === 'history') {
            this.loadHistory();
        }

        modal.classList.add('active');
    }

    /**
     * Switch settings tab
     */
    switchSettingsTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.settings-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });

        // Update tab content
        document.querySelectorAll('.settings-tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `${tabName}Tab`);
        });

        // Load history when switching to history tab
        if (tabName === 'history') {
            this.loadHistory();
        }
    }

    /**
     * Load history content
     */
    loadHistory() {
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
            content.innerHTML = history.map((entry, index) => {
                const date = new Date(entry.timestamp);
                const timeStr = date.toLocaleString();
                const hasJson = entry.patch_body || entry.active_state;

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
                        ${hasJson ? `
                            <button class="history-details-btn" onclick="window.bccApp.toggleHistoryDetails(${index})">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="6 9 12 15 18 9"/>
                                </svg>
                                View Details
                            </button>
                            <div class="history-json" id="history-json-${index}" style="display: none;">
                                ${entry.patch_body ? `
                                    <div class="json-section">
                                        <h4>PATCH Request Body:</h4>
                                        <pre class="json-code">${this.escapeHtml(JSON.stringify(entry.patch_body, null, 2))}</pre>
                                    </div>
                                ` : ''}
                                ${entry.active_state ? `
                                    <div class="json-section">
                                        <h4>Active State (after patch):</h4>
                                        <pre class="json-code">${this.escapeHtml(JSON.stringify(entry.active_state, null, 2))}</pre>
                                    </div>
                                ` : ''}
                            </div>
                        ` : ''}
                    </div>
                `;
            }).join('');
        }
    }

    /**
     * Toggle history details visibility
     */
    toggleHistoryDetails(index) {
        const jsonDiv = document.getElementById(`history-json-${index}`);
        const btn = jsonDiv.previousElementSibling;

        if (jsonDiv.style.display === 'none') {
            jsonDiv.style.display = 'block';
            btn.querySelector('svg polyline').setAttribute('points', '18 15 12 9 6 15');
            btn.querySelector('span').textContent = 'Hide Details';
        } else {
            jsonDiv.style.display = 'none';
            btn.querySelector('svg polyline').setAttribute('points', '6 9 12 15 18 9');
            btn.querySelector('span').textContent = 'View Details';
        }
    }

    /**
     * Handle clear history
     */
    handleClearHistory() {
        if (!confirm('Are you sure you want to clear all patch history? This cannot be undone.')) {
            return;
        }

        this.storage.clearHistory();
        this.loadHistory();
        this.showToast('Patch history cleared', 'success');
    }

    /**
     * Handle reset all
     */
    handleResetAll() {
        if (!confirm('⚠️ WARNING: This will delete ALL data including nodes and history. Are you absolutely sure?')) {
            return;
        }

        // Double confirmation
        if (!confirm('This is your last chance. Type "yes" in the next prompt to confirm.\n\nDelete all data?')) {
            return;
        }

        this.storage.clearAll();

        // Reset application state
        this.senderNode = null;
        this.senderClient = null;
        this.receiverNode = null;
        this.receiverClient = null;
        this.selectedSender = null;
        this.selectedReceiver = null;
        this.discoveredNodes = [];

        // Reload UI
        this.loadNodes();
        this.renderSenders([]);
        this.renderReceivers([]);
        this.updateTakeButton();

        // Close modal
        document.getElementById('settingsModal').classList.remove('active');

        this.showToast('All application data has been reset', 'success');
    }

    /**
     * Open connect RDS modal
     */
    openConnectRdsModal() {
        const modal = document.getElementById('connectRdsModal');
        const form = document.getElementById('connectRdsForm');
        const progress = document.getElementById('rdsProgress');
        const nodeList = document.getElementById('rdsNodeList');

        form.reset();
        form.style.display = 'block';
        progress.style.display = 'none';
        nodeList.style.display = 'none';
        modal.classList.add('active');
    }

    /**
     * Close connect RDS modal
     */
    closeConnectRdsModal() {
        document.getElementById('connectRdsModal').classList.remove('active');
    }

    /**
     * Handle RDS connection form submission
     */
    async handleConnectRds() {
        const form = document.getElementById('connectRdsForm');
        const progress = document.getElementById('rdsProgress');
        const nodeList = document.getElementById('rdsNodeList');
        const formData = new FormData(form);

        const rdsUrl = formData.get('rdsUrl');

        form.style.display = 'none';
        progress.style.display = 'flex';

        try {
            // Discover nodes from RDS
            const nodes = await NMOSClient.discoverFromRDS(rdsUrl);

            if (nodes.length === 0) {
                throw new Error('No nodes found in registry');
            }

            // Store discovered nodes temporarily
            this.discoveredNodes = nodes;

            // Show node list
            this.renderRdsNodes(nodes);
            progress.style.display = 'none';
            nodeList.style.display = 'block';

        } catch (error) {
            console.error('RDS connection failed:', error);
            this.showToast(`RDS connection failed: ${error.message}`, 'error');

            // Show form again
            form.style.display = 'block';
            progress.style.display = 'none';
        }
    }

    /**
     * Render discovered RDS nodes
     */
    renderRdsNodes(nodes) {
        const container = document.getElementById('rdsNodes');

        container.innerHTML = nodes.map((node, index) => `
            <div class="rds-node-item" data-index="${index}">
                <input type="checkbox" id="rds-node-${index}" class="rds-checkbox">
                <label for="rds-node-${index}" class="rds-node-details">
                    <div class="rds-node-label">${this.escapeHtml(node.label)}</div>
                    <div class="rds-node-info">
                        ${node.hostname ? `<span>${this.escapeHtml(node.hostname)}</span> • ` : ''}
                        <span>${this.escapeHtml(node.is04_url)}</span>
                    </div>
                    ${node.description ? `<div class="rds-node-description">${this.escapeHtml(node.description)}</div>` : ''}
                </label>
            </div>
        `).join('');

        // Add change listeners to update "Select All" checkbox state
        container.querySelectorAll('.rds-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                this.updateSelectAllCheckbox();
            });
        });

        // Reset "Select All" checkbox
        document.getElementById('selectAllNodes').checked = false;
    }

    /**
     * Handle select all nodes
     */
    handleSelectAllNodes(checked) {
        const checkboxes = document.querySelectorAll('.rds-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.checked = checked;
        });
    }

    /**
     * Update "Select All" checkbox state based on individual checkboxes
     */
    updateSelectAllCheckbox() {
        const checkboxes = document.querySelectorAll('.rds-checkbox');
        const selectAllCheckbox = document.getElementById('selectAllNodes');

        if (checkboxes.length === 0) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
            return;
        }

        const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;

        if (checkedCount === 0) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        } else if (checkedCount === checkboxes.length) {
            selectAllCheckbox.checked = true;
            selectAllCheckbox.indeterminate = false;
        } else {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = true;
        }
    }

    /**
     * Handle adding selected nodes from RDS
     */
    async handleAddSelectedNodes() {
        const checkboxes = document.querySelectorAll('.rds-checkbox:checked');

        if (checkboxes.length === 0) {
            this.showToast('Please select at least one node', 'error');
            return;
        }

        // Show progress UI
        const nodeList = document.getElementById('rdsNodeList');
        const progressSection = document.getElementById('rdsAddProgress');
        const progressBar = document.getElementById('rdsProgressBar');
        const progressText = document.getElementById('rdsProgressText');
        const progressDetails = document.getElementById('rdsProgressDetails');

        nodeList.style.display = 'none';
        progressSection.style.display = 'block';
        progressDetails.innerHTML = '';

        const totalNodes = checkboxes.length;
        let processedCount = 0;
        let addedCount = 0;
        let failedCount = 0;
        let skippedCount = 0;

        for (const checkbox of checkboxes) {
            const index = parseInt(checkbox.closest('.rds-node-item').dataset.index);
            const node = this.discoveredNodes[index];

            // Add progress item
            const progressItem = document.createElement('div');
            progressItem.className = 'progress-item processing';
            progressItem.id = `progress-item-${index}`;
            progressItem.innerHTML = `
                <div class="progress-item-icon spinner-small"></div>
                <span>Processing: ${this.escapeHtml(node.label)}</span>
            `;
            progressDetails.appendChild(progressItem);
            progressDetails.scrollTop = progressDetails.scrollHeight;

            try {
                // Check if node already exists
                const existingNodes = this.storage.getAllNodes();
                if (existingNodes.some(n => n.is04_url === node.is04_url)) {
                    console.log(`Node ${node.label} already exists, skipping`);
                    progressItem.className = 'progress-item skipped';
                    progressItem.innerHTML = `
                        <span>⊘</span>
                        <span>Skipped: ${this.escapeHtml(node.label)} (already exists)</span>
                    `;
                    skippedCount++;
                    processedCount++;

                    // Update progress
                    const percent = (processedCount / totalNodes) * 100;
                    progressBar.style.width = `${percent}%`;
                    progressText.textContent = `Processing ${processedCount}/${totalNodes} nodes...`;

                    continue;
                }

                // Create and initialize client
                const client = new NMOSClient(node.is04_url);
                await client.initialize();

                // Load devices
                const [senders, receivers] = await Promise.all([
                    client.getSenders(),
                    client.getReceivers()
                ]);

                // Save node
                this.storage.addNode({
                    name: node.label,
                    is04_url: node.is04_url,
                    is05_url: client.is05BaseUrl,
                    version: client.version,
                    is05_version: client.is05Version,
                    senders,
                    receivers
                });

                // Update progress item to success
                progressItem.className = 'progress-item success';
                progressItem.innerHTML = `
                    <span>✓</span>
                    <span>Added: ${this.escapeHtml(node.label)} (${senders.length} senders, ${receivers.length} receivers)</span>
                `;
                addedCount++;

            } catch (error) {
                console.error(`Failed to add node ${node.label}:`, error);

                // Update progress item to failed
                progressItem.className = 'progress-item failed';
                progressItem.innerHTML = `
                    <span>✗</span>
                    <span>Failed: ${this.escapeHtml(node.label)} - ${this.escapeHtml(error.message)}</span>
                `;
                failedCount++;
            }

            processedCount++;

            // Update progress bar and text
            const percent = (processedCount / totalNodes) * 100;
            progressBar.style.width = `${percent}%`;
            progressText.textContent = `Processing ${processedCount}/${totalNodes} nodes...`;
        }

        // Complete
        progressText.textContent = `✅ Complete: ${addedCount} added, ${skippedCount} skipped, ${failedCount} failed`;
        progressBar.style.width = '100%';

        // Reload nodes
        this.loadNodes();

        // Auto close after 3 seconds
        setTimeout(() => {
            this.closeConnectRdsModal();

            // Show result toast
            if (addedCount > 0 && failedCount === 0) {
                this.showToast(`✅ Added ${addedCount} node(s) from registry`, 'success');
            } else if (addedCount > 0 && failedCount > 0) {
                this.showToast(`Added ${addedCount} node(s), ${failedCount} failed`, 'info');
            } else if (skippedCount > 0 && addedCount === 0) {
                this.showToast(`All selected nodes already exist`, 'info');
            } else {
                this.showToast(`Failed to add nodes`, 'error');
            }
        }, 3000);
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
    window.bccApp = new BCCApplication();
});
