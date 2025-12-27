
// background/managers/control_manager.js
import { BrowserConnection } from '../control/connection.js';
import { SnapshotManager } from '../control/snapshot.js';
import { BrowserActions } from '../control/actions.js';
import { SelectorEngine } from '../control/selector.js';
import { AccessibilityChecker } from '../control/a11y.js';
import { BreakpointOverlay } from '../control/breakpoint_overlay.js';
import { ControlOverlay } from '../control/control_overlay.js';
import { FileOperations } from '../control/file_operations.js';

/**
 * Main Controller handling Chrome DevTools MCP functionalities.
 * Orchestrates connection, snapshots, and action execution.
 */
export class BrowserControlManager {
    constructor() {
        this.connection = new BrowserConnection();
        this.snapshotManager = new SnapshotManager(this.connection);
        this.actions = new BrowserActions(this.connection, this.snapshotManager);
        this.selector = new SelectorEngine(this.connection, this.snapshotManager);
        this.a11y = new AccessibilityChecker(this.connection);
        this.controlOverlay = new ControlOverlay(this.connection);  // Global control indicator
        this.breakpoint = new BreakpointOverlay(this.connection);   // Breakpoint panel
        this.fileOps = new FileOperations();  // File operations for AI workspace
        this.isBreakpointActive = false;
        this.isControlActive = false;  // Track if control mode is enabled
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
            // Always show overlay, even if already active
            // This ensures overlay appears for each new task
            if (!this.isControlActive) {
                // First time enabling - start polling
                await this.controlOverlay.show();
                this.isControlActive = true;
                console.log('[ControlManager] Control mode enabled - Page interaction blocked');
                this._startControlPolling();
            } else {
                // Already active - just ensure overlay is visible
                // This handles case where previous task ended but overlay was hidden
                if (!this.controlOverlay.isVisible) {
                    await this.controlOverlay.show();
                    console.log('[ControlManager] Control overlay re-shown for new task');
                }
            }
        }
    }

    async disableControlMode() {
        if (!this.isControlActive) return;
        await this.controlOverlay.hide();
        this.isControlActive = false;
        
        // Stop polling
        if (this._controlPollInterval) {
            clearInterval(this._controlPollInterval);
            this._controlPollInterval = null;
        }
        
        console.log('[ControlManager] Control mode disabled');
    }

    async updateControlStatus(message) {
        if (this.isControlActive) {
            await this.controlOverlay.updateStatus(message);
        }
    }

    /**
     * Poll for user actions (pause/continue button clicks)
     * This runs continuously when control mode is active
     */
    _startControlPolling() {
        if (this._controlPollInterval) return;
        
        this._controlPollInterval = setInterval(async () => {
            try {
                const result = await this.connection.sendCommand("Runtime.evaluate", {
                    expression: `
                        (function() {
                            const action = window.__geminiControlAction;
                            if (action) {
                                delete window.__geminiControlAction;
                                return action;
                            }
                            return null;
                        })()
                    `,
                    returnByValue: true
                });
                
                const action = result.result.value;
                if (action === 'pause') {
                    await this._handlePause();
                } else if (action === 'continue') {
                    await this._handleContinue();
                }
            } catch (e) {
                // Connection lost or page changed
                console.warn('[ControlManager] Polling error:', e.message);
            }
        }, 300);  // Poll every 300ms for responsive UI
    }

    /**
     * Handle pause action - Suspend AI, allow user interaction
     */
    async _handlePause() {
        console.log('[ControlManager] User requested pause');
        await this.controlOverlay.pause();
        
        // If there's a pending operation, resolve it with pause status
        if (this._operationResolve) {
            this._operationResolve({ status: 'paused', reason: 'user_requested' });
            this._operationResolve = null;
        }
    }

    /**
     * Handle continue action - Resume AI control
     */
    async _handleContinue() {
        console.log('[ControlManager] User requested continue');
        await this.controlOverlay.continue();
        
        // Signal to resume operations
        if (this._continueCallback) {
            this._continueCallback();
            this._continueCallback = null;
        }
    }

    /**
     * Wait for user to click continue
     * Used when AI needs user intervention (e.g., CAPTCHA)
     */
    async waitForUserIntervention(message) {
        console.log('[ControlManager] Waiting for user intervention:', message);
        
        // Auto-pause and show message
        await this.controlOverlay.pause();
        await this.controlOverlay.updateStatus(message);
        
        // Wait for continue button
        // Note: _handleContinue will call controlOverlay.continue() before invoking this callback
        return new Promise((resolve) => {
            this._continueCallback = () => {
                console.log('[ControlManager] User intervention completed, resuming AI control');
                resolve({ status: 'continued' });
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

            // Show control overlay on first tool execution
            if (!this.isControlActive) {
                await this.controlOverlay.show();
                this.isControlActive = true;
            }

            console.log(`[MCP] Executing tool: ${name}`, args);
            
            // Check for blocking elements before execution
            const blockingDetected = await this._detectBlockingElements();
            if (blockingDetected) {
                console.warn('[ControlManager] Blocking element detected:', blockingDetected.type);
                const result = await this.waitForUserIntervention(
                    blockingDetected.message || `检测到${blockingDetected.type}，请手动处理后点击继续`
                );
                // After user handles it, continue with the original tool
            }

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

        } catch (e) {
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
                    return `Error executing ${toolCall.name} after retry: ${retryError.message}`;
                }
            }
            
            return `Error executing ${toolCall.name}: ${e.message}`;
        }
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
        const errorMessage = error.message.toLowerCase();
        
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
