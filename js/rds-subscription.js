/**
 * RDS WebSocket Subscription Manager
 * Manages IS-04 Query API WebSocket subscriptions for real-time resource updates
 */

const RESOURCE_PATHS = ['/nodes', '/senders', '/receivers'];

export class RDSSubscription {
    /**
     * @param {string} baseUrl - IS-04 Query API base URL (http://...)
     * @param {Object} options
     * @param {Function} options.onGrain - callback(resourcePath, grainData[])
     * @param {Function} options.onStatusChange - callback(status)
     */
    constructor(baseUrl, options = {}) {
        this.baseUrl = baseUrl.replace(/\/$/, '');
        this.version = null;
        this.connections = new Map(); // resourcePath → WebSocket
        this.onGrain = options.onGrain || null;
        this.onStatusChange = options.onStatusChange || null;
        this._reconnectTimers = new Map();
        this._reconnectDelays = new Map();
        this._closed = false;
        this._status = 'disconnected';
    }

    get status() { return this._status; }

    /**
     * Connect to RDS and start subscriptions for all resource paths
     */
    async connect() {
        this._closed = false;
        this._setStatus('connecting');

        try {
            // Discover Query API version
            const res = await fetch(`${this.baseUrl}/x-nmos/query/`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const versions = await res.json();
            this.version = versions.sort().reverse()[0].replace(/\//g, '');

            // Create subscriptions concurrently
            await Promise.all(RESOURCE_PATHS.map(p => this._createSubscription(p)));
        } catch (error) {
            console.error('RDS subscription connect failed:', error);
            this._setStatus('error');
            throw error;
        }
    }

    /**
     * POST to IS-04 subscriptions endpoint and open the returned WebSocket
     */
    async _createSubscription(resourcePath) {
        const url = `${this.baseUrl}/x-nmos/query/${this.version}/subscriptions`;

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                max_update_rate_ms: 100,
                resource_path: resourcePath,
                params: {},
                persist: false,
                secure: false
            })
        });

        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`Subscription POST (${resourcePath}): HTTP ${res.status} ${text}`);
        }

        const sub = await res.json();
        console.log(`✅ WS subscription created: ${resourcePath} → ${sub.ws_href}`);
        this._openWS(resourcePath, sub.ws_href);
    }

    /**
     * Open a WebSocket for a resource path
     */
    _openWS(resourcePath, wsHref) {
        if (this._closed) return;

        // Close any existing connection for this path
        const existing = this.connections.get(resourcePath);
        if (existing) {
            existing.onclose = null;
            if (existing.readyState !== WebSocket.CLOSED) existing.close();
        }

        const ws = new WebSocket(wsHref);
        this.connections.set(resourcePath, ws);

        ws.onopen = () => {
            console.log(`🔌 WS open: ${resourcePath}`);
            this._reconnectDelays.delete(resourcePath);
            this._checkAllConnected();
        };

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.grain && msg.grain.data && this.onGrain) {
                    this.onGrain(resourcePath, msg.grain.data);
                }
            } catch (e) {
                console.warn('Failed to parse WS grain:', e);
            }
        };

        ws.onclose = (event) => {
            if (this._closed) return;
            console.warn(`WS closed (${resourcePath}): code=${event.code}`);
            this._setStatus('reconnecting');
            this._scheduleReconnect(resourcePath);
        };

        ws.onerror = () => {
            // onclose fires after onerror — handled there
        };
    }

    _checkAllConnected() {
        const allOpen = RESOURCE_PATHS.every(path => {
            const ws = this.connections.get(path);
            return ws && ws.readyState === WebSocket.OPEN;
        });
        if (allOpen) this._setStatus('connected');
    }

    _scheduleReconnect(resourcePath) {
        if (this._closed) return;

        const delay = this._reconnectDelays.get(resourcePath) || 1000;
        this._reconnectDelays.set(resourcePath, Math.min(delay * 2, 30000));

        console.log(`Reconnecting ${resourcePath} in ${delay}ms...`);
        const timer = setTimeout(async () => {
            if (this._closed) return;
            try {
                await this._createSubscription(resourcePath);
            } catch (e) {
                console.error(`Reconnect failed (${resourcePath}):`, e);
                this._scheduleReconnect(resourcePath);
            }
        }, delay);

        this._reconnectTimers.set(resourcePath, timer);
    }

    /**
     * Disconnect all WebSocket connections and stop reconnection
     */
    disconnect() {
        this._closed = true;

        this._reconnectTimers.forEach(t => clearTimeout(t));
        this._reconnectTimers.clear();

        this.connections.forEach(ws => {
            ws.onclose = null;
            if (ws.readyState !== WebSocket.CLOSED) ws.close();
        });
        this.connections.clear();

        this._setStatus('disconnected');
    }

    _setStatus(status) {
        if (this._status === status) return;
        this._status = status;
        console.log(`RDS WS status [${this.baseUrl}]: ${status}`);
        if (this.onStatusChange) this.onStatusChange(status);
    }
}
