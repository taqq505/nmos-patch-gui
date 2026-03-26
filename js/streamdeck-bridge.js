/**
 * Stream Deck Bridge
 * Manages WebSocket connection to Stream Deck plugin (ws://localhost:57284)
 * One-way: BCC → Stream Deck (node_list only)
 */

export class StreamDeckBridge {
    constructor(onStatusChange) {
        this._ws = null;
        this._enabled = false;
        this._retryTimer = null;
        this._onStatusChange = onStatusChange || (() => {});
        this.status = 'off'; // 'off' | 'disconnected' | 'connected'
    }

    /**
     * Enable or disable the bridge
     */
    setEnabled(enabled) {
        if (this._enabled === enabled) return;
        this._enabled = enabled;

        if (enabled) {
            this._setStatus('disconnected');
            this._connect();
        } else {
            this._disconnect();
            this._setStatus('off');
        }
    }

    /**
     * Send current node list to Stream Deck plugin
     * Only sends id / name / is04_url — plugin fetches the rest from IS-04 directly
     */
    sendNodeList(nodes) {
        if (this.status !== 'connected' || !this._ws) return;

        const message = {
            type: 'node_list',
            nodes: nodes.map(n => ({
                id: n.id,
                name: n.name,
                is04_url: n.is04_url
            }))
        };

        try {
            this._ws.send(JSON.stringify(message));
        } catch (e) {
            console.warn('StreamDeckBridge: send failed', e);
        }
    }

    _connect() {
        if (this._ws) return;

        try {
            this._ws = new WebSocket('ws://localhost:57284');

            this._ws.addEventListener('open', () => {
                console.log('StreamDeckBridge: connected');
                this._setStatus('connected');
            });

            this._ws.addEventListener('close', () => {
                this._ws = null;
                if (this._enabled) {
                    this._setStatus('disconnected');
                    this._scheduleRetry();
                }
            });

            this._ws.addEventListener('error', () => {
                // close event fires after error — handled there
            });

        } catch (e) {
            this._ws = null;
            if (this._enabled) {
                this._setStatus('disconnected');
                this._scheduleRetry();
            }
        }
    }

    _disconnect() {
        clearTimeout(this._retryTimer);
        this._retryTimer = null;
        if (this._ws) {
            this._ws.close();
            this._ws = null;
        }
    }

    _scheduleRetry() {
        clearTimeout(this._retryTimer);
        this._retryTimer = setTimeout(() => {
            if (this._enabled) this._connect();
        }, 5000);
    }

    _setStatus(status) {
        this.status = status;
        this._onStatusChange(status);
    }
}
