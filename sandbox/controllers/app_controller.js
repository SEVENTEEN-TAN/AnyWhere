
// sandbox/controllers/app_controller.js
import { MessageHandler } from './message_handler.js';
import { SessionFlowController } from './session_flow.js';
import { PromptController } from './prompt.js';
import { MCPController } from './mcp_controller.js';
import { GemsController } from './gems_controller.js';
import { ModelsController } from './models_controller.js';
import { t } from '../core/i18n.js';
import { saveSessionsToStorage, sendToBackground } from '../../lib/messaging.js';

export class AppController {
    constructor(sessionManager, uiController, imageManager) {
        this.sessionManager = sessionManager;
        this.ui = uiController;
        this.imageManager = imageManager;

        this.captureMode = 'snip';
        this.isGenerating = false;
        this.pageContextActive = false;
        this.browserControlActive = false;

        // Sidebar Restore Behavior: 'auto', 'restore', 'new'
        this.sidebarRestoreBehavior = 'auto';

        // Initialize Message Handler
        this.messageHandler = new MessageHandler(
            sessionManager,
            uiController,
            imageManager,
            this
        );

        // Initialize Sub-Controllers
        this.sessionFlow = new SessionFlowController(sessionManager, uiController, this);
        this.prompt = new PromptController(sessionManager, uiController, imageManager, this);
        this.mcp = new MCPController(this);
        this.gems = new GemsController();
        this.models = new ModelsController();
    }
    
    // Initialize Models and Gems after DOM is ready
    initializeGems() {
        // Register model selects for Models and Gems population
        const modelSelect = document.getElementById('model-select');
        if (modelSelect) {
            this.models.registerModelSelects([modelSelect]);
            this.gems.registerModelSelects([modelSelect]);
            
            // Fetch Models first, then Gems
            this.models.fetchModels(false)
                .then(() => {
                    console.log('[AppController] Models fetched successfully');
                    // Update Gemini API with dynamic model configs
                    return import('../../services/gemini_api.js');
                })
                .then(module => {
                    const models = this.models.getAllModels();
                    if (models.length > 0 && module.updateModelConfigs) {
                        module.updateModelConfigs(models);
                    }
                })
                .catch(err => {
                    console.error('[AppController] Failed to fetch Models:', err);
                });
            
            // Fetch Gems
            this.gems.fetchGems(false).catch(err => {
                console.error('[AppController] Failed to fetch Gems:', err);
            });
        } else {
            console.warn('[AppController] Model select not found, initialization delayed');
        }
    }

    setCaptureMode(mode) {
        this.captureMode = mode;
    }

    togglePageContext() {
        this.pageContextActive = !this.pageContextActive;
        this.ui.chat.togglePageContext(this.pageContextActive);

        if (this.pageContextActive) {
            this.ui.updateStatus(t('pageContextEnabled'));
            setTimeout(() => { if (!this.isGenerating) this.ui.updateStatus(""); }, 2000);
        }
    }

    setPageContext(enable) {
        if (this.pageContextActive !== enable) {
            this.togglePageContext();
        } else if (enable) {
            this.ui.updateStatus(t('pageContextActive'));
            setTimeout(() => { if (!this.isGenerating) this.ui.updateStatus(""); }, 2000);
        }
    }

    toggleBrowserControl() {
        this.browserControlActive = !this.browserControlActive;
        const btn = document.getElementById('browser-control-btn');
        if (btn) {
            btn.classList.toggle('active', this.browserControlActive);
        }

        if (this.browserControlActive) {
            // Disable page context if browser control is on (optional preference, 
            // but usually commands don't need full page context context)
            // For now, keeping them independent.
        }
    }

    // --- Delegation to Sub-Controllers ---

    handleNewChat() {
        this.sessionFlow.handleNewChat();
    }

    switchToSession(sessionId) {
        this.sessionFlow.switchToSession(sessionId);
    }

    rerender() {
        const currentId = this.sessionManager.currentSessionId;
        if (currentId) {
            this.switchToSession(currentId);
        }
    }

    getSelectedModel() {
        const modelValue = this.ui.modelSelect ? this.ui.modelSelect.value : "gemini-2.5-flash";
        return this.gems.getBaseModel(modelValue);
    }
    
    getSelectedGemId() {
        const modelValue = this.ui.modelSelect ? this.ui.modelSelect.value : null;
        return this.gems.getGemIdFromValue(modelValue);
    }

    getSelectedGemName() {
        const gemId = this.getSelectedGemId();
        return gemId ? this.gems.getGemName(gemId) : null;
    }

    handleModelChange(model) {
        window.parent.postMessage({ action: 'SAVE_MODEL', payload: model }, '*');
    }

    handleDeleteSession(sessionId) {
        this.sessionFlow.handleDeleteSession(sessionId);
    }

    async getActiveTabInfo() {
        return new Promise((resolve) => {
            this.pendingTabInfoResolver = resolve;
            sendToBackground({ action: "GET_ACTIVE_TAB_INFO" });

            // Timeout safety
            setTimeout(() => {
                if (this.pendingTabInfoResolver) {
                    this.pendingTabInfoResolver({ title: "", url: "" });
                    this.pendingTabInfoResolver = null;
                }
            }, 2000);
        });
    }

    handleCancel() {
        this.prompt.cancel();
    }

    handleSendMessage() {
        this.prompt.send();
    }

    // --- Event Handling ---

    async handleIncomingMessage(event) {
        const { action, payload } = event.data;

        if (action === 'RESTORE_SIDEBAR_BEHAVIOR') {
            this.sidebarRestoreBehavior = payload;
            // Update UI settings panel
            this.ui.settings.updateSidebarBehavior(payload);
            return;
        }

        // Restore Sessions
        if (action === 'RESTORE_SESSIONS') {
            console.log("[AppController] ===== 恢复会话列表 =====");
            console.log("[AppController] 会话数量:", payload ? payload.length : 0);
            if (payload && payload.length > 0) {
                console.log("[AppController] 最近会话标题:", payload[0].title);
            }
            
            this.sessionManager.setSessions(payload || []);
            this.sessionFlow.refreshHistoryUI();
            
            console.log("[AppController] 已刷新侧边栏UI");
            console.log("[AppController] ==========================\n");

            const currentId = this.sessionManager.currentSessionId;
            const currentSessionExists = this.sessionManager.getCurrentSession();

            // If we are initializing (no current session yet), apply the behavior logic
            if (!currentId || !currentSessionExists) {
                const sorted = this.sessionManager.getSortedSessions();

                let shouldRestore = false;

                if (this.sidebarRestoreBehavior === 'new') {
                    shouldRestore = false;
                } else if (this.sidebarRestoreBehavior === 'restore') {
                    shouldRestore = true;
                } else {
                    // 'auto' mode: Restore if last active within 10 minutes
                    if (sorted.length > 0) {
                        const lastActive = sorted[0].timestamp;
                        const now = Date.now();
                        const tenMinutes = 10 * 60 * 1000;
                        if (now - lastActive < tenMinutes) {
                            shouldRestore = true;
                        }
                    }
                }

                if (shouldRestore && sorted.length > 0) {
                    this.switchToSession(sorted[0].id);
                } else {
                    this.handleNewChat();
                }
            }
            return;
        }

        if (action === 'BACKGROUND_MESSAGE') {
            if (payload.action === 'SWITCH_SESSION') {
                this.switchToSession(payload.sessionId);
                return;
            }
            if (payload.action === 'ACTIVE_TAB_INFO') {
                if (this.pendingTabInfoResolver) {
                    this.pendingTabInfoResolver(payload);
                    this.pendingTabInfoResolver = null;
                }
                return;
            }
            await this.messageHandler.handle(payload);
        }
    }

    // Kept for simple access if needed by message_handler, 
    // though now sessionFlow handles refresh.
    persistSessions() {
        saveSessionsToStorage(this.sessionManager.sessions);
    }

    handleFileUpload(files) {
        this.imageManager.handleFiles(files);
    }

    // handleMcpSelection removed (legacy)

}
