// background/managers/automation_state.js

/**
 * AutomationStateStore - Manages automation task context, checkpoints, and state synchronization
 *
 * Responsibilities:
 * - Track current task ID, last tool call, snapshot hash, DOM version
 * - Save/restore checkpoints for user intervention
 * - Record event history for debugging and recovery
 * - Detect page changes during user intervention
 */
export class AutomationStateStore {
    constructor(options = {}) {
        this.useStorage = options.useStorage ?? true;
        this.storageKey = options.storageKey || 'automation_state';
        this.maxEvents = options.maxEvents || 100;

        // In-memory state
        this.state = {
            taskId: null,
            sessionId: null,
            lastAction: null,
            lastSnapshot: null,
            snapshotHash: null,
            domVersion: 0,
            todoQueue: [],
            events: [],
            checkpoints: {},
            needsRecovery: false,
            userIntervention: false
        };

        // Initialize from storage if enabled
        if (this.useStorage) {
            this._loadFromStorage().catch(err => {
                console.warn('[AutomationStateStore] Failed to load from storage', err);
            });
        }
    }

    /**
     * Get current context
     */
    getCurrentContext() {
        return {
            taskId: this.state.taskId,
            sessionId: this.state.sessionId,
            lastAction: this.state.lastAction,
            snapshotHash: this.state.snapshotHash,
            domVersion: this.state.domVersion,
            todoQueue: [...this.state.todoQueue],
            needsRecovery: this.state.needsRecovery,
            userIntervention: this.state.userIntervention
        };
    }

    /**
     * Initialize new task
     */
    async initTask(taskId, sessionId) {
        this.state.taskId = taskId;
        this.state.sessionId = sessionId;
        this.state.lastAction = null;
        this.state.domVersion = 0;
        this.state.todoQueue = [];
        this.state.needsRecovery = false;
        this.state.userIntervention = false;

        await this.appendEvent({
            type: 'task_init',
            taskId,
            sessionId,
            timestamp: Date.now()
        });

        await this._persistState();
    }

    /**
     * Update last action
     */
    async updateLastAction(action) {
        this.state.lastAction = {
            name: action.name,
            args: action.args,
            timestamp: Date.now()
        };

        await this.appendEvent({
            type: 'action_update',
            action: this.state.lastAction
        });

        await this._persistState();
    }

    /**
     * Update snapshot hash (for detecting page changes)
     */
    async updateSnapshot(snapshot, hash) {
        this.state.lastSnapshot = snapshot;
        this.state.snapshotHash = hash;
        this.state.domVersion += 1;

        await this.appendEvent({
            type: 'snapshot_update',
            hash,
            domVersion: this.state.domVersion
        });

        await this._persistState();
    }

    /**
     * Save checkpoint with label
     */
    async saveCheckpoint(label, payload = {}) {
        const checkpoint = {
            label,
            taskId: this.state.taskId,
            sessionId: this.state.sessionId,
            lastAction: this.state.lastAction,
            snapshotHash: this.state.snapshotHash,
            domVersion: this.state.domVersion,
            todoQueue: [...this.state.todoQueue],
            timestamp: Date.now(),
            ...payload
        };

        this.state.checkpoints[label] = checkpoint;

        await this.appendEvent({
            type: 'checkpoint_save',
            label,
            checkpoint
        });

        await this._persistState();

        console.log(`[AutomationStateStore] Checkpoint saved: ${label}`);
        return checkpoint;
    }

    /**
     * Restore checkpoint by label
     */
    async restoreCheckpoint(label) {
        const checkpoint = this.state.checkpoints[label];
        if (!checkpoint) {
            throw new Error(`Checkpoint not found: ${label}`);
        }

        this.state.taskId = checkpoint.taskId;
        this.state.sessionId = checkpoint.sessionId;
        this.state.lastAction = checkpoint.lastAction;
        this.state.snapshotHash = checkpoint.snapshotHash;
        this.state.domVersion = checkpoint.domVersion;
        this.state.todoQueue = [...checkpoint.todoQueue];

        await this.appendEvent({
            type: 'checkpoint_restore',
            label,
            checkpoint
        });

        await this._persistState();

        console.log(`[AutomationStateStore] Checkpoint restored: ${label}`);
        return checkpoint;
    }

    /**
     * Mark that user intervened
     */
    async markUserIntervention(reason = 'user_requested') {
        this.state.userIntervention = true;

        await this.appendEvent({
            type: 'user_intervention',
            reason,
            timestamp: Date.now()
        });

        await this._persistState();
    }

    /**
     * Clear user intervention flag
     */
    async clearUserIntervention() {
        this.state.userIntervention = false;
        await this._persistState();
    }

    /**
     * Mark that recovery is needed
     */
    async markNeedsRecovery(reason) {
        this.state.needsRecovery = true;

        await this.appendEvent({
            type: 'needs_recovery',
            reason,
            timestamp: Date.now()
        });

        await this._persistState();
    }

    /**
     * Clear recovery flag
     */
    async clearRecovery() {
        this.state.needsRecovery = false;
        await this._persistState();
    }

    /**
     * Append event to history
     */
    async appendEvent(event) {
        const eventWithTimestamp = {
            ...event,
            timestamp: event.timestamp || Date.now()
        };

        this.state.events.push(eventWithTimestamp);

        // Trim events if exceeds max
        if (this.state.events.length > this.maxEvents) {
            this.state.events = this.state.events.slice(-this.maxEvents);
        }

        // Don't persist on every event append (too frequent)
        // Caller should call _persistState() when appropriate
    }

    /**
     * Get recent events
     */
    getRecentEvents(count = 10) {
        return this.state.events.slice(-count);
    }

    /**
     * Get all events
     */
    getAllEvents() {
        return [...this.state.events];
    }

    /**
     * Add todo to queue
     */
    async addTodo(todo) {
        this.state.todoQueue.push(todo);
        await this._persistState();
    }

    /**
     * Remove todo from queue
     */
    async removeTodo(index) {
        this.state.todoQueue.splice(index, 1);
        await this._persistState();
    }

    /**
     * Clear todo queue
     */
    async clearTodos() {
        this.state.todoQueue = [];
        await this._persistState();
    }

    /**
     * Get current todo queue
     */
    getTodoQueue() {
        return [...this.state.todoQueue];
    }

    /**
     * Clear all state
     */
    async clear() {
        this.state = {
            taskId: null,
            sessionId: null,
            lastAction: null,
            lastSnapshot: null,
            snapshotHash: null,
            domVersion: 0,
            todoQueue: [],
            events: [],
            checkpoints: {},
            needsRecovery: false,
            userIntervention: false
        };

        await this._persistState();
        console.log('[AutomationStateStore] State cleared');
    }

    /**
     * Detect page change by comparing snapshot hash
     */
    hasPageChanged(newHash) {
        if (!this.state.snapshotHash) return false;
        return this.state.snapshotHash !== newHash;
    }

    /**
     * Get state change summary
     */
    getStateChangeSummary(oldSnapshot, newSnapshot) {
        if (!oldSnapshot || !newSnapshot) {
            return { changed: false };
        }

        // Simple hash comparison
        const oldHash = this._hashSnapshot(oldSnapshot);
        const newHash = this._hashSnapshot(newSnapshot);

        return {
            changed: oldHash !== newHash,
            oldHash,
            newHash,
            oldVersion: this.state.domVersion,
            newVersion: this.state.domVersion + 1
        };
    }

    /**
     * Hash snapshot for comparison (simple string hash)
     */
    _hashSnapshot(snapshot) {
        if (!snapshot) return null;

        const str = typeof snapshot === 'string' ? snapshot : JSON.stringify(snapshot);
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return hash.toString(36);
    }

    /**
     * Persist state to chrome.storage.session (or memory fallback)
     */
    async _persistState() {
        if (!this.useStorage) return;

        try {
            // Use chrome.storage.session if available (Chrome 102+)
            if (chrome?.storage?.session) {
                await chrome.storage.session.set({
                    [this.storageKey]: this.state
                });
            } else {
                // Fallback to local storage
                await chrome.storage.local.set({
                    [this.storageKey]: this.state
                });
            }
        } catch (err) {
            console.warn('[AutomationStateStore] Failed to persist state', err);
        }
    }

    /**
     * Load state from storage
     */
    async _loadFromStorage() {
        if (!this.useStorage) return;

        try {
            let result;
            if (chrome?.storage?.session) {
                result = await chrome.storage.session.get(this.storageKey);
            } else {
                result = await chrome.storage.local.get(this.storageKey);
            }

            if (result[this.storageKey]) {
                this.state = result[this.storageKey];
                console.log('[AutomationStateStore] State loaded from storage');
            }
        } catch (err) {
            console.warn('[AutomationStateStore] Failed to load from storage', err);
        }
    }
}
