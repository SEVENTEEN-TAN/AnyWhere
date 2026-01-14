
// background/managers/control_manager.js
import { BrowserConnection } from '../control/connection.js';
import { SnapshotManager } from '../control/snapshot.js';
import { BrowserActions } from '../control/actions.js';
import { SelectorEngine } from '../control/selector.js';
import { AccessibilityChecker } from '../control/a11y.js';
import { BreakpointOverlay } from '../control/breakpoint_overlay.js';
import { ControlOverlay } from '../control/control_overlay.js';
import { FileOperations } from '../control/file_operations.js';
import { ExecutionWatchdog } from '../control/execution_watchdog.js';
import { AutomationStateStore } from './automation_state.js';

/**
 * Main Controller handling Chrome DevTools MCP functionalities.
 * Orchestrates connection, snapshots, and action execution.
 * Enhanced with ExecutionWatchdog and AutomationStateStore for reliability.
 */
export class BrowserControlManager {
    constructor() {
        this.connection = new BrowserConnection();
        this.snapshotManager = new SnapshotManager(this.connection);
        this.controlOverlay = new ControlOverlay(this.connection);  // Global control indicator
        this.actions = new BrowserActions(this.connection, this.snapshotManager, this.controlOverlay);
        this.selector = new SelectorEngine(this.connection, this.snapshotManager);
        this.a11y = new AccessibilityChecker(this.connection);
        this.breakpoint = new BreakpointOverlay(this.connection);   // Breakpoint panel
        this.fileOps = new FileOperations();  // File operations for AI workspace
        this.isBreakpointActive = false;
        this.isControlActive = false;  // Track if control mode is enabled

        // Track all tabs under control (for multi-tab overlay support)
        this.controlledTabs = new Set();

        // Track user intervention state (for multi-tab support)
        this.userInterventionMessage = null;  // Formatted HTML message for user intervention

        // Initialize state store for tracking automation context
        this.stateStore = new AutomationStateStore({
            useStorage: true,
            storageKey: 'browser_automation_state'
        });

        // Initialize execution watchdog for timeout/retry/heartbeat
        this.watchdog = new ExecutionWatchdog({
            defaultTimeout: 15000,  // 15s default timeout
            maxRetries: 2,          // Retry twice on failures
            stateStore: this.stateStore,
            progressCallback: (event, payload) => {
                this._handleWatchdogProgress(event, payload);
            }
        });

        // Setup tab listeners for multi-tab overlay support
        this._setupTabListeners();

        // P5 Enhancement: Handle unexpected debugger detachment
        // If debugger detaches (user action/crash), we must remove the blocking overlay
        this.connection.onDetach(() => {
            if (this.isControlActive) {
                console.log('[ControlManager] Debugger detached unexpectedly, disabling control mode to free UI');
                this.disableControlMode().catch(e => console.warn('[ControlManager] Detach cleanup failed:', e));
            }
        });
    }

    async _forceStopControl(reason = 'unknown') {
        this.isControlActive = false;
        this.userInterventionMessage = null;
        this._userPausePromise = null;

        if (this._continueCallback) {
            try {
                this._continueCallback({ status: 'stopped', reason });
            } catch (_) {}
            this._continueCallback = null;
        }

        if (this._operationResolve) {
            try {
                this._operationResolve({ status: 'stopped', reason });
            } catch (_) {}
            this._operationResolve = null;
        }

        if (this._controlMessageListener) {
            chrome.runtime.onMessage.removeListener(this._controlMessageListener);
            this._controlMessageListener = null;
        }

        const tabIds = new Set(Array.from(this.controlledTabs));
        if (this.connection?.tabId) tabIds.add(this.connection.tabId);
        try {
            const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
            if (activeTab?.id) tabIds.add(activeTab.id);
        } catch (_) {}

        for (const tabId of tabIds) {
            try {
                await chrome.scripting.executeScript({
                    target: { tabId },
                    func: () => {
                        const overlay = document.getElementById('gemini-control-overlay');
                        const styles = document.getElementById('gemini-control-styles');
                        if (overlay) overlay.remove();
                        if (styles) styles.remove();
                        document.body.classList.remove('gemini-control-active');
                    }
                });
            } catch (_) {}
        }

        this.controlledTabs.clear();
    }

    /**
     * Setup tab listeners to auto-inject overlay in new tabs during control mode
     */
    _setupTabListeners() {
        // Listen for new tabs created
        chrome.tabs.onCreated.addListener((tab) => {
            if (this.isControlActive && tab.id) {
                console.log('[ControlManager] New tab created, will inject overlay when loaded:', tab.id);
                // Add to controlled tabs immediately
                this.controlledTabs.add(tab.id);
            }
        });

        // Listen for tab updates (to inject overlay when page loads)
        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            // Only inject if:
            // 1. Control mode is active
            // 2. Tab is in controlled list OR is newly created during control session
            // 3. Page has finished loading (status === 'complete')
            if (this.isControlActive && changeInfo.status === 'complete') {
                // Check if this tab should be controlled
                const shouldControl = this.controlledTabs.has(tabId);

                if (shouldControl) {
                    console.log('[ControlManager] Injecting overlay into tab:', tabId, tab.url);
                    this._injectOverlayToTab(tabId).catch(err => {
                        console.warn('[ControlManager] Failed to inject overlay into tab:', tabId, err.message);
                    });
                }
            }
        });

        // Listen for tab removal (cleanup)
        chrome.tabs.onRemoved.addListener((tabId) => {
            if (this.controlledTabs.has(tabId)) {
                console.log('[ControlManager] Controlled tab closed:', tabId);
                this.controlledTabs.delete(tabId);
            }
        });
    }

    /**
     * Inject overlay into a specific tab
     */
    async _injectOverlayToTab(tabId) {
        try {
            // Check if URL is restricted
            const tab = await chrome.tabs.get(tabId);
            if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:'))) {
                console.log('[ControlManager] Skipping restricted URL:', tab.url);
                return;
            }

            // Check if we're in user intervention mode
            const isUserIntervention = !!this.userInterventionMessage;
            const interventionMessage = this.userInterventionMessage || '';

            // Inject overlay using executeScript (doesn't require debugger attachment)
            await chrome.scripting.executeScript({
                target: { tabId },
                func: (isIntervention, message) => {
                    const existingOverlay = document.getElementById('gemini-control-overlay');
                    const existingStyles = document.getElementById('gemini-control-styles');
                    if (existingOverlay) existingOverlay.remove();
                    if (existingStyles) existingStyles.remove();

                    // Create full-screen blocking overlay
                    const overlay = document.createElement('div');
                    overlay.id = 'gemini-control-overlay';
                    overlay.style.cssText = `
                        position: fixed;
                        top: 0;
                        left: 0;
                        right: 0;
                        bottom: 0;
                        background: radial-gradient(circle at center, rgba(59, 130, 246, 0.15) 0%, rgba(59, 130, 246, 0.05) 100%);
                        backdrop-filter: ${isIntervention ? 'none' : 'blur(2px)'};
                        z-index: 999998;
                        pointer-events: ${isIntervention ? 'none' : 'auto'};
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: flex-end;
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        animation: ${isIntervention ? 'none' : 'breathe 3s ease-in-out infinite'};
                    `;

                    // Add styles
                    if (!document.getElementById('gemini-control-styles')) {
                        const style = document.createElement('style');
                        style.id = 'gemini-control-styles';
                        style.textContent = `
                            @keyframes breathe {
                                0%, 100% { opacity: 1; }
                                50% { opacity: 0.8; }
                            }
                            #gemini-control-panel {
                                background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
                                border-top: ${isIntervention ? '3px solid #ef4444' : '3px solid #3b82f6'};
                                box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.2);
                                padding: 20px 32px;
                                margin-bottom: 0;
                                width: 100%;
                                max-width: ${isIntervention ? '700px' : '600px'};
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                gap: 16px;
                                animation: slideUp 0.4s ease-out;
                                pointer-events: auto;
                            }
                            @keyframes slideUp {
                                from { transform: translateY(100%); opacity: 0; }
                                to { transform: translateY(0); opacity: 1; }
                            }
                            .control-btn {
                                padding: 12px 28px;
                                border: none;
                                border-radius: 8px;
                                font-weight: 600;
                                cursor: pointer;
                                font-size: 15px;
                                transition: all 0.2s ease;
                                display: flex;
                                align-items: center;
                                gap: 8px;
                                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                            }
                            .control-btn:hover {
                                transform: translateY(-2px);
                                box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
                            }
                            .control-btn.continue {
                                background: #3b82f6;
                                color: white;
                            }
                            .control-btn.continue:hover {
                                background: #2563eb;
                            }
                            .control-btn.pause {
                                background: #f59e0b;
                                color: white;
                            }
                            .control-btn.pause:hover {
                                background: #d97706;
                            }
                            .control-field {
                                flex: 1;
                                display: flex;
                                flex-direction: column;
                                gap: 8px;
                                color: #1f2937;
                            }
                            .control-field-label {
                                font-size: 13px;
                                color: #6b7280;
                            }
                            .control-note {
                                width: 100%;
                                resize: vertical;
                                min-height: 70px;
                                max-height: 180px;
                                padding: 10px 12px;
                                border: 1px solid #e5e7eb;
                                border-radius: 8px;
                                font-size: 13px;
                                line-height: 1.5;
                                outline: none;
                                background: #ffffff;
                                color: #111827;
                            }
                            .control-note:focus {
                                border-color: #3b82f6;
                                box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
                            }
                            body.gemini-control-active > *:not(#gemini-control-overlay),
                            body.gemini-control-active *:not(#gemini-control-overlay):not(#gemini-control-overlay *) {
                                pointer-events: none !important;
                            }
                        `;
                        document.head.appendChild(style);
                    }

                    // Create control panel
                    const panel = document.createElement('div');
                    panel.id = 'gemini-control-panel';

                    if (isIntervention) {
                        // User intervention mode - show message, note input, and Continue button
                        const field = document.createElement('div');
                        field.className = 'control-field';

                        const status = document.createElement('div');
                        status.style.cssText = 'color: #dc2626; font-size: 15px; font-weight: 600; line-height: 1.5;';
                        status.innerHTML = message;

                        const label = document.createElement('div');
                        label.className = 'control-field-label';
                        label.textContent = '请简单描述你刚刚做了什么（可选）：';

                        const note = document.createElement('textarea');
                        note.className = 'control-note';
                        note.placeholder = '例如：我刚登录了账号 / 我切换到了下一题 / 我关闭了弹窗 / 我改了筛选条件…';
                        note.id = 'gemini-control-note';

                        const continueBtn = document.createElement('button');
                        continueBtn.className = 'control-btn continue';
                        continueBtn.innerHTML = '▶ 继续';
                        continueBtn.addEventListener('click', () => {
                            try {
                                const noteText = (note.value || '').trim();
                                chrome.runtime.sendMessage({ action: 'USER_INTERVENTION_CONTINUE', note: noteText });
                                // Visual feedback
                                continueBtn.innerHTML = '正在恢复...';
                                continueBtn.disabled = true;
                                continueBtn.style.opacity = '0.7';
                                continueBtn.style.cursor = 'wait';
                            } catch (e) {
                                console.error('Failed to send continue message:', e);
                                alert('发送继续信号失败，请刷新页面重试');
                            }
                        });

                        field.appendChild(status);
                        field.appendChild(label);
                        field.appendChild(note);
                        panel.appendChild(field);
                        panel.appendChild(continueBtn);

                        // Enable page interaction in intervention mode
                        document.body.classList.remove('gemini-control-active');
                    } else {
                        // Normal control mode - show status indicator and Pause button
                        const status = document.createElement('div');
                        status.style.cssText = 'flex: 1; color: #1f2937; font-size: 14px; display: flex; align-items: center; gap: 12px; font-weight: 500;';
                        status.innerHTML = `
                            <span style="width: 10px; height: 10px; background: #3b82f6; border-radius: 50%; animation: pulse 2s ease-in-out infinite;"></span>
                            <span id="gemini-control-status-text">AI 正在控制浏览器...</span>
                        `;

                        const pauseBtn = document.createElement('button');
                        pauseBtn.className = 'control-btn pause';
                        pauseBtn.innerHTML = '⏸ 暂停';
                        pauseBtn.addEventListener('click', () => {
                            try {
                                chrome.runtime.sendMessage({ action: 'GEMINI_CONTROL_ACTION', payload: 'pause' });
                            } catch (e) {
                                console.error('Failed to send pause message:', e);
                                alert('发送暂停信号失败，请刷新页面重试');
                            }
                        });

                        panel.appendChild(status);
                        panel.appendChild(pauseBtn);

                        // Disable page interaction in normal mode
                        document.body.classList.add('gemini-control-active');
                    }

                    overlay.appendChild(panel);
                    document.body.appendChild(overlay);
                },
                args: [isUserIntervention, interventionMessage]
            });

            console.log('[ControlManager] Overlay injected successfully into tab:', tabId);
        } catch (err) {
            // Only log if it's not a permission error
            if (!err.message?.includes('Cannot access')) {
                console.warn('[ControlManager] Failed to inject overlay:', err.message);
            }
        }
    }

    // --- Internal Helpers ---

    async ensureConnection() {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (!tab) return false;
        
        // Check restricted URLs before trying to attach
        if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:'))) {
            return false;
        }

        await this.connection.attach(tab.id);
        return true;
    }

    async getSnapshot() {
        if (!this.connection.attached) {
             const success = await this.ensureConnection();
             if (!success) return null;
        }
        return await this.snapshotManager.takeSnapshot();
    }

    // --- Control Mode Management ---

    async enableControlMode() {
        const success = await this.ensureConnection();
        if (success) {
            // Add current tab to controlled tabs
            const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
            if (tab?.id) {
                this.controlledTabs.add(tab.id);
                console.log('[ControlManager] Added current tab to controlled tabs:', tab.id);
            }

            // Always show overlay, even if already active
            // This ensures overlay appears for each new task
            if (!this.isControlActive) {
                // First time enabling - start polling
                if (tab?.id) {
                    await this._injectOverlayToTab(tab.id);
                }
                this.isControlActive = true;
                console.log('[ControlManager] Control mode enabled - Page interaction blocked');
                console.log('[ControlManager] Controlled tabs:', Array.from(this.controlledTabs));
                this._startControlMessageListener();
            } else {
                // Already active - just ensure overlay is visible
                // This handles case where previous task ended but overlay was hidden
                if (tab?.id) {
                    await this._injectOverlayToTab(tab.id);
                }
            }
        }
    }

    async disableControlMode() {
        if (!this.isControlActive) return;
        await this._forceStopControl('disabled');
        console.log('[ControlManager] Control mode disabled');
    }

    async updateControlStatus(message) {
        if (this.isControlActive) {
            const tabId = this.connection.tabId;
            if (!tabId) return;
            await chrome.scripting.executeScript({
                target: { tabId },
                func: (text) => {
                    const el = document.getElementById('gemini-control-status-text');
                    if (el) el.textContent = text;
                },
                args: [message]
            });
        }
    }

    /**
     * Listen for user actions (pause/continue button clicks)
     * This runs when control mode is active
     */
    _startControlMessageListener() {
        if (this._controlMessageListener) return;

        this._controlMessageListener = (request, sender, sendResponse) => {
            if (request.action === 'GEMINI_CONTROL_ACTION') {
                const action = request.payload;
                if (action === 'pause') {
                    this._handlePause();
                } else if (action === 'continue') {
                    this._handleContinue('');
                }
            } else if (request.action === 'USER_INTERVENTION_CONTINUE') {
                this._handleContinue(request.note || '');
            }
        };
        chrome.runtime.onMessage.addListener(this._controlMessageListener);
    }

    /**
     * Handle pause action - Suspend AI, allow user interaction
     */
    async _handlePause() {
        console.log('[ControlManager] User requested pause');
        if (this._continueCallback) {
            return;
        }

        this._userPausePromise = this.waitForUserIntervention(
            '用户已暂停自动化并接管浏览器。\n请手动完成操作后，填写说明并点击“继续”。'
        );
    }

    /**
     * Handle watchdog progress events
     */
    _handleWatchdogProgress(event, payload) {
        const { actionName } = payload;

        switch (event) {
            case 'start':
                this.updateControlStatus(`Executing: ${actionName}...`).catch(() => {});
                break;
            case 'heartbeat':
                const message = payload.message || 'running';
                this.updateControlStatus(`${actionName} - ${message}...`).catch(() => {});
                break;
            case 'retry':
                this.updateControlStatus(`Retrying: ${actionName} (attempt ${payload.attempt})...`).catch(() => {});
                break;
            case 'error':
                const classification = payload.classification?.type || 'unknown';
                console.warn(`[ControlManager] Action failed: ${actionName} (${classification})`);
                break;
            case 'success':
                console.log(`[ControlManager] Action succeeded: ${actionName}`);
                break;
        }
    }

    /**
     * Handle continue action - Resume AI control
     * Enhanced to detect page changes and restore context
     */
    async _handleContinue(note = '') {
        console.log('[ControlManager] User requested continue');

        try {
            const trimmedNote = String(note || '').trim();
            if (trimmedNote) {
                await this.stateStore.appendEvent({
                    type: 'user_intervention_note',
                    note: trimmedNote,
                    timestamp: Date.now()
                });
            }

            // Take fresh snapshot to rebuild context after intervention
            const newSnapshot = await this.snapshotManager.takeSnapshot({ forceRefresh: true });
            const context = this.stateStore.getCurrentContext();

            // Check if page changed during intervention
            if (newSnapshot && context.snapshotHash) {
                const newHash = this.stateStore._hashSnapshot(newSnapshot);
                const pageChanged = this.stateStore.hasPageChanged(newHash);

                if (pageChanged) {
                    console.log('[ControlManager] Page changed during user intervention');
                    await this.stateStore.updateSnapshot(newSnapshot, newHash);

                    // Mark that page changed (will be included in tool output)
                    await this.stateStore.appendEvent({
                        type: 'page_changed_during_intervention',
                        oldHash: context.snapshotHash,
                        newHash,
                        timestamp: Date.now()
                    });
                }
            } else if (newSnapshot) {
                const newHash = this.stateStore._hashSnapshot(newSnapshot);
                await this.stateStore.updateSnapshot(newSnapshot, newHash);
            }

            // Clear user intervention flag
            await this.stateStore.clearUserIntervention();

            // Clear intervention message
            this.userInterventionMessage = null;

            // Re-inject normal overlay to all controlled tabs
            for (const tabId of this.controlledTabs) {
                await this._injectOverlayToTab(tabId);
            }

            this._userPausePromise = null;

            // Signal to resume operations
            if (this._continueCallback) {
                this._continueCallback({ note: trimmedNote, snapshot: newSnapshot });
                this._continueCallback = null;
            }
        } catch (error) {
            console.error('[ControlManager] Failed to resume automation:', error);
            await this.waitForUserIntervention(`恢复失败：${error.message}\n请修正问题后点击继续。`);
        }
    }

    /**
     * Wait for user to click continue
     * Used when AI needs user intervention (e.g., CAPTCHA)
     * Enhanced to save checkpoint before pausing
     */
    async waitForUserIntervention(message) {
        console.log('[ControlManager] Waiting for user intervention:', message);
        if (this._continueCallback) {
            return new Promise((resolve) => resolve({ status: 'already_waiting' }));
        }

        // Save checkpoint before pausing
        const snapshot = await this.getSnapshot();
        if (snapshot) {
            const hash = this.stateStore._hashSnapshot(snapshot);
            await this.stateStore.updateSnapshot(snapshot, hash);
        }

        // Mark user intervention
        await this.stateStore.markUserIntervention('user_requested');

        // Save checkpoint
        await this.stateStore.saveCheckpoint('user_pause', {
            message,
            snapshot,
            timestamp: Date.now()
        });

        // Format message for better visibility
        const formattedMessage = `
            <div style="display: flex; flex-direction: column; gap: 8px;">
                <div style="font-weight: 700; font-size: 16px;">⚠️ 需要人工介入</div>
                <div style="line-height: 1.5;">${message.replace(/\n/g, '<br>')}</div>
                <div style="font-size: 13px; color: #6b7280; margin-top: 4px;">
                    请手动处理问题后，点击下方的 <strong>继续</strong> 按钮
                </div>
            </div>
        `;

        // Store message for new tabs
        this.userInterventionMessage = formattedMessage;
        // Ensure overlay exists in intervention mode on all controlled tabs
        const currentTabId = this.connection.tabId;
        if (currentTabId) {
            this.controlledTabs.add(currentTabId);
        }
        for (const tabId of this.controlledTabs) {
            await this._injectOverlayToTab(tabId);
        }

        console.log('[ControlManager] User intervention message shown on all tabs');

        // Wait for continue button
        return new Promise((resolve) => {
            this._continueCallback = ({ note } = {}) => {
                console.log('[ControlManager] User intervention completed, resuming AI control');

                // Check if page changed
                const events = this.stateStore.getRecentEvents(5);
                const pageChangedEvent = events.find(e => e.type === 'page_changed_during_intervention');

                resolve({
                    status: 'continued',
                    pageChanged: !!pageChangedEvent,
                    events,
                    note: typeof note === 'string' ? note : ''
                });
            };
        });
    }

    // --- Breakpoint Methods ---

    async pauseAtBreakpoint(args = {}) {
        this.isBreakpointActive = true;
        const message = args.message || 'Automation paused - ready for user interaction';
        await this.breakpoint.show(message);
        
        // Wait for user action - poll for button clicks
        return new Promise((resolve) => {
            this._breakpointResolve = resolve;
            
            // Poll every 500ms to detect button clicks
            const pollInterval = setInterval(async () => {
                try {
                    const result = await this.connection.sendCommand("Runtime.evaluate", {
                        expression: `
                            (function() {
                                const action = window.__geminiBreakpointAction;
                                if (action) {
                                    delete window.__geminiBreakpointAction;
                                    return action;
                                }
                                return null;
                            })()
                        `,
                        returnByValue: true
                    });
                    
                    const action = result.result.value;
                    if (action === 'pause') {
                        clearInterval(pollInterval);
                        await this.breakpoint.hide();
                        this.isBreakpointActive = false;
                        resolve({ status: 'resumed', action: 'pause' });
                    } else if (action === 'end') {
                        clearInterval(pollInterval);
                        await this.breakpoint.hide();
                        this.isBreakpointActive = false;
                        resolve({ status: 'ended', action: 'end' });
                    }
                } catch (e) {
                    clearInterval(pollInterval);
                    this.isBreakpointActive = false;
                    resolve({ status: 'error', message: e.message });
                }
            }, 500);
            
            // Store interval ID for cleanup
            this._breakpointPollInterval = pollInterval;
        });
    }

    resumeFromBreakpoint() {
        // Clean up polling interval
        if (this._breakpointPollInterval) {
            clearInterval(this._breakpointPollInterval);
            this._breakpointPollInterval = null;
        }
        
        if (this._breakpointResolve) {
            this._breakpointResolve({ status: 'resumed', action: 'continue' });
            this._breakpointResolve = null;
        }
        this.isBreakpointActive = false;
        return 'Breakpoint resumed - continuing automation';
    }

    async endBreakpoint() {
        // Clean up polling interval
        if (this._breakpointPollInterval) {
            clearInterval(this._breakpointPollInterval);
            this._breakpointPollInterval = null;
        }
        
        if (this._breakpointResolve) {
            this._breakpointResolve({ status: 'ended', action: 'stop' });
            this._breakpointResolve = null;
        }
        await this.breakpoint.hide();
        this.isBreakpointActive = false;
        return 'Automation ended by user';
    }

    // --- Execution Entry Point ---

    async execute(toolCall) {
        try {
            const { name, args } = toolCall;
            const success = await this.ensureConnection();
            if (!success) return "Error: No active tab found or restricted URL.";

            if (this._userPausePromise) {
                await this._userPausePromise;
                this._userPausePromise = null;
            }

            // Show control overlay on first tool execution
            if (!this.isControlActive) {
                const currentTabId = this.connection.tabId;
                if (currentTabId) {
                    this.controlledTabs.add(currentTabId);
                    await this._injectOverlayToTab(currentTabId);
                }
                this.isControlActive = true;
                this._startControlMessageListener();
            }

            console.log(`[MCP] Executing tool: ${name}`, args);

            // P4 Optimization: Immediate UI feedback
            await this.updateControlStatus(`Analyzing page state...`);

            // Check for blocking elements before execution
            const blockingDetected = await this._detectBlockingElements();
            if (blockingDetected) {
                console.warn('[ControlManager] Blocking element detected:', blockingDetected.type);
                const result = await this.waitForUserIntervention(
                    blockingDetected.message || `检测到${blockingDetected.type}，请手动处理后点击继续`
                );
                // After user handles it, continue with the original tool
            }

            // P3 Enhancement: Wrap action execution with Watchdog + Checkpoint
            const result = await this._executeWithTransaction(name, args);
            return result;

        } catch (e) {
            // Silent fail if debugger session closed (common when tab is closed/refreshed)
            if (e.message?.includes('No active debugger session')) {
                console.log('[ControlManager] Debugger session closed during tool execution');
                return `Browser tab was closed or refreshed. Please try again.`;
            }

            console.error(`[MCP] Tool execution error:`, e);

            // Auto-retry logic for common failures
            if (this._shouldRequestUserHelp(e)) {
                console.log('[ControlManager] Auto-triggering user intervention due to error');
                try {
                    await this.waitForUserIntervention(
                        `操作失败: ${e.message}\n\n请手动处理问题后点击继续，AI将重试该操作`
                    );
                    // Retry the tool after user intervention
                    console.log('[ControlManager] Retrying tool after user intervention:', toolCall.name);
                    return await this.execute(toolCall);
                } catch (retryError) {
                    if (retryError.message?.includes('No active debugger session')) {
                        return `Browser tab was closed during retry. Please try again.`;
                    }
                    return `Error executing ${toolCall.name} after retry: ${retryError.message}`;
                }
            }

            return `Error executing ${toolCall.name}: ${e.message}`;
        }
    }

    /**
     * P3 Enhancement: Execute action with transaction semantics (checkpoint/commit/rollback)
     * @private
     */
    async _executeWithTransaction(name, args) {
        // P4 Optimization: Update UI before snapshotting (which can be slow)
        await this.updateControlStatus(`Creating checkpoint...`);

        // Step 1: Save checkpoint before execution
        const snapshot = await this.getSnapshot();
        if (snapshot) {
            const hash = this.stateStore._hashSnapshot(snapshot);
            await this.stateStore.updateSnapshot(snapshot, hash);
        }

        await this.stateStore.updateLastAction({ name, args });
        await this.stateStore.saveCheckpoint(`before_${name}`, {
            action: name,
            args,
            snapshot,
            timestamp: Date.now()
        });

        // Step 2: Execute action with watchdog
        let result;
        try {
            result = await this.watchdog.runWithWatchdog(
                name,
                async () => {
                    return await this._dispatchAction(name, args);
                },
                {
                    timeout: this._getActionTimeout(name),
                    retries: this._getActionRetries(name),
                    onError: async (error, classification) => {
                        console.warn(`[Transaction] Action ${name} failed:`, error.message, classification);

                        // Record error in state
                        await this.stateStore.appendEvent({
                            type: 'action_failed',
                            action: name,
                            error: error.message,
                            classification
                        });
                    }
                }
            );

            // Step 3: Commit - record success
            await this.stateStore.appendEvent({
                type: 'action_committed',
                action: name,
                timestamp: Date.now()
            });

            console.log(`[Transaction] Action ${name} committed successfully`);
            return result;

        } catch (error) {
            // Step 4: Rollback - attempt to restore previous state
            console.error(`[Transaction] Action ${name} failed after all retries, attempting rollback`);

            await this.stateStore.markNeedsRecovery(`Action ${name} failed: ${error.message}`);

            // For navigation-breaking errors, restore checkpoint
            if (this._isNavigationAction(name)) {
                try {
                    await this.stateStore.restoreCheckpoint(`before_${name}`);
                    console.log(`[Transaction] Checkpoint restored for ${name}`);
                } catch (restoreError) {
                    console.error(`[Transaction] Failed to restore checkpoint:`, restoreError.message);
                }
            }

            // Re-throw to let outer error handler decide
            throw error;
        }
    }

    /**
     * Dispatch action to appropriate handler
     * @private
     */
    async _dispatchAction(name, args) {
        let result;
        switch (name) {
                // Actions handled by BrowserActions
                case 'navigate_page':
                    result = await this.actions.navigatePage(args);
                    break;
                case 'new_page':
                    result = await this.actions.newPage(args);
                    break;
                case 'close_page':
                    result = await this.actions.closePage(args);
                    break;
                case 'take_screenshot':
                    result = await this.actions.takeScreenshot(args);
                    break;
                case 'click':
                    result = await this.actions.clickElement(args);
                    break;
                case 'drag_element':
                    result = await this.actions.dragElement(args);
                    break;
                case 'hover':
                    result = await this.actions.hoverElement(args);
                    break;
                case 'fill':
                    result = await this.actions.fillElement(args);
                    break;
                case 'fill_form':
                    result = await this.actions.fillForm(args);
                    break;
                case 'press_key':
                    result = await this.actions.pressKey(args);
                    break;
                case 'handle_dialog':
                    result = await this.actions.input.handleDialog(args);
                    break;
                case 'wait_for':
                    result = await this.actions.waitFor(args);
                    break;
                case 'evaluate_script':
                    result = await this.actions.evaluateScript(args);
                    break;
                case 'run_javascript':
                case 'run_script': // alias
                    result = await this.actions.evaluateScript(args);
                    break;
                case 'list_pages':
                    result = await this.actions.listPages();
                    break;
                case 'select_page':
                    result = await this.actions.selectPage(args);
                    break;

                // P2 Enhancement: Tab stack navigation
                case 'switch_to_tab':
                    result = await this.actions.switchToTab(args);
                    break;
                case 'return_to_previous_tab':
                    result = await this.actions.returnToPreviousTab(args);
                    break;
                case 'get_tab_stack':
                    result = await this.actions.getTabStack(args);
                    break;
                case 'clear_tab_stack':
                    result = await this.actions.clearTabStack(args);
                    break;

                case 'attach_file':
                    result = await this.actions.attachFile(args);
                    break;
                
                // Emulation
                case 'emulate':
                    result = await this.actions.emulate(args);
                    break;
                case 'resize_page':
                    result = await this.actions.resizePage(args);
                    break;

                // Performance
                case 'performance_start_trace':
                case 'start_trace': // Alias
                    result = await this.actions.startTrace(args);
                    break;
                case 'performance_stop_trace':
                case 'stop_trace': // Alias
                    result = await this.actions.stopTrace(args);
                    break;
                case 'performance_analyze_insight':
                    result = await this.actions.analyzeInsight(args);
                    break;

                // Observability Tools
                case 'get_logs':
                    result = await this.actions.observation.getLogs();
                    break;
                case 'get_network_activity': // Legacy simple view
                    result = await this.actions.observation.getNetworkActivity();
                    break;
                case 'list_network_requests':
                    result = await this.actions.observation.listNetworkRequests(args);
                    break;
                case 'get_network_request':
                    result = await this.actions.observation.getNetworkRequest(args);
                    break;
                
                // Snapshot handled by SnapshotManager
                case 'take_snapshot':
                    result = await this.snapshotManager.takeSnapshot(args);
                    break;

                // Element Selection (New)
                case 'find_by_css':
                    result = await this.selector.findByCssSelector(args.selector);
                    break;
                case 'find_by_xpath':
                    result = await this.selector.findByXPath(args.xpath);
                    break;
                case 'find_by_text':
                    result = await this.selector.findByText(args.text, args);
                    break;
                case 'find_by_accessibility':
                    result = await this.selector.findByAccessibility(args);
                    break;
                case 'validate_selector':
                    result = await this.selector.validateSelector(args.selector, args.type);
                    break;

                // Accessibility Audit (New)
                case 'audit_accessibility':
                case 'a11y_audit':
                    result = await this.a11y.audit();
                    break;

                // Breakpoint Control (Deprecated - use wait_for_user instead)
                case 'breakpoint_pause':
                    result = await this.pauseAtBreakpoint(args);
                    break;
                case 'breakpoint_resume':
                    result = this.resumeFromBreakpoint();
                    break;
                case 'breakpoint_end':
                    result = await this.endBreakpoint();
                    break;

                // User Intervention (New)
                case 'wait_for_user':
                case 'request_user_help':
                    const message = args.message || 'Please complete the task manually';
                    result = await this.waitForUserIntervention(message);
                    break;

                // File Operations (New)
                case 'write_file':
                case 'save_file':
                    result = await this.fileOps.writeFile(args);
                    break;
                case 'write_json':
                case 'save_json':
                    result = await this.fileOps.writeJSON(args);
                    break;
                case 'write_csv':
                case 'save_csv':
                    result = await this.fileOps.writeCSV(args);
                    break;
                case 'write_markdown':
                case 'save_markdown':
                    result = await this.fileOps.writeMarkdown(args);
                    break;
                case 'append_file':
                    result = await this.fileOps.appendFile(args);
                    break;
                case 'create_directory':
                case 'mkdir':
                    result = await this.fileOps.createDirectory(args);
                    break;
                case 'list_files':
                case 'ls':
                    result = await this.fileOps.listFiles(args);
                    break;
                case 'batch_write':
                    result = await this.fileOps.batchWrite(args);
                    break;

                default:
                    result = `Error: Unknown tool '${name}'`;
            }

            return result;
    }

    /**
     * Get action-specific timeout (in milliseconds)
     * @private
     */
    _getActionTimeout(name) {
        const timeouts = {
            'navigate_page': 30000,        // 30s for navigation
            'new_page': 20000,              // 20s for new tab
            'take_snapshot': 10000,         // 10s for snapshot
            'evaluate_script': 20000,       // 20s for script execution
            'wait_for': 60000,              // 60s for explicit waits
            'performance_stop_trace': 30000, // 30s for trace analysis
        };

        return timeouts[name] || 15000; // Default 15s
    }

    /**
     * Get action-specific retry count
     * @private
     */
    _getActionRetries(name) {
        const retries = {
            'click': 3,                     // More retries for clicks (common failure)
            'fill': 3,                      // More retries for form fills
            'hover': 2,                     // Fewer retries for hover
            'take_snapshot': 1,             // Snapshot failures are usually terminal
            'navigate_page': 2,             // Navigation can be retried
        };

        return retries[name] ?? 2; // Default 2 retries
    }

    /**
     * Check if action is a navigation action (for rollback purposes)
     * @private
     */
    _isNavigationAction(name) {
        return [
            'navigate_page',
            'new_page',
            'close_page',
            'select_page',
            'switch_to_tab'
        ].includes(name);
    }

    /**
     * Detect blocking elements that require user intervention
     * Returns { type, message } if blocking element found, null otherwise
     */
    async _detectBlockingElements() {
        try {
            const result = await this.connection.sendCommand("Runtime.evaluate", {
                expression: `
                    (function() {
                        // Check for CAPTCHA
                        const captchaSelectors = [
                            'iframe[src*="recaptcha"]',
                            'iframe[src*="hcaptcha"]',
                            '[class*="captcha"]',
                            '[id*="captcha"]',
                            '.g-recaptcha',
                            '.h-captcha'
                        ];
                        
                        for (const selector of captchaSelectors) {
                            if (document.querySelector(selector)) {
                                return { type: '验证码', message: '检测到验证码，请完成验证后点击继续' };
                            }
                        }
                        
                        // Check for authentication dialogs
                        const authSelectors = [
                            '[type="password"]:not([style*="display: none"])',
                            'input[name*="password"]:not([style*="display: none"])',
                            'input[autocomplete="current-password"]'
                        ];
                        
                        for (const selector of authSelectors) {
                            const elem = document.querySelector(selector);
                            if (elem && elem.offsetParent !== null) {
                                return { type: '登录验证', message: '检测到登录页面，请完成登录后点击继续' };
                            }
                        }
                        
                        // Check for modal dialogs that might block interaction
                        const modalSelectors = [
                            '[role="dialog"][aria-modal="true"]',
                            '.modal[style*="display: block"]',
                            '[class*="popup"][style*="display: block"]'
                        ];
                        
                        for (const selector of modalSelectors) {
                            const modal = document.querySelector(selector);
                            if (modal && modal.offsetParent !== null) {
                                // Check if modal has required action buttons
                                const hasRequiredAction = modal.querySelector('button[required], input[required]');
                                if (hasRequiredAction) {
                                    return { type: '必填弹窗', message: '检测到需要处理的弹窗，请完成操作后点击继续' };
                                }
                            }
                        }
                        
                        // Check for 2FA/OTP inputs
                        const otpSelectors = [
                            'input[type="text"][maxlength="6"]',
                            'input[autocomplete="one-time-code"]',
                            'input[name*="otp"]',
                            'input[name*="code"]'
                        ];
                        
                        for (const selector of otpSelectors) {
                            const elem = document.querySelector(selector);
                            if (elem && elem.offsetParent !== null) {
                                return { type: '双因素认证', message: '检测到验证码输入框，请输入验证码后点击继续' };
                            }
                        }
                        
                        return null;
                    })()
                `,
                returnByValue: true
            });
            
            return result.result.value;
        } catch (e) {
            console.warn('[ControlManager] Failed to detect blocking elements:', e.message);
            return null;
        }
    }

    /**
     * Determine if an error should trigger user intervention
     */
    _shouldRequestUserHelp(error) {
        if (error?.name === 'NonRetryableError' || error?.code === 'NON_RETRYABLE') {
            return false;
        }

        const errorMessage = error.message.toLowerCase();
        
        // Skip debugger session errors - these are expected when tab is closed
        if (errorMessage.includes('no active debugger session')) {
            return false;
        }
        
        // Network/timeout errors
        if (errorMessage.includes('timeout') || 
            errorMessage.includes('network') ||
            errorMessage.includes('failed to fetch')) {
            return true;
        }
        
        // Element not found/not interactable
        if (errorMessage.includes('not found') ||
            errorMessage.includes('not interactable') ||
            errorMessage.includes('not visible')) {
            return true;
        }
        
        // Navigation errors
        if (errorMessage.includes('navigation') ||
            errorMessage.includes('load')) {
            return true;
        }
        
        // Click intercepted
        if (errorMessage.includes('intercepted') ||
            errorMessage.includes('obscured')) {
            return true;
        }
        
        return false;
    }
}
