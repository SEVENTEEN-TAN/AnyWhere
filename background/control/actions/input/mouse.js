
// background/control/actions/input/mouse.js
import { BaseActionHandler } from '../base.js';

export class MouseActions extends BaseActionHandler {
    constructor(connection, snapshotManager, waitHelper, controlOverlay = null) {
        super(connection, snapshotManager, waitHelper);
        this.controlOverlay = controlOverlay;
    }

    /**
     * Enhanced click with pre-checks and retry support
     * @param {Object} options - Click options
     * @param {string} options.uid - Element UID
     * @param {boolean} [options.dblClick=false] - Double click
     * @param {Object} [options.retryOptions] - Retry configuration
     * @param {number} [options.retryOptions.maxRetries=3] - Max retry attempts
     * @param {number} [options.retryOptions.retryDelay=500] - Delay between retries (ms)
     * @param {boolean} [options.retryOptions.waitForInteractive=true] - Wait for element to be interactive
     */
    async clickElement({ uid, dblClick = false, retryOptions = {} }) {
        const {
            maxRetries = 3,
            retryDelay = 500,
            waitForInteractive = true
        } = retryOptions;

        let lastError = null;

        // Retry loop
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const objectId = await this.getObjectIdFromUid(uid);
                const backendNodeId = this.snapshotManager.getBackendNodeId(uid);

                // P1 Enhancement: Check if element is an OPTION
                // If so, redirect to parent SELECT interaction (since OPTIONs don't have box models)
                try {
                    const nodeInfo = await this.cmd("DOM.describeNode", { backendNodeId });
                    if (nodeInfo.node && nodeInfo.node.nodeName === 'OPTION') {
                         console.log(`[MouseActions] Detected click on OPTION tag, redirecting to parent SELECT logic`);

                         // Check if disabled before proceeding
                         const isDisabled = await this._isElementDisabled(objectId);
                         // Also check if parent select is disabled (common pattern)
                         const isParentDisabled = await this.cmd("Runtime.callFunctionOn", {
                             objectId,
                             functionDeclaration: `function() {
                                 return this.parentElement && (this.parentElement.disabled || this.parentElement.getAttribute('aria-disabled') === 'true');
                             }`,
                             returnByValue: true
                         }).then(r => r?.result?.value);

                         if (isDisabled || isParentDisabled) {
                             throw new Error('Element is disabled');
                         }

                         // Use JS fallback immediately which has enhanced SELECT support
                         // This is much more reliable than trying to click the option physically
                         // especially inside a closed select dropdown
                         return await this._jsClickFallback(uid, dblClick);
                    }
                } catch (nodeErr) {
                    if (nodeErr.message === 'Element is disabled') throw nodeErr;
                    // Ignore, continue with standard click
                }

                // P2 Enhancement: Check if element will open a new tab
                let willOpenNewTab = false;
                try {
                    const targetAttr = await this.cmd("Runtime.callFunctionOn", {
                        objectId,
                        functionDeclaration: `function() {
                            return this.target || this.getAttribute('target');
                        }`,
                        returnByValue: true
                    });
                    const target = targetAttr?.result?.value;
                    willOpenNewTab = target === '_blank';

                    if (willOpenNewTab) {
                        console.log(`[MouseActions] Element has target="_blank", will wait for new tab`);
                    }
                } catch (e) {
                    // Ignore if we can't check target attribute
                }

                // P0 Enhancement: Highlight element before clicking
                if (this.controlOverlay) {
                    try {
                        await this.controlOverlay.highlightElement(
                            backendNodeId,
                            dblClick ? `Double clicking '${uid}'...` : `Clicking '${uid}'...`
                        );
                    } catch (highlightErr) {
                        // Don't fail the click if highlighting fails
                        console.warn('[MouseActions] Highlight failed:', highlightErr.message);
                    }
                }

                // Phase 1 Enhancement: Pre-click checks
                if (waitForInteractive) {
                    await this._preClickChecks(uid, objectId);
                }

                // 1. Scroll element into view to ensure coordinates are valid
                await this.cmd("DOM.scrollIntoViewIfNeeded", { objectId });

                // 2. Get click coordinates
                const { model } = await this.cmd("DOM.getBoxModel", { backendNodeId });
                if (!model || !model.content) throw new Error("No box model found");

                // Calculate center of content quad [x1, y1, x2, y2, x3, y3, x4, y4]
                const x = (model.content[0] + model.content[4]) / 2;
                const y = (model.content[1] + model.content[5]) / 2;

                // P2 Enhancement: Start listening for new tab if target="_blank"
                let newTabPromise = null;
                if (willOpenNewTab) {
                    newTabPromise = this.connection.waitForNewTab(5000);  // 5 second timeout
                }

                // P3 Enhancement: Show click feedback (Ripple)
                if (this.controlOverlay) {
                    this.controlOverlay.showClickFeedback(x, y, dblClick ? 'dblclick' : 'click').catch(() => {});
                }

                // 3. Dispatch Trusted Input Events wrapped in WaitHelper
                await this.waitHelper.execute(async () => {
                    // Move to location
                    await this.cmd("Input.dispatchMouseEvent", {
                        type: "mouseMoved", x, y
                    });

                    // First Click
                    await this.cmd("Input.dispatchMouseEvent", {
                        type: "mousePressed", x, y, button: "left", clickCount: 1
                    });
                    await this.cmd("Input.dispatchMouseEvent", {
                        type: "mouseReleased", x, y, button: "left", clickCount: 1
                    });

                    // Second Click (if requested)
                    if (dblClick) {
                        await this.cmd("Input.dispatchMouseEvent", {
                            type: "mousePressed", x, y, button: "left", clickCount: 2
                        });
                        await this.cmd("Input.dispatchMouseEvent", {
                            type: "mouseReleased", x, y, button: "left", clickCount: 2
                        });
                    }
                });

                // P2 Enhancement: Wait for and switch to new tab if opened
                if (willOpenNewTab && newTabPromise) {
                    try {
                        console.log('[MouseActions] Waiting for new tab to open...');
                        const newTab = await newTabPromise;
                        console.log(`[MouseActions] New tab opened: ${newTab.id}`);

                        // Wait a bit for the new tab to start loading
                        await new Promise(r => setTimeout(r, 500));

                        // Switch to the new tab
                        await this.connection.switchToTab(newTab.id, true);
                        console.log(`[MouseActions] Switched to new tab ${newTab.id}`);

                        // Update status overlay
                        if (this.controlOverlay) {
                            await this.controlOverlay.updateStatus(`Switched to new tab (Tab ${newTab.id})`);
                        }
                    } catch (tabErr) {
                        console.warn('[MouseActions] Failed to handle new tab:', tabErr.message);
                        // Don't fail the click - the link might have opened in same tab
                    }
                }

                // Clear highlights after successful click
                if (this.controlOverlay) {
                    await this.controlOverlay.clearHighlights();
                }

                const result = `Clicked element ${uid} at ${Math.round(x)},${Math.round(y)}${dblClick ? ' (Double Click)' : ''}`;
                return willOpenNewTab ? `${result}\nNew tab opened and switched automatically.` : result;

            } catch (e) {
                lastError = e;
                console.warn(`Physical click attempt ${attempt}/${maxRetries} failed:`, e.message);

                // Check if error is due to stale snapshot (UID not found)
                if (e.message && e.message.includes('not found in snapshot')) {
                    console.log('[SnapshotRefresh] Detected stale snapshot, refreshing...');

                    try {
                        // Refresh snapshot (P1: will use cache if DOM hasn't changed)
                        const newSnapshot = await this.snapshotManager.takeSnapshot();
                        console.log('[SnapshotRefresh] Snapshot refreshed');

                        // Throw a clear error to inform AI that page has changed
                        throw new Error(
                            `Element ${uid} not found in current snapshot. Page may have changed.\n` +
                            `Snapshot has been refreshed automatically. Please analyze the page again and use a new UID.\n\n` +
                            `Latest page structure:\n${newSnapshot}`
                        );
                    } catch (refreshError) {
                        console.error('[SnapshotRefresh] Failed to refresh snapshot:', refreshError.message);
                        // Continue with original error handling
                    }
                }

                // On last attempt, try JS fallback
                if (attempt === maxRetries) {
                    try {
                        return await this._jsClickFallback(uid, dblClick);
                    } catch (fallbackError) {
                        throw new Error(`Click failed after ${maxRetries} attempts. Last error: ${lastError.message}. Fallback error: ${fallbackError.message}`);
                    }
                }

                // Wait before retry (exponential backoff)
                await new Promise(r => setTimeout(r, retryDelay * attempt));
            }
        }

        throw lastError;
    }

    /**
     * Pre-click checks to ensure element is ready for interaction
     * @private
     */
    async _preClickChecks(uid, objectId) {
        try {
            // Check 1: Element is visible
            const isVisible = await this._isElementVisible(objectId);
            if (!isVisible) {
                console.warn(`[PreCheck] Element ${uid} is not visible, waiting...`);
                // Wait up to 3 seconds for visibility
                const visible = await this.waitHelper.waitForCondition({
                    expression: `
                        (function() {
                            const rect = this.getBoundingClientRect();
                            return rect.width > 0 && rect.height > 0 && window.getComputedStyle(this).visibility !== 'hidden';
                        }).call(this)
                    `,
                    objectId: objectId, // Enhanced waitHelper to support objectId context
                    timeout: 3000,
                    pollInterval: 100
                });
                if (!visible) {
                    throw new Error('Element is not visible');
                }
            }

            // Check 2: Element is not disabled
            const isDisabled = await this._isElementDisabled(objectId);
            if (isDisabled) {
                console.warn(`[PreCheck] Element ${uid} is disabled, waiting...`);
                // Wait up to 3 seconds for element to be enabled
                const enabled = await this.waitHelper.waitForCondition({
                    expression: `
                        (function() {
                            return !this.disabled && this.getAttribute('aria-disabled') !== 'true';
                        }).call(this)
                    `,
                    objectId: objectId,
                    timeout: 3000,
                    pollInterval: 100
                });
                if (!enabled) {
                    throw new Error('Element is disabled');
                }
            }

            // Check 3: Element is not obscured
            // Note: ElementFromPoint is global, so we need coordinates
            // We can't easily do this check inside callFunctionOn without coordinates
            // So we skip the complex obscurity check for now or handle it via box model
            /*
            const isObscured = await this._isElementObscured(uid);
            if (isObscured) {
                console.warn(`[PreCheck] Element ${uid} is obscured by another element`);
                // Try scrolling again to bring it into view
                await this.cmd("DOM.scrollIntoViewIfNeeded", { objectId });
                // Wait a bit for scroll to complete
                await new Promise(r => setTimeout(r, 300));
            }
            */

        } catch (e) {
            console.warn('[PreCheck] Check failed:', e.message);
            // Don't throw - allow click to proceed and fail naturally
        }
    }

    /**
     * Check if element is visible
     * @private
     */
    async _isElementVisible(objectId) {
        try {
            const result = await this.cmd("Runtime.callFunctionOn", {
                objectId,
                functionDeclaration: `function() {
                    const rect = this.getBoundingClientRect();
                    return rect.width > 0 && rect.height > 0;
                }`,
                returnByValue: true
            });
            return result?.result?.value === true;
        } catch (e) {
            return false;
        }
    }

    /**
     * Check if element is disabled
     * @private
     */
    async _isElementDisabled(objectId) {
        try {
            const result = await this.cmd("Runtime.callFunctionOn", {
                objectId,
                functionDeclaration: `function() {
                    return this.disabled === true || this.getAttribute('aria-disabled') === 'true';
                }`,
                returnByValue: true
            });
            return result?.result?.value === true;
        } catch (e) {
            return false;
        }
    }

    /**
     * Check if element is obscured by another element
     * @private
     */
    async _isElementObscured(uid) {
        try {
            const result = await this.cmd("Runtime.evaluate", {
                expression: `
                    (function() {
                        const el = document.querySelector('[uid="${uid}"]');
                        if (!el) return true;

                        const rect = el.getBoundingClientRect();
                        const centerX = rect.left + rect.width / 2;
                        const centerY = rect.top + rect.height / 2;
                        const topElement = document.elementFromPoint(centerX, centerY);

                        // Element is obscured if the top element is not itself or a child
                        return topElement !== el && !el.contains(topElement);
                    })()
                `,
                returnByValue: true
            });
            return result?.result?.value === true;
        } catch (e) {
            return false;
        }
    }

    /**
     * Enhanced JS click fallback with Shadow DOM support
     * @private
     */
    async _jsClickFallback(uid, dblClick = false) {
        console.log(`[JSFallback] Attempting JS click for ${uid}`);

        try {
            const objectId = await this.getObjectIdFromUid(uid);

            // Phase 1 Enhancement: Shadow DOM & Framework support
            await this.waitHelper.execute(async () => {
                const result = await this.cmd("Runtime.callFunctionOn", {
                    objectId,
                    functionDeclaration: `function() {
                        // Try to focus first
                        try { this.focus(); } catch(e) {}

                        // Handle Option clicks specially
                        if (this.tagName === 'OPTION' && this.parentElement && this.parentElement.tagName === 'SELECT') {
                            const select = this.parentElement;

                            // Respect multiple selection
                            if (select.multiple) {
                                this.selected = !this.selected;
                            } else {
                                const idx = Array.from(select.options).indexOf(this);
                                // Use prototype setter for React compatibility
                                try {
                                    const proto = window.HTMLSelectElement.prototype;
                                    const nativeSetter = Object.getOwnPropertyDescriptor(proto, "selectedIndex").set;
                                    nativeSetter.call(select, idx);
                                } catch (e) {
                                    select.selectedIndex = idx;
                                }
                            }

                            // Dispatch events on the SELECT
                            select.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                            select.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
                            select.dispatchEvent(new Event('click', { bubbles: true, composed: true }));

                            return { success: true, isOption: true };
                        }

                        // Handle Checkbox/Radio toggle logic for frameworks
                        if (this.tagName === 'INPUT' && (this.type === 'checkbox' || this.type === 'radio')) {
                             // Click often works, but if it fails to update state, we enforce it
                             // We don't force value here yet, we let click() try first
                             // But we ensure bubbling is correct
                        }

                        // Dispatch mouse events with composed: true for Shadow DOM
                        const opts = { bubbles: true, cancelable: true, view: window, composed: true };
                        this.dispatchEvent(new MouseEvent('mousedown', opts));
                        this.dispatchEvent(new MouseEvent('mouseup', opts));

                        // Click (works in Shadow DOM)
                        try {
                            this.click();
                        } catch (clickErr) {
                            // If click fails (e.g. element not interactable), ignore here
                            // We already dispatched mouse events which is often enough
                        }

                        // For radio/checkbox, sometimes click() is intercepted.
                        // If state didn't change, force it via prototype setter
                        if (this.tagName === 'INPUT' && (this.type === 'checkbox' || this.type === 'radio')) {
                             // Check if we need to force change (if framework blocked it)
                             // This is risky if the app has complex logic, but safer for automation
                             // Keeping it simple for now: rely on composed events above
                        }

                        // Double click if requested
                        if (${dblClick}) {
                            this.dispatchEvent(new MouseEvent('dblclick', opts));
                        }

                        return { success: true, shadowRoot: !!this.shadowRoot };
                    }`,
                    returnByValue: true
                });

                const value = result?.result?.value;
                if (value?.shadowRoot) {
                    console.log(`[JSFallback] Successfully clicked element in Shadow DOM`);
                }
                if (value?.isOption) {
                    console.log(`[JSFallback] Successfully selected OPTION via parent SELECT`);
                }
            });

            return `Clicked element ${uid} (JS Fallback${dblClick ? ' - Double Click' : ''})`;

        } catch (e) {
            console.error('[JSFallback] Failed:', e);
            throw new Error(`JS Fallback failed: ${e.message}`);
        }
    }

    async dragElement({ from_uid, to_uid }) {
        if (!from_uid || !to_uid) return "Error: 'from_uid' and 'to_uid' are required.";
        
        try {
            const fromObjectId = await this.getObjectIdFromUid(from_uid);
            const toObjectId = await this.getObjectIdFromUid(to_uid);
            const fromBackendNodeId = this.snapshotManager.getBackendNodeId(from_uid);
            const toBackendNodeId = this.snapshotManager.getBackendNodeId(to_uid);

            // Calculate start coordinates
            await this.cmd("DOM.scrollIntoViewIfNeeded", { objectId: fromObjectId });
            const { model: fromModel } = await this.cmd("DOM.getBoxModel", { backendNodeId: fromBackendNodeId });
            if (!fromModel || !fromModel.content) throw new Error("No box model for from_uid");
            const startX = (fromModel.content[0] + fromModel.content[4]) / 2;
            const startY = (fromModel.content[1] + fromModel.content[5]) / 2;

            // Calculate end coordinates
            await this.cmd("DOM.scrollIntoViewIfNeeded", { objectId: toObjectId });
            const { model: toModel } = await this.cmd("DOM.getBoxModel", { backendNodeId: toBackendNodeId });
            if (!toModel || !toModel.content) throw new Error("No box model for to_uid");
            const endX = (toModel.content[0] + toModel.content[4]) / 2;
            const endY = (toModel.content[1] + toModel.content[5]) / 2;

            await this.waitHelper.execute(async () => {
                // Perform Drag
                // 1. Move to start
                await this.cmd("Input.dispatchMouseEvent", { type: "mouseMoved", x: startX, y: startY });
                // 2. Press
                await this.cmd("Input.dispatchMouseEvent", { type: "mousePressed", x: startX, y: startY, button: "left", clickCount: 1 });
                
                // 3. Drag steps (simulating movement)
                const steps = 10;
                for (let i = 1; i <= steps; i++) {
                    const x = startX + (endX - startX) * (i / steps);
                    const y = startY + (endY - startY) * (i / steps);
                    await this.cmd("Input.dispatchMouseEvent", { type: "mouseMoved", x: x, y: y, button: "left" });
                    await new Promise(r => setTimeout(r, 50));
                }

                // 4. Release
                await this.cmd("Input.dispatchMouseEvent", { type: "mouseReleased", x: endX, y: endY, button: "left", clickCount: 1 });
            });

            return `Dragged element ${from_uid} to ${to_uid}.`;
        } catch (e) {
            return `Error dragging element: ${e.message}`;
        }
    }

    async hoverElement({ uid }) {
        const objectId = await this.getObjectIdFromUid(uid);
        const backendNodeId = this.snapshotManager.getBackendNodeId(uid);

        try {
            await this.cmd("DOM.scrollIntoViewIfNeeded", { objectId });
            const { model } = await this.cmd("DOM.getBoxModel", { backendNodeId });
            if (!model || !model.content) throw new Error("No box model found");

            const x = (model.content[0] + model.content[4]) / 2;
            const y = (model.content[1] + model.content[5]) / 2;

            // Hover usually doesn't trigger navigation, but we wait for DOM updates (tooltips, menus)
            await this.waitHelper.waitForStableDOM(1500, 200); 

            await this.cmd("Input.dispatchMouseEvent", {
                type: "mouseMoved", x, y
            });

            return `Hovered element ${uid} at ${Math.round(x)},${Math.round(y)}`;
        } catch (e) {
            console.warn("Hover failed:", e);
            return `Error hovering element ${uid}: ${e.message}`;
        }
    }
}
