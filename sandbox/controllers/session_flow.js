
// sandbox/controllers/session_flow.js
import { appendMessage } from '../render/message.js';
import { sendToBackground, saveSessionsToStorage } from '../../lib/messaging.js';
import { t } from '../core/i18n.js';

export class SessionFlowController {
    constructor(sessionManager, uiController, appController) {
        this.sessionManager = sessionManager;
        this.ui = uiController;
        this.app = appController;
    }

    handleNewChat() {
        if (this.app.isGenerating) this.app.prompt.cancel();

        this.app.messageHandler.resetStream();
        if (this.app.applyDefaultModelIfAvailable) {
            this.app.applyDefaultModelIfAvailable();
        }

        const s = this.sessionManager.createSession();
        s.title = t('newChat');
        this.switchToSession(s.id);
    }

    switchToSession(sessionId) {
        if (this.app.isGenerating) this.app.prompt.cancel();

        this.app.messageHandler.resetStream();
        this.sessionManager.setCurrentId(sessionId);

        const session = this.sessionManager.getCurrentSession();
        if (!session) return;

        this.ui.clearChatHistory();
        session.messages.forEach(msg => {
            let attachment = null;
            if (msg.role === 'user') attachment = msg.image;
            if (msg.role === 'ai') attachment = msg.generatedImages;
            if (msg.role === 'ai') attachment = msg.generatedImages;
            // Pass msg.thoughts and msg.model(new) to appendMessage
            appendMessage(this.ui.historyDiv, msg.text, msg.role, attachment, msg.thoughts, null, msg.model);
        });
        this.ui.scrollToBottom();
        // Double check scroll after a short delay to account for rendering/layout shifts
        setTimeout(() => this.ui.scrollToBottom(), 300);

        if (session.context) {
            sendToBackground({
                action: "SET_CONTEXT",
                context: session.context,
                model: this.app.getSelectedModel()
            });
        } else {
            sendToBackground({ action: "RESET_CONTEXT" });
        }

        this.refreshHistoryUI();
        this.ui.resetInput();
    }

    refreshHistoryUI() {
        this.ui.renderHistoryList(
            this.sessionManager.getSortedSessions(),
            this.sessionManager.currentSessionId,
            {
                onSwitch: (id) => this.switchToSession(id),
                onDelete: (id) => this.handleDeleteSession(id),
                onRename: (id, newTitle) => this.handleRenameSession(id, newTitle)
            }
        );
    }

    handleRenameSession(sessionId, newTitle) {
        if (!newTitle || !newTitle.trim()) return;
        const success = this.sessionManager.renameSession(sessionId, newTitle);
        if (success) {
            saveSessionsToStorage(this.sessionManager.sessions);
            this.refreshHistoryUI();
        }
    }

    async handleDeleteSession(sessionId) {
        console.log('[SessionFlow] Deleting session:', sessionId);
        
        // Get conversationId for server-side deletion
        const conversationId = this.sessionManager.getConversationId(sessionId);
        
        // Delete from local storage first
        const switchNeeded = this.sessionManager.deleteSession(sessionId);
        saveSessionsToStorage(this.sessionManager.sessions);

        // Delete from server if we have conversationId
        if (conversationId) {
            console.log('[SessionFlow] Deleting from server:', conversationId);
            sendToBackground({
                action: 'DELETE_SESSION_FROM_SERVER',
                conversationId: conversationId,
                sessionId: sessionId
            });
        } else {
            console.log('[SessionFlow] 会话未同步到服务器(无conversationId),仅删除本地数据');
        }

        if (switchNeeded) {
            if (this.sessionManager.sessions.length > 0) {
                this.switchToSession(this.sessionManager.currentSessionId);
            } else {
                this.handleNewChat();
            }
        } else {
            this.refreshHistoryUI();
        }
    }
}
