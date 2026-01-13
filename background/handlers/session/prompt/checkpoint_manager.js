// background/handlers/session/prompt/checkpoint_manager.js

/**
 * CheckpointManager - Manages task segmentation and phase summaries
 *
 * Responsibilities:
 * - Determine when to pause for segment summary
 * - Generate structured segment summaries
 * - Persist checkpoint data
 * - Support long-running tasks (>10 steps)
 */
export class CheckpointManager {
    constructor(options = {}) {
        this.stateStore = options.stateStore || null;
        this.segmentSize = options.segmentSize || 5; // Generate summary every N loops
        this.maxSegments = options.maxSegments || 8; // Max 40 steps total (8 * 5)
        this.currentSegment = 0;
        this.loopHistory = [];
        this.segmentSummaries = [];
    }

    /**
     * Check if we should pause for segment summary
     */
    shouldPauseForSegment(loopCount) {
        // Pause at every segmentSize boundary
        return loopCount > 0 && loopCount % this.segmentSize === 0;
    }

    /**
     * Check if we've exceeded max segments
     */
    hasExceededMaxSegments(loopCount) {
        const segmentNum = Math.ceil(loopCount / this.segmentSize);
        return segmentNum > this.maxSegments;
    }

    /**
     * Record loop iteration
     */
    recordLoop(loopData) {
        this.loopHistory.push({
            ...loopData,
            timestamp: Date.now()
        });
    }

    /**
     * Get current segment number
     */
    getCurrentSegment() {
        return this.currentSegment;
    }

    /**
     * Compose segment summary from loop history
     */
    async composeSegmentSummary(startLoop, endLoop) {
        const segmentLoops = this.loopHistory.slice(startLoop, endLoop);

        // Extract tool calls
        const toolCalls = segmentLoops
            .filter(loop => loop.toolName)
            .map(loop => ({
                tool: loop.toolName,
                step: loop.loopCount,
                success: loop.success ?? true,
                output: loop.output ? this._truncateOutput(loop.output) : null
            }));

        // Extract page states
        const pageStates = segmentLoops
            .filter(loop => loop.snapshotHash)
            .map(loop => ({
                step: loop.loopCount,
                hash: loop.snapshotHash,
                url: loop.url
            }));

        // Compose summary
        const summary = {
            segment: this.currentSegment + 1,
            startLoop,
            endLoop,
            totalLoops: endLoop - startLoop,
            toolCalls,
            pageStates,
            timestamp: Date.now()
        };

        // Generate human-readable summary text
        summary.text = this._generateSummaryText(summary);

        // Store summary
        this.segmentSummaries.push(summary);
        this.currentSegment += 1;

        // Persist to state store
        if (this.stateStore) {
            await this.stateStore.appendEvent({
                type: 'segment_summary',
                summary
            });
        }

        console.log(`[CheckpointManager] Segment ${summary.segment} summary generated`);
        return summary;
    }

    /**
     * Generate human-readable summary text
     */
    _generateSummaryText(summary) {
        const lines = [];

        lines.push(`**Segment ${summary.segment} Summary** (Steps ${summary.startLoop + 1}-${summary.endLoop})`);
        lines.push('');

        if (summary.toolCalls.length > 0) {
            lines.push('**Actions taken:**');
            summary.toolCalls.forEach(call => {
                const status = call.success ? '✓' : '✗';
                lines.push(`- ${status} Step ${call.step}: ${call.tool}`);
                if (call.output && call.output.length > 0) {
                    lines.push(`  → ${call.output}`);
                }
            });
            lines.push('');
        }

        if (summary.pageStates.length > 0) {
            const uniquePages = new Set(summary.pageStates.map(s => s.url).filter(Boolean));
            if (uniquePages.size > 0) {
                lines.push('**Pages visited:**');
                uniquePages.forEach(url => {
                    lines.push(`- ${url}`);
                });
                lines.push('');
            }
        }

        return lines.join('\n');
    }

    /**
     * Truncate output for summary
     */
    _truncateOutput(output, maxLength = 100) {
        if (typeof output !== 'string') {
            output = JSON.stringify(output);
        }

        if (output.length <= maxLength) {
            return output;
        }

        return output.substring(0, maxLength) + '...';
    }

    /**
     * Get all segment summaries
     */
    getAllSummaries() {
        return [...this.segmentSummaries];
    }

    /**
     * Get latest segment summary
     */
    getLatestSummary() {
        return this.segmentSummaries[this.segmentSummaries.length - 1] || null;
    }

    /**
     * Create checkpoint with segment summaries
     */
    async createCheckpoint(label) {
        if (!this.stateStore) {
            throw new Error('CheckpointManager requires stateStore to create checkpoints');
        }

        const checkpoint = await this.stateStore.saveCheckpoint(label, {
            currentSegment: this.currentSegment,
            segmentSummaries: this.segmentSummaries,
            loopHistory: this.loopHistory
        });

        return checkpoint;
    }

    /**
     * Restore from checkpoint
     */
    async restoreCheckpoint(label) {
        if (!this.stateStore) {
            throw new Error('CheckpointManager requires stateStore to restore checkpoints');
        }

        const checkpoint = await this.stateStore.restoreCheckpoint(label);

        if (checkpoint.currentSegment !== undefined) {
            this.currentSegment = checkpoint.currentSegment;
        }
        if (checkpoint.segmentSummaries) {
            this.segmentSummaries = checkpoint.segmentSummaries;
        }
        if (checkpoint.loopHistory) {
            this.loopHistory = checkpoint.loopHistory;
        }

        console.log(`[CheckpointManager] Restored from checkpoint: ${label}`);
        return checkpoint;
    }

    /**
     * Generate continuation prompt based on segment summaries
     */
    generateContinuationPrompt() {
        if (this.segmentSummaries.length === 0) {
            return null;
        }

        const lines = [];
        lines.push('# Task Progress Summary');
        lines.push('');
        lines.push(`You have completed ${this.currentSegment} segments. Here is what has been accomplished:`);
        lines.push('');

        this.segmentSummaries.forEach(summary => {
            lines.push(summary.text);
        });

        lines.push('');
        lines.push('Please continue with the next steps of the task based on the progress above.');

        return lines.join('\n');
    }

    /**
     * Clear all data
     */
    clear() {
        this.currentSegment = 0;
        this.loopHistory = [];
        this.segmentSummaries = [];
    }

    /**
     * Get statistics
     */
    getStats() {
        return {
            currentSegment: this.currentSegment,
            totalLoops: this.loopHistory.length,
            totalSummaries: this.segmentSummaries.length,
            segmentSize: this.segmentSize,
            maxSegments: this.maxSegments
        };
    }
}
