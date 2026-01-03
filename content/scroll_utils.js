// content/scroll_utils.js
// Smart scroll utilities for detecting and scrolling containers

(function() {
    'use strict';

    /**
     * Check if an element is scrollable
     * @param {Element} el - The element to check
     * @returns {Object} - { isScrollableY, isScrollableX, scrollHeight, clientHeight }
     */
    function isScrollable(el) {
        if (!el || el === document || el === window) {
            // For document/window, check documentElement
            const docEl = document.documentElement;
            return {
                isScrollableY: docEl.scrollHeight > docEl.clientHeight,
                isScrollableX: docEl.scrollWidth > docEl.clientWidth,
                scrollHeight: docEl.scrollHeight,
                clientHeight: docEl.clientHeight
            };
        }

        const style = getComputedStyle(el);
        const overflowY = style.overflowY;
        const overflowX = style.overflowX;

        const canScrollY = (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay');
        const canScrollX = (overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'overlay');
        const hasOverflowY = el.scrollHeight > el.clientHeight + 10;
        const hasOverflowX = el.scrollWidth > el.clientWidth + 10;

        return {
            isScrollableY: canScrollY && hasOverflowY,
            isScrollableX: canScrollX && hasOverflowX,
            scrollHeight: el.scrollHeight,
            clientHeight: el.clientHeight
        };
    }

    /**
     * Find the main scrollable container on the page
     * Priority: semantic containers > largest scrollable > document
     * @returns {Element|null} - The scrollable element or null
     */
    function findScrollableContainer() {
        // 1. Priority: semantic main content containers
        const semanticSelectors = [
            'main',
            'article',
            '[role="main"]',
            '[role="article"]',
            '.main-content',
            '.main',
            '.content',
            '#content',
            '#main',
            '#app',
            '#root'
        ];

        for (const selector of semanticSelectors) {
            try {
                const el = document.querySelector(selector);
                if (el && isScrollable(el).isScrollableY) {
                    console.log(`[ScrollUtils] Found semantic container: ${selector}`);
                    return el;
                }
            } catch (e) {
                // Invalid selector, skip
            }
        }

        // 2. Find the largest scrollable container
        let maxScrollable = null;
        let maxArea = 0;
        const minArea = 50000; // Minimum area threshold (roughly 250x200)

        // Limit traversal for performance
        const allElements = document.querySelectorAll('div, section, aside, nav, ul, ol');
        const maxElements = 500;
        let count = 0;

        for (const el of allElements) {
            if (count++ > maxElements) break;

            const scrollInfo = isScrollable(el);
            if (scrollInfo.isScrollableY) {
                const rect = el.getBoundingClientRect();
                const area = rect.width * rect.height;

                // Prefer elements that are visible and large enough
                if (area > maxArea && area > minArea && rect.width > 100 && rect.height > 100) {
                    maxArea = area;
                    maxScrollable = el;
                }
            }
        }

        if (maxScrollable) {
            console.log(`[ScrollUtils] Found largest scrollable: ${maxScrollable.tagName}.${maxScrollable.className.split(' ')[0] || ''}`);
            return maxScrollable;
        }

        // 3. Fallback to document.scrollingElement
        const docScroller = document.scrollingElement || document.documentElement;
        if (docScroller && docScroller.scrollHeight > docScroller.clientHeight + 50) {
            console.log(`[ScrollUtils] Using document scroller`);
            return docScroller;
        }

        console.log(`[ScrollUtils] No scrollable container found`);
        return null;
    }

    /**
     * Create a visual scroll indicator
     * @returns {HTMLElement} - The indicator element
     */
    function createScrollIndicator() {
        const indicator = document.createElement('div');
        indicator.id = 'gemini-scroll-indicator';
        indicator.textContent = '🔄 AI 正在自动滚动页面...';
        indicator.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(0, 122, 255, 0.95);
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            z-index: 2147483647;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            transition: background 0.3s, transform 0.3s;
        `;

        // Add pulse animation
        const style = document.createElement('style');
        style.id = 'gemini-scroll-indicator-style';
        style.textContent = `
            @keyframes gemini-autoscroll-pulse {
                0%, 100% { transform: scale(1); opacity: 1; }
                50% { transform: scale(1.02); opacity: 0.9; }
            }
            #gemini-scroll-indicator {
                animation: gemini-autoscroll-pulse 2s infinite;
            }
        `;

        // Only add style if not already present
        if (!document.getElementById('gemini-scroll-indicator-style')) {
            document.head.appendChild(style);
        }

        return indicator;
    }

    /**
     * Scroll an element to the bottom, triggering lazy loads
     * @param {Element} scrollTarget - The element to scroll
     * @param {Object} options - { interval, maxTime }
     * @returns {Promise} - Resolves when scrolling is complete
     */
    async function scrollElement(scrollTarget, options = {}) {
        const interval = parseInt(options.interval) || 200;
        const maxTime = parseInt(options.maxTime) || 15000;
        const distance = 400;

        const isDocumentScroll = (
            scrollTarget === document.scrollingElement ||
            scrollTarget === document.documentElement ||
            scrollTarget === document.body
        );

        console.log(`[ScrollUtils] Starting scroll - Target: ${isDocumentScroll ? 'document' : scrollTarget.tagName}, Interval: ${interval}ms, MaxTime: ${maxTime}ms`);

        // Create indicator
        const indicator = createScrollIndicator();
        document.body.appendChild(indicator);

        return new Promise(resolve => {
            const startTime = Date.now();
            let lastScrollHeight = scrollTarget.scrollHeight;
            let bottomRetryCount = 0;
            const maxBottomRetries = 3;
            let isAborted = false;

            // ESC key handler
            const escHandler = (e) => {
                if (e.key === 'Escape') {
                    console.log('[ScrollUtils] User cancelled via ESC');
                    isAborted = true;
                    indicator.textContent = '❌ 已取消滚动';
                    indicator.style.background = 'rgba(255, 59, 48, 0.95)';
                }
            };
            document.addEventListener('keydown', escHandler);

            const timer = setInterval(() => {
                // Check abort or timeout
                if (isAborted || (Date.now() - startTime > maxTime)) {
                    console.log(`[ScrollUtils] Stopping - ${isAborted ? 'User aborted' : 'Timeout reached'}`);
                    finish();
                    return;
                }

                // Execute scroll
                if (isDocumentScroll) {
                    window.scrollBy(0, distance);
                } else {
                    scrollTarget.scrollTop += distance;
                }

                // Calculate progress
                const currentPos = isDocumentScroll
                    ? window.innerHeight + window.scrollY
                    : scrollTarget.scrollTop + scrollTarget.clientHeight;
                const totalHeight = scrollTarget.scrollHeight;
                const progress = Math.min(Math.round((currentPos / totalHeight) * 100), 100);

                indicator.textContent = `🔄 正在滚动... ${progress}%`;

                // Check if at bottom
                if (currentPos >= totalHeight - 100) {
                    if (scrollTarget.scrollHeight === lastScrollHeight) {
                        bottomRetryCount++;
                        console.log(`[ScrollUtils] At bottom, waiting... (${bottomRetryCount}/${maxBottomRetries})`);

                        if (bottomRetryCount >= maxBottomRetries) {
                            console.log('[ScrollUtils] ✅ Confirmed bottom - no new content');
                            indicator.textContent = '✅ 滚动完成';
                            indicator.style.background = 'rgba(52, 199, 89, 0.95)';
                            finish();
                            return;
                        }
                    } else {
                        console.log(`[ScrollUtils] 🆕 New content - height: ${lastScrollHeight} → ${scrollTarget.scrollHeight}`);
                        bottomRetryCount = 0;
                    }
                } else {
                    bottomRetryCount = 0;
                }

                lastScrollHeight = scrollTarget.scrollHeight;
            }, interval);

            function finish() {
                clearInterval(timer);
                document.removeEventListener('keydown', escHandler);

                setTimeout(() => {
                    // Return to top
                    if (isDocumentScroll) {
                        window.scrollTo(0, 0);
                    } else {
                        scrollTarget.scrollTop = 0;
                    }
                    console.log('[ScrollUtils] 🔝 Returned to top');

                    // Remove indicator after delay
                    setTimeout(() => {
                        if (indicator && indicator.parentNode) {
                            indicator.remove();
                        }
                    }, 1500);

                    resolve();
                }, 500);
            }
        });
    }

    /**
     * Get text content from an element after scrolling
     * @param {Element} el - The element to get content from
     * @param {Object} options - { autoScroll, interval, maxTime }
     * @returns {Promise<string>} - The text content
     */
    async function getElementContent(el, options = {}) {
        const { autoScroll = true, interval = 200, maxTime = 15000 } = options;

        // Check if we need to scroll
        const scrollInfo = isScrollable(el);

        if (autoScroll && scrollInfo.isScrollableY) {
            console.log(`[ScrollUtils] Element is scrollable (${scrollInfo.scrollHeight}px), starting scroll...`);
            await scrollElement(el, { interval, maxTime });
        }

        // Get content
        let text = el.innerText || '';
        text = text.replace(/\n{3,}/g, '\n\n'); // Clean up excessive newlines

        console.log(`[ScrollUtils] Captured ${text.length} characters`);
        return text;
    }

    // Export to global
    window.GeminiScrollUtils = {
        isScrollable,
        findScrollableContainer,
        createScrollIndicator,
        scrollElement,
        getElementContent
    };

})();
