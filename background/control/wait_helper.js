
// background/control/wait_helper.js

/**
 * Ensures actions wait for potential side effects (navigation) and DOM stability.
 * Enhanced logic based on Chrome DevTools MCP WaitForHelper.
 */
export class WaitForHelper {
    constructor(connection, cpuMultiplier = 1, networkMultiplier = 1) {
        this.connection = connection;
        this.updateMultipliers(cpuMultiplier, networkMultiplier);
    }

    /**
     * Updates timeout multipliers for emulation.
     * @param {number} cpu - CPU throttling multiplier (default 1)
     * @param {number} network - Network latency multiplier (default 1)
     */
    updateMultipliers(cpu = 1, network = 1) {
        this.cpuMultiplier = cpu;
        this.networkMultiplier = network;

        // Constants derived from MCP implementation logic
        this.timeouts = {
            // Max time to wait for DOM to stabilize
            stableDom: 3000 * cpu,
            // Duration of no mutations to consider DOM stable
            stableDomFor: 100 * cpu,
            // Time to wait for a navigation to potentially start after an action
            expectNavigationIn: 200 * cpu,
            // Max time to wait for navigation to complete
            navigation: 15000 * network 
        };
    }

    /**
     * Executes an action and waits for navigation/DOM stability afterwards.
     * @param {Function} actionFn - Async function performing the browser action
     */
    async execute(actionFn) {
        // Fallback for non-attached sessions (e.g. restricted URLs like chrome://)
        if (!this.connection.attached) {
            await actionFn();
            // Wait a bit for potential navigation to start/process since we can't track it precisely via CDP
            await new Promise(r => setTimeout(r, 1000));
            return;
        }

        // Enable Page domain to receive navigation events
        await this.connection.sendCommand("Page.enable").catch(() => {});

        let navStarted = false;
        let navFinished = false;
        
        // Listener to detect navigation start and completion
        const listener = (method, params) => {
            if (method === 'Page.frameStartedNavigating') {
                navStarted = true;
            }
            if (method === 'Page.loadEventFired') {
                navFinished = true;
            }
            if (method === 'Page.navigatedWithinDocument') {
                // SPA navigation completed
                navStarted = true;
                navFinished = true;
            }
        };
        this.connection.addListener(listener);

        try {
            // 1. Perform the Action
            await actionFn();

            // 2. Wait briefly to see if a navigation starts
            // MCP uses specific timeout based on CPU multiplier
            await new Promise(r => setTimeout(r, this.timeouts.expectNavigationIn));

            // 3. If navigation started, wait for it to finish (with timeout)
            if (navStarted && !navFinished) {
                const startTime = Date.now();
                while (!navFinished && (Date.now() - startTime < this.timeouts.navigation)) {
                    await new Promise(r => setTimeout(r, 100));
                }
            }
        } catch (e) {
            console.error("Error during action execution/waiting:", e);
            throw e;
        } finally {
            this.connection.removeListener(listener);
        }

        // 4. Wait for DOM to settle (MutationObserver)
        await this.waitForStableDOM();
    }

    /**
     * Waits for the DOM to be stable (no mutations) for a certain duration.
     * @param {number} [timeout] - Override max timeout
     * @param {number} [stabilityDuration] - Override stability duration
     */
    async waitForStableDOM(timeout = null, stabilityDuration = null) {
        if (!this.connection.attached) return;

        const tMax = timeout || this.timeouts.stableDom;
        const tStable = stabilityDuration || this.timeouts.stableDomFor;

        try {
            await this.connection.sendCommand("Runtime.evaluate", {
                expression: `
                    (async () => {
                        if (!document || !document.body) return true; // Fail safe

                        return await new Promise((resolve) => {
                            let timer = null;

                            const observer = new MutationObserver(() => {
                                // Mutation detected, reset timer
                                if (timer) clearTimeout(timer);
                                timer = setTimeout(done, ${tStable});
                            });

                            function done() {
                                observer.disconnect();
                                resolve(true);
                            }

                            // Start observing
                            observer.observe(document.body, {
                                attributes: true,
                                childList: true,
                                subtree: true
                            });

                            // Initial timer (resolve if no mutations happen immediately)
                            timer = setTimeout(done, ${tStable});

                            // Max safety timeout (resolve anyway to prevent hanging)
                            setTimeout(() => {
                                observer.disconnect();
                                resolve(false);
                            }, ${tMax});
                        });
                    })()
                `,
                awaitPromise: true,
                returnByValue: true
            });
        } catch (e) {
            // Ignore errors if runtime context is gone (e.g. page closed or navigated away mid-script)
        }
    }

    /**
     * Wait for a condition to be true (explicit wait)
     * @param {Object} options - Wait options
     * @param {string} options.expression - JavaScript expression to evaluate (should return boolean)
     * @param {number} [options.timeout=5000] - Max time to wait in ms
     * @param {number} [options.pollInterval=100] - Interval between checks in ms
     * @param {Function} [options.onProgress] - Progress callback
     * @returns {Promise<boolean>} True if condition met, false if timeout
     */
    async waitForCondition(options) {
        if (!this.connection.attached) {
            throw new Error('Cannot wait for condition: connection not attached');
        }

        const {
            expression,
            timeout = 5000,
            pollInterval = 100,
            onProgress = null
        } = options;

        if (!expression) {
            throw new Error('waitForCondition requires expression');
        }

        const startTime = Date.now();
        let attempts = 0;

        while (Date.now() - startTime < timeout) {
            attempts++;

            try {
                // Evaluate condition
                let result;

                if (options.objectId) {
                    // Use callFunctionOn if objectId is provided (supports Shadow DOM/Frames)
                    result = await this.connection.sendCommand("Runtime.callFunctionOn", {
                        objectId: options.objectId,
                        functionDeclaration: `function() {
                            try {
                                return Boolean(eval(${JSON.stringify(expression)}));
                            } catch(e) {
                                return false;
                            }
                        }`,
                        returnByValue: true,
                        awaitPromise: true
                    });
                } else {
                    // Use standard evaluate for global expressions
                    result = await this.connection.sendCommand("Runtime.evaluate", {
                        expression: `(() => { try { return Boolean(${expression}); } catch(e) { return false; } })()`,
                        returnByValue: true
                    });
                }

                if (result?.result?.value === true) {
                    console.log(`[WaitForHelper] Condition met after ${attempts} attempts`);
                    return true;
                }

                // Report progress
                if (typeof onProgress === 'function') {
                    onProgress({
                        attempts,
                        elapsed: Date.now() - startTime,
                        timeout
                    });
                }

                // Wait before next poll
                await new Promise(r => setTimeout(r, pollInterval));
            } catch (err) {
                console.warn('[WaitForHelper] Error evaluating condition:', err);
                // Continue polling despite errors
                await new Promise(r => setTimeout(r, pollInterval));
            }
        }

        console.warn(`[WaitForHelper] Condition not met within ${timeout}ms`);
        return false;
    }

    /**
     * Wait for network to be idle (no active requests)
     * @param {Object} options - Wait options
     * @param {number} [options.inflightThreshold=0] - Max number of inflight requests to consider idle
     * @param {number} [options.timeout=10000] - Max time to wait in ms
     * @param {number} [options.idleDuration=500] - Duration of idle state to confirm
     * @param {Function} [options.onProgress] - Progress callback
     * @returns {Promise<boolean>} True if network idle, false if timeout
     */
    async waitForNetworkIdle(options = {}) {
        if (!this.connection.attached) {
            throw new Error('Cannot wait for network idle: connection not attached');
        }

        const {
            inflightThreshold = 0,
            timeout = 10000,
            idleDuration = 500,
            onProgress = null
        } = options;

        // Enable Network domain
        await this.connection.sendCommand("Network.enable").catch(() => {});

        let inflightRequests = 0;
        let idleStartTime = null;
        const startTime = Date.now();

        return new Promise((resolve, reject) => {
            let resolved = false;

            // Track network requests
            const listener = (method, params) => {
                if (method === 'Network.requestWillBeSent') {
                    inflightRequests++;
                    idleStartTime = null;
                } else if (method === 'Network.loadingFinished' || method === 'Network.loadingFailed') {
                    inflightRequests = Math.max(0, inflightRequests - 1);

                    // Check if idle
                    if (inflightRequests <= inflightThreshold) {
                        if (idleStartTime === null) {
                            idleStartTime = Date.now();
                        }
                    } else {
                        idleStartTime = null;
                    }
                }
            };

            this.connection.addListener(listener);

            // Initial check - may already be idle
            if (inflightRequests <= inflightThreshold) {
                idleStartTime = Date.now();
            }

            // Poll for idle state
            const checkInterval = setInterval(() => {
                const elapsed = Date.now() - startTime;

                // Report progress
                if (typeof onProgress === 'function') {
                    onProgress({
                        inflightRequests,
                        elapsed,
                        timeout
                    });
                }

                // Check timeout
                if (elapsed >= timeout) {
                    clearInterval(checkInterval);
                    this.connection.removeListener(listener);
                    if (!resolved) {
                        resolved = true;
                        console.warn(`[WaitForHelper] Network idle timeout after ${timeout}ms (${inflightRequests} requests)`);
                        resolve(false);
                    }
                    return;
                }

                // Check if idle duration met
                if (idleStartTime !== null && Date.now() - idleStartTime >= idleDuration) {
                    clearInterval(checkInterval);
                    this.connection.removeListener(listener);
                    if (!resolved) {
                        resolved = true;
                        console.log(`[WaitForHelper] Network idle achieved`);
                        resolve(true);
                    }
                }
            }, 100);
        });
    }

    /**
     * Wrap a promise with timeout
     * @param {Promise} promise - Promise to wrap
     * @param {number} timeout - Timeout in ms
     * @param {string} [errorMessage] - Custom error message
     * @returns {Promise} Promise that rejects on timeout
     */
    async withTimeout(promise, timeout, errorMessage = null) {
        return Promise.race([
            promise,
            new Promise((_, reject) => {
                setTimeout(() => {
                    reject(new Error(errorMessage || `Operation timed out after ${timeout}ms`));
                }, timeout);
            })
        ]);
    }
}