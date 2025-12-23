
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
        summarizeBtn.addEventListener('click', () => {
            const prompt = `请对当前网页内容进行深度总结，严格按以下格式输出：

## 1. 内容概要
用2-3句话概括网页核心内容。

## 2. 知识脑图 (Markmap)
请生成一个 **markmap** 代码块，使用标准 Markdown 列表或标题层级表示思维导图结构。
根节点使用一级标题 (#)，子节点使用二级标题 (##) 或 列表项 (-)。

\`\`\`markmap
# 网页核心主题
## 关键概念A
- 细节1
- 细节2
## 关键概念B
- 细节3
- 细节4
\`\`\`

## 3. 总结
一句话核心结论。`;

            app.prompt.executePrompt(prompt, [], { includePageContext: true });
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

    // Handle custom Gemini links (opens in background tab)
    document.addEventListener('click', (e) => {
        const link = e.target.closest('.gemini-link');
        if (link) {
            e.preventDefault();
            const url = link.dataset.url;
            if (url) {
                // Send to parent (sidepanel) to forward to background
                window.parent.postMessage({
                    action: 'OPEN_TAB_BACKGROUND',
                    url: url
                }, '*');
            }
        }
    });
}
