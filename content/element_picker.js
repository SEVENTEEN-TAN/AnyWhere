// content/element_picker.js
// Element Picker with overlay-based highlighting (framework-agnostic)

(function () {
    'use strict';

    // =========================================================================
    // Overlay Manager - Creates independent highlight overlays
    // =========================================================================
    class OverlayManager {
        constructor() {
            this.container = null;
            this.overlays = new Map(); // element -> overlay div
            this.hoverOverlay = null;
            this.animationId = null;
        }

        init() {
            if (this.container) return;

            this.container = document.createElement('div');
            this.container.id = 'gemini-picker-overlays';
            this.container.style.cssText = `
                position: fixed;
                top: 0; left: 0;
                width: 100%; height: 100%;
                pointer-events: none;
                z-index: 2147483646;
            `;
            document.body.appendChild(this.container);

            // Hover overlay (follows mouse)
            this.hoverOverlay = document.createElement('div');
            this.hoverOverlay.style.cssText = `
                position: fixed;
                border: 2px solid #0b57d0;
                background: rgba(11, 87, 208, 0.08);
                pointer-events: none;
                transition: all 0.1s ease-out;
                display: none;
                box-sizing: border-box;
            `;
            this.container.appendChild(this.hoverOverlay);

            // Start position sync loop
            this.startSyncLoop();
        }

        destroy() {
            this.stopSyncLoop();
            if (this.container) {
                this.container.remove();
                this.container = null;
            }
            this.overlays.clear();
            this.hoverOverlay = null;
        }

        // Create overlay for selected element
        createOverlay(element, type = 'selected') {
            if (this.overlays.has(element)) return;

            const overlay = document.createElement('div');
            overlay.dataset.type = type;

            const colors = {
                selected: { border: '#0b57d0', bg: 'rgba(11, 87, 208, 0.12)' },
                sibling: { border: '#ff9800', bg: 'rgba(255, 152, 0, 0.1)' }
            };
            const color = colors[type] || colors.selected;

            overlay.style.cssText = `
                position: fixed;
                border: 3px dashed ${color.border};
                background: ${color.bg};
                pointer-events: none;
                box-sizing: border-box;
            `;

            this.container.appendChild(overlay);
            this.overlays.set(element, overlay);
            this.syncOverlayPosition(element, overlay);
        }

        // Remove overlay for element
        removeOverlay(element) {
            const overlay = this.overlays.get(element);
            if (overlay) {
                overlay.remove();
                this.overlays.delete(element);
            }
        }

        // Remove all overlays
        clearAll() {
            this.overlays.forEach((overlay) => overlay.remove());
            this.overlays.clear();
        }

        // Update hover overlay
        showHover(element) {
            if (!this.hoverOverlay || !element) return;

            const rect = element.getBoundingClientRect();
            this.hoverOverlay.style.display = 'block';
            this.hoverOverlay.style.left = `${rect.left}px`;
            this.hoverOverlay.style.top = `${rect.top}px`;
            this.hoverOverlay.style.width = `${rect.width}px`;
            this.hoverOverlay.style.height = `${rect.height}px`;
        }

        hideHover() {
            if (this.hoverOverlay) {
                this.hoverOverlay.style.display = 'none';
            }
        }

        // Sync single overlay position
        syncOverlayPosition(element, overlay) {
            if (!element.isConnected) {
                this.removeOverlay(element);
                return;
            }

            const rect = element.getBoundingClientRect();
            overlay.style.left = `${rect.left}px`;
            overlay.style.top = `${rect.top}px`;
            overlay.style.width = `${rect.width}px`;
            overlay.style.height = `${rect.height}px`;
        }

        // Sync all overlay positions (called on scroll/resize)
        syncAllPositions() {
            this.overlays.forEach((overlay, element) => {
                this.syncOverlayPosition(element, overlay);
            });
        }

        // Animation loop to keep overlays in sync
        startSyncLoop() {
            const sync = () => {
                this.syncAllPositions();
                this.animationId = requestAnimationFrame(sync);
            };
            this.animationId = requestAnimationFrame(sync);
        }

        stopSyncLoop() {
            if (this.animationId) {
                cancelAnimationFrame(this.animationId);
                this.animationId = null;
            }
        }
    }

    // =========================================================================
    // Element Picker
    // =========================================================================
    class ElementPicker {
        constructor() {
            this.isActive = false;
            this.overlayManager = new OverlayManager();

            // Current hover target
            this.currentElement = null;
            this.currentLevel = 0; // For level navigation

            // Selected elements
            this.selectedElements = new Set();

            // UI elements
            this.infoPanel = null;
            this.hint = null;

            // Callback
            this.callback = null;

            // Config
            this.ignoredTags = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'BR', 'HR', 'META', 'LINK', 'HEAD', 'SVG', 'PATH', 'HTML']);
            this.minSize = 20;

            // Bound handlers
            this.onMouseMove = this.handleMouseMove.bind(this);
            this.onMouseDown = this.handleMouseDown.bind(this);
            this.onKeyDown = this.handleKeyDown.bind(this);
            this.onWheel = this.handleWheel.bind(this);
            this.onScroll = this.handleScroll.bind(this);
        }

        // =====================================================================
        // Public API
        // =====================================================================

        start(callback) {
            if (this.isActive) {
                console.log('[ElementPicker] Already active');
                return;
            }

            this.callback = callback;
            this.isActive = true;
            this.selectedElements.clear();
            this.currentLevel = 0;

            this.overlayManager.init();
            this.createUI();
            this.attachListeners();

            console.log('[ElementPicker] Started');
        }

        stop() {
            if (!this.isActive) return;

            this.isActive = false;
            this.detachListeners();
            this.removeUI();
            this.overlayManager.destroy();
            this.selectedElements.clear();
            this.currentElement = null;

            console.log('[ElementPicker] Stopped');
        }

        // =====================================================================
        // UI Creation
        // =====================================================================

        createUI() {
            // Info panel
            this.infoPanel = document.createElement('div');
            this.infoPanel.id = 'gemini-picker-info';
            this.infoPanel.style.cssText = `
                position: fixed;
                z-index: 2147483647;
                background: rgba(20, 20, 20, 0.95);
                color: white;
                padding: 10px 14px;
                border-radius: 8px;
                font-size: 13px;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                box-shadow: 0 4px 20px rgba(0,0,0,0.4);
                display: none;
                max-width: 350px;
                line-height: 1.5;
                pointer-events: none;
            `;
            document.body.appendChild(this.infoPanel);

            // Hint bar
            this.hint = document.createElement('div');
            this.hint.id = 'gemini-picker-hint';
            this.hint.style.cssText = `
                position: fixed;
                top: 16px;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(0, 0, 0, 0.9);
                color: white;
                padding: 12px 20px;
                border-radius: 12px;
                font-size: 13px;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                z-index: 2147483648;
                pointer-events: none;
                box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                display: flex;
                gap: 16px;
                flex-wrap: wrap;
                justify-content: center;
            `;
            this.updateHint();
            document.body.appendChild(this.hint);
        }

        removeUI() {
            if (this.infoPanel) {
                this.infoPanel.remove();
                this.infoPanel = null;
            }
            if (this.hint) {
                this.hint.remove();
                this.hint = null;
            }
        }

        updateHint() {
            if (!this.hint) return;

            const count = this.selectedElements.size;
            const kbd = (text) => `<kbd style="background:#444;padding:2px 8px;border-radius:4px;font-size:12px">${text}</kbd>`;

            if (count === 0) {
                this.hint.innerHTML = `
                    <span>🎯 点击选择</span>
                    <span>${kbd('Ctrl+滚轮')} 切换层级</span>
                    <span>${kbd('S')} 同级全选</span>
                    <span>${kbd('ESC')} 取消</span>
                `;
            } else {
                this.hint.innerHTML = `
                    <span style="color:#4CAF50">✓ 已选 <b>${count}</b> 个</span>
                    <span>${kbd('Shift+点击')} 多选</span>
                    <span>${kbd('S')} 同级全选</span>
                    <span>${kbd('Enter')} 确认</span>
                    <span>${kbd('ESC')} 取消</span>
                `;
            }
        }

        updateInfoPanel(element, x, y) {
            if (!this.infoPanel || !element) {
                if (this.infoPanel) this.infoPanel.style.display = 'none';
                return;
            }

            const rect = element.getBoundingClientRect();
            const tag = element.tagName.toLowerCase();
            const id = element.id ? `#${element.id}` : '';
            const cls = element.className && typeof element.className === 'string'
                ? '.' + element.className.trim().split(/\s+/).slice(0, 2).join('.')
                : '';

            const isSelected = this.selectedElements.has(element);
            const siblings = this.getSiblings(element);
            const children = this.getSelectableChildren(element);

            let html = `
                <div style="font-weight:600;color:${isSelected ? '#4CAF50' : '#64B5F6'};margin-bottom:6px">
                    ${isSelected ? '✓ ' : ''}&lt;${tag}${id}${cls}&gt;
                </div>
                <div style="color:#999;font-size:12px">
                    📐 ${Math.round(rect.width)} × ${Math.round(rect.height)} px
                </div>
            `;

            if (siblings.length > 0) {
                html += `<div style="color:#ff9800;font-size:12px">👥 ${siblings.length} 个同级元素</div>`;
            }
            if (children.length > 0) {
                html += `<div style="color:#9C27B0;font-size:12px">📦 ${children.length} 个子容器</div>`;
            }

            this.infoPanel.innerHTML = html;
            this.infoPanel.style.display = 'block';

            // Position
            let left = x + 20;
            let top = y + 20;
            if (left + 350 > window.innerWidth) left = x - 370;
            if (top + 120 > window.innerHeight) top = y - 130;
            if (left < 10) left = 10;
            if (top < 10) top = 10;

            this.infoPanel.style.left = `${left}px`;
            this.infoPanel.style.top = `${top}px`;
        }

        // =====================================================================
        // Event Handlers
        // =====================================================================

        attachListeners() {
            document.addEventListener('mousemove', this.onMouseMove, true);
            document.addEventListener('mousedown', this.onMouseDown, true);
            document.addEventListener('keydown', this.onKeyDown, true);
            document.addEventListener('wheel', this.onWheel, { passive: false, capture: true });
            window.addEventListener('scroll', this.onScroll, true);
        }

        detachListeners() {
            document.removeEventListener('mousemove', this.onMouseMove, true);
            document.removeEventListener('mousedown', this.onMouseDown, true);
            document.removeEventListener('keydown', this.onKeyDown, true);
            document.removeEventListener('wheel', this.onWheel, true);
            window.removeEventListener('scroll', this.onScroll, true);
        }

        handleMouseMove(e) {
            const element = this.getElementAtPoint(e.clientX, e.clientY);
            if (!element) {
                this.overlayManager.hideHover();
                this.updateInfoPanel(null);
                return;
            }

            // Apply level offset
            const adjusted = this.applyLevelOffset(element);

            if (adjusted !== this.currentElement) {
                this.currentElement = adjusted;
                this.overlayManager.showHover(adjusted);
            }

            this.updateInfoPanel(adjusted, e.clientX, e.clientY);
        }

        handleMouseDown(e) {
            if (!this.currentElement) return;

            e.preventDefault();
            e.stopPropagation();

            if (e.shiftKey) {
                // Multi-select: toggle
                this.toggleSelection(this.currentElement);
            } else {
                // Single select: clear and select
                this.clearSelection();
                this.addToSelection(this.currentElement);
            }

            this.updateHint();
        }

        handleKeyDown(e) {
            switch (e.key) {
                case 'Escape':
                    e.preventDefault();
                    this.cancel();
                    break;

                case 'Enter':
                    e.preventDefault();
                    if (this.selectedElements.size > 0) {
                        this.confirm();
                    }
                    break;

                case 's':
                case 'S':
                    e.preventDefault();
                    if (this.currentElement) {
                        this.selectAllSiblings(this.currentElement);
                    }
                    break;

                case 'ArrowUp':
                    e.preventDefault();
                    this.navigateLevel(1); // Parent
                    break;

                case 'ArrowDown':
                    e.preventDefault();
                    this.navigateLevel(-1); // Child
                    break;
            }
        }

        handleWheel(e) {
            // Only intercept wheel when Ctrl is pressed (for level navigation)
            // Otherwise allow normal page scrolling
            if (!e.ctrlKey) {
                return; // Let the page scroll normally
            }

            e.preventDefault();
            e.stopPropagation();

            // Scroll up = parent, scroll down = child
            if (e.deltaY < 0) {
                this.navigateLevel(1);
            } else {
                this.navigateLevel(-1);
            }
        }

        handleScroll() {
            // Overlay positions are synced via requestAnimationFrame
        }

        // =====================================================================
        // Element Navigation
        // =====================================================================

        getElementAtPoint(x, y) {
            const elements = document.elementsFromPoint(x, y);

            for (const el of elements) {
                // Skip our UI elements
                if (el.id && el.id.startsWith('gemini-picker')) continue;
                if (el.closest('#gemini-picker-overlays')) continue;

                // Skip ignored tags
                if (this.ignoredTags.has(el.tagName)) continue;

                // Skip too small elements
                const rect = el.getBoundingClientRect();
                if (rect.width < this.minSize || rect.height < this.minSize) continue;

                return el;
            }
            return null;
        }

        applyLevelOffset(element) {
            if (this.currentLevel === 0) return element;

            let current = element;

            if (this.currentLevel > 0) {
                // Navigate up
                for (let i = 0; i < this.currentLevel && current.parentElement; i++) {
                    if (current.parentElement !== document.body &&
                        current.parentElement !== document.documentElement) {
                        current = current.parentElement;
                    }
                }
            } else {
                // Navigate down (find first suitable child)
                for (let i = 0; i < Math.abs(this.currentLevel); i++) {
                    const children = this.getSelectableChildren(current);
                    if (children.length > 0) {
                        current = children[0];
                    }
                }
            }

            return current;
        }

        navigateLevel(delta) {
            this.currentLevel += delta;

            // Clamp level
            if (this.currentLevel < -5) this.currentLevel = -5;
            if (this.currentLevel > 10) this.currentLevel = 10;

            // Re-apply to current element
            if (this.currentElement) {
                // Find base element (before level adjustment)
                let base = this.currentElement;

                // Apply new level
                const adjusted = this.applyLevelOffset(base);
                this.currentElement = adjusted;
                this.overlayManager.showHover(adjusted);
            }

            console.log('[ElementPicker] Level:', this.currentLevel);
        }

        getSelectableChildren(element) {
            const children = [];
            for (const child of element.children) {
                if (this.ignoredTags.has(child.tagName)) continue;
                const rect = child.getBoundingClientRect();
                if (rect.width >= this.minSize && rect.height >= this.minSize) {
                    children.push(child);
                }
            }
            return children;
        }

        getSiblings(element) {
            if (!element.parentElement) return [];

            const siblings = [];
            const tag = element.tagName;
            const cls = element.className?.split(' ')[0];

            for (const sibling of element.parentElement.children) {
                if (sibling === element) continue;
                if (sibling.tagName !== tag) continue;

                // Check class similarity
                const siblingCls = sibling.className?.split(' ')[0];
                if (cls && siblingCls && cls === siblingCls) {
                    siblings.push(sibling);
                } else if (!cls && !siblingCls) {
                    siblings.push(sibling);
                }
            }

            return siblings;
        }

        // =====================================================================
        // Selection Management
        // =====================================================================

        addToSelection(element) {
            if (this.selectedElements.has(element)) return;

            this.selectedElements.add(element);
            this.overlayManager.createOverlay(element, 'selected');
            console.log('[ElementPicker] Selected:', element.tagName, 'Total:', this.selectedElements.size);
        }

        removeFromSelection(element) {
            if (!this.selectedElements.has(element)) return;

            this.selectedElements.delete(element);
            this.overlayManager.removeOverlay(element);
        }

        toggleSelection(element) {
            if (this.selectedElements.has(element)) {
                this.removeFromSelection(element);
            } else {
                this.addToSelection(element);
            }
        }

        clearSelection() {
            this.selectedElements.forEach(el => {
                this.overlayManager.removeOverlay(el);
            });
            this.selectedElements.clear();
        }

        selectAllSiblings(element) {
            // Add current element first
            this.addToSelection(element);

            // Add all siblings
            const siblings = this.getSiblings(element);
            for (const sibling of siblings) {
                this.addToSelection(sibling);
            }

            this.updateHint();
            console.log('[ElementPicker] Selected siblings, total:', this.selectedElements.size);
        }

        // =====================================================================
        // Confirm / Cancel
        // =====================================================================

        cancel() {
            console.log('[ElementPicker] Cancelled');
            this.stop();

            if (this.callback) {
                this.callback(null);
            }
        }

        confirm() {
            console.log('[ElementPicker] Confirmed, elements:', this.selectedElements.size);

            const elements = Array.from(this.selectedElements);

            // Get the first element's scrollable parent for scrolling
            const firstEl = elements[0];
            let scrollInfo = null;

            if (firstEl) {
                const ScrollUtils = window.GeminiScrollUtils;
                if (ScrollUtils) {
                    const scrollable = ScrollUtils.isScrollable(firstEl);
                    if (scrollable.isScrollableY) {
                        scrollInfo = { element: firstEl, isScrollable: true };
                    } else {
                        // Find scrollable parent
                        let parent = firstEl.parentElement;
                        while (parent && parent !== document.body) {
                            if (ScrollUtils.isScrollable(parent).isScrollableY) {
                                scrollInfo = { element: parent, isScrollable: true };
                                break;
                            }
                            parent = parent.parentElement;
                        }
                    }
                }
            }

            // Prepare result
            const result = {
                elements: elements,
                elementCount: elements.length,
                isMultiple: elements.length > 1,
                scrollInfo: scrollInfo,
                // For compatibility
                element: elements[0],
                selector: elements[0] ? this.generateSelector(elements[0]) : '',
                isScrollable: scrollInfo?.isScrollable || false,
                rect: elements[0]?.getBoundingClientRect()
            };

            this.stop();

            if (this.callback) {
                this.callback(result);
            }
        }

        generateSelector(element) {
            if (!element) return '';
            if (element.id) return `#${element.id}`;

            const path = [];
            let current = element;

            while (current && current !== document.body && path.length < 5) {
                let selector = current.tagName.toLowerCase();
                if (current.id) {
                    path.unshift(`#${current.id}`);
                    break;
                }
                if (current.className && typeof current.className === 'string') {
                    const cls = current.className.trim().split(/\s+/)[0];
                    if (cls && !/^(ember|react|vue|ng-)/.test(cls)) {
                        selector += `.${cls}`;
                    }
                }
                path.unshift(selector);
                current = current.parentElement;
            }

            return path.join(' > ');
        }
    }

    // =========================================================================
    // Singleton & Export
    // =========================================================================

    const picker = new ElementPicker();

    window.GeminiElementPicker = {
        start(callback) {
            picker.start(callback);
        },
        stop() {
            picker.stop();
        },
        isActive() {
            return picker.isActive;
        }
    };

    // =========================================================================
    // Message Listener (for when script is dynamically injected)
    // =========================================================================

    if (!window._geminiElementPickerListenerAdded) {
        window._geminiElementPickerListenerAdded = true;

        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === 'START_ELEMENT_PICKER') {
                console.log('[ElementPicker] Received START_ELEMENT_PICKER message');

                const ScrollUtils = window.GeminiScrollUtils;

                picker.start(async (result) => {
                    if (!result) {
                        console.log('[ElementPicker] User cancelled');
                        chrome.runtime.sendMessage({ action: 'ELEMENT_PICKER_CANCELLED' });
                        return;
                    }

                    // Get elements array
                    const elements = result.elements || [result.element];
                    console.log(`[ElementPicker] Processing ${elements.length} elements`);

                    // Load scroll settings
                    let interval = 200;
                    let maxTime = 15000;
                    try {
                        const settings = await chrome.storage.local.get(['geminiAutoScrollInterval', 'geminiAutoScrollMaxTime']);
                        interval = parseInt(settings.geminiAutoScrollInterval) || 200;
                        maxTime = parseInt(settings.geminiAutoScrollMaxTime) || 15000;
                    } catch (e) {
                        console.warn('[ElementPicker] Failed to load settings:', e);
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

                    // Collect content using incremental collection for SPA support
                    const allContents = [];
                    const firstEl = elements[0];

                    // Check if selected element or its parent is scrollable
                    const isFirstElScrollable = ScrollUtils && ScrollUtils.isScrollable(firstEl).isScrollableY;
                    const scrollableParent = findScrollableParent(firstEl);

                    if (isFirstElScrollable && ScrollUtils && ScrollUtils.scrollAndCollectContent) {
                        // Selected element itself is scrollable - use incremental collection
                        console.log(`[ElementPicker] Selected element is scrollable, using incremental collection`);
                        try {
                            const content = await ScrollUtils.scrollAndCollectContent(firstEl, { interval, maxTime });
                            if (content) allContents.push(content);
                        } catch (e) {
                            console.warn('[ElementPicker] Incremental scroll failed:', e);
                        }
                    } else if (scrollableParent && ScrollUtils && ScrollUtils.scrollAndCollectContent) {
                        // Parent container is scrollable - use incremental collection on parent
                        console.log(`[ElementPicker] Found scrollable parent: ${scrollableParent.tagName}`);
                        try {
                            const content = await ScrollUtils.scrollAndCollectContent(scrollableParent, { interval, maxTime });
                            if (content) allContents.push(content);
                        } catch (e) {
                            console.warn('[ElementPicker] Incremental scroll failed:', e);
                        }
                    } else if (ScrollUtils && ScrollUtils.scrollAndCollectContent && ScrollUtils.isScrollable(document).isScrollableY) {
                        // Fallback: Document itself is scrollable, use it as scroll target but collect from selected element
                        console.log(`[ElementPicker] No scrollable parent found, using document scroll fallback`);
                        try {
                            const target = document.scrollingElement || document.documentElement || document.body;
                            // Critical: Pass collectionTarget to only collect content from the user's selection
                            const content = await ScrollUtils.scrollAndCollectContent(target, {
                                interval,
                                maxTime,
                                collectionTarget: firstEl
                            });
                            if (content) allContents.push(content);
                        } catch (e) {
                            console.warn('[ElementPicker] Document scroll failed:', e);
                        }
                    } else {
                        // No scrollable container or scrollAndCollectContent not available - get static content
                        console.log(`[ElementPicker] No scrollable container, getting static content`);
                        for (const el of elements) {
                            let text = el.innerText || '';
                            text = text
                                .split('\n')
                                .map(line => line.trim())
                                .filter(line => line.length > 0)
                                .join('\n')
                                .replace(/\n{3,}/g, '\n\n')
                                .replace(/[ \t]{2,}/g, ' ')
                                .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '')
                                .trim();

                            if (text) allContents.push(text);
                        }
                    }

                    const finalContent = allContents.length > 1
                        ? allContents.join('\n\n---\n\n')
                        : allContents[0] || '';

                    console.log(`[ElementPicker] Captured ${finalContent.length} chars from ${elements.length} elements`);

                    // Send result
                    chrome.runtime.sendMessage({
                        action: 'ELEMENT_PICKED',
                        payload: {
                            selector: result.selector,
                            isScrollable: result.isScrollable,
                            content: finalContent,
                            elementCount: elements.length,
                            rect: result.rect
                        }
                    });
                });

                sendResponse({ status: 'picker_started' });
                return true;
            }
        });

        console.log('[ElementPicker] Message listener registered');
    }

    console.log('[ElementPicker] Module loaded (overlay-based)');
})();
