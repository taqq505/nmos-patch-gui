/**
 * Local Storage Manager
 * Manages nodes and patch history in browser localStorage
 */

const STORAGE_KEYS = {
    NODES: 'nmos_bcc_nodes',
    HISTORY: 'nmos_bcc_history',
    RDS_URLS: 'nmos_bcc_rds_urls'
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
            showNotifications: true
        };
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
            settings: this.getSettings(),
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
        if (data.settings) {
            this.saveSettings(data.settings);
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
    }
}
