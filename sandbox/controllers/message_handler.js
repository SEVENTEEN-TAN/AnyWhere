
// sandbox/controllers/message_handler.js
import { appendMessage } from '../render/message.js';
import { cropImage } from '../../lib/crop_utils.js';
import { t } from '../core/i18n.js';
import { WatermarkRemover } from '../../lib/watermark_remover.js';

export class MessageHandler {
    constructor(sessionManager, uiController, imageManager, appController) {
        this.sessionManager = sessionManager;
        this.ui = uiController;
        this.imageManager = imageManager;
        this.app = appController; // Reference back to app for state like captureMode
        this.streamingBubble = null;
    }

    async handle(request) {
        // 0. Stream Update
        if (request.action === "GEMINI_STREAM_UPDATE") {
            this.handleStreamUpdate(request);
            return;
        }

        // 1. AI Reply
        if (request.action === "GEMINI_REPLY") {
            this.handleGeminiReply(request);
            return;
        }

        // 2. Image Fetch Result (For User Uploads)
        if (request.action === "FETCH_IMAGE_RESULT") {
            this.handleImageResult(request);
            return;
        }

        // 2.1 Generated Image Result (Proxy Fetch for Display)
        if (request.action === "GENERATED_IMAGE_RESULT") {
            await this.handleGeneratedImageResult(request);
            return;
        }

        // 3. Capture Result (Crop & OCR)
        if (request.action === "CROP_SCREENSHOT") {
            await this.handleCropResult(request);
            return;
        }

        // 4. Mode Sync (from Context Menu)
        if (request.action === "SET_SIDEBAR_CAPTURE_MODE") {
            this.app.setCaptureMode(request.mode);
            let statusText = t('selectSnip');
            if (request.mode === 'ocr') statusText = t('selectOcr');
            if (request.mode === 'screenshot_translate') statusText = t('selectTranslate');

            this.ui.updateStatus(statusText);
            return;
        }

        // 5. Quote Selection Result
        if (request.action === "SELECTION_RESULT") {
            this.handleSelectionResult(request);
            return;
        }

        // 6. Page Context Toggle (from Context Menu)
        if (request.action === "TOGGLE_PAGE_CONTEXT") {
            this.app.setPageContext(request.enable);
            return;
        }

        // 7. MCP Config Response (Legacy removed)
        // Was: if (typeof request === 'string' && request.includes('"mcpServers"')) ...


        // 8. MCP Tools Response (for backwards compatibility)
        if (request.tools) {
            this.handleMcpTools(request.tools);
            return;
        }

        // 9. MCP Status Response (for new MCP picker)
        if (request.servers) {
            this.app.mcp.handleMcpStatus(request.servers);
            return;
        }
    }



    // Legacy method - kept for backwards compatibility but no longer injects text
    injectMcpContext(selectedServers) {
        // Now handled by MCPController - just update selections
        if (!selectedServers || selectedServers.length === 0) return;
        selectedServers.forEach(server => {
            this.app.mcp.selectMcp(server.name);
        });
    }

    handleMcpTools(tools) {
        if (!tools || tools.length === 0) {
            alert(t('noToolsFound') || "No MCP tools found. Please configure a server first.");
            return;
        }

        // Show a simple selection UI (e.g., prompt or temporary modal)
        // For MVP, let's create a temporary modal logic here or delegate to UI
        // Since we don't have a dedicated Tools Modal class yet, we can create one dynamically
        // or just append tool definitions to input for now as per plan.

        // Let's create a dynamic modal for better UX
        this.showToolPicker(tools);
    }

    showToolPicker(tools) {
        const modalId = 'mcp-tool-picker';
        let modal = document.getElementById(modalId);
        if (modal) modal.remove();

        modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'settings-modal visible';
        modal.style.zIndex = '2000';

        const content = document.createElement('div');
        content.className = 'settings-content';
        content.style.maxWidth = '500px';
        content.style.maxHeight = '80vh';
        content.style.display = 'flex';
        content.style.flexDirection = 'column';

        // Header
        const header = document.createElement('div');
        header.className = 'settings-header';
        header.innerHTML = `<h3>Select Tools to Use</h3>
            <div style="display:flex;gap:8px;">
                <button class="btn-primary small" id="mcp-confirm-btn">Insert Selected</button>
                <button class="icon-btn small close-pc">✕</button>
            </div>`;

        // Body (Scrollable)
        const body = document.createElement('div');
        body.className = 'settings-body';
        body.style.flex = '1';
        body.style.overflowY = 'auto';

        // Render Tools with Checkboxes
        tools.forEach((tool, index) => {
            const item = document.createElement('label');
            item.className = 'shortcut-row';
            item.style.cursor = 'pointer';
            item.style.padding = '8px';
            item.style.borderRadius = '6px';
            item.style.marginBottom = '4px';
            item.style.border = '1px solid var(--border-color)';
            item.style.display = 'flex';
            item.style.alignItems = 'center';
            item.onmouseover = () => item.style.background = 'var(--bg-input)';
            item.onmouseout = () => item.style.background = 'transparent';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = index;
            checkbox.style.marginRight = '12px';
            checkbox.style.width = '16px';
            checkbox.style.height = '16px';

            const info = document.createElement('div');
            info.style.flex = '1';
            info.innerHTML = `
                <div style="font-weight:600; font-size:14px;">${tool.name}</div>
                <div style="font-size:12px;color:var(--text-tertiary); margin-top:2px;">${tool.description || 'No description'}</div>
                <div style="font-size:10px;color:var(--text-tertiary); margin-top:2px; font-family:monospace;">Server: ${tool._serverId}</div>
            `;

            item.appendChild(checkbox);
            item.appendChild(info);
            body.appendChild(item);
        });

        content.appendChild(header);
        content.appendChild(body);
        modal.appendChild(content);
        document.body.appendChild(modal);

        // Event Listeners
        const confirmBtn = modal.querySelector('#mcp-confirm-btn');
        confirmBtn.onclick = () => {
            const checkboxes = body.querySelectorAll('input[type="checkbox"]:checked');
            const selectedTools = Array.from(checkboxes).map(cb => tools[cb.value]);

            if (selectedTools.length > 0) {
                this.injectTools(selectedTools);
            }
            modal.remove();
        };

        modal.querySelector('.close-pc').onclick = () => modal.remove();
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    }

    // Legacy method - kept for backwards compatibility but no longer injects text
    injectTools(selectedTools) {
        // The new flow uses MCPController to track selected servers
        // Tool details are sent via mcpIds in the request
        if (!selectedTools || selectedTools.length === 0) return;

        // Extract unique server IDs and select them
        const serverIds = new Set(selectedTools.map(t => t._serverId).filter(Boolean));
        serverIds.forEach(id => this.app.mcp.selectMcp(id));
    }

    handleStreamUpdate(request) {
        // If we don't have a bubble yet, create one
        if (!this.streamingBubble) {
            // Get current MCP IDs from controller
            const mcpIds = this.app.mcp ? this.app.mcp.getSelectedMcpIds() : [];
            const currentModel = this.app.getSelectedModel();
            this.streamingBubble = appendMessage(this.ui.historyDiv, "", 'ai', null, "", mcpIds, currentModel);
        }

        // Update content if text or thoughts exist
        this.streamingBubble.update(request.text, request.thoughts);

        // Ensure UI state reflects generation
        if (!this.app.isGenerating) {
            this.app.isGenerating = true;
            this.ui.setLoading(true);
        }
    }

    handleGeminiReply(request) {
        this.app.isGenerating = false;
        this.ui.setLoading(false);

        const session = this.sessionManager.getCurrentSession();
        if (session) {
            // Note: We do NOT save to sessionManager/storage here anymore.
            // The background script saves the AI response to storage and broadcasts 'SESSIONS_UPDATED'.
            // The AppController handles that broadcast to keep data in sync.
            // We just ensure the UI is visually complete here.

            const currentModel = this.app.getSelectedModel(); // Pass model for display

            if (request.status === 'success') {
                // Although session data comes from background, we might want to ensure context matches locally
                // just in case further user prompts happen before SESSIONS_UPDATED arrives (rare)
                this.sessionManager.updateContext(session.id, request.context);
            }

            // Get MCP IDs from controller
            const mcpIds = this.app.mcp ? this.app.mcp.getSelectedMcpIds() : [];

            // Update UI
            if (this.streamingBubble) {
                // Finalize the streaming bubble with complete text and thoughts
                this.streamingBubble.update(request.text, request.thoughts);

                // Set MCP badges
                if (mcpIds.length > 0) {
                    this.streamingBubble.setMcpIds(mcpIds);
                }

                // Inject images if any
                if (request.images && request.images.length > 0) {
                    this.streamingBubble.addImages(request.images);
                }

                if (request.status !== 'success') {
                    // Optionally style error
                }

                // Clear reference
                this.streamingBubble = null;
            } else {
                // Fallback if no stream occurred (or single short response)
                appendMessage(this.ui.historyDiv, request.text, 'ai', request.images, request.thoughts, mcpIds, currentModel);
            }
        }
    }

    handleImageResult(request) {
        this.ui.updateStatus("");
        if (request.error) {
            console.error("Image fetch failed", request.error);
            this.ui.updateStatus(t('failedLoadImage'));
            setTimeout(() => this.ui.updateStatus(""), 3000);
        } else {
            this.imageManager.setFile(request.base64, request.type, request.name);
        }
    }

    async handleGeneratedImageResult(request) {
        // Find the placeholder image by ID
        const img = document.querySelector(`img[data-req-id="${request.reqId}"]`);
        if (img) {
            if (request.base64) {
                try {
                    // Apply Watermark Removal
                    const cleanedBase64 = await WatermarkRemover.process(request.base64);
                    img.src = cleanedBase64;
                } catch (e) {
                    console.warn("Watermark removal failed, using original", e);
                    img.src = request.base64;
                }

                img.classList.remove('loading');
                img.style.minHeight = "auto";
            } else {
                // Handle error visually
                img.style.background = "#ffebee"; // Light red
                img.alt = "Failed to load image";
                console.warn("Generated image load failed:", request.error);
            }
        }
    }

    async handleCropResult(request) {
        this.ui.updateStatus(t('processingImage'));
        try {
            const croppedBase64 = await cropImage(request.image, request.area);
            this.imageManager.setFile(croppedBase64, 'image/png', 'snip.png');

            if (this.app.captureMode === 'ocr') {
                // Change prompt to localized OCR instructions
                this.ui.inputFn.value = t('ocrPrompt');
                // Auto-send via the main controller
                this.app.handleSendMessage();
            } else if (this.app.captureMode === 'screenshot_translate') {
                // Change prompt to localized Translate instructions
                this.ui.inputFn.value = t('screenshotTranslatePrompt');
                this.app.handleSendMessage();
            } else {
                this.ui.updateStatus("");
                this.ui.inputFn.focus();
            }
        } catch (e) {
            console.error("Crop error", e);
            this.ui.updateStatus(t('errorScreenshot'));
        }
    }

    handleSelectionResult(request) {
        if (request.text && request.text.trim()) {
            const quote = `> ${request.text.trim()}\n\n`;
            const input = this.ui.inputFn;
            // Append to new line if text exists
            input.value = input.value ? input.value + "\n\n" + quote : quote;
            input.focus();
            // Trigger resize
            input.dispatchEvent(new Event('input'));
        } else {
            this.ui.updateStatus(t('noTextSelected'));
            setTimeout(() => this.ui.updateStatus(""), 2000);
        }
    }

    // Called by AppController on cancel/switch
    resetStream() {
        if (this.streamingBubble) {
            this.streamingBubble = null;
        }
    }
}
