/**
 * Local Storage Manager
 * Manages nodes and patch history in browser localStorage
 */

const STORAGE_KEYS = {
    NODES: 'nmos_bcc_nodes',
    HISTORY: 'nmos_bcc_history',
    RDS_URLS: 'nmos_bcc_rds_urls',
    SETTINGS: 'nmos_bcc_settings',
    MATRIX: 'nmos_bcc_matrix'
};

export class StorageManager {
    constructor() {
        this.nodes = this.loadNodes();
        this.history = this.loadHistory();
    }

    // ===== NODES =====

    /**
     * Load all nodes from localStorage
     */
    loadNodes() {
        try {
            const data = localStorage.getItem(STORAGE_KEYS.NODES);
            return data ? JSON.parse(data) : [];
        } catch (error) {
            console.error('Failed to load nodes from storage:', error);
            return [];
        }
    }

    /**
     * Save nodes to localStorage
     */
    saveNodes() {
        try {
            localStorage.setItem(STORAGE_KEYS.NODES, JSON.stringify(this.nodes));
            document.dispatchEvent(new CustomEvent('nmos:nodes-updated'));
        } catch (error) {
            console.error('Failed to save nodes to storage:', error);
        }
    }

    /**
     * Add a new node
     */
    addNode(node) {
        const nodeData = {
            id: this.generateId(),
            name: node.name,
            type: node.type || 'is04',
            is04_url: node.is04_url,
            is05_url: node.is05_url,
            version: node.version,
            is05_version: node.is05_version,
            senders: node.senders || [],
            receivers: node.receivers || [],
            patch_paths: node.patch_paths || {},
            added_at: new Date().toISOString(),
            last_updated: new Date().toISOString()
        };

        this.nodes.push(nodeData);
        this.saveNodes();
        return nodeData;
    }

    // ===== SDP SOURCES =====

    /**
     * Get or create the special "SDP Sources" virtual node
     */
    getSdpSourcesNode() {
        let node = this.nodes.find(n => n.type === 'sdp');
        if (!node) {
            node = {
                id: 'sdp-sources',
                name: 'SDP Sources',
                type: 'sdp',
                is04_url: null,
                is05_url: null,
                version: null,
                is05_version: null,
                senders: [],
                receivers: [],
                patch_paths: {},
                added_at: new Date().toISOString(),
                last_updated: new Date().toISOString()
            };
            this.nodes.push(node);
            this.saveNodes();
        }
        return node;
    }

    /**
     * Add a SDP sender to SDP Sources node
     */
    addSdpSender(label, sdpText) {
        const node = this.getSdpSourcesNode();
        const sender = {
            id: this.generateId(),
            label,
            sdp_raw: sdpText,
            format: this._detectSdpFormat(sdpText),
            type: 'sdp'
        };
        node.senders.push(sender);
        this.updateNode(node.id, { senders: node.senders });
        return sender;
    }

    /**
     * Remove a SDP sender
     */
    removeSdpSender(senderId) {
        const node = this.getSdpSourcesNode();
        node.senders = node.senders.filter(s => s.id !== senderId);
        this.updateNode(node.id, { senders: node.senders });
    }

    /**
     * Detect media format from SDP
     */
    _detectSdpFormat(sdpText) {
        // ST 2110-40 (ancillary/metadata) is carried as "m=video" but rtpmap encoding is smpte291
        if (/a=rtpmap:\d+\s+smpte291\//im.test(sdpText)) return 'data';
        if (/^m=video/m.test(sdpText)) return 'video';
        if (/^m=audio/m.test(sdpText)) return 'audio';
        if (/^m=application/m.test(sdpText)) return 'data';
        return 'unknown';
    }

    /**
     * Update existing node
     */
    updateNode(nodeId, updates) {
        const index = this.nodes.findIndex(n => n.id === nodeId);
        if (index === -1) {
            throw new Error(`Node not found: ${nodeId}`);
        }

        this.nodes[index] = {
            ...this.nodes[index],
            ...updates,
            last_updated: new Date().toISOString()
        };

        this.saveNodes();
        return this.nodes[index];
    }

    /**
     * Remove a node
     */
    removeNode(nodeId) {
        const index = this.nodes.findIndex(n => n.id === nodeId);
        if (index === -1) {
            return false;
        }

        this.nodes.splice(index, 1);
        this.saveNodes();
        return true;
    }

    /**
     * Get node by ID
     */
    getNode(nodeId) {
        return this.nodes.find(n => n.id === nodeId);
    }

    /**
     * Get all nodes
     */
    getAllNodes() {
        return [...this.nodes];
    }

    /**
     * Update node's senders and receivers
     */
    updateNodeDevices(nodeId, senders, receivers) {
        return this.updateNode(nodeId, {
            senders,
            receivers
        });
    }

    /**
     * Cache PATCH path for a receiver
     */
    cachePatchPath(nodeId, receiverId, path) {
        const node = this.getNode(nodeId);
        if (!node) return;

        const patchPaths = node.patch_paths || {};
        patchPaths[receiverId] = path;

        this.updateNode(nodeId, { patch_paths: patchPaths });
    }

    /**
     * Get cached PATCH path for a receiver
     */
    getCachedPatchPath(nodeId, receiverId) {
        const node = this.getNode(nodeId);
        if (!node || !node.patch_paths) return null;
        return node.patch_paths[receiverId];
    }

    // ===== RECEIVER LOCKS =====

    /**
     * Get resource settings for a receiver or sender
     * Returns { locked: bool, local_label: string }
     */
    getReceiverLock(nodeId, receiverId) {
        const node = this.getNode(nodeId);
        if (!node || !node.resource_settings) return { locked: false, local_label: '' };
        return node.resource_settings[receiverId] || { locked: false, local_label: '' };
    }

    /**
     * Set lock state and local_label for a receiver
     */
    setReceiverLock(nodeId, receiverId, locked, local_label = '') {
        const node = this.getNode(nodeId);
        if (!node) return;
        const resourceSettings = node.resource_settings || {};
        resourceSettings[receiverId] = { locked, local_label };
        this.updateNode(nodeId, { resource_settings: resourceSettings });
    }

    /**
     * Get all resource_settings for a node
     */
    getLockedReceivers(nodeId) {
        const node = this.getNode(nodeId);
        if (!node || !node.resource_settings) return {};
        return node.resource_settings;
    }

    /**
     * Get local_label for a sender
     */
    getSenderLocalLabel(nodeId, senderId) {
        const node = this.getNode(nodeId);
        if (!node || !node.resource_settings) return '';
        return (node.resource_settings[senderId] || {}).local_label || '';
    }

    /**
     * Set local_label for a sender
     */
    setSenderLocalLabel(nodeId, senderId, local_label = '') {
        const node = this.getNode(nodeId);
        if (!node) return;
        const resourceSettings = node.resource_settings || {};
        resourceSettings[senderId] = { ...(resourceSettings[senderId] || {}), local_label };
        this.updateNode(nodeId, { resource_settings: resourceSettings });
    }

    // ===== COMBOS =====

    getComboNode() {
        let node = this.nodes.find(n => n.type === 'combo');
        if (!node) {
            node = {
                id: 'combos', name: 'Combos', type: 'combo',
                is04_url: null, is05_url: null, version: null, is05_version: null,
                senders: [], receivers: [], patch_paths: {},
                added_at: new Date().toISOString(), last_updated: new Date().toISOString()
            };
            this.nodes.push(node);
            this.saveNodes();
        }
        return node;
    }

    _saveComboNode(node) {
        const idx = this.nodes.findIndex(n => n.id === node.id);
        if (idx === -1) return;
        this.nodes[idx] = { ...node, last_updated: new Date().toISOString() };
        this.saveNodes();
    }

    addComboSender(label, members) {
        const node = this.getComboNode();
        const combo = { id: this.generateId(), label, type: 'combo', format: 'combo',
            members: { video: members.video || [], audio: members.audio || [], anc: members.anc || [] } };
        node.senders.push(combo);
        this._saveComboNode(node);
        return combo;
    }

    updateComboSender(comboId, label, members) {
        const node = this.getComboNode();
        const idx = node.senders.findIndex(s => s.id === comboId);
        if (idx === -1) return null;
        node.senders[idx] = { ...node.senders[idx], label,
            members: { video: members.video || [], audio: members.audio || [], anc: members.anc || [] } };
        this._saveComboNode(node);
        return node.senders[idx];
    }

    removeComboSender(comboId) {
        const node = this.getComboNode();
        node.senders = node.senders.filter(s => s.id !== comboId);
        this._saveComboNode(node);
    }

    addComboReceiver(label, members) {
        const node = this.getComboNode();
        const combo = { id: this.generateId(), label, type: 'combo', format: 'combo',
            members: { video: members.video || [], audio: members.audio || [], anc: members.anc || [] } };
        node.receivers.push(combo);
        this._saveComboNode(node);
        return combo;
    }

    updateComboReceiver(comboId, label, members) {
        const node = this.getComboNode();
        const idx = node.receivers.findIndex(r => r.id === comboId);
        if (idx === -1) return null;
        node.receivers[idx] = { ...node.receivers[idx], label,
            members: { video: members.video || [], audio: members.audio || [], anc: members.anc || [] } };
        this._saveComboNode(node);
        return node.receivers[idx];
    }

    removeComboReceiver(comboId) {
        const node = this.getComboNode();
        node.receivers = node.receivers.filter(r => r.id !== comboId);
        this._saveComboNode(node);
    }

    getAllComboSenders()   { return this.getComboNode().senders;   }
    getAllComboReceivers() { return this.getComboNode().receivers; }

    // ===== RDS URLS =====

    /**
     * Get all saved RDS URLs (most recently used first)
     */
    getAllRdsUrls() {
        try {
            const data = localStorage.getItem(STORAGE_KEYS.RDS_URLS);
            return data ? JSON.parse(data) : [];
        } catch {
            return [];
        }
    }

    /**
     * Save an RDS URL (add or update last_used, keep max 10)
     */
    saveRdsUrl(url) {
        const urls = this.getAllRdsUrls().filter(entry => entry.url !== url);
        urls.unshift({ url, last_used: new Date().toISOString() });
        const trimmed = urls.slice(0, 10);
        localStorage.setItem(STORAGE_KEYS.RDS_URLS, JSON.stringify(trimmed));
    }

    /**
     * Remove a saved RDS URL
     */
    removeRdsUrl(url) {
        const urls = this.getAllRdsUrls().filter(entry => entry.url !== url);
        localStorage.setItem(STORAGE_KEYS.RDS_URLS, JSON.stringify(urls));
    }

    /**
     * Set WebSocket subscription enabled flag for a RDS URL
     */
    setRdsWsEnabled(url, enabled) {
        const urls = this.getAllRdsUrls();
        const idx = urls.findIndex(e => e.url === url);
        if (idx === -1) return;
        urls[idx].ws_enabled = enabled;
        localStorage.setItem(STORAGE_KEYS.RDS_URLS, JSON.stringify(urls));
    }

    // ===== HISTORY =====

    /**
     * Load patch history from localStorage
     */
    loadHistory() {
        try {
            const data = localStorage.getItem(STORAGE_KEYS.HISTORY);
            return data ? JSON.parse(data) : [];
        } catch (error) {
            console.error('Failed to load history from storage:', error);
            return [];
        }
    }

    /**
     * Save history to localStorage
     */
    saveHistory() {
        try {
            // Keep only last 100 entries
            if (this.history.length > 100) {
                this.history = this.history.slice(-100);
            }
            localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(this.history));
        } catch (error) {
            console.error('Failed to save history to storage:', error);
        }
    }

    /**
     * Add patch history entry
     */
    addHistory(entry) {
        let historyEntry;

        // Handle enable_change type
        if (entry.type === 'enable_change') {
            historyEntry = {
                id: this.generateId(),
                type: 'enable_change',
                timestamp: entry.timestamp || Date.now(),
                target: entry.target, // 'sender' | 'receiver'
                resourceId: entry.resourceId,
                resourceLabel: entry.resourceLabel,
                nodeLabel: entry.nodeLabel,
                newState: entry.newState,
                success: entry.success,
                error: entry.error || null,
                patchBody: entry.patchBody || null,
                response: entry.response || null
            };
        } else {
            // Original patch history format
            historyEntry = {
                id: this.generateId(),
                timestamp: new Date().toISOString(),
                node_id: entry.node_id,
                node_name: entry.node_name,
                sender: {
                    id: entry.sender.id,
                    label: entry.sender.label
                },
                receiver: {
                    id: entry.receiver.id,
                    label: entry.receiver.label
                },
                status: entry.status, // 'success' | 'failed'
                error: entry.error || null,
                patch_body: entry.patch_body || null,
                active_state: entry.active_state || null
            };
        }

        this.history.unshift(historyEntry); // Add to beginning
        this.saveHistory();
        return historyEntry;
    }

    /**
     * Get all history entries
     */
    getAllHistory() {
        return [...this.history];
    }

    /**
     * Get history for specific node
     */
    getNodeHistory(nodeId) {
        return this.history.filter(h => h.node_id === nodeId);
    }

    /**
     * Clear all history
     */
    clearHistory() {
        this.history = [];
        this.saveHistory();
    }

    /**
     * Clear history older than X days
     */
    clearOldHistory(days = 30) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);

        this.history = this.history.filter(h => {
            return new Date(h.timestamp) > cutoffDate;
        });

        this.saveHistory();
    }

    // ===== SETTINGS =====

    /**
     * Get settings
     */
    getSettings() {
        try {
            const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
            return data ? JSON.parse(data) : this.getDefaultSettings();
        } catch (error) {
            console.error('Failed to load settings:', error);
            return this.getDefaultSettings();
        }
    }

    /**
     * Save settings
     */
    saveSettings(settings) {
        try {
            localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
        } catch (error) {
            console.error('Failed to save settings:', error);
        }
    }

    /**
     * Get default settings
     */
    getDefaultSettings() {
        return {
            theme: 'dark',
            autoRefresh: false,
            refreshInterval: 30000, // 30 seconds
            showNotifications: true,
            streamdeck: { enabled: false }
        };
    }

    getStreamDeckEnabled() {
        const settings = this.getSettings();
        return settings.streamdeck?.enabled ?? false;
    }

    setStreamDeckEnabled(enabled) {
        const settings = this.getSettings();
        if (!settings.streamdeck) settings.streamdeck = {};
        settings.streamdeck.enabled = enabled;
        this.saveSettings(settings);
    }

    // ===== MATRIX SETTINGS =====

    getMatrixSettings() {
        try {
            const data = localStorage.getItem(STORAGE_KEYS.MATRIX);
            return data ? JSON.parse(data) : { hidden_senders: [], hidden_receivers: [] };
        } catch {
            return { hidden_senders: [], hidden_receivers: [] };
        }
    }

    saveMatrixSettings(settings) {
        localStorage.setItem(STORAGE_KEYS.MATRIX, JSON.stringify(settings));
    }

    setMatrixSenderVisible(key, visible) {
        const s = this.getMatrixSettings();
        if (!s.hidden_senders) s.hidden_senders = [];
        if (visible) {
            s.hidden_senders = s.hidden_senders.filter(k => k !== key);
        } else if (!s.hidden_senders.includes(key)) {
            s.hidden_senders.push(key);
        }
        this.saveMatrixSettings(s);
    }

    setMatrixReceiverVisible(key, visible) {
        const s = this.getMatrixSettings();
        if (!s.hidden_receivers) s.hidden_receivers = [];
        if (visible) {
            s.hidden_receivers = s.hidden_receivers.filter(k => k !== key);
        } else if (!s.hidden_receivers.includes(key)) {
            s.hidden_receivers.push(key);
        }
        this.saveMatrixSettings(s);
    }

    // ===== UTILITIES =====

    /**
     * Generate unique ID
     */
    generateId() {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Export all data as JSON
     */
    exportData() {
        return {
            nodes: this.nodes,
            history: this.history,
            rds_urls: this.getAllRdsUrls(),
            settings: this.getSettings(),
            matrix_settings: this.getMatrixSettings(),
            exported_at: new Date().toISOString()
        };
    }

    /**
     * Import data from JSON
     */
    importData(data) {
        if (data.nodes) {
            this.nodes = data.nodes;
            this.saveNodes();
        }
        if (data.history) {
            this.history = data.history;
            this.saveHistory();
        }
        if (data.rds_urls) {
            localStorage.setItem(STORAGE_KEYS.RDS_URLS, JSON.stringify(data.rds_urls));
        }
        if (data.settings) {
            this.saveSettings(data.settings);
        }
        if (data.matrix_settings) {
            this.saveMatrixSettings(data.matrix_settings);
        }
    }

    /**
     * Clear all stored data
     */
    clearAll() {
        this.nodes = [];
        this.history = [];
        this.saveNodes();
        this.saveHistory();
        localStorage.removeItem(STORAGE_KEYS.SETTINGS);
        localStorage.removeItem(STORAGE_KEYS.RDS_URLS);
    }
}
