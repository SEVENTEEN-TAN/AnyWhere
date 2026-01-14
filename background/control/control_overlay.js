
// background/control/control_overlay.js
/**
 * Control Overlay - Blocks page interaction during AI automation
 * Shows breathing glow effect with Pause/Continue controls
 */

export class ControlOverlay {
    constructor(connection) {
        this.connection = connection;
        this.isVisible = false;
        this.isPaused = false;  // Track if automation is paused
    }

    /**
     * Show control overlay - BLOCKS user interaction
     * AI is in control, user cannot interact with page
     */
    async show() {
        if (this.isVisible) return;
        this.isVisible = true;
        this.isPaused = false;

        try {
            await this.connection.sendCommand("Runtime.evaluate", {
                expression: `
                    (function() {
                        // Remove existing overlay if any
                        const existing = document.getElementById('gemini-control-overlay');
                        if (existing) existing.remove();

                        // Create full-screen blocking overlay
                        const overlay = document.createElement('div');
                        overlay.id = 'gemini-control-overlay';
                        overlay.style.cssText = \`
                            position: fixed;
                            top: 0;
                            left: 0;
                            right: 0;
                            bottom: 0;
                            background: radial-gradient(circle at center, rgba(59, 130, 246, 0.15) 0%, rgba(59, 130, 246, 0.05) 100%);
                            backdrop-filter: blur(2px);
                            z-index: 999998;
                            pointer-events: auto;
                            display: flex;
                            flex-direction: column;
                            align-items: center;
                            justify-content: flex-end;
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                            animation: breathe 3s ease-in-out infinite;
                        \`;

                        // Add styles
                        if (!document.getElementById('gemini-control-styles')) {
                            const style = document.createElement('style');
                            style.id = 'gemini-control-styles';
                            style.textContent = \`
                                @keyframes breathe {
                                    0%, 100% {
                                        opacity: 1;
                                    }
                                    50% {
                                        opacity: 0.8;
                                    }
                                }
                                
                                #gemini-control-panel {
                                    background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
                                    border-top: 3px solid #3b82f6;
                                    box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.2);
                                    padding: 20px 32px;
                                    margin-bottom: 0;
                                    width: 100%;
                                    max-width: 600px;
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                    gap: 16px;
                                    animation: slideUp 0.4s ease-out;
                                    pointer-events: auto;
                                }
                                
                                @keyframes slideUp {
                                    from {
                                        transform: translateY(100%);
                                        opacity: 0;
                                    }
                                    to {
                                        transform: translateY(0);
                                        opacity: 1;
                                    }
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
                                
                                .control-btn:active {
                                    transform: translateY(0);
                                }
                                
                                .control-btn.pause {
                                    background: #f59e0b;
                                    color: white;
                                }
                                
                                .control-btn.pause:hover {
                                    background: #d97706;
                                }
                                
                                .control-btn.continue {
                                    background: #3b82f6;
                                    color: white;
                                }
                                
                                .control-btn.continue:hover {
                                    background: #2563eb;
                                }
                                
                                .control-status {
                                    flex: 1;
                                    color: #1f2937;
                                    font-size: 14px;
                                    display: flex;
                                    align-items: center;
                                    gap: 12px;
                                    font-weight: 500;
                                }

                                .status-content {
                                    flex: 1;
                                    display: flex;
                                    flex-direction: column;
                                    gap: 6px;
                                }

                                .progress-bar {
                                    width: 100%;
                                    height: 4px;
                                    background: #e5e7eb;
                                    border-radius: 2px;
                                    overflow: hidden;
                                }

                                .progress-fill {
                                    height: 100%;
                                    background: linear-gradient(90deg, #3b82f6 0%, #60a5fa 100%);
                                    border-radius: 2px;
                                    transition: width 0.3s ease;
                                    width: 0%;
                                }
                                
                                .status-indicator {
                                    width: 10px;
                                    height: 10px;
                                    background: #3b82f6;
                                    border-radius: 50%;
                                    animation: pulse 2s ease-in-out infinite;
                                }
                                
                                .status-indicator.paused {
                                    background: #f59e0b;
                                    animation: none;
                                }
                                
                                @keyframes pulse {
                                    0%, 100% {
                                        opacity: 1;
                                        transform: scale(1);
                                    }
                                    50% {
                                        opacity: 0.5;
                                        transform: scale(1.3);
                                    }
                                }
                                
                                /* Disable all page interactions */
                                body.gemini-control-active > *:not(#gemini-control-overlay),
                                body.gemini-control-active *:not(#gemini-control-overlay):not(#gemini-control-overlay *) {
                                    pointer-events: none !important;
                                }
                            \`;
                            document.head.appendChild(style);
                        }

                        // Create control panel
                        const panel = document.createElement('div');
                        panel.id = 'gemini-control-panel';

                        // Status indicator with progress bar
                        const status = document.createElement('div');
                        status.className = 'control-status';
                        status.innerHTML = \`
                            <span class="status-indicator"></span>
                            <div class="status-content">
                                <span id="control-status-text">AI is controlling the browser...</span>
                                <div id="control-progress-bar" class="progress-bar" style="display: none;">
                                    <div class="progress-fill"></div>
                                </div>
                            </div>
                        \`;

                        // Pause button
                        const pauseBtn = document.createElement('button');
                        pauseBtn.className = 'control-btn pause';
                        pauseBtn.id = 'gemini-pause-btn';
                        const pauseText = window.chrome?.i18n?.getMessage('overlay_pause') || '⏸ Pause';
                        pauseBtn.innerHTML = pauseText;

                        pauseBtn.addEventListener('click', () => {
                            window.__geminiControlAction = 'pause';
                        });

                        // Continue button
                        const continueBtn = document.createElement('button');
                        continueBtn.className = 'control-btn continue';
                        continueBtn.id = 'gemini-continue-btn';
                        const continueText = window.chrome?.i18n?.getMessage('overlay_continue') || '▶ Continue';
                        continueBtn.innerHTML = continueText;
                        continueBtn.style.display = 'none';  // Hidden by default

                        continueBtn.addEventListener('click', () => {
                            // Immediate visual feedback
                            continueBtn.disabled = true;
                            const resumingText = window.chrome?.i18n?.getMessage('overlay_resuming') || 'Resuming...';
                            continueBtn.innerHTML = resumingText;
                            continueBtn.style.opacity = '0.7';
                            continueBtn.style.cursor = 'wait';

                            window.__geminiControlAction = 'continue';

                            // Safety timeout to reset button if background script crashes/timeouts
                            setTimeout(() => {
                                if (continueBtn.disabled) {
                                    continueBtn.disabled = false;
                                    const continueText = window.chrome?.i18n?.getMessage('overlay_continue') || '▶ Continue';
                                    continueBtn.innerHTML = continueText;
                                    continueBtn.style.opacity = '1';
                                    continueBtn.style.cursor = 'pointer';
                                }
                            }, 5000);
                        });

                        panel.appendChild(status);
                        panel.appendChild(pauseBtn);
                        panel.appendChild(continueBtn);
                        overlay.appendChild(panel);

                        // Disable page interaction
                        document.body.classList.add('gemini-control-active');
                        document.body.appendChild(overlay);
                        
                        window.__geminiControlState = {
                            overlay,
                            panel,
                            pauseBtn,
                            continueBtn,
                            statusText: document.getElementById('control-status-text'),
                            statusIndicator: status.querySelector('.status-indicator'),
                            progressBar: document.getElementById('control-progress-bar'),
                            progressFill: document.querySelector('.progress-fill')
                        };
                    })()
                `
            });
        } catch (e) {
            // Silent fail if debugger session is closed (tab closed/refreshed)
            if (e.message?.includes('No active debugger session')) {
                console.log('[ControlOverlay] Debugger session closed, overlay not shown');
                this.isVisible = false;
            } else {
                console.error('[ControlOverlay] Failed to show overlay:', e);
                this.isVisible = false;
            }
        }
    }

    /**
     * Pause automation - Allow user to interact with page
     * @param {string} message - Optional custom message to display
     */
    async pause(message = null) {
        if (!this.isVisible || this.isPaused) return;
        this.isPaused = true;

        try {
            await this.connection.sendCommand("Runtime.evaluate", {
                expression: `
                    (function() {
                        const state = window.__geminiControlState;
                        if (!state) return;

                        // Change status with custom message or default
                        const customMessage = ${message ? `'${message.replace(/'/g, "\\'").replace(/\n/g, '\\n')}'` : 'null'};
                        state.statusText.innerHTML = customMessage || 'Paused - You can interact with the page';
                        state.statusIndicator.classList.add('paused');

                        // Make panel more prominent for user intervention
                        if (customMessage) {
                            state.panel.style.borderTop = '3px solid #ef4444';  // Red border for errors
                            state.panel.style.maxWidth = '700px';  // Wider for error messages
                            state.statusText.style.color = '#dc2626';  // Red text
                            state.statusText.style.fontWeight = '600';  // Bold
                            state.statusText.style.fontSize = '15px';  // Larger
                        }

                        // Swap buttons
                        state.pauseBtn.style.display = 'none';
                        state.continueBtn.style.display = 'flex';

                        // Reset continue button state
                        state.continueBtn.disabled = false;
                        const continueText = window.chrome?.i18n?.getMessage('overlay_continue') || '▶ Continue';
                        state.continueBtn.innerHTML = continueText;
                        state.continueBtn.style.opacity = '1';
                        state.continueBtn.style.cursor = 'pointer';

                        // Remove blur effect when paused
                        state.overlay.style.backdropFilter = 'none';
                        state.overlay.style.animation = 'none';  // Stop breathing animation

                        // Enable page interaction
                        document.body.classList.remove('gemini-control-active');
                        state.overlay.style.pointerEvents = 'none';
                        state.panel.style.pointerEvents = 'auto';
                    })()
                `
            });
        } catch (e) {
            // Silent fail if debugger session is closed
            if (e.message?.includes('No active debugger session')) {
                console.log('[ControlOverlay] Debugger session closed, cannot pause');
            } else {
                console.error('[ControlOverlay] Failed to pause:', e);
            }
        }
    }

    /**
     * Continue automation - AI takes control again
     */
    async continue() {
        if (!this.isVisible || !this.isPaused) return;
        this.isPaused = false;

        try {
            await this.connection.sendCommand("Runtime.evaluate", {
                expression: `
                    (function() {
                        const state = window.__geminiControlState;
                        if (!state) return;

                        // Change status
                        state.statusText.textContent = 'AI is controlling the browser...';
                        state.statusIndicator.classList.remove('paused');

                        // Swap buttons
                        state.continueBtn.style.display = 'none';
                        state.pauseBtn.style.display = 'flex';

                        // Reset continue button state (for next time)
                        state.continueBtn.disabled = false;
                        const continueText = window.chrome?.i18n?.getMessage('overlay_continue') || '▶ Continue';
                        state.continueBtn.innerHTML = continueText;
                        state.continueBtn.style.opacity = '1';
                        state.continueBtn.style.cursor = 'pointer';

                        // Restore blur effect when continuing
                        state.overlay.style.backdropFilter = 'blur(2px)';
                        state.overlay.style.animation = 'breathe 3s ease-in-out infinite';  // Resume breathing animation

                        // Disable page interaction again
                        document.body.classList.add('gemini-control-active');
                        state.overlay.style.pointerEvents = 'auto';
                    })()
                `
            });
        } catch (e) {
            // Silent fail if debugger session is closed
            if (e.message?.includes('No active debugger session')) {
                console.log('[ControlOverlay] Debugger session closed, cannot continue');
            } else {
                console.error('[ControlOverlay] Failed to continue:', e);
            }
        }
    }

    /**
     * Update status message
     */
    async updateStatus(message) {
        if (!this.isVisible) return;

        try {
            await this.connection.sendCommand("Runtime.evaluate", {
                expression: `
                    (function() {
                        const state = window.__geminiControlState;
                        if (state && state.statusText) {
                            state.statusText.textContent = '${message.replace(/'/g, "\\'")}';
                        }
                    })()
                `
            });
        } catch (e) {
            // Silent fail if debugger session is closed
            if (e.message?.includes('No active debugger session')) {
                // Expected when tab is closed/refreshed, no need to log
            } else {
                console.warn('[ControlOverlay] Failed to update status:', e.message);
            }
        }
    }

    /**
     * Update progress with optional detailed status
     * @param {Object} options - Progress options
     * @param {number} options.current - Current step
     * @param {number} options.total - Total steps
     * @param {string} [options.message] - Status message
     * @param {number} [options.percentage] - Direct percentage (overrides current/total)
     */
    async updateProgress(options = {}) {
        if (!this.isVisible) return;

        const { current, total, message, percentage } = options;

        // Calculate percentage
        let percent = percentage;
        if (percent === undefined && current !== undefined && total !== undefined) {
            percent = total > 0 ? Math.round((current / total) * 100) : 0;
        }

        try {
            await this.connection.sendCommand("Runtime.evaluate", {
                expression: `
                    (function() {
                        const state = window.__geminiControlState;
                        if (!state) return;

                        // Update message if provided
                        ${message ? `
                            if (state.statusText) {
                                const stepInfo = ${current !== undefined && total !== undefined}
                                    ? '[${current}/${total}] '
                                    : '';
                                state.statusText.textContent = stepInfo + '${message.replace(/'/g, "\\'")}';
                            }
                        ` : ''}

                        // Update progress bar
                        if (${percent !== undefined}) {
                            if (state.progressBar) {
                                state.progressBar.style.display = 'block';
                            }
                            if (state.progressFill) {
                                state.progressFill.style.width = '${percent}%';
                            }
                        }
                    })()
                `
            });
        } catch (e) {
            if (e.message?.includes('No active debugger session')) {
                // Expected when tab is closed/refreshed
            } else {
                console.warn('[ControlOverlay] Failed to update progress:', e.message);
            }
        }
    }

    /**
     * Hide progress bar
     */
    async hideProgress() {
        if (!this.isVisible) return;

        try {
            await this.connection.sendCommand("Runtime.evaluate", {
                expression: `
                    (function() {
                        const state = window.__geminiControlState;
                        if (state && state.progressBar) {
                            state.progressBar.style.display = 'none';
                            if (state.progressFill) {
                                state.progressFill.style.width = '0%';
                            }
                        }
                    })()
                `
            });
        } catch (e) {
            // Silent fail
        }
    }

    /**
     * Show click feedback (ripple effect) at specific coordinates
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {string} type - 'click' or 'dblclick'
     */
    async showClickFeedback(x, y, type = 'click') {
        if (!this.connection.attached) return;

        try {
            await this.connection.sendCommand("Runtime.evaluate", {
                expression: `
                    (function() {
                        const ripple = document.createElement('div');
                        ripple.className = 'gemini-click-ripple';
                        ripple.style.cssText = \`
                            position: fixed;
                            left: ${x}px;
                            top: ${y}px;
                            width: 20px;
                            height: 20px;
                            background: rgba(59, 130, 246, 0.6);
                            background: var(--primary, #0b57d0);
                            border-radius: 50%;
                            transform: translate(-50%, -50%) scale(0);
                            pointer-events: none;
                            z-index: 1000000;
                            box-shadow: 0 0 10px rgba(59, 130, 246, 0.8);
                        \`;

                        ripple.setAttribute('aria-hidden', 'true');

                        if (!document.getElementById('gemini-click-styles')) {
                            const style = document.createElement('style');
                            style.id = 'gemini-click-styles';
                            style.textContent = \`
                                @media (prefers-reduced-motion: no-preference) {
                                    @keyframes ripple-effect {
                                        0% {
                                            transform: translate(-50%, -50%) scale(0);
                                            opacity: 1;
                                        }
                                        100% {
                                            transform: translate(-50%, -50%) scale(2.5);
                                            opacity: 0;
                                        }
                                    }
                                }
                            \`;
                            document.head.appendChild(style);
                        }

                        // Only animate if user prefers motion
                        if (window.matchMedia('(prefers-reduced-motion: no-preference)').matches) {
                            ripple.style.animation = 'ripple-effect ${type === 'dblclick' ? '0.6s' : '0.4s'} ease-out forwards';
                        } else {
                             // Fallback for reduced motion: just flash
                             ripple.style.transform = 'translate(-50%, -50%) scale(1)';
                             ripple.style.opacity = '1';
                             setTimeout(() => ripple.style.opacity = '0', 200);
                        }

                        document.body.appendChild(ripple);

                        if ('${type}' === 'dblclick' && window.matchMedia('(prefers-reduced-motion: no-preference)').matches) {
                            setTimeout(() => {
                                const ripple2 = ripple.cloneNode(true);
                                ripple2.style.animation = 'ripple-effect 0.4s ease-out forwards';
                                document.body.appendChild(ripple2);
                                setTimeout(() => ripple2.remove(), 400);
                            }, 100);
                        }

                        setTimeout(() => ripple.remove(), 600);
                    })()
                `
            });
        } catch (e) {
            console.warn('[ControlOverlay] Failed to show click feedback:', e.message);
        }
    }

    /**
     * Highlight an element before interaction
     * @param {number} backendNodeId - Backend node ID of the element
     * @param {string} action - Action description (e.g., "Clicking 'Submit'...")
     * @param {number} duration - Highlight duration in ms (default: 800)
     */
    async highlightElement(backendNodeId, action = '', duration = 800) {
        if (!this.connection.attached) return;

        try {
            // Get box model for the element
            const { model } = await this.connection.sendCommand("DOM.getBoxModel", { backendNodeId });
            if (!model || !model.content) return;

            // Calculate coordinates
            const x = (model.content[0] + model.content[4]) / 2;
            const y = (model.content[1] + model.content[5]) / 2;
            const width = Math.abs(model.content[4] - model.content[0]);
            const height = Math.abs(model.content[5] - model.content[1]);

            // Draw highlight
            await this.connection.sendCommand("Runtime.evaluate", {
                expression: `
                    (function() {
                        // Remove existing highlights
                        const existing = document.querySelectorAll('.gemini-element-highlight');
                        existing.forEach(el => el.remove());

                        // Create highlight overlay
                        const highlight = document.createElement('div');
                        highlight.className = 'gemini-element-highlight';
                        highlight.style.cssText = \`
                            position: fixed;
                            left: ${model.content[0]}px;
                            top: ${model.content[1]}px;
                            width: ${width}px;
                            height: ${height}px;
                            border: 3px solid #facc15;
                            background: rgba(250, 204, 21, 0.15);
                            border-radius: 8px;
                            z-index: 999999;
                            pointer-events: none;
                            box-shadow: 0 0 20px rgba(250, 204, 21, 0.5), inset 0 0 20px rgba(250, 204, 21, 0.3);
                            animation: gemini-pulse 0.8s ease-in-out;
                        \`;

                        // Add action label if provided
                        ${action ? `
                            const label = document.createElement('div');
                            label.style.cssText = \`
                                position: absolute;
                                top: -36px;
                                left: 50%;
                                transform: translateX(-50%);
                                background: linear-gradient(135deg, #facc15 0%, #f59e0b 100%);
                                color: #000;
                                padding: 6px 14px;
                                border-radius: 6px;
                                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                                font-size: 13px;
                                font-weight: 600;
                                white-space: nowrap;
                                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
                                z-index: 1000000;
                            \`;
                            label.textContent = '${action.replace(/'/g, "\\'")}';
                            highlight.appendChild(label);
                        ` : ''}

                        // Add pulse animation
                        if (!document.getElementById('gemini-highlight-styles')) {
                            const style = document.createElement('style');
                            style.id = 'gemini-highlight-styles';
                            style.textContent = \`
                                @keyframes gemini-pulse {
                                    0%, 100% {
                                        transform: scale(1);
                                        opacity: 1;
                                    }
                                    50% {
                                        transform: scale(1.05);
                                        opacity: 0.8;
                                    }
                                }
                            \`;
                            document.head.appendChild(style);
                        }

                        document.body.appendChild(highlight);

                        // Auto-remove after duration
                        setTimeout(() => {
                            highlight.remove();
                        }, ${duration});
                    })()
                `
            });

            // Small delay to let user see the highlight
            await new Promise(r => setTimeout(r, Math.min(duration, 500)));
        } catch (e) {
            console.warn('[ControlOverlay] Failed to highlight element:', e.message);
            // Don't throw - continue with action even if highlight fails
        }
    }

    /**
     * Clear all element highlights
     */
    async clearHighlights() {
        if (!this.connection.attached) return;

        try {
            await this.connection.sendCommand("Runtime.evaluate", {
                expression: `
                    (function() {
                        const highlights = document.querySelectorAll('.gemini-element-highlight');
                        highlights.forEach(el => el.remove());
                    })()
                `
            });
        } catch (e) {
            // Silent fail
        }
    }

    /**
     * Hide control overlay completely
     */
    async hide() {
        if (!this.isVisible) return;
        this.isVisible = false;
        this.isPaused = false;

        try {
            await this.connection.sendCommand("Runtime.evaluate", {
                expression: `
                    (function() {
                        const overlay = document.getElementById('gemini-control-overlay');
                        const styles = document.getElementById('gemini-control-styles');
                        
                        if (overlay) overlay.remove();
                        if (styles) styles.remove();
                        
                        document.body.classList.remove('gemini-control-active');
                        delete window.__geminiControlState;
                        delete window.__geminiControlAction;
                    })()
                `
            });
        } catch (e) {
            // Silent fail if debugger session is closed
            if (e.message?.includes('No active debugger session')) {
                console.log('[ControlOverlay] Debugger session closed, overlay already gone');
            } else {
                console.warn('[ControlOverlay] Failed to hide overlay:', e.message);
            }
        }
    }
}
