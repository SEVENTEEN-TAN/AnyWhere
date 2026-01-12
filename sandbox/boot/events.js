
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
    // Summarize Button (Combined with MindMap) - Now with Element Picker
    const summarizeBtn = document.getElementById('summarize-btn');
    if (summarizeBtn) {
        summarizeBtn.addEventListener('click', async () => {
            // Set pending action to 'summarize' - will be used when element is picked
            app.pendingSummarize = true;
            ui.updateStatus(t('selectElement') || 'Select content area...');
            sendToBackground({ action: "START_ELEMENT_PICKER" });
        });
    }

    // Video Summary Button
    const videoSummaryBtn = document.getElementById('video-summary-btn');
    if (videoSummaryBtn) {
        videoSummaryBtn.addEventListener('click', () => {
            if (app.handleVideoSummary) {
                app.handleVideoSummary();
            } else {
                console.error('AppController.handleVideoSummary is not defined');
            }
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

    // Page Context Toggle - Now uses Element Picker
    const contextBtn = document.getElementById('page-context-btn');
    if (contextBtn) {
        contextBtn.addEventListener('click', () => {
            // If already active, disable it
            if (app.pageContextActive) {
                app.togglePageContext();
                return;
            }

            // Otherwise, start element picker to select content
            app.pendingPageContext = true;
            ui.updateStatus(t('selectElement') || 'Select content area...');
            sendToBackground({ action: "START_ELEMENT_PICKER" });
        });
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
