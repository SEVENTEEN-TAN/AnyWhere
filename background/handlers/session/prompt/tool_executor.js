// background/handlers/session/prompt/tool_executor.js
import { parseToolCommand } from '../utils.js';

/**
 * ToolExecutor - Executes browser automation tools and manages execution context
 *
 * Enhanced with:
 * - State synchronization after user intervention
 * - Context information (snapshot hash, URL)
 * - CheckpointManager integration
 */
export class ToolExecutor {
    constructor(controlManager) {
        this.controlManager = controlManager;
        this.checkpointManager = null; // Will be set by PromptHandler
    }

    async executeIfPresent(text, onUpdate) {
        if (!this.controlManager) return null;

        const toolCommand = parseToolCommand(text);
        if (!toolCommand) return null;

        const toolName = toolCommand.name;
        onUpdate(`Executing tool: ${toolName}...`, "Processing tool execution...");

        let output = "";
        let files = null;

        // Check for user intervention and page changes
        const stateStore = this.controlManager.stateStore;
        const recentEvents = stateStore?.getRecentEvents(5) || [];
        const interventionEvent = recentEvents.find(e => e.type === 'page_changed_during_intervention');
        const interventionNoteEvent = recentEvents.find(e => e.type === 'user_intervention_note' && typeof e.note === 'string' && e.note.trim());

        // Record tool input to checkpoint manager (optional)
        if (this.checkpointManager) {
            this.checkpointManager.recordLoop({
                phase: 'tool_input',
                toolName,
                args: toolCommand.args,
                timestamp: Date.now()
            });
        }

        try {
            const execResult = await this.controlManager.execute({
                name: toolName,
                args: toolCommand.args || {}
            });

            // Handle structured result (image + text) which usually comes from take_screenshot
            if (execResult && typeof execResult === 'object' && execResult.image) {
                output = execResult.text;
                files = [{
                    base64: execResult.image,
                    type: "image/png",
                    name: "screenshot.png"
                }];
            } else {
                output = execResult;
            }

            // Insert state sync message if page was modified during user intervention
            if (interventionEvent) {
                console.log('[ToolExecutor] Page was modified during user intervention, notifying model');
                output = `[State Sync] ⚠️ Page was modified during user intervention. A new snapshot has been taken and selectors may have changed.

${output}`;

                // Clear intervention flag to avoid duplicate notifications
                if (stateStore) {
                    await stateStore.clearUserIntervention();
                }
            }
            if (interventionNoteEvent) {
                output = `[User Intervention Notes]\n\`\`\`\n${interventionNoteEvent.note.trim()}\n\`\`\`\n\n${output}`;
            }

        } catch (err) {
            console.error('[ToolExecutor] Tool execution error:', err);
            output = `Error executing tool: ${err.message}`;

            // Check if error is due to stale context after user intervention
            if (interventionEvent && err.message?.toLowerCase().includes('not found')) {
                output += `\n\n[Hint] This error may be caused by page changes during user intervention. Consider taking a new snapshot first.`;
            }
        }

        // Get context information for checkpoint and state tracking
        let snapshot = null;
        let snapshotHash = null;
        let url = null;

        try {
            // Get current snapshot and hash
            snapshot = await this.controlManager.getSnapshot();
            if (snapshot && stateStore) {
                snapshotHash = stateStore._hashSnapshot(snapshot);

                // Update state store with new snapshot
                await stateStore.updateSnapshot(snapshot, snapshotHash);
            }

            // Get current tab URL
            const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
            url = tab?.url || null;

            // Update last action in state store
            if (stateStore) {
                await stateStore.updateLastAction({
                    name: toolName,
                    args: toolCommand.args
                });
            }
        } catch (err) {
            console.warn('[ToolExecutor] Failed to capture context:', err);
            // Don't fail the whole execution if context capture fails
        }

        return {
            toolName,
            output,
            files,
            snapshotHash,  // Added: for page change detection
            url,           // Added: for segment summaries
            timestamp: Date.now()
        };
    }
}
