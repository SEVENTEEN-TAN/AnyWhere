
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
        // Get current window first to ensure we target the right tab
        const currentWindow = await chrome.windows.getCurrent();
        const [tab] = await chrome.tabs.query({ 
            active: true, 
            windowId: currentWindow.id 
        });
        
        if (!tab || !tab.id) {
            console.log("[PageContext] 无法找到活动标签页");
            return null;
        }

        console.log(`[PageContext] 目标标签页: ${tab.title || '无标题'} (${tab.url})`);

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
            console.log(`[PageContext] 尝试向标签页 ${tab.id} 发送 GET_PAGE_CONTENT 消息...`);
            const response = await chrome.tabs.sendMessage(tab.id, { action: "GET_PAGE_CONTENT" });
            if (response && response.content) {
                console.log(`[PageContext] Content script 响应成功，获取 ${response.content.length} 字符`);
            }
            return response ? response.content : null;
        } catch (e) {
            // Strategy 2: Fallback to Scripting Injection with auto-scroll
            console.log(`[PageContext] Content script 无响应 (${e.message})，使用 Fallback 模式`);
            console.log(`[PageContext] 即将在标签页 ${tab.id} (${tab.title}) 执行自动滚动...`);
            try {
                // Get settings first
                const settings = await chrome.storage.local.get(['geminiAutoScrollInterval', 'geminiAutoScrollMaxTime']);
                const intervalTime = parseInt(settings.geminiAutoScrollInterval) || 200;
                const maxTime = parseInt(settings.geminiAutoScrollMaxTime) || 15000;

                const results = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    args: [intervalTime, maxTime],
                    func: async (interval, maxDuration) => {
                        // Auto-scroll function for fallback
                        console.log(`[AutoScroll-Fallback] Initializing - Interval: ${interval}ms, Max: ${maxDuration}ms`);

                        async function autoScrollFallback() {
                            const initialScrollHeight = document.body.scrollHeight;
                            const viewHeight = window.innerHeight;
                            console.log(`[AutoScroll-Fallback] Page dimensions - scrollHeight: ${initialScrollHeight}, viewHeight: ${viewHeight}`);

                            if (initialScrollHeight <= viewHeight + 50) {
                                console.log("[AutoScroll-Fallback] Page not scrollable, skipping");
                                return; // Page not scrollable
                            }

                            console.log(`[AutoScroll-Fallback] Starting scroll...`);

                            return new Promise(resolve => {
                                const distance = 400;
                                const startTime = Date.now();
                                let lastScrollHeight = document.body.scrollHeight;
                                let bottomRetryCount = 0;
                                const maxBottomRetries = 3;

                                let isAborted = false;
                                const escHandler = (e) => {
                                    if (e.key === 'Escape') {
                                        console.log("[AutoScroll-Fallback] User cancelled via ESC");
                                        isAborted = true;
                                    }
                                };
                                document.addEventListener('keydown', escHandler);

                                const timer = setInterval(() => {
                                    if (isAborted || (Date.now() - startTime > maxDuration)) {
                                        console.log(`[AutoScroll-Fallback] Stopping - ${isAborted ? 'User aborted' : 'Timeout'}`);
                                        clearInterval(timer);
                                        document.removeEventListener('keydown', escHandler);
                                        setTimeout(() => {
                                            window.scrollTo(0, 0);
                                            console.log("[AutoScroll-Fallback] Returned to top");
                                            resolve();
                                        }, 500);
                                        return;
                                    }

                                    const currentScrollHeight = document.body.scrollHeight;
                                    const currentPosition = window.innerHeight + window.scrollY;

                                    window.scrollBy(0, distance);

                                    if (currentPosition >= currentScrollHeight - 100) {
                                        if (currentScrollHeight === lastScrollHeight) {
                                            bottomRetryCount++;
                                            console.log(`[AutoScroll-Fallback] At bottom, waiting... (${bottomRetryCount}/${maxBottomRetries})`);
                                            if (bottomRetryCount >= maxBottomRetries) {
                                                console.log(`[AutoScroll-Fallback] Confirmed bottom - Final height: ${currentScrollHeight}`);
                                                clearInterval(timer);
                                                document.removeEventListener('keydown', escHandler);
                                                setTimeout(() => {
                                                    window.scrollTo(0, 0);
                                                    console.log("[AutoScroll-Fallback] Returned to top");
                                                    resolve();
                                                }, 500);
                                                return;
                                            }
                                        } else {
                                            console.log(`[AutoScroll-Fallback] New content loaded - height: ${lastScrollHeight} → ${currentScrollHeight}`);
                                            bottomRetryCount = 0;
                                        }
                                    } else {
                                        bottomRetryCount = 0;
                                    }

                                    lastScrollHeight = currentScrollHeight;
                                }, interval);
                            });
                        }

                        await autoScrollFallback();
                        let text = document.body ? document.body.innerText : "";
                        text = text.replace(/\n{3,}/g, '\n\n');
                        console.log(`[AutoScroll-Fallback] Captured ${text.length} characters`);
                        return text;
                    }
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
