// background/handlers/session/prompt_handler.js
import { appendAiMessage, appendUserMessage } from '../../managers/history_manager.js';
import { PromptBuilder } from './prompt/builder.js';
import { ToolExecutor } from './prompt/tool_executor.js';
import { CheckpointManager } from './prompt/checkpoint_manager.js';

export class PromptHandler {
    constructor(sessionManager, controlManager) {
        this.sessionManager = sessionManager;
        this.builder = new PromptBuilder(controlManager);
        this.toolExecutor = new ToolExecutor(controlManager);

        // Initialize CheckpointManager for task segmentation
        this.checkpointManager = new CheckpointManager({
            stateStore: controlManager?.stateStore,
            segmentSize: 5,  // Generate summary every 5 loops
            maxSegments: 8   // Max 40 steps total (8 * 5)
        });

        // Pass checkpointManager to toolExecutor
        if (this.toolExecutor) {
            this.toolExecutor.checkpointManager = this.checkpointManager;
        }
    }

    handle(request, sendResponse) {
        (async () => {
            const onUpdate = (partialText, partialThoughts) => {
                // Catch errors if receiver (UI) is closed/unavailable
                chrome.runtime.sendMessage({
                    action: "GEMINI_STREAM_UPDATE",
                    text: partialText,
                    thoughts: partialThoughts
                }).catch(() => {}); 
            };

            try {
                // 1. Build Initial Prompt (with Preamble/Context)
                let currentPromptText = await this.builder.build(request);
                let currentFiles = request.files;

                // Get MAX_LOOPS from request or settings (default: 40 for long tasks)
                const MAX_LOOPS = request.maxLoops || 40;
                let loopCount = 0;
                let keepLooping = true;

                // Clear checkpoint manager for new task
                this.checkpointManager.clear();

                // --- AUTOMATED FEEDBACK LOOP with Checkpointing ---
                while (keepLooping && loopCount < MAX_LOOPS) {
                    // Check if exceeded max segments
                    if (this.checkpointManager.hasExceededMaxSegments(loopCount)) {
                        onUpdate(
                            "Task requires user confirmation to continue",
                            `Reached maximum automated segment limit (${this.checkpointManager.maxSegments} segments). Please review progress and restart if needed.`
                        );
                        break;
                    }

                    // 2. Send to Gemini
                    const result = await this.sessionManager.handleSendPrompt({
                        ...request,
                        text: currentPromptText,
                        files: currentFiles
                    }, onUpdate);

                    if (!result || result.status !== 'success') {
                        // If error, notify UI and break loop
                        if (result) chrome.runtime.sendMessage(result).catch(() => {});
                        break;
                    }

                    // 3. Save AI Response to History
                    if (request.sessionId) {
                        await appendAiMessage(request.sessionId, result);
                    }

                    // Notify UI of the result (replaces streaming bubble)
                    chrome.runtime.sendMessage(result).catch(() => {});

                    // 4. Process Tool Execution (if any)
                    let toolResult = null;
                    if (request.enableBrowserControl) {
                        toolResult = await this.toolExecutor.executeIfPresent(result.text, onUpdate);
                    }

                    // 5. Decide Next Step
                    if (toolResult) {
                        // Tool executed, feed back to model (Loop continues)
                        loopCount++;

                        // Record loop in checkpoint manager
                        this.checkpointManager.recordLoop({
                            loopCount,
                            toolName: toolResult.toolName,
                            output: toolResult.output,
                            success: true,
                            snapshotHash: toolResult.snapshotHash,
                            url: toolResult.url
                        });

                        currentFiles = toolResult.files || []; // Send new files if any, or clear previous files

                        // Check if we should generate segment summary
                        if (this.checkpointManager.shouldPauseForSegment(loopCount)) {
                            const startLoop = Math.max(0, loopCount - this.checkpointManager.segmentSize);
                            const summary = await this.checkpointManager.composeSegmentSummary(startLoop, loopCount);

                            // Prepend summary to next prompt
                            currentPromptText = `${summary.text}

[Tool Output from ${toolResult.toolName}]:
\`\`\`
${toolResult.output}
\`\`\`

(Continue with the next steps based on the progress above)`;
                        } else {
                            // Format observation for the model
                            currentPromptText = `[Tool Output from ${toolResult.toolName}]:
\`\`\`
${toolResult.output}
\`\`\`

(Proceed with the next step or confirm completion)`;
                        }

                        // Save "User" message (Tool Output) to history to keep context in sync
                        if (request.sessionId) {
                            const userMsg = `🛠️ **Tool Output:**
\`\`\`
${toolResult.output}
\`\`\`

*(Proceeding to step ${loopCount + 1})*`;

                            let historyImages = toolResult.files ? toolResult.files.map(f => f.base64) : null;
                            await appendUserMessage(request.sessionId, userMsg, historyImages);
                        }

                        // Update UI status
                        const segmentInfo = this.checkpointManager.getCurrentSegment() > 0
                            ? ` (Segment ${this.checkpointManager.getCurrentSegment()})`
                            : '';
                        onUpdate("Gemini is thinking...", `Observed output from tool. Planning next step (${loopCount}/${MAX_LOOPS})${segmentInfo}...`);

                    } else {
                        // No tool execution, final answer reached
                        keepLooping = false;
                    }
                }

            } catch (e) {
                console.error("Prompt loop error:", e);
                chrome.runtime.sendMessage({
                    action: "GEMINI_REPLY",
                    text: "Error: " + e.message,
                    status: "error"
                }).catch(() => {});
            } finally {
                // Clean up browser control overlay when task completes
                if (request.enableBrowserControl && this.builder.controlManager) {
                    await this.builder.controlManager.disableControlMode();
                    console.log('[PromptHandler] Browser control disabled after task completion');
                }
                sendResponse({ status: "completed" });
            }
        })();
        return true;
    }
}
