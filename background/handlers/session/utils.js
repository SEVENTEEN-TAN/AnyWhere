
// background/handlers/session/utils.js

export function parseToolCommand(responseText) {
    // Look for JSON code blocks identifying a tool
    // Pattern: ```json { "tool": ... } ```
    const jsonMatch = responseText.match(/```json\s*(\{[\s\S]*?"tool"[\s\S]*?\})\s*```/);
    
    if (jsonMatch && jsonMatch[1]) {
        try {
            const command = JSON.parse(jsonMatch[1]);
            return {
                name: command.tool,
                args: command.args || {}
            };
        } catch (e) {
            console.error("Failed to parse tool command JSON", e);
        }
    }
    return null;
}

export async function getActiveTabContent() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (!tab || !tab.id) return null;

        // Check for restricted URLs (Chrome internal pages, extensions, etc.)
        if (tab.url && (
            tab.url.startsWith('chrome://') || 
            tab.url.startsWith('edge://') || 
            tab.url.startsWith('chrome-extension://') || 
            tab.url.startsWith('about:') ||
            tab.url.startsWith('view-source:') ||
            tab.url.startsWith('devtools://') ||
            tab.url.startsWith('https://chrome.google.com/webstore') ||
            tab.url.startsWith('https://chromewebstore.google.com')
        )) {
            console.log(`[PageContext] 系统页面无法获取内容: ${tab.url}`);
            return null;
        }

        // Strategy 1: Try sending message to existing content script
        try {
            const response = await chrome.tabs.sendMessage(tab.id, { action: "GET_PAGE_CONTENT" });
            return response ? response.content : null;
        } catch (e) {
            // Strategy 2: Fallback to Scripting Injection
            try {
                const results = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: () => document.body ? document.body.innerText : ""
                });
                return results?.[0]?.result || null;
            } catch (injErr) {
                // Check if it's a restricted page error (expected behavior)
                const errorMsg = injErr.message || String(injErr);
                if (errorMsg.includes('chrome://') || 
                    errorMsg.includes('edge://') || 
                    errorMsg.includes('Cannot access') ||
                    errorMsg.includes('restricted')) {
                    // Silently handle restricted pages - this is expected
                    console.log(`[PageContext] 无法访问受限页面: ${tab.url || '未知'}`);
                } else {
                    // Log unexpected errors for debugging
                    console.warn(`[PageContext] 页面内容获取失败:`, injErr.message);
                }
                return null;
            }
        }
    } catch (e) {
        console.error("[PageContext] Failed to get page context:", e);
        return null;
    }
}
