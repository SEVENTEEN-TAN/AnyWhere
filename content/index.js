// content.js v4.0.0 -> content/index.js

// Fix: Inline constants because Content Scripts do not support ES Module imports natively in this configuration.
const DEFAULT_SHORTCUTS = {
    quickAsk: "Ctrl+G",
    openPanel: "Alt+S"
};

console.log("%c Gemini Nexus v4.0.0 Ready ", "background: #333; color: #00ff00; font-size: 16px");

// Initialize Helpers
const selectionOverlay = new window.GeminiNexusOverlay();
const floatingToolbar = new window.GeminiToolbarController();

// State to track who requested the capture
let captureSource = null;

// Listen for messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

    // 来自右键菜单的指令
    if (request.action === "CONTEXT_MENU_ACTION") {
        if (floatingToolbar) {
            floatingToolbar.handleContextAction(request.mode);
        }
        sendResponse({ status: "ok" });
        return true;
    }

    // Focus Input
    if (request.action === "FOCUS_INPUT") {
        try {
            const inputBox = document.querySelector('div[contenteditable="true"][role="textbox"]');
            if (inputBox) {
                inputBox.focus();
                const selection = window.getSelection();
                if (selection.rangeCount > 0) selection.removeAllRanges();
                sendResponse({ status: "ok" });
            } else {
                sendResponse({ status: "error", msg: "DOM_NOT_FOUND" });
            }
        } catch (e) {
            sendResponse({ status: "error", msg: e.message });
        }
        return true;
    }

    // Start Selection Mode
    if (request.action === "START_SELECTION") {
        captureSource = request.source; // Track source (e.g. 'sidepanel')

        // 关键：在截图前隐藏所有浮动 UI，防止 UI 被截进去
        if (floatingToolbar) {
            floatingToolbar.hideAll();
            // Update the controller's mode if provided, so it knows what to do with the result (if local)
            if (request.mode) {
                floatingToolbar.currentMode = request.mode;
            }
        }
        // Passing captured image from request to overlay
        selectionOverlay.start(request.image);
        sendResponse({ status: "selection_started" });
        return true;
    }

    // 处理截图后的裁剪结果
    if (request.action === "CROP_SCREENSHOT") {
        if (captureSource === 'sidepanel') {
            // Forward back to sidepanel via background
            chrome.runtime.sendMessage({
                action: "PROCESS_CROP_IN_SIDEPANEL",
                payload: request
            });
            captureSource = null;
        } else {
            // Handle locally with floating toolbar
            if (floatingToolbar) {
                floatingToolbar.handleCropResult(request);
            }
        }
        sendResponse({ status: "ok" });
        return true;
    }

    // Handle Generated Image Result
    if (request.action === "GENERATED_IMAGE_RESULT") {
        if (floatingToolbar) {
            floatingToolbar.handleGeneratedImageResult(request);
        }
        sendResponse({ status: "ok" });
        return true;
    }

    // Get Active Selection
    if (request.action === "GET_SELECTION") {
        sendResponse({ selection: window.getSelection().toString() });
        return true;
    }

    // Start Element Picker - DevTools-like element selection
    if (request.action === "START_ELEMENT_PICKER") {
        const ElementPicker = window.GeminiElementPicker;
        const ScrollUtils = window.GeminiScrollUtils;

        if (!ElementPicker) {
            console.error("[ElementPicker] Module not loaded");
            sendResponse({ status: "error", error: "ElementPicker not loaded" });
            return true;
        }

        // Hide floating toolbar before starting picker
        if (floatingToolbar) {
            floatingToolbar.hideAll();
        }

        ElementPicker.start(async (result) => {
            if (!result) {
                // User cancelled
                console.log("[ElementPicker] User cancelled selection");
                chrome.runtime.sendMessage({
                    action: "ELEMENT_PICKER_CANCELLED"
                });
                return;
            }

            // Get elements array (new API supports multiple elements)
            const elements = result.elements || [result.element];
            console.log(`[ElementPicker] Processing ${elements.length} selected elements`);

            // Load scroll settings
            const settings = await chrome.storage.local.get(['geminiAutoScrollInterval', 'geminiAutoScrollMaxTime']);
            const interval = parseInt(settings.geminiAutoScrollInterval) || 200;
            const maxTime = parseInt(settings.geminiAutoScrollMaxTime) || 15000;

            // Helper function to find scrollable parent
            function findScrollableParent(el) {
                if (!ScrollUtils) return null;

                let parent = el.parentElement;
                while (parent && parent !== document.body) {
                    if (ScrollUtils.isScrollable(parent).isScrollableY) {
                        return parent;
                    }
                    parent = parent.parentElement;
                }
                return null;
            }

            // Collect content using incremental collection for SPA support
            const allContents = [];
            const firstEl = elements[0];

            // Check if selected element or its parent is scrollable
            const isFirstElScrollable = ScrollUtils && ScrollUtils.isScrollable(firstEl).isScrollableY;
            const scrollableParent = findScrollableParent(firstEl);

            if (isFirstElScrollable && ScrollUtils) {
                // Selected element itself is scrollable - use incremental collection
                console.log(`[ElementPicker] Selected element is scrollable, using incremental collection`);
                const content = await ScrollUtils.scrollAndCollectContent(firstEl, { interval, maxTime });
                if (content) allContents.push(content);
            } else if (scrollableParent && ScrollUtils) {
                // Parent container is scrollable - use incremental collection on parent
                console.log(`[ElementPicker] Found scrollable parent: ${scrollableParent.tagName}.${scrollableParent.className?.split(' ')[0] || ''}`);
                const content = await ScrollUtils.scrollAndCollectContent(scrollableParent, { interval, maxTime });
                if (content) allContents.push(content);
            } else {
                // No scrollable container - just get static content from each element
                console.log(`[ElementPicker] No scrollable container, getting static content`);
                for (const el of elements) {
                    let text = el.innerText || "";

                    // Smart content cleaning for forum/SPA pages
                    text = text
                        .split('\n')
                        .map(line => line.trim())
                        .filter(line => line.length > 0)
                        .join('\n')
                        .replace(/\n{3,}/g, '\n\n')
                        .replace(/[ \t]{2,}/g, ' ')
                        .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '')
                        .trim();

                    if (text) {
                        allContents.push(text);
                    }
                }
            }

            // Join multiple elements with separator
            const finalContent = allContents.length > 1
                ? allContents.join('\n\n---\n\n')
                : allContents[0] || '';

            console.log(`[ElementPicker] Captured ${finalContent.length} characters from ${elements.length} elements`);

            // Send result back to background/sandbox
            chrome.runtime.sendMessage({
                action: "ELEMENT_PICKED",
                payload: {
                    selector: result.selector,
                    isScrollable: result.isScrollable,
                    content: finalContent,
                    elementCount: elements.length,
                    rect: result.rect
                }
            });
        });

        sendResponse({ status: "picker_started" });
        return true;
    }

    // Get Full Page Content (with Element Picker for user selection)
    if (request.action === "GET_PAGE_CONTENT") {
        const log = (msg) => {
            console.log(msg);
            try {
                chrome.runtime.sendMessage({ action: "DEBUG_LOG", message: msg });
            } catch (e) { /* ignore */ }
        };

        log(`[PageContent] 🚀 启动元素选择器`);

        // Start element picker to let user choose the content area
        const picker = window.GeminiElementPicker;

        if (!picker) {
            log(`[PageContent] ❌ 元素选择器未加载，使用 fallback`);
            // Fallback: get entire page content
            (async () => {
                let text = document.body.innerText || "";
                text = text
                    .replace(/[ \t]{2,}/g, ' ')
                    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '')
                    .split('\n')
                    .map(line => line.trim())
                    .join('\n')
                    .replace(/\n{4,}/g, '\n\n\n')
                    .trim();
                log(`[PageContent] 📊 获取 ${text.length} 字符（fallback）`);
                sendResponse({ content: text });
            })();
            return true;
        }

        // Use element picker for user selection
        picker.start(async (result) => {
            if (!result) {
                log('[PageContent] ❌ 用户取消选择');
                sendResponse({ content: "", cancelled: true });
                return;
            }

            const startTime = Date.now();
            const ScrollUtils = window.GeminiScrollUtils;
            const elements = result.elements || [result.element];

            log(`[PageContent] ✅ 用户选择了 ${elements.length} 个元素`);

            // Load scroll settings
            let interval = 200;
            let maxTime = 15000;
            try {
                const settings = await chrome.storage.local.get(['geminiAutoScrollInterval', 'geminiAutoScrollMaxTime']);
                interval = parseInt(settings.geminiAutoScrollInterval) || 200;
                maxTime = parseInt(settings.geminiAutoScrollMaxTime) || 15000;
            } catch (e) {
                log('[PageContent] ⚠️ 无法加载滚动设置，使用默认值');
            }

            // Helper: find scrollable parent
            function findScrollableParent(el) {
                if (!ScrollUtils) return null;
                let parent = el.parentElement;
                while (parent && parent !== document.body) {
                    if (ScrollUtils.isScrollable(parent).isScrollableY) {
                        return parent;
                    }
                    parent = parent.parentElement;
                }
                return null;
            }

            // Collect content
            const allContents = [];
            const firstEl = elements[0];

            // Check if selected element or its parent is scrollable
            const isFirstElScrollable = ScrollUtils && ScrollUtils.isScrollable(firstEl).isScrollableY;
            const scrollableParent = findScrollableParent(firstEl);

            if (isFirstElScrollable && ScrollUtils && ScrollUtils.scrollAndCollectContent) {
                log(`[PageContent] 📦 选中元素可滚动，使用增量收集`);
                try {
                    const content = await ScrollUtils.scrollAndCollectContent(firstEl, { interval, maxTime });
                    if (content) allContents.push(content);
                } catch (e) {
                    log(`[PageContent] ❌ 增量收集失败: ${e.message}`);
                }
            } else if (scrollableParent && ScrollUtils && ScrollUtils.scrollAndCollectContent) {
                log(`[PageContent] 📦 找到可滚动父容器: ${scrollableParent.tagName}`);
                try {
                    const content = await ScrollUtils.scrollAndCollectContent(scrollableParent, { interval, maxTime });
                    if (content) allContents.push(content);
                } catch (e) {
                    log(`[PageContent] ❌ 增量收集失败: ${e.message}`);
                }
            } else {
                log(`[PageContent] 📄 无可滚动容器，直接获取静态内容`);
                for (const el of elements) {
                    let text = el.innerText || '';
                    text = text
                        .replace(/[ \t]{2,}/g, ' ')
                        .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '')
                        .split('\n')
                        .map(line => line.trim())
                        .join('\n')
                        .replace(/\n{4,}/g, '\n\n\n')
                        .trim();

                    if (text) allContents.push(text);
                }
            }

            const finalContent = allContents.length > 1
                ? allContents.join('\n\n---\n\n')
                : allContents[0] || '';

            const elapsed = Date.now() - startTime;
            log(`[PageContent] 📊 获取 ${finalContent.length} 字符，总耗时 ${elapsed}ms`);

            sendResponse({ content: finalContent });
        });

        // Return true to indicate async response (don't call sendResponse here)
        return true; // Async response
    }
});

// --- Shortcut Configuration ---
let appShortcuts = { ...DEFAULT_SHORTCUTS };

// Initial Load of Settings
chrome.storage.local.get(['geminiShortcuts', 'geminiTextSelectionEnabled', 'geminiImageToolsEnabled'], (result) => {
    if (result.geminiShortcuts) {
        appShortcuts = { ...appShortcuts, ...result.geminiShortcuts };
    }
    // Default enabled if undefined
    const selectionEnabled = result.geminiTextSelectionEnabled !== false;
    if (floatingToolbar) {
        floatingToolbar.setSelectionEnabled(selectionEnabled);
    }

    // Image Tools
    const imageToolsEnabled = result.geminiImageToolsEnabled !== false;
    if (floatingToolbar) {
        floatingToolbar.setImageToolsEnabled(imageToolsEnabled);
    }
});

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
        if (changes.geminiShortcuts) {
            appShortcuts = { ...appShortcuts, ...changes.geminiShortcuts.newValue };
        }
        if (changes.geminiTextSelectionEnabled) {
            const enabled = changes.geminiTextSelectionEnabled.newValue !== false;
            if (floatingToolbar) {
                floatingToolbar.setSelectionEnabled(enabled);
            }
        }
        if (changes.geminiImageToolsEnabled) {
            const enabled = changes.geminiImageToolsEnabled.newValue !== false;
            if (floatingToolbar) {
                floatingToolbar.setImageToolsEnabled(enabled);
            }
        }
    }
});

function matchShortcut(event, shortcutString) {
    if (!shortcutString) return false;

    const parts = shortcutString.split('+').map(p => p.trim().toLowerCase());
    const key = event.key.toLowerCase();

    const hasCtrl = parts.includes('ctrl');
    const hasAlt = parts.includes('alt');
    const hasShift = parts.includes('shift');
    const hasMeta = parts.includes('meta') || parts.includes('command');

    if (event.ctrlKey !== hasCtrl) return false;
    if (event.altKey !== hasAlt) return false;
    if (event.shiftKey !== hasShift) return false;
    if (event.metaKey !== hasMeta) return false;

    const mainKeys = parts.filter(p => !['ctrl', 'alt', 'shift', 'meta', 'command'].includes(p));
    if (mainKeys.length !== 1) return false;

    return key === mainKeys[0];
}

document.addEventListener('keydown', (e) => {
    if (matchShortcut(e, appShortcuts.openPanel)) {
        e.preventDefault();
        e.stopPropagation();
        chrome.runtime.sendMessage({ action: "OPEN_SIDE_PANEL" });
        return;
    }

    if (matchShortcut(e, appShortcuts.quickAsk)) {
        e.preventDefault();
        e.stopPropagation();
        floatingToolbar.showGlobalInput();
        return;
    }
}, true);