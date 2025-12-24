
// sandbox/boot/events.js
import { sendToBackground } from '../../lib/messaging.js';
import { t } from '../core/i18n.js';

export function bindAppEvents(app, ui, setResizeRef) {
    // New Chat Buttons
    document.getElementById('new-chat-header-btn').addEventListener('click', () => app.handleNewChat());

    // Open Full Page Button
    const openFullPageBtn = document.getElementById('open-full-page-btn');
    if (openFullPageBtn) {
        openFullPageBtn.addEventListener('click', () => {
            window.parent.postMessage({ action: 'OPEN_FULL_PAGE' }, '*');
        });
    }

    // Tools Row Navigation
    const toolsRow = document.getElementById('tools-row');
    const scrollLeftBtn = document.getElementById('tools-scroll-left');
    const scrollRightBtn = document.getElementById('tools-scroll-right');

    if (toolsRow && scrollLeftBtn && scrollRightBtn) {
        scrollLeftBtn.addEventListener('click', () => {
            toolsRow.scrollBy({ left: -150, behavior: 'smooth' });
        });
        scrollRightBtn.addEventListener('click', () => {
            toolsRow.scrollBy({ left: 150, behavior: 'smooth' });
        });
    }

    // Tools

    // Summarize Button
    // Summarize Button (Combined with MindMap)
    const summarizeBtn = document.getElementById('summarize-btn');
    if (summarizeBtn) {
        summarizeBtn.addEventListener('click', async () => { // Make async
            ui.setLoading(true); // Show loading immediately to give feedback
            const { title, url } = await app.getActiveTabInfo();
            ui.setLoading(false);

            const prompt = `请将网页内容重构为一份【结构化深度研报】。
请严格按照以下顺序和格式输出：

## 1. 核心摘要
简明扼要地概括网页的核心内容、背景及价值（100-200字）。

## 2. 知识脑图 (Markmap)
请生成一个 **markmap** 代码块，可视化展示文章的逻辑结构。
根节点使用一级标题 (#)，子节点使用二级标题 (##) 或 列表项 (-)。

\`\`\`markmap
# 核心主题
## 核心板块 1
- 关键细节 1.1
- 关键细节 1.2
## 核心板块 2
...
\`\`\`

## 3. 深度内容明细
请像“思维导图文字化”一样，层层拆解内容。
**要求**：必须使用 **H3 (###)** 标题列出具体细节，并在每个 H3 下填充**详尽的段落解析**（包含数据、案例、原理解释），拒绝简单的列表或一句话概括。

### [核心板块 1：主要观点]
#### [关键细节 1.1：具体概念]
> 在此处深度展开...
#### [关键细节 1.2：具体概念]
> 在此处深度展开...

### [核心板块 2：主要观点]
...

## 4. 总结与启示
用精炼的语言总结全文，并给出核心结论。`;

            const displayTitle = title ? `[${title}]` : 'Current Page';
            const displayUrl = url ? `(${url})` : '';
            const linkText = title && url ? `${displayTitle}${displayUrl}` : (title || url || 'Current Page');

            // Add Suggestion Instructions (No visible heading, block only)
            const promptWithSuggestions = prompt + `

请根据页面内容，在回答末尾额外生成 3 个用户可能感兴趣的追问问题。
要求：
1. 问题应短小精悍（不超过20字），直击用户好奇心或痛点。
2. 侧重于“如何应用”、“底层逻辑”或“反直觉的细节”。
3. 避免宽泛的“主要内容是什么”。

请严格使用以下格式封装建议问题（不要添加标题或任何其他文字，直接输出标签）：
<suggestions>
["问题1", "问题2", "问题3"]
</suggestions>`;

            app.prompt.executePrompt(promptWithSuggestions, [], {
                includePageContext: true,
                displayPrompt: `总结 ${linkText}`,
                sessionTitle: title // Use page title as session title
            });
        });
    }

    // Old 'draw-btn' removed

    // Browser Control (Functional Toggle)
    const browserControlBtn = document.getElementById('browser-control-btn');
    if (browserControlBtn) {
        browserControlBtn.addEventListener('click', () => {
            app.toggleBrowserControl();
        });
    }

    document.getElementById('quote-btn').addEventListener('click', () => {
        sendToBackground({ action: "GET_ACTIVE_SELECTION" });
    });

    document.getElementById('ocr-btn').addEventListener('click', () => {
        app.setCaptureMode('ocr');
        sendToBackground({ action: "INITIATE_CAPTURE", mode: 'ocr', source: 'sidepanel' });
        ui.updateStatus(t('selectOcr'));
    });

    document.getElementById('screenshot-translate-btn').addEventListener('click', () => {
        app.setCaptureMode('screenshot_translate');
        sendToBackground({ action: "INITIATE_CAPTURE", mode: 'screenshot_translate', source: 'sidepanel' });
        ui.updateStatus(t('selectTranslate'));
    });

    document.getElementById('snip-btn').addEventListener('click', () => {
        app.setCaptureMode('snip');
        sendToBackground({ action: "INITIATE_CAPTURE", mode: 'snip', source: 'sidepanel' });
        ui.updateStatus(t('selectSnip'));
    });

    // Page Context Toggle
    const contextBtn = document.getElementById('page-context-btn');
    if (contextBtn) {
        contextBtn.addEventListener('click', () => app.togglePageContext());
    }

    // Model Selector
    const modelSelect = document.getElementById('model-select');

    // Auto-resize Logic
    const resizeModelSelect = () => {
        if (!modelSelect) return;
        const tempSpan = document.createElement('span');
        Object.assign(tempSpan.style, {
            visibility: 'hidden',
            position: 'absolute',
            fontSize: '13px',
            fontWeight: '500',
            fontFamily: window.getComputedStyle(modelSelect).fontFamily,
            whiteSpace: 'nowrap'
        });
        tempSpan.textContent = modelSelect.options[modelSelect.selectedIndex].text;
        document.body.appendChild(tempSpan);
        const width = tempSpan.getBoundingClientRect().width;
        document.body.removeChild(tempSpan);
        modelSelect.style.width = `${width + 34}px`;
    };

    if (setResizeRef) setResizeRef(resizeModelSelect); // Expose for message handler

    if (modelSelect) {
        modelSelect.addEventListener('change', (e) => {
            app.handleModelChange(e.target.value);
            resizeModelSelect();
        });
        resizeModelSelect();
    }

    // --- Action Menu Logic (Upload / MCP) ---
    const actionTrigger = document.querySelector('.action-trigger');
    const actionMenu = document.getElementById('action-menu');
    const fileInput = document.getElementById('image-input');

    if (actionTrigger && actionMenu) {
        // Toggle menu
        actionTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            actionMenu.classList.toggle('hidden');
        });

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!actionMenu.classList.contains('hidden') && !actionMenu.contains(e.target) && !actionTrigger.contains(e.target)) {
                actionMenu.classList.add('hidden');
            }
        });

        // 1. Upload Action
        const uploadItem = document.getElementById('action-upload');
        if (uploadItem && fileInput) {
            uploadItem.addEventListener('click', () => {
                fileInput.click();
                actionMenu.classList.add('hidden');
            });

            fileInput.addEventListener('change', (e) => {
                const files = e.target.files;
                if (files.length > 0) {
                    app.handleFileUpload(files);
                }
            });
        }

        // 2. MCP Action
        // Handled by mcp_controller.js now.

    }

    // Input Key Handling
    const inputFn = document.getElementById('prompt');
    const sendBtn = document.getElementById('send');

    if (inputFn && sendBtn) {
        inputFn.addEventListener('keydown', (e) => {
            // Tab Cycle Models
            if (e.key === 'Tab') {
                e.preventDefault();
                if (modelSelect) {
                    const direction = e.shiftKey ? -1 : 1;
                    const newIndex = (modelSelect.selectedIndex + direction + modelSelect.length) % modelSelect.length;
                    modelSelect.selectedIndex = newIndex;
                    modelSelect.dispatchEvent(new Event('change'));
                }
                return;
            }

            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendBtn.click();
            }
        });

        sendBtn.addEventListener('click', () => {
            if (app.isGenerating) {
                app.handleCancel();
            } else {
                app.handleSendMessage();
            }
        });
    }

    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
            e.preventDefault();
            if (inputFn) inputFn.focus();
        }
    });



    // Handle Suggestions Click
    document.addEventListener('gemini-suggestion-click', (e) => {
        const text = e.detail;
        if (text) {
            const inputFn = document.getElementById('prompt');
            if (inputFn) {
                // 1. Force enable Page Context if not already enabled
                // Suggestions are usually derived from page content, so context is needed.
                const contextBtn = document.getElementById('page-context-btn');
                if (contextBtn && !contextBtn.classList.contains('active')) {
                    // Programmatically activate context
                    app.togglePageContext(true); 
                }

                // 2. Fill and Send
                inputFn.value = text;
                const sendBtn = document.getElementById('send');
                if (sendBtn) sendBtn.click();
            }
        }
    });

}
