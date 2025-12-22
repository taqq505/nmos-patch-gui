/**
 * SDP Parser for ST2110
 * Converts SDP to NMOS IS-05 PATCH format
 * Based on nmos-sdp-patcher3.py
 */

export class SDPParser {
    /**
     * Parse SDP text to IS-05 PATCH JSON format
     * @param {string} sdpText - Raw SDP text
     * @param {string} senderId - NMOS sender ID (optional)
     * @param {number} receiverPortCount - Number of transport_params expected (1 or 2)
     * @returns {object} IS-05 PATCH body
     */
    parseToJSON(sdpText, senderId = null, receiverPortCount = 2) {
        // Normalize line endings: convert all to \n for processing
        const normalizedSdp = sdpText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

        // For transport_file, convert to CRLF and remove consecutive empty lines
        let normalizedSdpCrlf = normalizedSdp.replace(/\n/g, '\r\n');
        normalizedSdpCrlf = normalizedSdpCrlf.replace(/\r\n\r\n+/g, '\r\n');

        const lines = normalizedSdp.split('\n');

        // Build result object
        const result = {
            activation: { mode: 'activate_immediate' },
            master_enable: true,
            transport_file: {
                data: normalizedSdpCrlf,
                type: 'application/sdp'
            },
            transport_params: []
        };

        // Add sender_id if provided
        if (senderId) {
            result.sender_id = senderId;
        }

        // Parse transport parameters
        const transportParams = this.extractTransportParams(lines, receiverPortCount);
        result.transport_params = transportParams;

        return result;
    }

    /**
     * Extract transport parameters from SDP lines
     * Handles ST2110-7 (primary/secondary legs) and single stream
     */
    extractTransportParams(lines, receiverPortCount) {
        const paramBlocks = {};
        let currentBlock = {
            destination_port: null,
            multicast_ip: null,
            source_ip: null,
            rtp_enabled: true
        };
        let currentMid = null;

        for (const line of lines) {
            const trimmed = line.trim();

            // m= line: media description with port
            if (trimmed.startsWith('m=')) {
                const parts = trimmed.split(/\s+/);
                if (parts.length >= 2) {
                    currentBlock.destination_port = parseInt(parts[1]);
                }
            }
            // c= line: connection information (multicast IP)
            else if (trimmed.startsWith('c=IN IP4')) {
                const parts = trimmed.split(/\s+/);
                if (parts.length >= 3) {
                    // Handle format: "239.0.0.1/32" or "239.0.0.1"
                    currentBlock.multicast_ip = parts[2].split('/')[0];
                }
            }
            // a=source-filter: source IP
            else if (trimmed.startsWith('a=source-filter:')) {
                const parts = trimmed.split(/\s+/);
                if (parts.length >= 5) {
                    currentBlock.source_ip = parts[parts.length - 1];
                }
            }
            // a=mid: media ID (primary/secondary for ST2110-7)
            else if (trimmed.startsWith('a=mid:')) {
                const mid = trimmed.split(':')[1].trim().toLowerCase();

                // Save previous block if it has valid data
                if (currentBlock.destination_port && currentBlock.multicast_ip) {
                    if (currentMid) {
                        paramBlocks[currentMid] = { ...currentBlock };
                    }
                }

                // Start new block for this mid
                currentMid = mid;
                currentBlock = {
                    destination_port: null,
                    multicast_ip: null,
                    source_ip: null,
                    rtp_enabled: true
                };
            }
        }

        // Save the last block
        if (currentMid && currentBlock.destination_port && currentBlock.multicast_ip) {
            paramBlocks[currentMid] = { ...currentBlock };
        }

        // Build transport_params array based on detected structure
        const transportParams = this.buildTransportParamsArray(
            paramBlocks,
            currentBlock,
            receiverPortCount
        );

        return transportParams;
    }

    /**
     * Build transport_params array based on detected parameters
     */
    buildTransportParamsArray(paramBlocks, lastBlock, receiverPortCount) {
        const params = [];

        // Case 1: ST2110-7 with primary and secondary
        if (paramBlocks.primary && paramBlocks.secondary) {
            params.push(paramBlocks.primary);
            params.push(paramBlocks.secondary);
        }
        // Case 2: Only primary leg
        else if (paramBlocks.primary) {
            params.push(paramBlocks.primary);
            if (receiverPortCount === 2) {
                params.push({ rtp_enabled: false });
            }
        }
        // Case 3: Single stream without mid tags
        else if (Object.keys(paramBlocks).length > 0) {
            const firstBlock = paramBlocks[Object.keys(paramBlocks)[0]];
            params.push(firstBlock);
            if (receiverPortCount === 2) {
                params.push({ rtp_enabled: false });
            }
        }
        // Case 4: Fallback - use last collected block
        else if (this.isValidBlock(lastBlock)) {
            params.push(lastBlock);
            if (receiverPortCount === 2) {
                params.push({ rtp_enabled: false });
            }
        }
        // Case 5: No valid parameters found
        else {
            throw new Error('Could not extract transport_params from SDP (missing required information)');
        }

        // Adjust to receiver port count
        if (receiverPortCount === 1 && params.length > 1) {
            return [params[0]];
        }

        return params;
    }

    /**
     * Check if a transport block has all required fields
     */
    isValidBlock(block) {
        return block.destination_port !== null &&
               block.multicast_ip !== null &&
               block.source_ip !== null;
    }

    /**
     * Extract basic SDP information for display
     */
    getSDPInfo(sdpText) {
        const lines = sdpText.split(/\r?\n/);
        const info = {
            sessionName: null,
            streams: []
        };

        let currentStream = null;

        for (const line of lines) {
            const trimmed = line.trim();

            // Session name
            if (trimmed.startsWith('s=')) {
                info.sessionName = trimmed.substring(2).trim();
            }
            // Media stream
            else if (trimmed.startsWith('m=')) {
                if (currentStream) {
                    info.streams.push(currentStream);
                }
                const parts = trimmed.split(/\s+/);
                currentStream = {
                    type: parts[0].substring(2), // video/audio
                    port: parseInt(parts[1]),
                    format: null,
                    multicast: null
                };
            }
            // Connection info
            else if (trimmed.startsWith('c=') && currentStream) {
                const parts = trimmed.split(/\s+/);
                if (parts.length >= 3) {
                    currentStream.multicast = parts[2].split('/')[0];
                }
            }
            // Media format
            else if (trimmed.startsWith('a=rtpmap:') && currentStream) {
                const format = trimmed.substring(9).trim();
                currentStream.format = format;
            }
        }

        if (currentStream) {
            info.streams.push(currentStream);
        }

        return info;
    }
}
