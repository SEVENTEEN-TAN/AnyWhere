
/**
 * Handles Accessibility Tree generation and UID mapping.
 * Converts complex DOM structures into an LLM-friendly, token-efficient text tree.
 * Matches logic from Chrome DevTools MCP formatters.
 *
 * P1 Enhancement: Implements snapshot caching to reduce redundant AXTree generation
 */
export class SnapshotManager {
    constructor(connection) {
        this.connection = connection;
        this.snapshotMap = new Map(); // Maps uid -> backendNodeId
        this.snapshotIdCount = 0;
        this.persistentUidByBackend = new Map();
        this.persistentBackendByUid = new Map();

        // P1 Enhancement: Snapshot cache
        this.cachedSnapshot = null;
        this.cachedSnapshotHash = null;
        this.cacheStats = {
            hits: 0,
            misses: 0,
            totalSaved: 0  // Estimated milliseconds saved
        };

        // Listen to connection detach to clear state
        this.connection.onDetach(() => this.clear());
    }

    clear() {
        this.snapshotMap.clear();
        this.clearCache();
        this.persistentUidByBackend.clear();
        this.persistentBackendByUid.clear();
    }

    /**
     * Clear snapshot cache
     */
    clearCache() {
        this.cachedSnapshot = null;
        this.cachedSnapshotHash = null;
    }

    /**
     * Get cache statistics
     */
    getCacheStats() {
        return {
            ...this.cacheStats,
            hitRate: this.cacheStats.hits + this.cacheStats.misses > 0
                ? (this.cacheStats.hits / (this.cacheStats.hits + this.cacheStats.misses) * 100).toFixed(1) + '%'
                : '0%'
        };
    }

    /**
     * Calculate a strong hash of AXTree nodes using DJB2
     * @param {Array} nodes - Accessibility nodes
     * @returns {string} Hash string
     */
    _hashAXTree(nodes) {
        if (!nodes || nodes.length === 0) return 'empty';

        // Create a comprehensive string representation of the tree state
        // We include properties that affect the semantic meaning of the tree
        const str = nodes.map(n => {
            const roleVal = n.role?.value || '';
            const nameVal = n.name?.value || '';
            const childCount = n.childIds?.length || 0;
            const val = n.value?.value || ''; // Include value as it changes often

            // Extract properties from properties array
            let disabled = '0';
            let checked = '0';
            let selected = '0';
            if (n.properties) {
                for (const p of n.properties) {
                    if (p.name === 'disabled' && p.value?.value) disabled = '1';
                    if (p.name === 'checked' && p.value?.value) checked = '1';
                    if (p.name === 'selected' && p.value?.value) selected = '1';
                }
            }

            // Combine fields: nodeId is structural, others are semantic
            return `${n.nodeId}:${roleVal}:${nameVal}:${childCount}:${val}:${disabled}:${checked}:${selected}`;
        }).join('|');

        // DJB2 Hash implementation
        let hash = 5381;
        for (let i = 0; i < str.length; i++) {
            // hash * 33 + c
            hash = ((hash << 5) + hash) + str.charCodeAt(i);
        }

        // Convert to unsigned 32-bit integer hex string
        return (hash >>> 0).toString(16);
    }

    getBackendNodeId(uid) {
        return this.snapshotMap.get(uid);
    }

    async takeSnapshot(args = {}) {
        const verbose = args.verbose === true;
        const forceRefresh = args.forceRefresh === true;  // P1: Option to bypass cache

        const startTime = Date.now();

        // Ensure domains are enabled
        await this.connection.sendCommand("DOM.enable");
        await this.connection.sendCommand("Accessibility.enable");

        // Get the full accessibility tree from CDP
        const { nodes } = await this.connection.sendCommand("Accessibility.getFullAXTree");

        // P1 Enhancement: Check cache before processing
        if (!forceRefresh && this.cachedSnapshot && this.cachedSnapshotHash) {
            const currentHash = this._hashAXTree(nodes);

            if (currentHash === this.cachedSnapshotHash) {
                // Cache hit! Return cached snapshot
                this.cacheStats.hits++;
                const elapsedTime = Date.now() - startTime;
                this.cacheStats.totalSaved += (250 - elapsedTime);  // Assume ~250ms for full generation

                console.log(`[SnapshotManager] Cache HIT (${this.cacheStats.hits} hits, saved ~${this.cacheStats.totalSaved}ms total)`);

                return this.cachedSnapshot;
            }
        }

        // Cache miss - need to generate snapshot
        this.cacheStats.misses++;
        console.log(`[SnapshotManager] Cache MISS (generating new snapshot...)`);

        // Setup new snapshot ID generation
        this.snapshotIdCount++;
        const currentSnapshotPrefix = this.snapshotIdCount;
        let nodeCounter = 0;
        this.snapshotMap.clear();

        // Identify Root: Node that is not a child of any other node
        const allChildIds = new Set(nodes.flatMap(n => n.childIds || []));
        const root = nodes.find(n => !allChildIds.has(n.nodeId));

        if (!root) return "Error: Could not find root of A11y tree.";

        // --- Helpers ---
        const getVal = (prop) => prop && prop.value;
        const escapeStr = (str) => {
            const s = String(str);
            // Only quote if necessary (contains spaces or special chars)
            if (/^[\w-]+$/.test(s)) return s;
            return `"${s.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
        };

        // Mappings for boolean capabilities (property name) -> attribute name
        // Based on chrome-devtools-mcp snapshotFormatter.ts
        const booleanPropertyMap = {
            disabled: 'disableable',
            expanded: 'expandable',
            focused: 'focusable',
            selected: 'selectable',
            checked: 'checkable',
            pressed: 'pressable',
            editable: 'editable',
            multiselectable: 'multiselectable',
            modal: 'modal',
            required: 'required',
            readonly: 'readonly'
        };

        // Properties to exclude from generic attribute listing
        const excludedProps = new Set([
            'id', 'role', 'name', 'elementHandle', 'children', 'backendNodeId', 'value', 'parentId',
            'description' // Explicitly handled in fixed order
        ]);

        const isInteresting = (node) => {
            if (node.ignored) return false;
            const role = getVal(node.role);
            const name = getVal(node.name);

            // Skip purely structural/generic roles unless they have a specific name
            if (role === 'generic' || role === 'StructuralContainer' || role === 'div' || role === 'text' || role === 'none' || role === 'presentation') {
                 if (name && name.trim().length > 0) return true;
                 // Keep if it has input-related properties?
                 // For token efficiency, we bias towards removing generic containers.
                 return false;
            }
            return true;
        };

        // --- Recursive Formatter ---
        const formatNode = (node, depth = 0) => {
            const interesting = isInteresting(node);
            // In verbose mode, show everything. In default mode, prune uninteresting nodes.
            const shouldPrint = verbose || interesting;

            let line = '';

            if (shouldPrint) {
                let uid = null;
                const backendId = node.backendDOMNodeId;
                const frameId = node.frameId || '';
                const stableKey = backendId ? `${frameId}:${backendId}` : null;
                if (stableKey && this.persistentUidByBackend.has(stableKey)) {
                    uid = this.persistentUidByBackend.get(stableKey);
                } else {
                    nodeCounter++;
                    uid = `${currentSnapshotPrefix}_${nodeCounter}`;
                    if (stableKey) {
                        this.persistentUidByBackend.set(stableKey, uid);
                        this.persistentBackendByUid.set(uid, stableKey);
                    }
                }

                if (node.backendDOMNodeId) {
                    this.snapshotMap.set(uid, node.backendDOMNodeId);
                }

                // 2. Extract Core Attributes
                let role = getVal(node.role);
                // Label ignored nodes in verbose mode (in non-verbose they are skipped)
                if (node.ignored) role = 'ignored';

                const name = getVal(node.name);
                let value = getVal(node.value);
                const description = getVal(node.description);

                // Fix for options missing value (Use text content)
                if (role === 'option' && !value && name) {
                    value = name;
                }

                let parts = [`uid=${uid}`];

                // P4 Enhancement: Include Frame ID if present
                if (node.frameId) {
                    parts.push(`frameId=${node.frameId}`);
                }

                if (role) parts.push(role);
                if (name) parts.push(escapeStr(name));
                if (value) parts.push(`value=${escapeStr(value)}`);
                if (description) parts.push(`desc=${escapeStr(description)}`);

                // 3. Process Properties
                if (node.properties) {
                    const propsMap = {};
                    for (const p of node.properties) {
                        propsMap[p.name] = getVal(p.value);
                    }

                    const sortedKeys = Object.keys(propsMap).sort();

                    for (const key of sortedKeys) {
                        if (excludedProps.has(key)) continue;

                        const val = propsMap[key];

                        if (typeof val === 'boolean') {
                            // Check if this boolean property maps to a capability (e.g. focused -> focusable)
                            if (key in booleanPropertyMap) {
                                parts.push(booleanPropertyMap[key]);
                            }
                            // If true, also print the state name itself (e.g. focused)
                            if (val === true) {
                                parts.push(key);
                            }
                        } else if (val !== undefined && val !== "") {
                            parts.push(`${key}=${escapeStr(val)}`);
                        }
                    }
                }

                line = ' '.repeat(depth * 2) + parts.join(' ') + '\n';
            }

            // 4. Process Children
            // Flatten hierarchy: if node is skipped, children stay at current depth
            const nextDepth = shouldPrint ? depth + 1 : depth;

            if (node.childIds) {
                for (const childId of node.childIds) {
                    const child = nodes.find(n => n.nodeId === childId);
                    if (child) {
                        line += formatNode(child, nextDepth);
                    }
                }
            }
            return line;
        };

        const snapshotText = formatNode(root);

        // P1 Enhancement: Update cache after successful generation
        this.cachedSnapshot = snapshotText;
        this.cachedSnapshotHash = this._hashAXTree(nodes);

        const elapsedTime = Date.now() - startTime;
        console.log(`[SnapshotManager] Snapshot generated in ${elapsedTime}ms (cached for future use)`);

        return snapshotText;
    }
}
