
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
            mcpIds: this.app.mcp.getSelectedMcpIds(),
            gemId: this.app.getSelectedGemId() // Get Gem ID from selected model
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
        // Only update title if sessionTitle is explicitly provided (e.g., from summarize feature)
        // Otherwise, let Gemini API auto-generate the title after the first response
        if (session.messages.length === 0 && options.sessionTitle) {
            const titleUpdate = this.sessionManager.updateTitle(currentId, options.sessionTitle);
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

        // Get Gem ID from the selected model (if it's a Gem)
        let effectiveGemId = options.gemId || this.app.getSelectedGemId();

        if (selectedModel === 'gem' && !effectiveGemId) {
            console.warn('[PromptController] Gem model selected but no Gem ID found!');
        }

        if (session.context) {
            sendToBackground({
                action: "SET_CONTEXT",
                context: session.context,
                model: selectedModel
            });
        }

        this.app.isGenerating = true;
        this.ui.setLoading(true);

        const payload = {
            action: "SEND_PROMPT",
            text: text,
            files: files, // Send full file objects array
            model: selectedModel,
            includePageContext: includePageContext,
            // Pass pre-selected content from element picker (if available)
            pageContextContent: includePageContext && this.app.pickedElementContent ? this.app.pickedElementContent : null,
            enableBrowserControl: enableBrowserControl,
            mcpIds: mcpIds, // MCP servers to activate
            gemId: effectiveGemId, // Pass Gem ID (required for 'gem' model)
            sessionId: currentId
        };

        console.log("[PromptController] ========== 发送消息 ==========");
        console.log("[PromptController] 用户输入:", displayPrompt);
        console.log("[PromptController] 模型:", selectedModel);
        console.log("[PromptController] Gem ID:", effectiveGemId || '无');
        console.log("[PromptController] 附件数量:", files.length);
        console.log("[PromptController] MCP 服务:", mcpIds);
        console.log("[PromptController] 完整Payload:", JSON.stringify(payload, null, 2));
        console.log("[PromptController] =====================================\n");

        sendToBackground(payload);
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
