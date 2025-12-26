
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

            const prompt = `请将网页内容重构为一份【结构化深度研报】,严格按以下格式输出:

## 1. 核心摘要
用100-200字概括网页的核心内容、背景及价值。

## 2. 知识脑图 (Markmap)
生成markmap代码块,可视化展示逻辑结构。根节点用 #,子节点用 ## 或 -。

\`\`\`markmap
# 文章主题(用实际标题替换)
## 核心板块1(如:技术架构)
  - 关键点1.1
  - 关键点1.2
## 核心板块2(如:应用场景)
  - 关键点2.1
  - 关键点2.2
## 核心板块3
  - ...
\`\`\`

## 3. 深度内容明细
将思维导图"文字化",层层拆解内容。

**格式要求**:
- 必须使用 H3(###) 和 H4(####) 标题
- 每个H4下必须有详细段落(含数据/案例/原理)
- 禁止简单列表或一句话敷衍
- 标题格式: ### 板块名:具体主题 (不要方括号)

**示例**:

### 技术架构:Serverless设计
#### 核心组件:Cloudflare Workers
在边缘计算节点运行JavaScript代码,无需管理服务器。Workers采用V8引擎隔离技术,启动时间<5ms,支持全球200+数据中心部署。相比传统Lambda,冷启动延迟降低90%。关键优势在于...(继续深入)

#### 数据存储:D1分布式数据库
Cloudflare的SQL数据库,基于SQLite构建。支持ACID事务,免费额度100K读/天。采用多区域复制策略,RPO<1秒。在本项目中用于存储邮件元数据和配置,结构设计为...(继续深入)

### 部署策略:多模态方案
#### CLI自动化部署
...

**反面示例(禁止模仿)**:
### 技术架构
- Cloudflare Workers
- D1数据库
- Pages前端
(这种简单列表是错误的!)

## 4. 总结与启示
用精炼语言总结全文,给出1-2个核心结论或启发。`;

            const displayTitle = title ? `[${title}]` : 'Current Page';
            const displayUrl = url ? `(${url})` : '';
            const linkText = title && url ? `${displayTitle}${displayUrl}` : (title || url || 'Current Page');

            // Add Suggestion Instructions (No visible heading, block only)
            const promptWithSuggestions = prompt + `

---

**重要**:回答完上述4个部分后,必须在末尾生成3个追问问题。

要求:
1. 短小精悍(≤20字),直击好奇心/痛点
2. 侧重"如何应用"、"底层逻辑"、"反直觉细节"
3. 避免宽泛问题(如"主要内容是什么")

严格使用此格式(不加标题,直接输出):
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
        
        // Check if there are any options (silent check - models may still be loading)
        if (!modelSelect.options || modelSelect.options.length === 0) {
            return; // Silently skip, models are loading asynchronously
        }
        
        // Check if selected index is valid
        const selectedOption = modelSelect.options[modelSelect.selectedIndex];
        if (!selectedOption) {
            return; // Silently skip
        }
        
        const tempSpan = document.createElement('span');
        Object.assign(tempSpan.style, {
            visibility: 'hidden',
            position: 'absolute',
            fontSize: '13px',
            fontWeight: '500',
            fontFamily: window.getComputedStyle(modelSelect).fontFamily,
            whiteSpace: 'nowrap'
        });
        
        tempSpan.textContent = selectedOption.text;
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

    // Intercept all links to open in new tab via parent
    document.addEventListener('click', (e) => {
        const link = e.target.closest('a');
        if (link && link.href) {
            // Check if it's an internal anchor link (optional, but good practice)
            if (link.hash && link.href.includes(window.location.href.split('#')[0])) {
                return; // Let internal anchors work normally
            }

            e.preventDefault();
            window.parent.postMessage({
                action: 'OPEN_URL',
                url: link.href
            }, '*');
        }
    });

}
