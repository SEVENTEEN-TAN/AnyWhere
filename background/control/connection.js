
// background/control/connection.js
import { CollectorManager } from './collectors.js';

/**
 * Manages the connection to the Chrome Debugger API.
 * P2 Enhancement: Supports multi-tab tracking and automatic switching
 */
export class BrowserConnection {
    constructor() {
        this.currentTabId = null;
        this.targetTabId = null; // Tracks the intended tab ID even if debugger is not attached
        this.attached = false;
        this.onDetachCallbacks = [];
        this.eventListeners = new Set();

        // Tracing State
        this.traceEvents = [];
        this.traceCompletePromise = null;
        this.traceCompleteResolver = null;

        // Initialize State Collectors
        this.collectors = new CollectorManager();

        // P2 Enhancement: Tab stack for managing navigation across multiple tabs
        this.tabStack = [];  // Stack of tab IDs (for nested navigation)
        this.isWaitingForNewTab = false;
        this.newTabResolver = null;
        this.newTabTimeout = null;

        // Global listener for CDP events
        chrome.debugger.onEvent.addListener(this._handleEvent.bind(this));

        // P2 Enhancement: Listen for new tab creation
        chrome.tabs.onCreated.addListener(this._handleTabCreated.bind(this));
        chrome.tabs.onRemoved.addListener(this._handleTabRemoved.bind(this));
    }

    _handleEvent(source, method, params) {
        if (this.attached && this.currentTabId === source.tabId) {
            // 0. Handle Tracing Events (Special Case)
            if (method === 'Tracing.dataCollected') {
                this.traceEvents.push(...params.value);
            } else if (method === 'Tracing.tracingComplete') {
                if (this.traceCompleteResolver) {
                    this.traceCompleteResolver(this.traceEvents);
                    this.traceCompleteResolver = null;
                }
            }

            // 1. Pass to collectors for persistence
            this.collectors.handleEvent(method, params);
            
            // 2. Pass to active listeners (e.g. WaitHelper)
            this.eventListeners.forEach(callback => callback(method, params));
        }
    }

    addListener(callback) {
        this.eventListeners.add(callback);
    }

    removeListener(callback) {
        this.eventListeners.delete(callback);
    }

    onDetach(callback) {
        this.onDetachCallbacks.push(callback);
    }

    async attach(tabId) {
        this.targetTabId = tabId; // Always store the intended tab

        // If already attached to the same tab, just ensure domains are enabled
        if (this.attached && this.currentTabId === tabId) {
            return;
        }
        
        // If attached to a different tab, detach first
        if (this.attached && this.currentTabId !== tabId) {
            await this.detach();
        }

        return new Promise((resolve, reject) => {
            chrome.debugger.attach({ tabId }, "1.3", async () => {
                if (chrome.runtime.lastError) {
                    console.warn("Debugger attach failed (likely restricted URL):", chrome.runtime.lastError.message);
                    // Resolve anyway to allow fallback actions (like navigation) to proceed without debugger
                    resolve();
                } else {
                    this.attached = true;
                    this.currentTabId = tabId;
                    
                    // Clear collectors on new attachment (new session)
                    this.collectors.clear();
                    // Clear trace buffer
                    this.traceEvents = [];

                    // Enable domains for collection
                    try {
                        await this.sendCommand("Network.enable");
                        await this.sendCommand("Log.enable");
                        await this.sendCommand("Runtime.enable");
                        // Page domain is often enabled by actions, but good to have for lifecycle
                        // Also enables Page.javascriptDialogOpening events
                        await this.sendCommand("Page.enable");
                        // Enable Audits for issues (CORS, mixed content, etc)
                        await this.sendCommand("Audits.enable");
                    } catch (e) {
                        console.warn("Failed to enable collection domains:", e);
                    }

                    resolve();
                }
            });
        });
    }

    async detach() {
        if (!this.attached || !this.currentTabId) return;
        return new Promise((resolve) => {
            chrome.debugger.detach({ tabId: this.currentTabId }, () => {
                this.attached = false;
                this.currentTabId = null;
                this.traceEvents = [];
                this.onDetachCallbacks.forEach(cb => cb());
                resolve();
            });
        });
    }

    sendCommand(method, params = {}) {
        if (!this.currentTabId) throw new Error("No active debugger session");
        return new Promise((resolve, reject) => {
            chrome.debugger.sendCommand({ tabId: this.currentTabId }, method, params, (result) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve(result);
                }
            });
        });
    }

    async startTracing(categories) {
        this.traceEvents = [];
        await this.sendCommand('Tracing.start', { categories });
    }

    async stopTracing() {
        this.traceCompletePromise = new Promise(resolve => {
            this.traceCompleteResolver = resolve;
        });
        await this.sendCommand('Tracing.end');
        return this.traceCompletePromise;
    }

    // ========== P2 Enhancement: Multi-Tab Support ==========

    /**
     * Handle new tab creation
     * @private
     */
    _handleTabCreated(tab) {
        if (this.isWaitingForNewTab && this.newTabResolver) {
            console.log(`[BrowserConnection] New tab detected: ${tab.id}`);

            // Clear timeout
            if (this.newTabTimeout) {
                clearTimeout(this.newTabTimeout);
                this.newTabTimeout = null;
            }

            // Resolve with new tab
            this.newTabResolver(tab);
            this.newTabResolver = null;
            this.isWaitingForNewTab = false;
        }
    }

    /**
     * Handle tab removal - clean up stack
     * @private
     */
    _handleTabRemoved(tabId) {
        // Remove from stack if present
        const index = this.tabStack.indexOf(tabId);
        if (index > -1) {
            this.tabStack.splice(index, 1);
            console.log(`[BrowserConnection] Tab ${tabId} removed from stack`);
        }

        // If current tab is closed, detach
        if (this.currentTabId === tabId) {
            console.log(`[BrowserConnection] Current tab ${tabId} closed, detaching...`);
            this.attached = false;
            this.currentTabId = null;
        }
    }

    /**
     * Wait for a new tab to be created (typically after clicking a link with target="_blank")
     * @param {number} timeout - Max wait time in milliseconds
     * @returns {Promise<chrome.tabs.Tab>} The newly created tab
     */
    async waitForNewTab(timeout = 3000) {
        this.isWaitingForNewTab = true;

        return new Promise((resolve, reject) => {
            this.newTabResolver = resolve;

            // Set timeout
            this.newTabTimeout = setTimeout(() => {
                this.isWaitingForNewTab = false;
                this.newTabResolver = null;
                reject(new Error(`No new tab detected within ${timeout}ms`));
            }, timeout);
        });
    }

    /**
     * Switch to a different tab (detach from current, attach to new)
     * @param {number} tabId - Target tab ID
     * @param {boolean} pushToStack - Whether to push current tab to stack (for returning later)
     */
    async switchToTab(tabId, pushToStack = true) {
        const previousTabId = this.currentTabId;

        // Push current tab to stack if requested
        if (pushToStack && previousTabId && previousTabId !== tabId) {
            this.tabStack.push(previousTabId);
            console.log(`[BrowserConnection] Pushed tab ${previousTabId} to stack. Stack: [${this.tabStack.join(', ')}]`);
        }

        // Switch to new tab
        await this.attach(tabId);

        // Make the tab active (bring to front)
        try {
            await chrome.tabs.update(tabId, { active: true });
        } catch (e) {
            console.warn('[BrowserConnection] Failed to activate tab:', e.message);
        }

        console.log(`[BrowserConnection] Switched to tab ${tabId}`);
    }

    /**
     * Return to the previous tab in the stack
     * @returns {boolean} True if returned to previous tab, false if stack is empty
     */
    async returnToPreviousTab() {
        if (this.tabStack.length === 0) {
            console.warn('[BrowserConnection] No previous tab in stack');
            return false;
        }

        const previousTabId = this.tabStack.pop();
        console.log(`[BrowserConnection] Returning to tab ${previousTabId}. Remaining stack: [${this.tabStack.join(', ')}]`);

        await this.switchToTab(previousTabId, false);  // Don't push to stack when returning
        return true;
    }

    /**
     * Clear the tab stack
     */
    clearTabStack() {
        this.tabStack = [];
        console.log('[BrowserConnection] Tab stack cleared');
    }

    /**
     * Get current tab stack
     * @returns {number[]} Array of tab IDs in the stack
     */
    getTabStack() {
        return [...this.tabStack];
    }
}
