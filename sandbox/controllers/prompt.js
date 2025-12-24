
// sandbox/controllers/prompt.js
import { appendMessage } from '../render/message.js';
import { sendToBackground, saveSessionsToStorage } from '../../lib/messaging.js';
import { t } from '../core/i18n.js';

export class PromptController {
    constructor(sessionManager, uiController, imageManager, appController) {
        this.sessionManager = sessionManager;
        this.ui = uiController;
        this.imageManager = imageManager;
        this.app = appController;
    }

    async send() {
        if (this.app.isGenerating) return;

        const text = this.ui.inputFn.value.trim();
        const files = this.imageManager.getFiles();

        if (!text && files.length === 0) return;

        // Clear inputs immediately
        this.ui.resetInput();
        this.imageManager.clearFile();

        await this.executePrompt(text, files, {
            includePageContext: this.app.pageContextActive,
            enableBrowserControl: this.app.browserControlActive,
            mcpIds: this.app.mcp.getSelectedMcpIds()
        });
    }

    async executePrompt(text, files, options = {}) {
        if (this.app.isGenerating) return;

        const includePageContext = options.includePageContext !== undefined ? options.includePageContext : this.app.pageContextActive;
        const enableBrowserControl = options.enableBrowserControl !== undefined ? options.enableBrowserControl : this.app.browserControlActive;
        const mcpIds = options.mcpIds || [];
        // New: displayPrompt allows showing a different message in UI/Storage than what is sent to LLM
        const displayPrompt = options.displayPrompt || text;

        if (!this.sessionManager.currentSessionId) {
            this.sessionManager.createSession();
        }

        const currentId = this.sessionManager.currentSessionId;
        const session = this.sessionManager.getCurrentSession();

        // Update Title if needed
        if (session.messages.length === 0) {
            const newTitle = options.sessionTitle || displayPrompt || t('imageSent');
            const titleUpdate = this.sessionManager.updateTitle(currentId, newTitle);
            if (titleUpdate) this.app.sessionFlow.refreshHistoryUI();
        }

        // Render User Message
        const displayAttachments = files.map(f => f.base64);

        appendMessage(
            this.ui.historyDiv,
            displayPrompt,
            'user',
            displayAttachments.length > 0 ? displayAttachments : null,
            null,  // thoughts
            mcpIds // MCP IDs
        );

        this.sessionManager.addMessage(currentId, 'user', displayPrompt, displayAttachments.length > 0 ? displayAttachments : null);

        saveSessionsToStorage(this.sessionManager.sessions);
        this.app.sessionFlow.refreshHistoryUI();

        // Prepare Context & Model
        const selectedModel = options.forceModel || this.app.getSelectedModel();

        if (session.context) {
            sendToBackground({
                action: "SET_CONTEXT",
                context: session.context,
                model: selectedModel
            });
        }

        this.app.isGenerating = true;
        this.ui.setLoading(true);

        sendToBackground({
            action: "SEND_PROMPT",
            text: text,
            files: files, // Send full file objects array
            model: selectedModel,
            includePageContext: includePageContext,
            enableBrowserControl: enableBrowserControl,
            mcpIds: mcpIds, // MCP servers to activate
            sessionId: currentId
        });
    }

    cancel() {
        if (!this.app.isGenerating) return;

        sendToBackground({ action: "CANCEL_PROMPT" });
        this.app.messageHandler.resetStream();

        this.app.isGenerating = false;
        this.ui.setLoading(false);
        this.ui.updateStatus(t('cancelled'));
    }
}
