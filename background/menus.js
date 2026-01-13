
// background/menus.js
/**
 * @typedef {import('./managers/image_manager.js').ImageManager} ImageManager
 */

/**
 * Initializes Context Menus and attaches the click listener.
 * @param {ImageManager} imageHandler - Instance of the ImageManager.
 */
export function setupContextMenus(imageHandler) {
    
    // Create Context Menus with Localization check
    chrome.runtime.onInstalled.addListener(() => {
        const isZh = chrome.i18n.getUILanguage().startsWith('zh');
        
        const titles = {
            main: isZh ? "Gemini Nexus" : "Gemini Nexus",
            ask: isZh ? "快速提问" : "Quick Ask",
            pageChat: isZh ? "与当前网页对话" : "Chat with Page",
            ocr: isZh ? "OCR (文字提取)" : "OCR (Extract Text)",
            screenshotTranslate: isZh ? "截图翻译" : "Screenshot Translate",
            snip: isZh ? "区域截图 (Snip)" : "Snip (Capture Area)"
        };

        chrome.contextMenus.create({
            id: "gemini-nexus-parent",
            title: titles.main,
            contexts: ["all"]
        });

        chrome.contextMenus.create({
            id: "menu-ask",
            parentId: "gemini-nexus-parent",
            title: titles.ask,
            contexts: ["all"]
        });

        chrome.contextMenus.create({
            id: "menu-page-chat",
            parentId: "gemini-nexus-parent",
            title: titles.pageChat,
            contexts: ["all"]
        });

        chrome.contextMenus.create({
            id: "menu-ocr",
            parentId: "gemini-nexus-parent",
            title: titles.ocr,
            contexts: ["all"]
        });

        chrome.contextMenus.create({
            id: "menu-screenshot-translate",
            parentId: "gemini-nexus-parent",
            title: titles.screenshotTranslate,
            contexts: ["all"]
        });

        chrome.contextMenus.create({
            id: "menu-snip",
            parentId: "gemini-nexus-parent",
            title: titles.snip,
            contexts: ["all"]
        });
    });

    // Handle Context Menu Clicks
    chrome.contextMenus.onClicked.addListener(async (info, tab) => {
        if (!tab) return;

        // 获取当前点击的菜单项
        const menuId = info.menuItemId;

        if (menuId === "menu-ask") {
            chrome.tabs.sendMessage(tab.id, { 
                action: "CONTEXT_MENU_ACTION", 
                mode: "ask" 
            }).catch(() => {});
        } else if (menuId === "menu-page-chat") {
            // 直接通知内容脚本打开对话窗口并启用网页上下文
            chrome.tabs.sendMessage(tab.id, { 
                action: "CONTEXT_MENU_ACTION", 
                mode: "page_chat" 
            }).catch(() => {});
        } else if (menuId === "menu-ocr" || menuId === "menu-snip" || menuId === "menu-screenshot-translate") {
            let mode = "snip";
            if (menuId === "menu-ocr") mode = "ocr";
            if (menuId === "menu-screenshot-translate") mode = "screenshot_translate";
            
            // 通知内容脚本准备截图
            chrome.tabs.sendMessage(tab.id, { 
                action: "CONTEXT_MENU_ACTION", 
                mode: mode 
            }).catch(() => {});
        }
    });
}