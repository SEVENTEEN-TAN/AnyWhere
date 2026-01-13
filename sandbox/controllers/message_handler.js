
// sandbox/controllers/message_handler.js
import { appendMessage } from '../render/message.js';
import { cropImage } from '../../lib/crop_utils.js';
import { t } from '../core/i18n.js';
import { WatermarkRemover } from '../../lib/watermark_remover.js';
import { promptTemplates } from '../prompts/summarize.js';

/**
 * ✅ P1: 添加超时保护机制
 * @param {Promise} promise - 要执行的 Promise
 * @param {number} timeoutMs - 超时时间（毫秒）
 * @returns {Promise} - 带超时保护的 Promise
 */
function promiseWithTimeout(promise, timeoutMs = 5000) {
    return Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Operation timed out')), timeoutMs)
        )
    ]);
}

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

        // 5.1 Element Picker Result
        if (request.action === "ELEMENT_PICKED") {
            this.handleElementPicked(request);
            return;
        }

        // 5.2 Element Picker Cancelled
        if (request.action === "ELEMENT_PICKER_CANCELLED") {
            this.app.pendingSummarize = false;
            this.app.pendingPageContext = false;
            this.ui.updateStatus('');
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

    // ✅ P0 修复: 使用 AbortController 管理事件监听器，防止内存泄漏
    showToolPicker(tools) {
        const modalId = 'mcp-tool-picker';
        let modal = document.getElementById(modalId);
        if (modal) {
            // 清理旧的事件监听器
            modal._abortController?.abort();
            modal.remove();
        }

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

        // 创建 AbortController 管理事件监听器
        const abortController = new AbortController();
        modal._abortController = abortController;
        const { signal } = abortController;

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

        // Event Listeners (使用 signal 自动清理)
        const confirmBtn = modal.querySelector('#mcp-confirm-btn');
        confirmBtn.addEventListener('click', () => {
            const checkboxes = body.querySelectorAll('input[type="checkbox"]:checked');
            const selectedTools = Array.from(checkboxes).map(cb => tools[cb.value]);

            if (selectedTools.length > 0) {
                this.injectTools(selectedTools);
            }
            abortController.abort();  // 清理所有监听器
            modal.remove();
        }, { signal });

        modal.querySelector('.close-pc').addEventListener('click', () => {
            abortController.abort();
            modal.remove();
        }, { signal });
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                abortController.abort();
                modal.remove();
            }
        }, { signal });
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
            const gemName = currentModel === 'gem' ? this.app.getSelectedGemName() : null;
            this.streamingBubble = appendMessage(this.ui.historyDiv, "", 'ai', null, "", mcpIds, currentModel, gemName);
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
        console.log("[MessageHandler] ========== 收到AI响应 ==========");
        console.log("[MessageHandler] 状态:", request.status);
        console.log("[MessageHandler] 文本长度:", request.text ? request.text.length : 0);
        console.log("[MessageHandler] 思考过程:", request.thoughts ? '有' : '无');
        console.log("[MessageHandler] 图片数量:", request.images ? request.images.length : 0);
        console.log("[MessageHandler] 上下文ID:", request.context?.contextIds);
        console.log("[MessageHandler] 自动生成标题:", request.title || '无');
        console.log("[MessageHandler] 完整响应:", JSON.stringify(request, null, 2));
        console.log("[MessageHandler] ========================================\n");
        // Handle error case
        if (request.isError && request.error) {
            console.warn("[MessageHandler] Error response:", request.error);
            this.app.isGenerating = false;
            this.ui.setLoading(false);

            // Display error message as AI response
            const errorText = `❌ **错误**

${request.error}`;

            if (this.streamingBubble) {
                this.streamingBubble.update(errorText, null);
                this.streamingBubble = null;
            } else {
                appendMessage(this.ui.historyDiv, errorText, 'ai', null, null, []);
            }
            return;
        }

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
                const gemName = currentModel === 'gem' ? this.app.getSelectedGemName() : null;
                appendMessage(this.ui.historyDiv, request.text, 'ai', request.images, request.thoughts, mcpIds, currentModel, gemName);
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
                    // ✅ P1: 添加超时保护（5秒）
                    const cleanedBase64 = await promiseWithTimeout(
                        WatermarkRemover.process(request.base64),
                        5000
                    );
                    img.src = cleanedBase64;
                } catch (e) {
                    console.warn("Watermark removal failed or timed out, using original", e);
                    img.src = request.base64;
                }

                img.classList.remove('loading');
                img.style.minHeight = "auto";
            } else if (request.error === "PLACEHOLDER_URL_DETECTED") {
                // Handle specific placeholder case
                img.classList.remove('loading');
                img.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NCIgaGVpZ2h0PSI2NCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiNlMGUwZTAiIHN0cm9rZS13aWR0aD0iMS41IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxyZWN0IHg9IjMiIHk9IjMiIHdpZHRoPSIxOCIgaGVpZ2h0PSIxOCIgcng9IjIiIHJ5PSIyIj48L3JlY3Q+PGNpcmNsZSBjeD0iOC41IiBjeT0iOC41IiByPSIxLjUiPjwvY2lyY2xlPjxwb2x5bGluZSBwb2ludHM9IjIxIDE1IDE2IDEwIDUgMjEiPjwvcG9seWxpbmU+PC9zdmc+';
                img.style.padding = "40px";
                img.style.background = "#f8f9fa";
                img.alt = "Image generation unavailable";
                img.title = "No image was generated for this response";
                img.style.minHeight = "150px";
                img.style.border = "1px solid #eee";
                img.style.borderRadius = "8px";
                img.style.display = "block";
                img.style.margin = "10px 0";
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

    handleElementPicked(request) {
        const payload = request.payload || request;

        if (!payload.content) {
            this.ui.updateStatus(t('noContentFound') || 'No content found in selected element');
            setTimeout(() => this.ui.updateStatus(""), 3000);
            this.app.pendingSummarize = false;
            this.app.pendingPageContext = false;
            return;
        }

        // Store the content
        this.app.pickedElementContent = payload.content;
        this.app.pickedElementSelector = payload.selector;

        const charCount = payload.content.length;
        const elementInfo = payload.elementCount > 1 ? ` (${payload.elementCount} elements)` : '';

        // Check if this is a pending summarize action
        if (this.app.pendingSummarize) {
            this.app.pendingSummarize = false;
            this.ui.updateStatus(`${t('summarizing') || 'Summarizing'} (${charCount.toLocaleString()} chars)${elementInfo}...`);

            // Execute summarize with the picked content
            this.executeSummarize(payload.content);
        } else if (this.app.pendingPageContext) {
            // Page context was requested via element picker
            this.app.pendingPageContext = false;
            const statusMsg = (t('pageContextSet') || 'Page context set') + ` (${charCount.toLocaleString()} chars)${elementInfo}`;
            this.ui.updateStatus(statusMsg);
            this.app.setPageContext(true, payload.content);
            setTimeout(() => this.ui.updateStatus(""), 3000);
            this.ui.inputFn.focus();
        } else {
            // Fallback: just set page context
            const statusMsg = (t('elementSelected') || 'Element selected') + ` (${charCount.toLocaleString()} chars)${elementInfo}`;
            this.ui.updateStatus(statusMsg);
            this.app.setPageContext(true, payload.content);
            setTimeout(() => this.ui.updateStatus(""), 3000);
            this.ui.inputFn.focus();
        }
    }

    // ✅ P2: 使用配置文件替代硬编码模板
    async executeSummarize(content) {
        // Get tab info for display
        const { title, url } = await this.app.getActiveTabInfo();
        
        // Get language setting (use navigator.language in sandbox environment)
        const lang = (navigator.language || 'en').startsWith('zh') ? 'zh' : 'en';
        const template = promptTemplates.summarize[lang];
        
        // Build prompt from template
        const structureText = `${template.structure.title}\n${template.structure.items.join('\n')}`;
        const formatText = `${template.format.title}\n${template.format.items.join('\n')}`;
        const requirementsText = `${template.requirements.title}\n${template.requirements.items.join('\n')}`;
        
        const prompt = `${template.instruction}

${structureText}

${formatText}

${requirementsText}

${template.separator}

${template.content_prefix}

${content}`;

        const displayTitle = title ? `[${title}]` : 'Selected Content';
        const displayUrl = url ? `(${url})` : '';
        const linkText = title && url ? `${displayTitle}${displayUrl}` : (title || 'Selected Content');

        this.app.prompt.executePrompt(prompt, [], {
            includePageContext: false,
            displayPrompt: `${template.display_prefix} ${linkText}`,
            sessionTitle: title || 'Summary'
        });
    }

    // Called by AppController on cancel/switch
    resetStream() {
        if (this.streamingBubble) {
            this.streamingBubble = null;
        }
    }
}
