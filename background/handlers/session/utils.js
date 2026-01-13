
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
    const startTime = Date.now();
    console.group(`%c[PageContext] 🚀 开始获取页面内容`, 'color: #00bcd4; font-weight: bold');

    try {
        // Get current window first to ensure we target the right tab
        const currentWindow = await chrome.windows.getCurrent();
        const [tab] = await chrome.tabs.query({
            active: true,
            windowId: currentWindow.id
        });

        if (!tab || !tab.id) {
            console.log("❌ 无法找到活动标签页");
            console.groupEnd();
            return null;
        }

        console.log(`📄 目标标签页: ${tab.title || '无标题'}`);
        console.log(`🔗 URL: ${tab.url}`);

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
            console.log(`⚠️ 系统页面无法获取内容`);
            console.groupEnd();
            return null;
        }

        // Strategy 1: Try sending message to existing content script
        try {
            console.log(`📨 策略1: 向 Content Script 发送 GET_PAGE_CONTENT 消息...`);
            const response = await chrome.tabs.sendMessage(tab.id, { action: "GET_PAGE_CONTENT" });
            if (response && response.content) {
                const elapsed = Date.now() - startTime;
                console.log(`✅ Content Script 响应成功`);
                console.log(`📊 获取 ${response.content.length} 字符，耗时 ${elapsed}ms`);
                console.groupEnd();
                return response.content;
            }
            console.log(`⚠️ Content Script 返回空内容`);
            console.groupEnd();
            return null;
        } catch (e) {
            // Strategy 2: Fallback to Scripting Injection with auto-scroll
            console.log(`⚠️ Content Script 无响应: ${e.message}`);
            console.log(`📨 策略2: 使用 Fallback 模式（脚本注入 + 自动滚动）`);

            try {
                // Get settings first
                const settings = await chrome.storage.local.get(['geminiAutoScrollInterval', 'geminiAutoScrollMaxTime']);
                const intervalTime = parseInt(String(settings.geminiAutoScrollInterval || 200));
                const maxTime = parseInt(String(settings.geminiAutoScrollMaxTime || 15000));

                console.log(`⚙️ 滚动设置: interval=${intervalTime}ms, maxTime=${maxTime}ms`);
                console.log(`🔄 开始自动滚动...`);

                const results = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    args: [intervalTime, maxTime],
                    func: async (interval, maxDuration) => {
                        // Auto-scroll function for fallback (injected via scripting API)
                        console.group(`%c[AutoScroll-Fallback] 🚀 Initializing`, 'color: #00bcd4; font-weight: bold');
                        console.log(`Settings: interval=${interval}ms, maxDuration=${maxDuration}ms`);
                        console.groupEnd();

                        async function autoScrollFallback() {
                            const initialScrollHeight = document.body.scrollHeight;
                            const viewHeight = window.innerHeight;
                            console.log(`[AutoScroll-Fallback] Page: scrollHeight=${initialScrollHeight}px, viewHeight=${viewHeight}px`);

                            if (initialScrollHeight <= viewHeight + 50) {
                                console.log("[AutoScroll-Fallback] ⏭️ Page not scrollable, skipping");
                                return;
                            }

                            console.log(`[AutoScroll-Fallback] 🔄 Starting scroll...`);

                            return new Promise(resolve => {
                                const distance = 400;
                                const startTime = Date.now();
                                let lastScrollHeight = document.body.scrollHeight;
                                let bottomRetryCount = 0;
                                const maxBottomRetries = 5; // Increased from 3
                                let scrollCount = 0;

                                let isAborted = false;
                                const escHandler = (e) => {
                                    if (e.key === 'Escape') {
                                        console.log("[AutoScroll-Fallback] ❌ User cancelled via ESC");
                                        isAborted = true;
                                    }
                                };
                                document.addEventListener('keydown', escHandler);

                                const timer = setInterval(() => {
                                    scrollCount++;
                                    const elapsed = Date.now() - startTime;

                                    if (isAborted || elapsed > maxDuration) {
                                        const reason = isAborted ? 'user_abort' : 'timeout';
                                        console.log(`%c[AutoScroll-Fallback] ⏹️ Stopping - ${isAborted ? 'User aborted' : `Timeout (${elapsed}ms)`}`, 'color: #ff9800');
                                        console.log(`  Total scrolls: ${scrollCount}, Final height: ${document.body.scrollHeight}px`);
                                        clearInterval(timer);
                                        document.removeEventListener('keydown', escHandler);
                                        setTimeout(() => {
                                            window.scrollTo(0, 0);
                                            console.log("[AutoScroll-Fallback] 🔝 Returned to top");
                                            resolve();
                                        }, 500);
                                        return;
                                    }

                                    const currentScrollHeight = document.body.scrollHeight;
                                    const currentPosition = window.innerHeight + window.scrollY;
                                    const remainingPx = currentScrollHeight - currentPosition;
                                    const progress = Math.min(Math.round((currentPosition / currentScrollHeight) * 100), 100);

                                    window.scrollBy(0, distance);

                                    // Log every 5 scrolls or when near bottom
                                    const isNearBottom = remainingPx < 500;
                                    if (scrollCount % 5 === 0 || isNearBottom) {
                                        console.log(`%c[AutoScroll-Fallback] #${scrollCount}`, isNearBottom ? 'color: #ff5722' : 'color: #9e9e9e',
                                            `| pos: ${Math.round(currentPosition)}/${currentScrollHeight}px`,
                                            `| remaining: ${Math.round(remainingPx)}px`,
                                            `| progress: ${progress}%`
                                        );
                                    }

                                    if (remainingPx < 100) {
                                        if (currentScrollHeight === lastScrollHeight) {
                                            bottomRetryCount++;
                                            console.log(`%c[AutoScroll-Fallback] 🔻 Bottom detected - retry ${bottomRetryCount}/${maxBottomRetries}`,
                                                'color: #e91e63',
                                                `| height stable at ${currentScrollHeight}px`
                                            );
                                            if (bottomRetryCount >= maxBottomRetries) {
                                                console.log(`%c[AutoScroll-Fallback] ✅ Confirmed bottom`, 'color: #4caf50; font-weight: bold');
                                                console.log(`  Total scrolls: ${scrollCount}, Final height: ${currentScrollHeight}px, Time: ${elapsed}ms`);
                                                clearInterval(timer);
                                                document.removeEventListener('keydown', escHandler);
                                                setTimeout(() => {
                                                    window.scrollTo(0, 0);
                                                    console.log("[AutoScroll-Fallback] 🔝 Returned to top");
                                                    resolve();
                                                }, 500);
                                                return;
                                            }
                                        } else {
                                            console.log(`%c[AutoScroll-Fallback] 🆕 New content loaded!`, 'color: #2196f3; font-weight: bold',
                                                `| height: ${lastScrollHeight} → ${currentScrollHeight}px (+${currentScrollHeight - lastScrollHeight}px)`
                                            );
                                            bottomRetryCount = 0;
                                        }
                                    } else {
                                        if (bottomRetryCount > 0) {
                                            console.log(`[AutoScroll-Fallback] ↗️ Not at bottom anymore, reset retry count`);
                                        }
                                        bottomRetryCount = 0;
                                    }

                                    lastScrollHeight = currentScrollHeight;
                                }, interval);
                            });
                        }

                        await autoScrollFallback();

                        // Get full text content
                        let text = document.body ? document.body.innerText : "";

                        // Apply line-level deduplication for virtual scrolling pages
                        // This prevents duplicate content in SPAs with dynamic DOM updates
                        const lines = text.split('\n');
                        const seen = new Set();
                        const uniqueLines = lines.filter(line => {
                            const trimmed = line.trim();
                            // Keep short lines (headers, separators, etc.)
                            if (trimmed.length < 20) return true;
                            // Deduplicate longer lines
                            if (seen.has(trimmed)) return false;
                            seen.add(trimmed);
                            return true;
                        });
                        text = uniqueLines.join('\n');

                        // Clean up excessive newlines
                        text = text.replace(/\n{3,}/g, '\n\n');

                        console.log(`[AutoScroll-Fallback] 📄 Captured ${text.length} characters (after deduplication)`);
                        return text;
                    }
                });

                const result = results?.[0]?.result || null;
                const elapsed = Date.now() - startTime;

                if (result) {
                    console.log(`✅ Fallback 模式完成`);
                    console.log(`📊 获取 ${result.length} 字符，总耗时 ${elapsed}ms`);
                } else {
                    console.log(`⚠️ Fallback 模式返回空内容`);
                }
                console.groupEnd();
                return result;
            } catch (injErr) {
                // Check if it's a restricted page error (expected behavior)
                const errorMsg = injErr.message || String(injErr);
                if (errorMsg.includes('chrome://') ||
                    errorMsg.includes('edge://') ||
                    errorMsg.includes('Cannot access') ||
                    errorMsg.includes('restricted')) {
                    // Silently handle restricted pages - this is expected
                    console.log(`⚠️ 无法访问受限页面`);
                } else {
                    // Log unexpected errors for debugging
                    console.warn(`❌ 页面内容获取失败:`, injErr.message);
                }
                console.groupEnd();
                return null;
            }
        }
    } catch (e) {
        console.error("❌ Failed to get page context:", e);
        console.groupEnd();
        return null;
    }
}
