
// background/control/actions/base.js
import { WaitForHelper } from '../wait_helper.js';
import { NonRetryableError } from '../execution_watchdog.js';

export class BaseActionHandler {
    constructor(connection, snapshotManager, waitHelper) {
        this.connection = connection;
        this.snapshotManager = snapshotManager;
        // Use injected waitHelper or create new one (fallback)
        this.waitHelper = waitHelper || new WaitForHelper(connection);
    }

    // Helper: Send command via connection
    cmd(method, params) {
        return this.connection.sendCommand(method, params);
    }

    /**
     * @deprecated Use this.waitHelper.waitForStableDOM() directly
     */
    async waitForStableDOM(timeout = 3000, stabilityDuration = 500) {
        return this.waitHelper.waitForStableDOM(timeout, stabilityDuration);
    }

    async getObjectIdFromUid(uid) {
        const backendNodeId = this.snapshotManager.getBackendNodeId(uid);
        if (!backendNodeId) {
            const newSnapshot = await this.snapshotManager.takeSnapshot({ forceRefresh: true });
            throw new NonRetryableError(
                `Node with uid ${uid} not found in snapshot. The page may have changed.\n` +
                `A new snapshot has been taken. Please re-analyze and choose a new UID, or use find_by_text/find_by_css/find_by_accessibility.\n\n` +
                `Latest page structure:\n${newSnapshot}`,
                { uid, refreshed: true }
            );
        }

        // Trigger highlight for visual feedback on interaction
        this.highlight(uid).catch(() => {});

        const { object } = await this.cmd("DOM.resolveNode", { backendNodeId });
        return object.objectId;
    }

    async highlight(uid) {
        const backendNodeId = this.snapshotManager.getBackendNodeId(uid);
        if (!backendNodeId) return;

        try {
            await this.cmd("Overlay.enable");
            await this.cmd("Overlay.highlightNode", {
                backendNodeId: backendNodeId,
                highlightConfig: {
                    showInfo: true,
                    showRulers: false,
                    showExtensionLines: false,
                    contentColor: { r: 11, g: 87, b: 208, a: 0.3 }, // Gemini Blue fill
                    paddingColor: { r: 11, g: 87, b: 208, a: 0.1 },
                    borderColor: { r: 11, g: 87, b: 208, a: 0.8 }  // Border
                }
            });

            // Auto-hide after 1.5 seconds
            setTimeout(() => {
                this.cmd("Overlay.hideHighlight").catch(() => {});
            }, 1500);

        } catch (e) {
            // Ignore highlight errors (e.g. node detached)
        }
    }
}
