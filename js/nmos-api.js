/**
 * NMOS API Client
 * Handles IS-04 and IS-05 communication
 */

export class NMOSClient {
    constructor(is04BaseUrl) {
        this.is04BaseUrl = is04BaseUrl.replace(/\/$/, ''); // Remove trailing slash
        this.is05BaseUrl = null;
        this.version = null;
        this.is05Version = null;
    }

    /**
     * Initialize the client by discovering versions and IS-05 endpoint
     */
    async initialize() {
        try {
            // Get IS-04 version
            const versions = await this.fetchJSON('/x-nmos/node/');
            this.version = versions.sort().reverse()[0].replace(/\//g, '');

            // Discover IS-05 endpoint from device controls
            await this.discoverIS05();

            return true;
        } catch (error) {
            console.error('Failed to initialize NMOS client:', error);
            throw new Error(`Failed to connect to NMOS node: ${error.message}`);
        }
    }

    /**
     * Discover IS-05 endpoint from device controls
     */
    async discoverIS05() {
        try {
            // Get first available device to discover IS-05
            const devices = await this.fetchJSON(`/x-nmos/node/${this.version}/devices/`);

            if (devices.length === 0) {
                throw new Error('No devices found on this node');
            }

            // Check first device for IS-05 control endpoint
            const device = devices[0];

            if (device.controls && device.controls.length > 0) {
                const is05Control = device.controls.find(
                    c => c.type && (c.type.includes('sr-ctrl') || c.type.includes('connection'))
                );

                if (is05Control && is05Control.href) {
                    this.is05BaseUrl = is05Control.href.replace(/\/$/, '');
                    console.log('✅ IS-05 discovered from device controls:', this.is05BaseUrl);

                    // Get IS-05 version
                    const is05Versions = await this.fetchJSON('/x-nmos/connection/', this.is05BaseUrl);
                    this.is05Version = is05Versions.sort().reverse()[0].replace(/\//g, '');

                    return;
                }
            }

            // Fallback: try common IS-05 ports
            await this.guessIS05Endpoint();

        } catch (error) {
            console.warn('Failed to discover IS-05 from devices, trying fallback:', error);
            await this.guessIS05Endpoint();
        }
    }

    /**
     * Fallback: Guess IS-05 endpoint based on IS-04 URL
     */
    async guessIS05Endpoint() {
        const url = new URL(this.is04BaseUrl);
        const basePort = parseInt(url.port || 80);

        // Try common port patterns
        const portsToTry = [
            basePort + 1,  // Most common: IS-04 port + 1
            3001,          // Standard IS-05 port
            basePort
        ];

        for (const port of portsToTry) {
            try {
                const testUrl = `${url.protocol}//${url.hostname}:${port}`;
                const versions = await this.fetchJSON('/x-nmos/connection/', testUrl);

                this.is05BaseUrl = testUrl;
                this.is05Version = versions.sort().reverse()[0].replace(/\//g, '');
                console.log(`✅ IS-05 guessed successfully: ${this.is05BaseUrl}`);
                return;
            } catch (error) {
                // Continue to next port
            }
        }

        throw new Error('Could not discover IS-05 endpoint. Please check your NMOS node configuration.');
    }

    /**
     * Get all senders from IS-04
     */
    async getSenders() {
        const senders = await this.fetchJSON(`/x-nmos/node/${this.version}/senders/`);

        // Get all flows to resolve formats
        const flows = await this.fetchJSON(`/x-nmos/node/${this.version}/flows/`);
        const flowMap = new Map(flows.map(f => [f.id, f]));

        return senders.map(s => {
            let format = 'unknown';

            if (s.flow_id && flowMap.has(s.flow_id)) {
                const flow = flowMap.get(s.flow_id);
                // Parse NMOS format URN
                if (flow.format) {
                    const formatMatch = flow.format.match(/urn:x-nmos:format:(\w+)/);
                    if (formatMatch) {
                        format = formatMatch[1]; // video, audio, data, mux
                    }
                }
            }

            return {
                id: s.id,
                label: s.label || s.id,
                description: s.description || '',
                format: format,
                manifest_href: s.manifest_href,
                device_id: s.device_id,
                flow_id: s.flow_id,
                transport: s.transport
            };
        });
    }

    /**
     * Get all receivers from IS-04
     */
    async getReceivers() {
        const receivers = await this.fetchJSON(`/x-nmos/node/${this.version}/receivers/`);

        return receivers.map(r => {
            let format = 'unknown';

            // Parse NMOS format URN
            if (r.format) {
                const formatMatch = r.format.match(/urn:x-nmos:format:(\w+)/);
                if (formatMatch) {
                    format = formatMatch[1]; // video, audio, data, mux
                }
            }

            return {
                id: r.id,
                label: r.label || r.id,
                description: r.description || '',
                format: format,
                device_id: r.device_id,
                transport: r.transport,
                caps: r.caps
            };
        });
    }

    /**
     * Get SDP from sender's manifest_href
     */
    async getSenderSDP(sender) {
        if (!sender.manifest_href) {
            throw new Error('Sender does not have manifest_href');
        }

        const response = await fetch(sender.manifest_href);
        if (!response.ok) {
            throw new Error(`Failed to fetch SDP: ${response.status} ${response.statusText}`);
        }

        return await response.text();
    }

    /**
     * Test PATCH path (with or without trailing slash)
     */
    async testPatchPath(receiverId) {
        const basePath = `/x-nmos/connection/${this.is05Version}/single/receivers/${receiverId}/staged`;

        // Try with trailing slash first
        for (const suffix of ['/', '']) {
            const path = basePath + suffix;
            try {
                await this.patchJSON(path, {
                    activation: { mode: 'activate_immediate' },
                    master_enable: false
                }, this.is05BaseUrl);

                console.log(`✅ PATCH path confirmed: ${path}`);
                return {
                    stagedPath: path,
                    activePath: `/x-nmos/connection/${this.is05Version}/single/receivers/${receiverId}/active/`
                };
            } catch (error) {
                console.log(`Failed to PATCH ${path}:`, error.message);
            }
        }

        throw new Error('Could not determine correct PATCH path for receiver');
    }

    /**
     * Get receiver's current staged parameters to determine transport_params count
     */
    async getStagedParams(receiverId, stagedPath) {
        try {
            const staged = await this.fetchJSON(stagedPath, this.is05BaseUrl);
            const portCount = staged.transport_params ? staged.transport_params.length : 2;
            return { portCount, staged };
        } catch (error) {
            console.warn('Failed to get staged params, defaulting to 2 ports:', error);
            return { portCount: 2, staged: null };
        }
    }

    /**
     * Patch receiver with sender's SDP
     */
    async patchReceiver(receiverId, senderId, sdpText, receiverPortCount = 2) {
        if (!this.is05BaseUrl) {
            throw new Error('IS-05 endpoint not available');
        }

        // Import SDP parser
        const { SDPParser } = await import('./sdp-parser.js');
        const parser = new SDPParser();

        // Convert SDP to PATCH body
        const patchBody = parser.parseToJSON(sdpText, senderId, receiverPortCount);

        // Find correct PATCH path
        const paths = await this.testPatchPath(receiverId);

        // Send PATCH
        console.log('Sending PATCH:', patchBody);
        const response = await this.patchJSON(paths.stagedPath, patchBody, this.is05BaseUrl);

        // Wait a moment for activation
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Get active state
        const activeState = await this.fetchJSON(paths.activePath, this.is05BaseUrl);

        return {
            success: true,
            patchBody,
            activeState,
            paths
        };
    }

    /**
     * Discover nodes from RDS (Registry & Discovery System)
     * @param {string} queryApiUrl - IS-04 Query API URL
     */
    static async discoverFromRDS(queryApiUrl) {
        const baseUrl = queryApiUrl.replace(/\/$/, '');

        try {
            // Get Query API version
            const versionsResponse = await fetch(`${baseUrl}/x-nmos/query/`);
            if (!versionsResponse.ok) {
                throw new Error(`Failed to connect to Registry: ${versionsResponse.status}`);
            }

            const versions = await versionsResponse.json();
            const version = versions.sort().reverse()[0].replace(/\//g, '');

            // Get all nodes from registry
            const nodesResponse = await fetch(`${baseUrl}/x-nmos/query/${version}/nodes/`);
            if (!nodesResponse.ok) {
                throw new Error(`Failed to fetch nodes: ${nodesResponse.status}`);
            }

            const nodes = await nodesResponse.json();

            // Parse nodes and extract IS-04 endpoints
            return nodes.map(node => {
                // Find Node API endpoint
                let nodeApiUrl = null;

                if (node.services && node.services.length > 0) {
                    const nodeService = node.services.find(s =>
                        s.type && s.type.includes('node')
                    );
                    if (nodeService && nodeService.href) {
                        nodeApiUrl = nodeService.href.replace(/\/$/, '');
                    }
                }

                // Fallback: construct from node's API endpoints
                if (!nodeApiUrl && node.api && node.api.endpoints && node.api.endpoints.length > 0) {
                    const endpoint = node.api.endpoints[0];
                    const protocol = endpoint.protocol || 'http';
                    const host = endpoint.host;
                    const port = endpoint.port || 80;
                    nodeApiUrl = `${protocol}://${host}:${port}`;
                }

                return {
                    id: node.id,
                    label: node.label || node.id,
                    description: node.description || '',
                    hostname: node.hostname || '',
                    is04_url: nodeApiUrl,
                    version: node.version || null,
                    raw: node
                };
            }).filter(n => n.is04_url); // Only include nodes with valid IS-04 URL
        } catch (error) {
            console.error('RDS discovery failed:', error);
            throw new Error(`Registry connection failed: ${error.message}`);
        }
    }

    /**
     * Fetch JSON from NMOS API
     */
    async fetchJSON(path, baseUrl = null) {
        const url = (baseUrl || this.is04BaseUrl) + path;

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
                throw new Error(`Network error: Cannot reach ${url}. Check CORS settings or network connectivity.`);
            }
            throw error;
        }
    }

    /**
     * PATCH JSON to NMOS API
     */
    async patchJSON(path, body, baseUrl = null) {
        const url = (baseUrl || this.is05BaseUrl) + path;

        try {
            const response = await fetch(url, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(body)
            });

            if (!response.ok && response.status !== 202) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
            }

            // IS-05 may return 200 or 202
            return response.status;
        } catch (error) {
            if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
                throw new Error(`Network error: Cannot reach ${url}. Check CORS settings.`);
            }
            throw error;
        }
    }
}
