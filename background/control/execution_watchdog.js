// background/control/execution_watchdog.js
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_RETRY_LIMIT = 2;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 1000;
const DEFAULT_BACKOFF_BASE_MS = 500;
const RETRYABLE_KEYWORDS = [
    'timeout',
    'network',
    'not found',
    'not visible',
    'not interactable',
    'navigation',
    'load',
    'stale',
    'temporarily unavailable'
];

export class WatchdogTimeoutError extends Error {
    constructor(message, metadata = {}) {
        super(message);
        this.name = 'WatchdogTimeoutError';
        this.code = 'WATCHDOG_TIMEOUT';
        this.metadata = metadata;
    }
}

/**
 * ExecutionWatchdog - Unified timeout detection, heartbeat, and retry mechanism
 *
 * Provides:
 * - Per-tool timeout (default 15s, configurable)
 * - Heartbeat/progress reporting to UI
 * - Exponential backoff retry strategy
 * - Error classification (retryable vs non-retryable)
 */
export class ExecutionWatchdog {
    constructor(options = {}) {
        this.defaultTimeout = options.defaultTimeout || DEFAULT_TIMEOUT_MS;
        this.maxRetries = options.maxRetries ?? DEFAULT_RETRY_LIMIT;
        this.progressCallback = options.progressCallback || null;
        this.stateStore = options.stateStore || null;
        this.heartbeatInterval = options.heartbeatInterval || DEFAULT_HEARTBEAT_INTERVAL_MS;
    }

    setProgressCallback(callback) {
        this.progressCallback = callback;
    }

    /**
     * Execute an action with timeout, heartbeat, and retry logic
     * @param {string} actionName - Name of the action for logging
     * @param {Function} actionFn - Async function to execute
     * @param {Object} options - Execution options
     * @returns {Promise<any>} Result from actionFn
     */
    async runWithWatchdog(actionName, actionFn, options = {}) {
        const timeout = options.timeout || this.defaultTimeout;
        const maxRetries = options.retries ?? this.maxRetries;
        const maxAttempts = Math.max(1, maxRetries + 1);
        const backoffBase = options.backoffBaseMs || DEFAULT_BACKOFF_BASE_MS;
        let attempt = 0;
        let lastError = null;

        while (attempt < maxAttempts) {
            attempt += 1;
            const context = { actionName, attempt, timeout };
            this._emitProgress('start', context);
            await this._recordState('action_start', context);

            try {
                const result = await this._executeWithTimeout(actionFn, timeout, actionName, options);
                this._emitProgress('success', { actionName, attempt });
                await this._recordState('action_success', { actionName, attempt });
                return result;
            } catch (error) {
                const classification = this._classifyError(error);
                lastError = this._wrapError(error, classification, { actionName, attempt, timeout });
                this._emitProgress('error', { actionName, attempt, classification });
                await this._recordState('action_error', { actionName, attempt, classification });

                // Allow custom error handler
                if (typeof options.onError === 'function') {
                    await options.onError(lastError, classification);
                }

                const shouldRetry = this._shouldRetry(classification, attempt, maxAttempts);
                if (!shouldRetry) {
                    throw lastError;
                }

                // Exponential backoff
                const delay = this._calculateBackoff(backoffBase, attempt);
                this._emitProgress('retry', { actionName, attempt, delay });
                await this._recordState('action_retry', { actionName, attempt, delay });
                await this._delay(delay);
            }
        }

        throw lastError || new Error(`Execution watchdog exhausted retries for ${actionName}.`);
    }

    /**
     * Execute action with timeout and heartbeat
     */
    async _executeWithTimeout(actionFn, timeout, actionName, options = {}) {
        const heartbeatInterval = options.heartbeatIntervalMs ?? this.heartbeatInterval;
        const heartbeatMessage = options.heartbeatMessage || 'running';

        return await new Promise((resolve, reject) => {
            let finished = false;

            // Setup timeout
            const timer = setTimeout(() => {
                if (finished) return;
                finished = true;
                reject(new WatchdogTimeoutError(
                    `Action "${actionName}" timed out after ${timeout}ms`,
                    { actionName, timeout }
                ));
            }, timeout);

            // Setup heartbeat
            let heartbeatTimer = null;
            if (heartbeatInterval > 0) {
                heartbeatTimer = setInterval(() => {
                    this._emitProgress('heartbeat', { actionName, message: heartbeatMessage });
                }, heartbeatInterval);
            }

            // Execute action
            Promise.resolve()
                .then(() => actionFn())
                .then((result) => {
                    if (finished) return;
                    finished = true;
                    clearTimeout(timer);
                    if (heartbeatTimer) clearInterval(heartbeatTimer);
                    resolve(result);
                })
                .catch((error) => {
                    if (finished) return;
                    finished = true;
                    clearTimeout(timer);
                    if (heartbeatTimer) clearInterval(heartbeatTimer);
                    reject(error);
                });
        });
    }

    /**
     * Classify error into retryable/non-retryable categories
     */
    _classifyError(error) {
        if (!error) {
            return { type: 'unknown', retryable: false };
        }

        // Watchdog timeout is always retryable
        if (error.code === 'WATCHDOG_TIMEOUT') {
            return { type: 'timeout', retryable: true };
        }

        const message = (error.message || String(error)).toLowerCase();

        // Network errors
        if (message.includes('network') || message.includes('connection')) {
            return { type: 'network', retryable: true };
        }

        // Stale context errors (DOM changed)
        if (message.includes('stale') || message.includes('detached')) {
            return { type: 'stale_context', retryable: true };
        }

        // Element interaction errors
        if (message.includes('intercept') || message.includes('not interactable')) {
            return { type: 'element_interaction', retryable: true };
        }

        // Check against retryable keywords
        if (RETRYABLE_KEYWORDS.some((keyword) => message.includes(keyword))) {
            return { type: 'retryable', retryable: true };
        }

        return { type: 'unknown', retryable: false };
    }

    /**
     * Determine if we should retry based on error classification
     */
    _shouldRetry(classification, attempt, maxAttempts) {
        if (!classification.retryable) return false;
        return attempt < maxAttempts;
    }

    /**
     * Calculate exponential backoff delay
     */
    _calculateBackoff(base, attempt) {
        return base * Math.pow(2, Math.max(0, attempt - 1));
    }

    _delay(duration) {
        return new Promise((resolve) => setTimeout(resolve, duration));
    }

    /**
     * Emit progress event to callback
     */
    _emitProgress(event, payload = {}) {
        if (typeof this.progressCallback === 'function') {
            try {
                this.progressCallback(event, payload);
            } catch (err) {
                console.warn('[ExecutionWatchdog] Failed to dispatch progress event', err);
            }
        }
    }

    /**
     * Record state event to AutomationStateStore
     */
    async _recordState(event, payload) {
        if (!this.stateStore || typeof this.stateStore.appendEvent !== 'function') {
            return;
        }

        try {
            await this.stateStore.appendEvent({ type: event, ...payload });
        } catch (err) {
            console.warn('[ExecutionWatchdog] Failed to capture state event', err);
        }
    }

    /**
     * Wrap error with classification and context metadata
     */
    _wrapError(error, classification, context) {
        if (error instanceof WatchdogTimeoutError) {
            error.metadata = { ...(error.metadata || {}), classification, ...context };
            return error;
        }

        if (!error || typeof error !== 'object') {
            const generic = new Error('Unknown watchdog failure');
            generic.metadata = { classification, ...context };
            return generic;
        }

        error.metadata = { ...(error.metadata || {}), classification, ...context };
        return error;
    }
}
