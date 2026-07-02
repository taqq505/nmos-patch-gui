/**
 * ComboManager — resolves multi-stream patch pairs for COMBO mode in the Matrix view.
 * A combo groups VIDEO / AUDIO / ANC senders (or receivers) as one logical unit.
 */

const COMBO_FORMATS = ['video', 'audio', 'anc'];

export class ComboManager {
    constructor(storage) {
        this.storage = storage;
    }

    isCombo(item) {
        return item?.type === 'combo';
    }

    /** Collect combo senders for the MTX COMBO tab */
    collectComboSenders() {
        const node = this.storage.getComboNode();
        return (node.senders || []).map(s => ({
            ...s,
            nodeId:       node.id,
            nodeName:     node.name,
            nodeType:     'combo',
            key:          `${node.id}:${s.id}`,
            displayLabel: s.label || s.id,
            is04Label:    s.label,
        }));
    }

    /** Collect combo receivers for the MTX COMBO tab */
    collectComboReceivers() {
        const node = this.storage.getComboNode();
        return (node.receivers || []).map(r => ({
            ...r,
            nodeId:       node.id,
            nodeName:     node.name,
            key:          `${node.id}:${r.id}`,
            locked:       false,
            displayLabel: r.label || r.id,
            is04Label:    r.label,
        }));
    }

    /**
     * Resolve actual {sender, receiver} pairs to patch.
     * Combo→Combo: zip by format, youngest index first.
     * Combo→Single: first sender of matching format.
     * Single→Combo: first receiver of matching format.
     * Single→Single: pass through unchanged.
     */
    resolvePatchPairs(sender, receiver) {
        const isSC = this.isCombo(sender);
        const isRC = this.isCombo(receiver);

        if (!isSC && !isRC) {
            return [{ sender, receiver }];
        }

        if (isSC && isRC) {
            const pairs = [];
            for (const fmt of COMBO_FORMATS) {
                const sRefs = sender.members?.[fmt] || [];
                const rRefs = receiver.members?.[fmt] || [];
                const count = Math.min(sRefs.length, rRefs.length);
                for (let i = 0; i < count; i++) {
                    const s = this._resolveSender(sRefs[i]);
                    const r = this._resolveReceiver(rRefs[i]);
                    if (s && r) pairs.push({ sender: s, receiver: r });
                }
            }
            return pairs;
        }

        if (isSC && !isRC) {
            const fmt = this._normalizeFormat(receiver.format);
            const sRefs = sender.members?.[fmt] || [];
            if (!sRefs.length) return [];
            const s = this._resolveSender(sRefs[0]);
            return s ? [{ sender: s, receiver }] : [];
        }

        // Single → Combo
        const fmt = this._normalizeFormat(sender.format);
        const rRefs = receiver.members?.[fmt] || [];
        if (!rRefs.length) return [];
        const r = this._resolveReceiver(rRefs[0]);
        return r ? [{ sender, receiver: r }] : [];
    }

    /** Stream counts per format: { video: 2, audio: 1 } */
    getStreamSummary(combo) {
        const result = {};
        for (const fmt of COMBO_FORMATS) {
            const count = (combo.members?.[fmt] || []).length;
            if (count > 0) result[fmt] = count;
        }
        return result;
    }

    /** How many streams will actually be patched between two combos */
    countMatchingStreams(senderCombo, receiverCombo) {
        let count = 0;
        for (const fmt of COMBO_FORMATS) {
            count += Math.min(
                senderCombo.members?.[fmt]?.length || 0,
                receiverCombo.members?.[fmt]?.length || 0
            );
        }
        return count;
    }

    /** HTML badges string for display in row/column headers */
    streamBadgesHtml(combo) {
        const summary = this.getStreamSummary(combo);
        const FMT_COLOR = { video: 'combo-badge-v', audio: 'combo-badge-a', anc: 'combo-badge-n' };
        const FMT_LABEL = { video: 'V', audio: 'A', anc: 'N' };
        return Object.entries(summary)
            .map(([fmt, n]) =>
                `<span class="combo-badge ${FMT_COLOR[fmt]}">${FMT_LABEL[fmt]}${n > 1 ? '×' + n : ''}</span>`)
            .join('');
    }

    _resolveSender(ref) {
        if (!ref) return null;
        const node = this.storage.getNode(ref.node_id);
        const s = node?.senders?.find(s => s.id === ref.sender_id);
        if (!s) return null;
        return {
            ...s,
            nodeId:       ref.node_id,
            nodeName:     node.name,
            nodeType:     node.type || 'is04',
            displayLabel: s.label || s.id,
        };
    }

    _resolveReceiver(ref) {
        if (!ref) return null;
        const node = this.storage.getNode(ref.node_id);
        const r = node?.receivers?.find(r => r.id === ref.receiver_id);
        if (!r) return null;
        return {
            ...r,
            nodeId:       ref.node_id,
            nodeName:     node.name,
            displayLabel: r.label || r.id,
        };
    }

    _normalizeFormat(formatStr) {
        if (!formatStr) return 'video';
        const lower = formatStr.toLowerCase();
        if (lower.includes('audio')) return 'audio';
        if (lower.includes('data') || lower.includes('smpte291') || lower.includes('anc')) return 'anc';
        return 'video';
    }
}
