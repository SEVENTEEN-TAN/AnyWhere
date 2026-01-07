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
     * Generate a fingerprint for content deduplication
     * @param {string} text - The text content
     * @returns {string} - A fingerprint string
     */
    function generateFingerprint(text) {
        if (!text || text.length === 0) return '';
        // Use first 100 chars + length as fingerprint
        const prefix = text.slice(0, 100).trim();
        return `${prefix.length}:${text.length}:${prefix}`;
    }

    /**
     * Find content blocks within a container
     * Automatically detects common content block patterns
     * Uses intelligent selector scoring to find the best match
     * @param {Element} container - The container element
     * @returns {Element[]} - Array of content block elements
     */
    function findContentBlocks(container) {
        // Common content block selectors for forums, blogs, SPAs
        const contentSelectors = [
            // Forum/Discussion patterns
            '.topic-post', '.post', '.post-content', '.post-body',
            '.comment', '.comment-body', '.reply', '.reply-content',
            '.message', '.message-body', '.message-content',
            // Article patterns
            'article', '.article', '.article-content',
            '.entry', '.entry-content',
            // Document/Office patterns (for .docx-page, Google Docs, etc.)
            '.docx-page > *', '.doc-content > *', '.kix-paginateddocumentplugin > *',
            // Generic content patterns
            '.content-block', '.text-block', '.item', '.block',
            // Paragraph-level patterns
            'p', '.paragraph', '.text',
            // Fallback to direct children with substantial text
            ':scope > div', ':scope > section', ':scope > article'
        ];

        let bestBlocks = [];
        let bestScore = 0;

        // Try each selector and score the results
        for (const selector of contentSelectors) {
            try {
                const found = container.querySelectorAll(selector);
                if (found.length === 0) continue;

                // Filter to only include blocks with meaningful text content
                const meaningful = Array.from(found).filter(el => {
                    const text = el.innerText?.trim() || '';
                    // Lower threshold to 20 chars for better granularity
                    return text.length > 20;
                });

                if (meaningful.length === 0) continue;

                // Calculate score: total text length + block count bonus
                const totalTextLength = meaningful.reduce((sum, el) => {
                    return sum + (el.innerText?.trim().length || 0);
                }, 0);

                // Score = total text + (block count * 100) to favor more blocks
                const score = totalTextLength + (meaningful.length * 100);

                // Keep the best scoring selector
                if (score > bestScore) {
                    bestScore = score;
                    bestBlocks = meaningful;
                }
            } catch (e) {
                // Invalid selector, skip
            }
        }

        // Fallback: if no blocks found, use visible text nodes
        if (bestBlocks.length === 0) {
            // Get all elements with direct text content
            const allDivs = container.querySelectorAll('div, p, section, article, li, span');
            bestBlocks = Array.from(allDivs).filter(el => {
                const text = el.innerText?.trim() || '';
                // Must have meaningful content and be visible
                const rect = el.getBoundingClientRect();
                return text.length > 20 && rect.height > 0 && rect.width > 0;
            });
        }

        return bestBlocks;
    }

    /**
     * Collect visible content from the current viewport
     * Optimized for virtual scrolling and dynamic content
     * @param {Element} container - The scroll container
     * @param {Set} seenFingerprints - Set of already collected fingerprints
     * @param {boolean} isDocumentScroll - Whether scrolling the document
     * @returns {Object} - { newTexts: string[], newCount: number }
     */
    function collectVisibleContent(container, seenFingerprints, isDocumentScroll) {
        const newTexts = [];

        // Get viewport bounds
        const viewportTop = isDocumentScroll ? window.scrollY : container.scrollTop;
        const viewportHeight = isDocumentScroll ? window.innerHeight : container.clientHeight;
        const viewportBottom = viewportTop + viewportHeight;

        // IMPORTANT: Re-scan blocks each time for virtual scrolling support
        // Virtual scrollers dynamically add/remove DOM elements
        const blocks = findContentBlocks(container);

        for (const block of blocks) {
            // Skip invisible blocks early
            const rect = block.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) continue;

            // Calculate block position relative to container
            const blockTop = isDocumentScroll
                ? rect.top + window.scrollY
                : rect.top - container.getBoundingClientRect().top + container.scrollTop;
            const blockBottom = blockTop + rect.height;

            // More generous visibility check: block is at least 10% visible
            const overlapTop = Math.max(viewportTop, blockTop);
            const overlapBottom = Math.min(viewportBottom, blockBottom);
            const overlapHeight = overlapBottom - overlapTop;
            const visibleRatio = overlapHeight / rect.height;

            const isVisible = overlapHeight > 0 && visibleRatio > 0.1;

            if (isVisible) {
                let text = block.innerText?.trim() || '';
                if (text.length < 20) continue; // Skip too short

                // Clean up whitespace while preserving Markdown structure
                text = text
                    // Replace multiple consecutive whitespace (but preserve single newlines)
                    .replace(/[ \t]{2,}/g, ' ')
                    // Remove invisible Unicode characters
                    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '')
                    // Trim each line (remove leading/trailing spaces)
                    .split('\n')
                    .map(line => line.trim())
                    .join('\n')
                    // Normalize multiple blank lines to max 2 (important for Markdown headers)
                    .replace(/\n{4,}/g, '\n\n\n')
                    // Final trim
                    .trim();

                const fingerprint = generateFingerprint(text);

                if (fingerprint && !seenFingerprints.has(fingerprint)) {
                    seenFingerprints.add(fingerprint);
                    newTexts.push(text);
                }
            }
        }

        return { newTexts, newCount: newTexts.length };
    }

    /**
     * Scroll an element and incrementally collect content
     * Designed for SPAs with virtual scrolling (Vue, React, etc.)
     * @param {Element} scrollTarget - The element to scroll
     * @param {Object} options - { interval, maxTime }
     * @returns {Promise<string>} - Collected content
     */
    async function scrollAndCollectContent(scrollTarget, options = {}) {
        const interval = parseInt(options.interval) || 200;
        const maxTime = parseInt(options.maxTime) || 15000;
        const collectionTarget = options.collectionTarget || scrollTarget;
        const distance = 400;

        // Content collection
        const seenFingerprints = new Set();
        const collectedTexts = [];

        // Helper to log both locally and to background
        const log = (msg) => {
            console.log(msg);
            try {
                chrome.runtime.sendMessage({ action: "DEBUG_LOG", message: msg });
            } catch (e) { /* ignore */ }
        };

        const isDocumentScroll = (
            scrollTarget === document.scrollingElement ||
            scrollTarget === document.documentElement ||
            scrollTarget === document.body
        );

        // Enhanced logging for debugging
        log(`[ScrollCollect] 🚀 Starting Scroll & Collect`);
        log(`[ScrollCollect] Target: ${isDocumentScroll ? 'document' : `${scrollTarget.tagName}.${scrollTarget.className?.split(' ')[0] || ''}`}`);
        log(`[ScrollCollect] Collection Scope: ${collectionTarget === scrollTarget ? 'Target' : `${collectionTarget.tagName}.${collectionTarget.className?.split(' ')[0] || ''}`}`);
        log(`[ScrollCollect] Settings: interval=${interval}ms, maxTime=${maxTime}ms, distance=${distance}px`);

        // Create indicator
        const indicator = createScrollIndicator();
        indicator.textContent = '🔄 正在收集页面内容...';
        document.body.appendChild(indicator);

        // Collect initial content before scrolling
        const initialCollect = collectVisibleContent(collectionTarget, seenFingerprints, isDocumentScroll);
        collectedTexts.push(...initialCollect.newTexts);
        log(`[ScrollCollect] 📝 Initial collection: ${initialCollect.newCount} blocks`);

        return new Promise(resolve => {
            const startTime = Date.now();
            let lastScrollHeight = scrollTarget.scrollHeight;
            let bottomRetryCount = 0;
            const maxBottomRetries = 5;
            let isAborted = false;
            let scrollCount = 0;
            let totalBlocksCollected = initialCollect.newCount;

            // ESC key handler
            const escHandler = (e) => {
                if (e.key === 'Escape') {
                    log('[ScrollCollect] ❌ User cancelled via ESC');
                    isAborted = true;
                    indicator.textContent = '❌ 已取消';
                    indicator.style.background = 'rgba(255, 59, 48, 0.95)';
                }
            };
            document.addEventListener('keydown', escHandler);

            const timer = setInterval(() => {
                scrollCount++;
                const elapsed = Date.now() - startTime;

                // Check abort or timeout
                if (isAborted || elapsed > maxTime) {
                    const reason = isAborted ? 'user_abort' : 'timeout';
                    log(`[ScrollCollect] ⏹️ Stopping - ${reason}`);
                    finish(reason);
                    return;
                }

                // Execute scroll
                if (isDocumentScroll) {
                    window.scrollBy(0, distance);
                } else {
                    scrollTarget.scrollTop += distance;
                }

                // Increased delay for DOM to update (especially for slow pages)
                setTimeout(() => {
                    // Collect content after scroll
                    const collected = collectVisibleContent(collectionTarget, seenFingerprints, isDocumentScroll);
                    if (collected.newCount > 0) {
                        collectedTexts.push(...collected.newTexts);
                        totalBlocksCollected += collected.newCount;
                        log(`[ScrollCollect] 📝 +${collected.newCount} blocks (total: ${totalBlocksCollected})`);
                        // Reset bottom retry when new content found
                        bottomRetryCount = 0;
                    }

                    // Calculate progress
                    const currentPos = isDocumentScroll
                        ? window.innerHeight + window.scrollY
                        : scrollTarget.scrollTop + scrollTarget.clientHeight;
                    const totalHeight = scrollTarget.scrollHeight;
                    const progress = Math.min(Math.round((currentPos / totalHeight) * 100), 100);
                    const remainingPx = totalHeight - currentPos;

                    indicator.textContent = `🔄 收集中... ${progress}% (${totalBlocksCollected} 块)`;

                    // Periodic progress report (every 10 scrolls)
                    if (scrollCount % 10 === 0) {
                        log(`[ScrollCollect] 📊 Progress: ${progress}% | Blocks: ${totalBlocksCollected} | Time: ${Math.round(elapsed/1000)}s`);
                    }

                    // Check if at bottom
                    if (remainingPx < 100) {
                        if (scrollTarget.scrollHeight === lastScrollHeight) {
                            bottomRetryCount++;
                            log(`[ScrollCollect] 🔻 At bottom - retry ${bottomRetryCount}/${maxBottomRetries}`);
                            if (bottomRetryCount >= maxBottomRetries) {
                                log(`[ScrollCollect] ✅ Reached bottom - no new content`);
                                indicator.textContent = '✅ 收集完成';
                                indicator.style.background = 'rgba(52, 199, 89, 0.95)';
                                finish('complete');
                                return;
                            }
                        } else {
                            log(`[ScrollCollect] 🆕 Height changed: ${lastScrollHeight} → ${scrollTarget.scrollHeight}px`);
                            bottomRetryCount = 0;
                        }
                    } else {
                        bottomRetryCount = 0;
                    }

                    lastScrollHeight = scrollTarget.scrollHeight;
                }, 150); // Increased from 50ms to 150ms for better rendering support
            }, interval);

            function finish(reason = 'unknown') {
                clearInterval(timer);
                document.removeEventListener('keydown', escHandler);

                // Final collection at current position
                const finalCollect = collectVisibleContent(collectionTarget, seenFingerprints, isDocumentScroll);
                if (finalCollect.newCount > 0) {
                    collectedTexts.push(...finalCollect.newTexts);
                    totalBlocksCollected += finalCollect.newCount;
                }

                log(`[ScrollCollect] 📊 Collection Summary`);
                log(`[ScrollCollect]   Reason: ${reason}`);
                log(`[ScrollCollect]   Total scrolls: ${scrollCount}`);
                log(`[ScrollCollect]   Blocks collected: ${totalBlocksCollected}`);
                log(`[ScrollCollect]   Duration: ${Date.now() - startTime}ms`);

                // Combine all collected texts
                const finalContent = collectedTexts.join('\n\n---\n\n');
                log(`[ScrollCollect]   Final content length: ${finalContent.length} chars`);

                setTimeout(() => {
                    // Return to top
                    if (isDocumentScroll) {
                        window.scrollTo(0, 0);
                    } else {
                        scrollTarget.scrollTop = 0;
                    }
                    log('[ScrollCollect] 🔝 Returned to top');

                    // Remove indicator after delay
                    setTimeout(() => {
                        if (indicator && indicator.parentNode) {
                            indicator.remove();
                        }
                    }, 1500);

                    resolve(finalContent);
                }, 500);
            }
        });
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

        // Helper to log both locally and to background
        const log = (msg) => {
            console.log(msg);
            try {
                chrome.runtime.sendMessage({ action: "DEBUG_LOG", message: msg });
            } catch (e) { /* ignore */ }
        };

        const isDocumentScroll = (
            scrollTarget === document.scrollingElement ||
            scrollTarget === document.documentElement ||
            scrollTarget === document.body
        );

        // Enhanced logging for debugging
        log(`[ScrollUtils] 🚀 Starting Auto-Scroll`);
        log(`[ScrollUtils] Target: ${isDocumentScroll ? 'document' : `${scrollTarget.tagName}.${scrollTarget.className?.split(' ')[0] || ''}`}`);
        log(`[ScrollUtils] Settings: interval=${interval}ms, maxTime=${maxTime}ms, distance=${distance}px`);
        log(`[ScrollUtils] Initial: scrollHeight=${scrollTarget.scrollHeight}px, clientHeight=${scrollTarget.clientHeight}px`);

        // Create indicator
        const indicator = createScrollIndicator();
        document.body.appendChild(indicator);

        return new Promise(resolve => {
            const startTime = Date.now();
            let lastScrollHeight = scrollTarget.scrollHeight;
            let bottomRetryCount = 0;
            const maxBottomRetries = 5; // Increased from 3 to 5 for better lazy-load detection
            let isAborted = false;
            let scrollCount = 0;

            // ESC key handler
            const escHandler = (e) => {
                if (e.key === 'Escape') {
                    log('[ScrollUtils] ❌ User cancelled via ESC');
                    isAborted = true;
                    indicator.textContent = '❌ 已取消滚动';
                    indicator.style.background = 'rgba(255, 59, 48, 0.95)';
                }
            };
            document.addEventListener('keydown', escHandler);

            const timer = setInterval(() => {
                scrollCount++;
                const elapsed = Date.now() - startTime;

                // Check abort or timeout
                if (isAborted || elapsed > maxTime) {
                    const reason = isAborted ? 'user_abort' : 'timeout';
                    log(`[ScrollUtils] ⏹️ Stopping - ${isAborted ? 'User aborted (ESC)' : `Timeout (${elapsed}ms > ${maxTime}ms)`}`);
                    log(`[ScrollUtils] Total scrolls: ${scrollCount}, Final height: ${scrollTarget.scrollHeight}px`);
                    finish(reason);
                    return;
                }

                // Get position BEFORE scroll
                const preScrollPos = isDocumentScroll
                    ? window.innerHeight + window.scrollY
                    : scrollTarget.scrollTop + scrollTarget.clientHeight;
                const preScrollHeight = scrollTarget.scrollHeight;

                // Execute scroll
                if (isDocumentScroll) {
                    window.scrollBy(0, distance);
                } else {
                    scrollTarget.scrollTop += distance;
                }

                // Calculate progress AFTER scroll
                const currentPos = isDocumentScroll
                    ? window.innerHeight + window.scrollY
                    : scrollTarget.scrollTop + scrollTarget.clientHeight;
                const totalHeight = scrollTarget.scrollHeight;
                const progress = Math.min(Math.round((currentPos / totalHeight) * 100), 100);
                const remainingPx = totalHeight - currentPos;

                indicator.textContent = `🔄 正在滚动... ${progress}%`;

                // Detailed logging every 5 scrolls or when near bottom
                const isNearBottom = remainingPx < 500;
                if (scrollCount % 5 === 0 || isNearBottom) {
                    log(`[ScrollUtils] #${scrollCount} | pos: ${Math.round(currentPos)}/${totalHeight}px | remaining: ${Math.round(remainingPx)}px | progress: ${progress}% | elapsed: ${elapsed}ms`);
                }

                // Check if at bottom (remaining < 100px)
                if (remainingPx < 100) {
                    // Check if height changed since last interval
                    if (scrollTarget.scrollHeight === lastScrollHeight) {
                        bottomRetryCount++;
                        log(`[ScrollUtils] 🔻 Bottom detected - retry ${bottomRetryCount}/${maxBottomRetries} | height stable at ${scrollTarget.scrollHeight}px`);

                        if (bottomRetryCount >= maxBottomRetries) {
                            log(`[ScrollUtils] ✅ Confirmed bottom - no new content after ${maxBottomRetries} retries`);
                            log(`[ScrollUtils] Total scrolls: ${scrollCount}, Final height: ${scrollTarget.scrollHeight}px, Time: ${elapsed}ms`);
                            indicator.textContent = '✅ 滚动完成';
                            indicator.style.background = 'rgba(52, 199, 89, 0.95)';
                            finish('complete');
                            return;
                        }
                    } else {
                        log(`[ScrollUtils] 🆕 New content loaded! | height: ${lastScrollHeight} → ${scrollTarget.scrollHeight}px (+${scrollTarget.scrollHeight - lastScrollHeight}px)`);
                        bottomRetryCount = 0;
                    }
                } else {
                    // Reset retry count when not at bottom
                    if (bottomRetryCount > 0) {
                        log(`[ScrollUtils] ↗️ Not at bottom anymore, reset retry count`);
                    }
                    bottomRetryCount = 0;
                }

                lastScrollHeight = scrollTarget.scrollHeight;
            }, interval);

            function finish(reason = 'unknown') {
                clearInterval(timer);
                document.removeEventListener('keydown', escHandler);

                log(`[ScrollUtils] 📊 Scroll Summary`);
                log(`[ScrollUtils]   Reason: ${reason}`);
                log(`[ScrollUtils]   Total scrolls: ${scrollCount}`);
                log(`[ScrollUtils]   Duration: ${Date.now() - startTime}ms`);
                log(`[ScrollUtils]   Final scrollHeight: ${scrollTarget.scrollHeight}px`);

                setTimeout(() => {
                    // Return to top
                    if (isDocumentScroll) {
                        window.scrollTo(0, 0);
                    } else {
                        scrollTarget.scrollTop = 0;
                    }
                    log('[ScrollUtils] 🔝 Returned to top');

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
        scrollAndCollectContent,
        getElementContent,
        // Helper functions for advanced usage
        generateFingerprint,
        findContentBlocks,
        collectVisibleContent
    };

})();
