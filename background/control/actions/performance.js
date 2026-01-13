
// background/control/actions/performance.js
import { BaseActionHandler } from './base.js';
import { TraceProcessor } from '../../lib/trace_processor.js';

export class PerformanceActions extends BaseActionHandler {
    
    constructor(connection, snapshotManager, waitHelper) {
        super(connection, snapshotManager, waitHelper);
        this.isRunning = false;
    }

    async startTrace({ reload = false } = {}) {
        if (this.isRunning) {
            return "Error: A performance trace is already running. Use stop_trace first.";
        }

        try {
            // Standard categories used by Lighthouse/DevTools
            const categories = [
                '-*', 'blink.console', 'blink.user_timing', 'devtools.timeline', 
                'disabled-by-default-devtools.screenshot', 'loading', 
                'latencyInfo', 'v8.execute', 'disabled-by-default-lighthouse'
            ].join(',');

            await this.connection.startTracing(categories);
            this.isRunning = true;

            let msg = "Performance trace started.";
            
            if (reload) {
                const tabId = this.connection.currentTabId;
                if (tabId) {
                    await chrome.tabs.reload(tabId);
                    msg += " Page reloading...";
                }
            }

            return msg;
        } catch (e) {
            this.isRunning = false;
            return `Error starting trace: ${e.message}`;
        }
    }

    async stopTrace(args = {}) {
        if (!this.isRunning) {
            return "Error: No trace is currently running.";
        }

        try {
            const rawEvents = await this.connection.stopTracing();
            this.isRunning = false;

            const result = TraceProcessor.process(rawEvents);
            const summary = TraceProcessor.formatSummary(result);

            // Store result in memory if we wanted to support analyze_insight later
            // this.lastTrace = result;

            return summary;
        } catch (e) {
            this.isRunning = false;
            return `Error stopping trace: ${e.message}`;
        }
    }

    async analyzeInsight({ insightName }) {
        // Since we don't have the full CDT backend, we provide static guidance based on metrics
        // or simple heuristics implemented in TraceProcessor.
        return `Insight analysis for '${insightName}' requires the full Chrome DevTools frontend logic which is simulated here. Please refer to the metrics summary provided by stop_trace.`;
    }
}
