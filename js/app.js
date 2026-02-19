/**
 * ST2110 BCC - Main Application
 * Broadcast Control Center for NMOS patching
 */

import { NMOSClient } from './nmos-api.js';
import { StorageManager } from './storage.js';
import { RDSSubscription } from './rds-subscription.js';

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
        this.lastRdsUrl = null;    // RDS URL used for last discovery

        // RDS WebSocket subscriptions (Map: url → RDSSubscription)
        this.rdsSubscriptions = new Map();
        this._refreshDebounce = { sender: null, receiver: null };
        this._lastUserAction = 0; // Timestamp of last user-initiated IS-05 action

        // Track which nodes have shown the enable/disable warning
        this.senderWarningShown = new Set();
        this.receiverWarningShown = new Set();

        this.init();
    }

    /**
     * Initialize application
     */
    async init() {
        this.setupEventListeners();
        this.loadNodes();
        this.showWelcomeIfNeeded();
        this.checkCookieConsent();
        this.reconnectEnabledSubscriptions();
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

        document.getElementById('refreshReceiversBtn').addEventListener('click', () => {
            this.refreshReceiverNode();
        });

        document.getElementById('refreshSendersBtn').addEventListener('click', () => {
            this.refreshSenderNode();
        });

        // Settings button
        document.getElementById('settingsBtn').addEventListener('click', () => {
            this.openSettingsModal();
        });

        // About button
        document.getElementById('aboutBtn').addEventListener('click', () => {
            this.openSettingsModal('about');
        });

        // Resource detail modal copy buttons
        document.getElementById('copySdpBtn').addEventListener('click', () => {
            const sdpContent = document.getElementById('sdpContent').textContent;
            this.copyToClipboard(sdpContent, document.getElementById('copySdpBtn'));
        });

        document.getElementById('copyActiveBtn').addEventListener('click', () => {
            const activeContent = document.getElementById('activeContent').textContent;
            this.copyToClipboard(activeContent, document.getElementById('copyActiveBtn'));
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

        // RDS recent dropdown toggle
        document.getElementById('rdsRecentToggle').addEventListener('click', (e) => {
            e.preventDefault();
            const toggle = e.currentTarget;
            const list = document.getElementById('rdsRecentDropdown');
            const isOpen = list.classList.contains('open');
            list.classList.toggle('open', !isOpen);
            toggle.classList.toggle('open', !isOpen);
        });

        // RDS recent dropdown item click
        document.getElementById('rdsRecentDropdown').addEventListener('click', (e) => {
            const li = e.target.closest('li');
            if (li && li.dataset.url) {
                document.getElementById('rdsUrl').value = li.dataset.url;
                document.getElementById('rdsRecentDropdown').classList.remove('open');
                document.getElementById('rdsRecentToggle').classList.remove('open');
            }
        });

        // Close RDS dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#rdsUrlWrapper')) {
                document.getElementById('rdsRecentDropdown').classList.remove('open');
                document.getElementById('rdsRecentToggle').classList.remove('open');
            }
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

        // Export / Import buttons
        document.getElementById('exportDataBtn').addEventListener('click', () => {
            this.handleExportData();
        });

        document.getElementById('importDataInput').addEventListener('change', (e) => {
            if (e.target.files[0]) this.handleImportData(e.target.files[0]);
            e.target.value = ''; // allow re-selecting same file
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

        // Cookie consent buttons
        document.getElementById('cookieAccept').addEventListener('click', () => {
            this.handleCookieConsent(true);
        });

        document.getElementById('cookieDecline').addEventListener('click', () => {
            this.handleCookieConsent(false);
        });

        document.getElementById('cookieLearnMore').addEventListener('click', (e) => {
            e.preventDefault();
            this.hideCookieBanner();
            this.openSettingsModal('about');
            // Expand privacy accordion and scroll to it
            setTimeout(() => {
                const privacyAccordion = document.querySelector('[data-accordion="privacy"]');
                if (privacyAccordion && !privacyAccordion.classList.contains('active')) {
                    privacyAccordion.click();
                }
                setTimeout(() => {
                    const privacyItem = privacyAccordion?.closest('.accordion-item');
                    if (privacyItem) {
                        privacyItem.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                }, 100);
            }, 300);
        });

        // Accordion toggles
        document.querySelectorAll('.accordion-header').forEach(header => {
            header.addEventListener('click', () => {
                this.toggleAccordion(header);
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

            // Fetch active connections for all senders
            await this.refreshSenderConnections();

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

            // Fetch active connections for all receivers
            await this.refreshReceiverConnections();

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

            // Refresh sender connection states (enable/disable)
            await this.refreshSenderConnections();

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

            // Refresh active connections
            await this.refreshReceiverConnections();

            this.showToast('Receivers refreshed', 'success');
        } catch (error) {
            this.showToast(`Refresh failed: ${error.message}`, 'error');
        } finally {
            refreshBtn.disabled = false;
        }
    }

    /**
     * Refresh receiver connection status (active sender info)
     */
    async refreshReceiverConnections() {
        if (!this.receiverNode || !this.receiverNode.receivers || !this.receiverClient) {
            console.log('refreshReceiverConnections: Missing requirements', {
                hasReceiverNode: !!this.receiverNode,
                hasReceivers: !!this.receiverNode?.receivers,
                hasClient: !!this.receiverClient
            });
            return;
        }

        console.log(`Fetching active connections for ${this.receiverNode.receivers.length} receivers...`);
        const allNodes = this.storage.getAllNodes();

        // Fetch active connections for each receiver
        const connectionPromises = this.receiverNode.receivers.map(async (receiver) => {
            try {
                const activeInfo = await this.getReceiverActiveConnection(receiver.id);
                if (activeInfo) {
                    const senderInfo = activeInfo.sender_id ? this.findSenderById(activeInfo.sender_id, allNodes) : null;
                    return {
                        receiverId: receiver.id,
                        senderId: activeInfo.sender_id || null,
                        senderInfo: senderInfo,
                        masterEnable: activeInfo.master_enable !== undefined ? activeInfo.master_enable : true
                    };
                }
            } catch (error) {
                // Silently fail for individual receivers
                console.warn(`Failed to get active connection for receiver ${receiver.id}:`, error);
            }
            return null;
        });

        const connections = await Promise.all(connectionPromises);

        const activeConnections = connections.filter(c => c !== null);
        console.log(`Found ${activeConnections.length} receivers with status out of ${connections.length} total`);

        // Update UI with connection info and enable state
        connections.forEach(conn => {
            if (conn) {
                console.log('Displaying connection:', conn);
                this.updateReceiverConnectionDisplay(conn.receiverId, conn.senderId, conn.senderInfo, conn.masterEnable);
            }
        });
    }

    /**
     * Get active connection for a receiver
     */
    async getReceiverActiveConnection(receiverId) {
        if (!this.receiverClient || !this.receiverClient.is05BaseUrl || !this.receiverClient.is05Version) {
            return null;
        }

        try {
            // Construct the full IS-05 active endpoint path
            const activePath = `/x-nmos/connection/${this.receiverClient.is05Version}/single/receivers/${receiverId}/active`;
            const fullUrl = `${this.receiverClient.is05BaseUrl}${activePath}`;

            console.log(`Fetching active connection from: ${fullUrl}`);

            const response = await fetch(fullUrl, {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.warn(`Failed to fetch active connection for receiver ${receiverId}:`, error);
            return null;
        }
    }

    /**
     * Find sender by ID across all nodes
     */
    findSenderById(senderId, allNodes) {
        for (const node of allNodes) {
            if (node.senders && node.senders.length > 0) {
                const sender = node.senders.find(s => s.id === senderId);
                if (sender) {
                    return {
                        senderLabel: sender.label || 'Unknown',
                        nodeName: node.name,
                        sender: sender
                    };
                }
            }
        }
        return null; // Sender not found in managed nodes
    }

    /**
     * Update receiver card display with connection info and enable state
     */
    updateReceiverConnectionDisplay(receiverId, senderId, senderInfo, masterEnable = true) {
        const receiverCard = document.querySelector(`#receiverList .item[data-id="${receiverId}"]`);
        if (!receiverCard) return;

        // Update enable/disable visual state
        if (masterEnable) {
            receiverCard.classList.add('receiver-enabled');
            receiverCard.classList.remove('receiver-disabled');
        } else {
            receiverCard.classList.add('receiver-disabled');
            receiverCard.classList.remove('receiver-enabled');
        }

        // Remove existing connection info and toggle button
        const existingInfo = receiverCard.querySelector('.receiver-connection-info');
        if (existingInfo) {
            existingInfo.remove();
        }
        const existingToggleContainer = receiverCard.querySelector('.receiver-enable-container');
        if (existingToggleContainer) {
            existingToggleContainer.remove();
        }

        // Create enable/disable toggle container
        const toggleContainer = document.createElement('div');
        toggleContainer.className = 'receiver-enable-container';

        // Create label
        const toggleLabel = document.createElement('span');
        toggleLabel.className = 'receiver-enable-label';
        toggleLabel.textContent = masterEnable ? 'Enabled' : 'Disabled';

        // Create toggle button
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'receiver-enable-toggle';
        toggleBtn.title = masterEnable ? 'Click to disable' : 'Click to enable';
        toggleBtn.setAttribute('aria-label', masterEnable ? 'Enabled' : 'Disabled');
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent receiver selection
            this.toggleReceiverEnable(receiverId, !masterEnable);
        });

        toggleContainer.appendChild(toggleLabel);
        toggleContainer.appendChild(toggleBtn);
        receiverCard.appendChild(toggleContainer);

        // Create connection info element if there's a connection
        if (senderId) {
            const connectionDiv = document.createElement('div');
            connectionDiv.className = 'receiver-connection-info';

            if (senderInfo) {
                // Known sender
                connectionDiv.innerHTML = `
                    <svg class="connection-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <polyline points="12 6 12 12 16 14"/>
                    </svg>
                    <div class="connection-text">
                        <span class="connection-label">Receiving:</span>
                        <span class="connection-sender">${this.escapeHtml(senderInfo.senderLabel)}</span>
                        <span class="connection-node">(${this.escapeHtml(senderInfo.nodeName)})</span>
                    </div>
                `;
            } else {
                // Unknown sender
                const shortId = senderId.substring(0, 8) + '...';
                connectionDiv.innerHTML = `
                    <svg class="connection-icon connection-icon-unknown" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                        <line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                    <div class="connection-text">
                        <span class="connection-label">Receiving:</span>
                        <span class="connection-sender-unknown">Unknown (${shortId})</span>
                    </div>
                `;
            }

            receiverCard.appendChild(connectionDiv);
        }
    }

    /**
     * Show warning modal for enable/disable toggle
     */
    async showEnableWarning(type, nodeId) {
        console.log('showEnableWarning called - type:', type, 'nodeId:', nodeId);
        return new Promise((resolve) => {
            const modal = document.getElementById('enableWarningModal');
            const title = document.getElementById('warningModalTitle');
            const content = document.getElementById('warningModalContent');
            const confirmBtn = document.getElementById('warningConfirm');
            const cancelBtn = document.getElementById('warningCancel');

            console.log('Modal elements:', { modal, title, content, confirmBtn, cancelBtn });

            if (type === 'sender') {
                title.textContent = 'Warning: Sender Enable/Disable';
                content.innerHTML = `
                    <p>Changing the sender's enable/disable state will <strong>stop packet transmission</strong>.</p>
                    <p>This may <strong>interrupt video/audio</strong> to other devices receiving from this sender.</p>
                    <p>Please verify the impact before proceeding.</p>
                `;
            } else {
                title.textContent = 'Warning: Receiver Enable/Disable';
                content.innerHTML = `
                    <p>Changing the receiver's enable/disable state will <strong>start receiving with the currently configured settings</strong>.</p>
                    <p>This may receive unintended streams and <strong>consume bandwidth</strong>.</p>
                    <p>Please verify bandwidth management before proceeding.</p>
                `;
            }

            modal.classList.remove('hidden');

            const handleConfirm = () => {
                cleanup();
                resolve(true);
            };

            const handleCancel = () => {
                cleanup();
                resolve(false);
            };

            const cleanup = () => {
                modal.classList.add('hidden');
                confirmBtn.removeEventListener('click', handleConfirm);
                cancelBtn.removeEventListener('click', handleCancel);
            };

            confirmBtn.addEventListener('click', handleConfirm);
            cancelBtn.addEventListener('click', handleCancel);
        });
    }

    /**
     * Toggle receiver enable/disable state
     */
    async toggleReceiverEnable(receiverId, newEnableState) {
        if (!this.receiverClient || !this.receiverClient.is05BaseUrl || !this.receiverClient.is05Version) {
            this.showToast('IS-05 connection not available', 'error');
            return;
        }
        this._lastUserAction = Date.now();

        // Check if warning should be shown for this node
        const nodeId = this.receiverNode.id;
        console.log('toggleReceiverEnable - nodeId:', nodeId, 'warningShown:', this.receiverWarningShown.has(nodeId));

        if (!this.receiverWarningShown.has(nodeId)) {
            console.log('Showing warning for receiver node:', nodeId);
            const confirmed = await this.showEnableWarning('receiver', nodeId);
            console.log('Warning result:', confirmed);
            if (!confirmed) {
                console.log('User cancelled receiver toggle');
                return; // User cancelled
            }
            this.receiverWarningShown.add(nodeId);
        }

        // Get receiver info for history
        const receiver = this.receiverNode.receivers.find(r => r.id === receiverId);
        const receiverLabel = receiver ? receiver.label : receiverId;

        try {
            // PATCH the receiver's staged endpoint with new master_enable value
            const stagedPath = `/x-nmos/connection/${this.receiverClient.is05Version}/single/receivers/${receiverId}/staged`;
            const fullUrl = `${this.receiverClient.is05BaseUrl}${stagedPath}`;

            const patchBody = {
                master_enable: newEnableState,
                activation: {
                    mode: 'activate_immediate'
                }
            };

            console.log(`Toggling receiver ${receiverId} to ${newEnableState ? 'enabled' : 'disabled'}`);

            const response = await fetch(fullUrl, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(patchBody)
            });

            const responseData = await response.json().catch(() => null);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            // Wait a moment for the change to take effect
            await new Promise(resolve => setTimeout(resolve, 500));

            // Refresh the active state for this specific receiver
            const activeInfo = await this.getReceiverActiveConnection(receiverId);
            if (activeInfo) {
                const allNodes = this.storage.getAllNodes();
                const senderInfo = activeInfo.sender_id ? this.findSenderById(activeInfo.sender_id, allNodes) : null;
                this.updateReceiverConnectionDisplay(
                    receiverId,
                    activeInfo.sender_id || null,
                    senderInfo,
                    activeInfo.master_enable !== undefined ? activeInfo.master_enable : true
                );
            }

            // Add to history
            this.storage.addHistory({
                type: 'enable_change',
                target: 'receiver',
                resourceId: receiverId,
                resourceLabel: receiverLabel,
                nodeLabel: this.receiverNode.name,
                newState: newEnableState,
                timestamp: Date.now(),
                success: true,
                patchBody: patchBody,
                response: responseData
            });

            this.showToast(`Receiver ${newEnableState ? 'enabled' : 'disabled'}`, 'success');

        } catch (error) {
            console.error('Failed to toggle receiver enable state:', error);

            // Add failed attempt to history
            this.storage.addHistory({
                type: 'enable_change',
                target: 'receiver',
                resourceId: receiverId,
                resourceLabel: receiverLabel,
                nodeLabel: this.receiverNode.name,
                newState: newEnableState,
                timestamp: Date.now(),
                success: false,
                error: error.message
            });

            this.showToast(`Failed to ${newEnableState ? 'enable' : 'disable'} receiver: ${error.message}`, 'error');
        }
    }

    /**
     * Refresh sender connection status (master_enable state)
     */
    async refreshSenderConnections() {
        if (!this.senderNode || !this.senderNode.senders || !this.senderClient) {
            console.log('refreshSenderConnections: Missing requirements', {
                hasSenderNode: !!this.senderNode,
                hasSenders: !!this.senderNode?.senders,
                hasClient: !!this.senderClient
            });
            return;
        }

        console.log(`Fetching active connections for ${this.senderNode.senders.length} senders...`);

        const connectionPromises = this.senderNode.senders.map(async (sender) => {
            try {
                const activeInfo = await this.getSenderActiveConnection(sender.id);
                if (activeInfo) {
                    return {
                        senderId: sender.id,
                        masterEnable: activeInfo.master_enable !== undefined ? activeInfo.master_enable : true
                    };
                }
            } catch (error) {
                console.warn(`Failed to get active connection for sender ${sender.id}:`, error);
            }
            return null;
        });

        const connections = await Promise.all(connectionPromises);
        connections.forEach(conn => {
            if (conn) {
                this.updateSenderConnectionDisplay(conn.senderId, conn.masterEnable);
            }
        });
    }

    /**
     * Get sender active connection info from IS-05
     */
    async getSenderActiveConnection(senderId) {
        if (!this.senderClient || !this.senderClient.is05BaseUrl || !this.senderClient.is05Version) {
            return null;
        }

        try {
            const activePath = `/x-nmos/connection/${this.senderClient.is05Version}/single/senders/${senderId}/active`;
            const fullUrl = `${this.senderClient.is05BaseUrl}${activePath}`;

            console.log(`Fetching active connection from: ${fullUrl}`);

            const response = await fetch(fullUrl, {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.warn(`Failed to fetch active connection for sender ${senderId}:`, error);
            return null;
        }
    }

    /**
     * Update sender card UI with enable/disable state
     */
    updateSenderConnectionDisplay(senderId, masterEnable = true) {
        const senderCard = document.querySelector(`#senderList .item[data-id="${senderId}"]`);
        if (!senderCard) return;

        // Update enable/disable visual state
        if (masterEnable) {
            senderCard.classList.add('sender-enabled');
            senderCard.classList.remove('sender-disabled');
        } else {
            senderCard.classList.add('sender-disabled');
            senderCard.classList.remove('sender-enabled');
        }

        // Remove existing toggle container if present
        const existingToggleContainer = senderCard.querySelector('.sender-enable-container');
        if (existingToggleContainer) {
            existingToggleContainer.remove();
        }

        // Create enable/disable toggle container
        const toggleContainer = document.createElement('div');
        toggleContainer.className = 'sender-enable-container';

        // Create label
        const toggleLabel = document.createElement('span');
        toggleLabel.className = 'sender-enable-label';
        toggleLabel.textContent = masterEnable ? 'Enabled' : 'Disabled';

        // Create toggle button
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'sender-enable-toggle';
        toggleBtn.title = masterEnable ? 'Click to disable' : 'Click to enable';
        toggleBtn.setAttribute('aria-label', masterEnable ? 'Enabled' : 'Disabled');
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent sender selection
            this.toggleSenderEnable(senderId, !masterEnable);
        });

        toggleContainer.appendChild(toggleLabel);
        toggleContainer.appendChild(toggleBtn);
        senderCard.appendChild(toggleContainer);
    }

    /**
     * Toggle sender enable/disable state via IS-05 PATCH
     */
    async toggleSenderEnable(senderId, newEnableState) {
        if (!this.senderClient || !this.senderClient.is05BaseUrl || !this.senderClient.is05Version) {
            this.showToast('IS-05 connection not available', 'error');
            return;
        }
        this._lastUserAction = Date.now();

        // Check if warning should be shown for this node
        const nodeId = this.senderNode.id;
        console.log('toggleSenderEnable - nodeId:', nodeId, 'warningShown:', this.senderWarningShown.has(nodeId));

        if (!this.senderWarningShown.has(nodeId)) {
            console.log('Showing warning for sender node:', nodeId);
            const confirmed = await this.showEnableWarning('sender', nodeId);
            console.log('Warning result:', confirmed);
            if (!confirmed) {
                console.log('User cancelled sender toggle');
                return; // User cancelled
            }
            this.senderWarningShown.add(nodeId);
        }

        // Get sender info for history
        const sender = this.senderNode.senders.find(s => s.id === senderId);
        const senderLabel = sender ? sender.label : senderId;

        try {
            const stagedPath = `/x-nmos/connection/${this.senderClient.is05Version}/single/senders/${senderId}/staged`;
            const fullUrl = `${this.senderClient.is05BaseUrl}${stagedPath}`;

            const patchBody = {
                master_enable: newEnableState,
                activation: {
                    mode: 'activate_immediate'
                }
            };

            console.log(`Toggling sender ${senderId} to ${newEnableState ? 'enabled' : 'disabled'}`);

            const response = await fetch(fullUrl, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(patchBody)
            });

            const responseData = await response.json().catch(() => null);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            // Wait for change to take effect
            await new Promise(resolve => setTimeout(resolve, 500));

            // Refresh this specific sender
            const activeInfo = await this.getSenderActiveConnection(senderId);
            if (activeInfo) {
                this.updateSenderConnectionDisplay(
                    senderId,
                    activeInfo.master_enable !== undefined ? activeInfo.master_enable : true
                );
            }

            // Add to history
            this.storage.addHistory({
                type: 'enable_change',
                target: 'sender',
                resourceId: senderId,
                resourceLabel: senderLabel,
                nodeLabel: this.senderNode.name,
                newState: newEnableState,
                timestamp: Date.now(),
                success: true,
                patchBody: patchBody,
                response: responseData
            });

            this.showToast(`Sender ${newEnableState ? 'enabled' : 'disabled'}`, 'success');

        } catch (error) {
            console.error('Failed to toggle sender enable state:', error);

            // Add failed attempt to history
            this.storage.addHistory({
                type: 'enable_change',
                target: 'sender',
                resourceId: senderId,
                resourceLabel: senderLabel,
                nodeLabel: this.senderNode.name,
                newState: newEnableState,
                timestamp: Date.now(),
                success: false,
                error: error.message
            });

            this.showToast(`Failed to ${newEnableState ? 'enable' : 'disable'} sender: ${error.message}`, 'error');
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
            item.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                this.showSenderDetails(item.dataset.id);
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
            item.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                this.showReceiverDetails(item.dataset.id);
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
        this._lastUserAction = Date.now();

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

            // Refresh receiver connections to show updated status
            await this.refreshReceiverConnections();

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

        // Load content for tab
        if (tabName === 'history') {
            this.loadHistory();
        } else if (tabName === 'nodes') {
            this.loadNodesTab();
        } else if (tabName === 'rds') {
            this.loadRdsTab();
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

                // Handle enable_change type
                if (entry.type === 'enable_change') {
                    const hasJson = entry.patchBody || entry.response;
                    const statusClass = entry.success ? 'success' : 'error';
                    const statusText = entry.success ? 'SUCCESS' : 'FAILED';
                    const stateText = entry.newState ? 'ENABLED' : 'DISABLED';
                    const stateClass = entry.newState ? 'enabled' : 'disabled';

                    return `
                        <div class="history-item history-enable-change">
                            <div class="history-header">
                                <div class="history-time">${timeStr}</div>
                                <div class="history-status ${statusClass}">${statusText}</div>
                            </div>
                            <div class="history-details">
                                <strong>${this.escapeHtml(entry.nodeLabel)}</strong><br>
                                <span class="history-target-type">${entry.target.toUpperCase()}</span>
                                ${this.escapeHtml(entry.resourceLabel)} →
                                <span class="history-state-${stateClass}">${stateText}</span>
                                ${entry.error ? `<br><span style="color: var(--error);">Error: ${this.escapeHtml(entry.error)}</span>` : ''}
                            </div>
                            ${hasJson ? `
                                <button class="history-details-btn" onclick="window.bccApp.toggleHistoryDetails(${index})">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <polyline points="6 9 12 15 18 9"/>
                                    </svg>
                                    <span>View Details</span>
                                </button>
                                <div class="history-json" id="history-json-${index}" style="display: none;">
                                    ${entry.patchBody ? `
                                        <div class="json-section">
                                            <h4>PATCH Request Body:</h4>
                                            <pre class="json-code">${this.escapeHtml(JSON.stringify(entry.patchBody, null, 2))}</pre>
                                        </div>
                                    ` : ''}
                                    ${entry.response ? `
                                        <div class="json-section">
                                            <h4>Response:</h4>
                                            <pre class="json-code">${this.escapeHtml(JSON.stringify(entry.response, null, 2))}</pre>
                                        </div>
                                    ` : ''}
                                </div>
                            ` : ''}
                        </div>
                    `;
                }

                // Original patch history format
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
                                <span>View Details</span>
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
     * Load nodes tab content
     */
    loadNodesTab() {
        const content = document.getElementById('nodesContent');
        const countEl = document.getElementById('nodesTabCount');
        const nodes = this.storage.getAllNodes();

        countEl.textContent = `${nodes.length} node${nodes.length !== 1 ? 's' : ''} registered`;

        if (nodes.length === 0) {
            content.innerHTML = `
                <div class="empty-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="12" y1="8" x2="12" y2="16"/>
                        <line x1="8" y1="12" x2="16" y2="12"/>
                    </svg>
                    <p>No nodes registered</p>
                    <small>Use "Add Node" or "Connect RDS" to add nodes</small>
                </div>
            `;
            return;
        }

        content.innerHTML = nodes.map(node => `
            <div class="node-manage-item" data-id="${node.id}">
                <div class="node-manage-header">
                    <div class="node-manage-name">${this.escapeHtml(node.name)}</div>
                    <div class="node-manage-actions">
                        <button class="btn btn-small node-refresh-btn" data-id="${node.id}" title="Re-sync from IS-04">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                                <polyline points="23 4 23 10 17 10"/>
                                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                            </svg>
                            Re-sync
                        </button>
                        <button class="btn btn-small btn-danger node-delete-btn" data-id="${node.id}" title="Delete node">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                                <polyline points="3 6 5 6 21 6"/>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                            Delete
                        </button>
                    </div>
                </div>
                <div class="node-manage-info">
                    <span class="node-manage-url">${this.escapeHtml(node.is04_url)}</span>
                    <span class="node-manage-stats">
                        ${node.senders ? node.senders.length : 0} senders &nbsp;/&nbsp; ${node.receivers ? node.receivers.length : 0} receivers
                    </span>
                </div>
                ${node.added_at ? `<div class="node-manage-date">Added: ${new Date(node.added_at).toLocaleString()}</div>` : ''}
            </div>
        `).join('');

        // Wire up buttons
        content.querySelectorAll('.node-delete-btn').forEach(btn => {
            btn.addEventListener('click', () => this.handleDeleteNode(btn.dataset.id));
        });
        content.querySelectorAll('.node-refresh-btn').forEach(btn => {
            btn.addEventListener('click', () => this.handleRefreshNode(btn.dataset.id));
        });
    }

    /**
     * Delete a node from storage
     */
    handleDeleteNode(nodeId) {
        const node = this.storage.getNode(nodeId);
        if (!node) return;

        if (!confirm(`Delete node "${node.name}"?\nThis cannot be undone.`)) return;

        this.storage.removeNode(nodeId);

        // If this node is currently selected, deselect it
        if (this.senderNode && this.senderNode.id === nodeId) {
            this.senderNode = null;
            this.senderClient = null;
            this.selectedSender = null;
            this.renderSenders([]);
        }
        if (this.receiverNode && this.receiverNode.id === nodeId) {
            this.receiverNode = null;
            this.receiverClient = null;
            this.selectedReceiver = null;
            this.renderReceivers([]);
        }

        this.loadNodes();
        this.updateTakeButton();
        this.loadNodesTab();
        this.showToast(`Node "${node.name}" deleted`, 'success');
    }

    /**
     * Re-sync a node from its IS-04 endpoint
     */
    async handleRefreshNode(nodeId) {
        const node = this.storage.getNode(nodeId);
        if (!node) return;

        // Disable the button during refresh
        const btn = document.querySelector(`.node-refresh-btn[data-id="${nodeId}"]`);
        if (btn) btn.disabled = true;

        try {
            const client = new NMOSClient(node.is04_url);
            await client.initialize();

            const [senders, receivers] = await Promise.all([
                client.getSenders(),
                client.getReceivers()
            ]);

            this.storage.updateNode(nodeId, {
                is05_url: client.is05BaseUrl,
                version: client.version,
                is05_version: client.is05Version,
                senders,
                receivers
            });

            // Update in-memory client if currently selected
            if (this.senderNode && this.senderNode.id === nodeId) {
                this.senderNode = this.storage.getNode(nodeId);
                this.senderClient.version = client.version;
                this.senderClient.is05BaseUrl = client.is05BaseUrl;
                this.senderClient.is05Version = client.is05Version;
                this.renderSenders(senders);
            }
            if (this.receiverNode && this.receiverNode.id === nodeId) {
                this.receiverNode = this.storage.getNode(nodeId);
                this.receiverClient.version = client.version;
                this.receiverClient.is05BaseUrl = client.is05BaseUrl;
                this.receiverClient.is05Version = client.is05Version;
                this.renderReceivers(receivers);
            }

            this.loadNodesTab();
            this.showToast(`"${node.name}" re-synced (${senders.length} senders, ${receivers.length} receivers)`, 'success');

        } catch (error) {
            this.showToast(`Re-sync failed: ${error.message}`, 'error');
            if (btn) btn.disabled = false;
        }
    }

    /**
     * Load RDS tab content
     */
    loadRdsTab() {
        const content = document.getElementById('rdsContent');
        const countEl = document.getElementById('rdsTabCount');
        const urls = this.storage.getAllRdsUrls();

        countEl.textContent = `${urls.length} RDS saved`;

        if (urls.length === 0) {
            content.innerHTML = `
                <div class="empty-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="3"/>
                        <path d="M12 1v6m0 6v6M5.64 5.64l4.24 4.24m4.24 4.24l4.24 4.24M1 12h6m6 0h6M5.64 18.36l4.24-4.24m4.24-4.24l4.24-4.24"/>
                    </svg>
                    <p>No RDS saved</p>
                    <small>Use "Connect RDS" to discover and register nodes</small>
                </div>
            `;
            return;
        }

        content.innerHTML = urls.map(entry => {
            const sub = this.rdsSubscriptions.get(entry.url);
            const wsStatus = sub ? sub.status : (entry.ws_enabled ? 'connecting' : 'disconnected');
            const isActive = sub && sub.status !== 'disconnected';

            const statusLabels = {
                connected: '● Live',
                connecting: '◌ Connecting...',
                reconnecting: '◌ Reconnecting...',
                error: '● Error',
                disconnected: '○ Not subscribed'
            };
            const statusLabel = statusLabels[wsStatus] || '○ Not subscribed';
            const badgeClass = (wsStatus === 'disconnected') ? '' : wsStatus;

            return `
            <div class="node-manage-item">
                <div class="node-manage-header">
                    <div class="node-manage-url" style="font-size:14px; color: var(--text-primary);">${this.escapeHtml(entry.url)}</div>
                    <div class="node-manage-actions">
                        <span class="rds-ws-badge ${badgeClass}">${statusLabel}</span>
                        <button class="btn btn-small rds-ws-btn" data-url="${this.escapeHtml(entry.url)}" title="${isActive ? 'Unsubscribe' : 'Subscribe to live updates'}">
                            ${isActive ? 'Unsubscribe' : 'Subscribe'}
                        </button>
                        <button class="btn btn-small rds-resync-btn" data-url="${this.escapeHtml(entry.url)}" title="Re-sync nodes from this RDS">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                                <polyline points="23 4 23 10 17 10"/>
                                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                            </svg>
                            Re-sync
                        </button>
                        <button class="btn btn-small btn-danger rds-delete-btn" data-url="${this.escapeHtml(entry.url)}" title="Remove saved RDS">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                                <polyline points="3 6 5 6 21 6"/>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                            Delete
                        </button>
                    </div>
                </div>
                <div class="node-manage-date">Last used: ${new Date(entry.last_used).toLocaleString()}</div>
            </div>
            `;
        }).join('');

        // Wire up buttons
        content.querySelectorAll('.rds-ws-btn').forEach(btn => {
            btn.addEventListener('click', () => this.handleRdsWsToggle(btn.dataset.url));
        });
        content.querySelectorAll('.rds-delete-btn').forEach(btn => {
            btn.addEventListener('click', () => this.handleDeleteRdsUrl(btn.dataset.url));
        });
        content.querySelectorAll('.rds-resync-btn').forEach(btn => {
            btn.addEventListener('click', () => this.handleRdsResync(btn.dataset.url));
        });
    }

    /**
     * Delete a saved RDS URL
     */
    handleDeleteRdsUrl(url) {
        this.disconnectRdsSubscription(url);
        this.storage.removeRdsUrl(url);
        this.loadRdsTab();
        this.showToast('RDS removed', 'success');
    }

    /**
     * Open Connect RDS modal pre-filled with a saved URL
     */
    handleRdsResync(url) {
        document.getElementById('settingsModal').classList.remove('active');
        this.openConnectRdsModal();
        document.getElementById('rdsUrl').value = url;
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
     * Export all data as a JSON file download
     */
    handleExportData() {
        const data = this.storage.exportData();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `nmos-bcc-backup-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        this.showToast('Backup exported', 'success');
    }

    /**
     * Import data from a JSON backup file
     */
    async handleImportData(file) {
        try {
            const text = await file.text();
            const data = JSON.parse(text);

            if (!data.nodes && !data.rds_urls && !data.history) {
                this.showToast('Invalid backup file', 'error');
                return;
            }

            if (!confirm('Import this backup? Current data (nodes, RDS URLs, history) will be replaced.')) {
                return;
            }

            // Disconnect any active WS subscriptions before replacing RDS URLs
            this.rdsSubscriptions.forEach((sub) => sub.disconnect());
            this.rdsSubscriptions.clear();
            this.updateWsStatusIndicator();

            this.storage.importData(data);

            // Reload UI
            this.senderNode = null;
            this.senderClient = null;
            this.receiverNode = null;
            this.receiverClient = null;
            this.selectedSender = null;
            this.selectedReceiver = null;
            this.loadNodes();
            this.renderSenders([]);
            this.renderReceivers([]);
            this.updateTakeButton();
            this.loadHistory();

            // Reconnect WS subscriptions that were enabled
            this.reconnectEnabledSubscriptions();

            document.getElementById('settingsModal').classList.remove('active');
            this.showToast('Backup imported successfully', 'success');
        } catch (e) {
            console.error('Import failed:', e);
            this.showToast('Failed to import backup file', 'error');
        }
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

        // Populate recent RDS dropdown and close it
        this.populateRdsRecentSelect();
        document.getElementById('rdsRecentDropdown').classList.remove('open');
        document.getElementById('rdsRecentToggle').classList.remove('open');

        modal.classList.add('active');
    }

    /**
     * Populate the Recent RDS dropdown for the URL input
     */
    populateRdsRecentSelect() {
        const toggle = document.getElementById('rdsRecentToggle');
        const list = document.getElementById('rdsRecentDropdown');
        const wrapper = document.getElementById('rdsUrlWrapper');
        const urls = this.storage.getAllRdsUrls();

        if (urls.length === 0) {
            toggle.style.display = 'none';
            wrapper.classList.remove('has-dropdown');
            list.classList.remove('open');
            list.innerHTML = '';
            return;
        }

        toggle.style.display = 'flex';
        wrapper.classList.add('has-dropdown');
        list.innerHTML = urls.map(entry =>
            `<li data-url="${this.escapeHtml(entry.url)}">${this.escapeHtml(entry.url)}</li>`
        ).join('');
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

            // Save RDS URL to history and remember it for WS connect
            this.storage.saveRdsUrl(rdsUrl);
            this.lastRdsUrl = rdsUrl;

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

            // Auto-enable WS subscription for this RDS
            if (this.lastRdsUrl && (addedCount > 0 || skippedCount > 0)) {
                this.connectRdsSubscription(this.lastRdsUrl, true);
            }
        }, 3000);
    }

    // ===== RDS WebSocket Subscription =====

    /**
     * Reconnect subscriptions that were enabled (ws_enabled: true) on page load
     */
    reconnectEnabledSubscriptions() {
        const urls = this.storage.getAllRdsUrls();
        urls.filter(e => e.ws_enabled).forEach(e => {
            this.connectRdsSubscription(e.url, false);
        });
    }

    /**
     * Connect a RDS WebSocket subscription
     * @param {string} url - RDS base URL
     * @param {boolean} setEnabled - whether to persist ws_enabled: true in storage
     */
    connectRdsSubscription(url, setEnabled) {
        // Disconnect existing subscription for this URL if any
        this.disconnectRdsSubscription(url);

        if (setEnabled) {
            this.storage.setRdsWsEnabled(url, true);
        }

        const sub = new RDSSubscription(url, {
            onGrain: (resourcePath, items) => this.handleGrain(url, resourcePath, items), // url passed for future per-RDS filtering
            onStatusChange: () => {
                this.updateWsStatusIndicator();
                // Refresh RDS tab if open
                const rdsTab = document.getElementById('rdsTab');
                if (rdsTab && rdsTab.classList.contains('active')) {
                    this.loadRdsTab();
                }
            }
        });

        this.rdsSubscriptions.set(url, sub);
        this.updateWsStatusIndicator();

        sub.connect().catch(err => {
            console.warn('WS subscription failed:', err);
        });
    }

    /**
     * Disconnect and remove a RDS WebSocket subscription
     * @param {string} url
     * @param {boolean} setDisabled - whether to persist ws_enabled: false in storage
     */
    disconnectRdsSubscription(url, setDisabled = false) {
        const sub = this.rdsSubscriptions.get(url);
        if (sub) {
            sub.disconnect();
            this.rdsSubscriptions.delete(url);
        }
        if (setDisabled) {
            this.storage.setRdsWsEnabled(url, false);
        }
        this.updateWsStatusIndicator();
    }

    /**
     * Toggle WS subscription for a RDS URL (called from RDS tab)
     */
    handleRdsWsToggle(url) {
        const sub = this.rdsSubscriptions.get(url);
        if (sub && sub.status !== 'disconnected') {
            this.disconnectRdsSubscription(url, true);
            this.showToast('RDS subscription disconnected', 'info');
        } else {
            this.connectRdsSubscription(url, true);
            this.showToast('RDS subscription connecting...', 'info');
        }
        this.loadRdsTab();
    }

    /**
     * Handle incoming IS-04 grain message from RDS WebSocket
     */
    handleGrain(_rdsUrl, resourcePath, items) {
        // Suppress auto-refresh for 3 seconds after a user-initiated action
        // to avoid flickering caused by our own IS-05 PATCH triggering a grain
        const suppressMs = 3000;
        const isSuppressed = (Date.now() - this._lastUserAction) < suppressMs;

        if (resourcePath === '/nodes') {
            items.forEach(item => {
                if (!item.pre && item.post) {
                    const label = item.post.label || item.post.id;
                    this.showToast(`New node in registry: ${label}`, 'info');
                } else if (item.pre && !item.post) {
                    const label = item.pre.label || item.pre.id;
                    this.showToast(`Node left registry: ${label}`, 'warning');
                }
            });
        } else if (resourcePath === '/senders') {
            if (this.senderNode && !isSuppressed) {
                // Only refresh if the changed sender belongs to the displayed node
                const displayedIds = new Set(this.senderNode.senders.map(s => s.id));
                const relevant = items.some(item => displayedIds.has(item.path));
                if (relevant) {
                    clearTimeout(this._refreshDebounce.sender);
                    this._refreshDebounce.sender = setTimeout(() => this.refreshSenderNode(), 800);
                }
            }
        } else if (resourcePath === '/receivers') {
            if (this.receiverNode && !isSuppressed) {
                // Only refresh if the changed receiver belongs to the displayed node
                const displayedIds = new Set(this.receiverNode.receivers.map(r => r.id));
                const relevant = items.some(item => displayedIds.has(item.path));
                if (relevant) {
                    clearTimeout(this._refreshDebounce.receiver);
                    this._refreshDebounce.receiver = setTimeout(() => this.refreshReceiverNode(), 800);
                }
            }
        }
    }

    /**
     * Update the WS status indicator in the header
     */
    updateWsStatusIndicator() {
        const indicator = document.getElementById('wsStatusIndicator');
        const label = document.getElementById('wsStatusLabel');
        if (!indicator) return;

        if (this.rdsSubscriptions.size === 0) {
            indicator.classList.add('hidden');
            return;
        }

        indicator.classList.remove('hidden');
        const statuses = Array.from(this.rdsSubscriptions.values()).map(s => s.status);

        indicator.className = 'ws-status-indicator';
        if (statuses.some(s => s === 'connected')) {
            indicator.classList.add('connected');
            if (label) label.textContent = 'RDS Live';
        } else if (statuses.some(s => s === 'connecting' || s === 'reconnecting')) {
            indicator.classList.add('connecting');
            if (label) label.textContent = 'RDS...';
        } else if (statuses.some(s => s === 'error')) {
            indicator.classList.add('error');
            if (label) label.textContent = 'RDS Error';
        } else {
            if (label) label.textContent = 'RDS';
        }
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

    /**
     * Check if cookie consent has been given
     */
    checkCookieConsent() {
        const consent = localStorage.getItem('cookieConsent');
        if (consent === null) {
            // No consent decision yet, show banner
            this.showCookieBanner();
        } else if (consent === 'true') {
            // User accepted cookies, initialize analytics
            this.initializeAnalytics();
        }
        // If consent === 'false', do nothing (no analytics)
    }

    /**
     * Show cookie consent banner
     */
    showCookieBanner() {
        const banner = document.getElementById('cookieConsent');
        banner.classList.remove('hidden');
    }

    /**
     * Hide cookie consent banner
     */
    hideCookieBanner() {
        const banner = document.getElementById('cookieConsent');
        banner.classList.add('hidden');
    }

    /**
     * Handle cookie consent decision
     */
    handleCookieConsent(accepted) {
        localStorage.setItem('cookieConsent', accepted.toString());
        this.hideCookieBanner();

        if (accepted) {
            this.initializeAnalytics();
            this.showToast('Cookies accepted. Thank you!', 'success');
        } else {
            this.showToast('Cookie preferences saved', 'info');
        }
    }

    /**
     * Initialize Google Analytics (placeholder)
     * TODO: Uncomment when GA tracking ID is provided
     */
    initializeAnalytics() {
        // Placeholder for Google Analytics initialization
        // When you have your tracking ID, uncomment the GA script in index.html
        // and this function will automatically start tracking

        console.log('Analytics would be initialized here with user consent');

        // Example of how to track custom events:
        // if (typeof gtag !== 'undefined') {
        //     gtag('event', 'app_loaded', {
        //         'event_category': 'engagement'
        //     });
        // }
    }

    /**
     * Toggle accordion section
     */
    toggleAccordion(header) {
        const accordionId = header.dataset.accordion;
        const content = document.getElementById(`accordion-${accordionId}`);
        const isActive = header.classList.contains('active');

        // Close all other accordions
        document.querySelectorAll('.accordion-header').forEach(h => {
            if (h !== header) {
                h.classList.remove('active');
                const otherId = h.dataset.accordion;
                const otherContent = document.getElementById(`accordion-${otherId}`);
                if (otherContent) {
                    otherContent.classList.remove('active');
                }
            }
        });

        // Toggle current accordion
        if (isActive) {
            header.classList.remove('active');
            content.classList.remove('active');
        } else {
            header.classList.add('active');
            content.classList.add('active');
        }
    }

    /**
     * Show sender details modal (SDP + active connection)
     */
    async showSenderDetails(senderId) {
        if (!this.senderNode || !this.senderNode.senders) return;

        const sender = this.senderNode.senders.find(s => s.id === senderId);
        if (!sender) return;

        const modal = document.getElementById('resourceDetailModal');
        const title = document.getElementById('resourceDetailTitle');
        const sdpSection = document.getElementById('sdpSection');
        const sdpContent = document.getElementById('sdpContent');
        const activeContent = document.getElementById('activeContent');

        title.textContent = `Sender: ${sender.label}`;
        sdpSection.style.display = 'block';
        sdpContent.textContent = 'Loading SDP...';
        activeContent.textContent = 'Loading...';

        modal.classList.add('active');

        // Fetch SDP from IS-04 manifest_href
        try {
            if (sender.manifest_href) {
                const sdp = await this.senderClient.getSenderSDP(sender);
                sdpContent.textContent = sdp;
            } else {
                sdpContent.textContent = 'No manifest_href available';
            }
        } catch (error) {
            sdpContent.textContent = `Error fetching SDP: ${error.message}`;
        }

        // Fetch active connection from IS-05
        try {
            const activeInfo = await this.getSenderActiveConnection(senderId);
            if (activeInfo) {
                activeContent.innerHTML = this.formatJsonWithHighlight(activeInfo);
            } else {
                activeContent.textContent = 'No active connection data available';
            }
        } catch (error) {
            activeContent.textContent = `Error fetching active connection: ${error.message}`;
        }
    }

    /**
     * Show receiver details modal (active connection)
     */
    async showReceiverDetails(receiverId) {
        if (!this.receiverNode || !this.receiverNode.receivers) return;

        const receiver = this.receiverNode.receivers.find(r => r.id === receiverId);
        if (!receiver) return;

        const modal = document.getElementById('resourceDetailModal');
        const title = document.getElementById('resourceDetailTitle');
        const sdpSection = document.getElementById('sdpSection');
        const activeContent = document.getElementById('activeContent');

        title.textContent = `Receiver: ${receiver.label}`;
        sdpSection.style.display = 'none'; // No SDP for receiver
        activeContent.textContent = 'Loading...';

        modal.classList.add('active');

        // Fetch active connection from IS-05
        try {
            const activeInfo = await this.getReceiverActiveConnection(receiverId);
            if (activeInfo) {
                activeContent.innerHTML = this.formatJsonWithHighlight(activeInfo);
            } else {
                activeContent.textContent = 'No active connection data available';
            }
        } catch (error) {
            activeContent.textContent = `Error fetching active connection: ${error.message}`;
        }
    }

    /**
     * Format JSON with syntax highlighting for true/false
     */
    formatJsonWithHighlight(obj) {
        const json = JSON.stringify(obj, null, 2);
        return json
            .replace(/: true/g, ': <span class="json-true">true</span>')
            .replace(/: false/g, ': <span class="json-false">false</span>');
    }

    /**
     * Copy text to clipboard
     */
    async copyToClipboard(text, buttonEl) {
        try {
            await navigator.clipboard.writeText(text);
            buttonEl.classList.add('copied');
            const originalText = buttonEl.innerHTML;
            buttonEl.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                    <polyline points="20 6 9 17 4 12"/>
                </svg>
                Copied!
            `;
            setTimeout(() => {
                buttonEl.classList.remove('copied');
                buttonEl.innerHTML = originalText;
            }, 2000);
        } catch (error) {
            this.showToast('Failed to copy to clipboard', 'error');
        }
    }
}

// Initialize application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.bccApp = new BCCApplication();
});
