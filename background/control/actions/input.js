
// background/control/actions/input.js
import { BaseActionHandler } from './base.js';
import { MouseActions } from './input/mouse.js';
import { KeyboardActions } from './input/keyboard.js';
import { FileActions } from './input/file.js';

export class InputActions extends BaseActionHandler {
    constructor(connection, snapshotManager, waitHelper, controlOverlay = null) {
        super(connection, snapshotManager, waitHelper);
        this.mouse = new MouseActions(connection, snapshotManager, waitHelper, controlOverlay);
        this.keyboard = new KeyboardActions(connection, snapshotManager, waitHelper);
        this.file = new FileActions(connection, snapshotManager, waitHelper);
    }

    async clickElement(args) { return this.mouse.clickElement(args); }
    async dragElement(args) { return this.mouse.dragElement(args); }
    async hoverElement(args) { return this.mouse.hoverElement(args); }
    
    async fillElement(args) { return this.keyboard.fillElement(args); }
    
    async fillForm({ elements }) {
        if (!elements || !Array.isArray(elements)) {
            return "Error: 'elements' array is required for fill_form.";
        }

        const results = [];
        for (const item of elements) {
            try {
                // Reuse the robust fillElement logic (including wait helper)
                // fillElement expects { uid, value }
                if (!item.uid || item.value === undefined) {
                    results.push(`Skipped invalid item: ${JSON.stringify(item)}`);
                    continue;
                }
                const res = await this.keyboard.fillElement(item);
                results.push(res);
            } catch (e) {
                results.push(`Failed to fill element ${item.uid}: ${e.message}`);
            }
        }

        return `Form filled:\n${results.join('\n')}`;
    }

    async pressKey(args) { return this.keyboard.pressKey(args); }
    
    async attachFile(args) { return this.file.attachFile(args); }

    async handleDialog({ accept = true, promptText }) {
        try {
            await this.cmd("Page.handleJavaScriptDialog", {
                accept: accept,
                promptText: promptText
            });
            return `Dialog handled (accept: ${accept}).`;
        } catch (e) {
            return `Error handling dialog: ${e.message}. (Is a dialog open?)`;
        }
    }
}
