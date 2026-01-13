
// sidepanel/index.js - Bridge between Sandbox and Background

/** @type {HTMLIFrameElement} */
const iframe = /** @type {HTMLIFrameElement} */ (document.getElementById('sandbox-frame'));
/** @type {HTMLElement} */
const skeleton = /** @type {HTMLElement} */ (document.getElementById('skeleton'));

// --- Optimization: 1. Instant Load (Sync) ---
// We use localStorage for Theme/Lang to avoid waiting for async chrome.storage
// This ensures the iframe request starts in the very same Event Loop tick.
const cachedTheme = localStorage.getItem('geminiTheme') || 'system';
const cachedLang = localStorage.getItem('geminiLanguage') || 'system';

// Set src immediately to start loading HTML (Parallel with storage fetch)
iframe.src = `../sandbox/index.html?theme=${cachedTheme}&lang=${cachedLang}`;

// Get Version from Manifest
const appVersion = chrome.runtime.getManifest().version;


// --- Optimization: 2. Async Data Fetch ---
let preFetchedData = null;
let uiIsReady = false;

// Start fetching bulk data (sessions) immediately
chrome.storage.local.get([
    'geminiSessions',
    'pendingSessionId',
    'geminiShortcuts',
    'geminiModel',
    'pendingImage',
    'geminiSidebarBehavior', // New preference
    'geminiTextSelectionEnabled',
    'geminiImageToolsEnabled',
    'geminiImageToolsEnabled',
    'gemini_gem_id'
], (result) => {
    preFetchedData = result;
    trySendInitData();
});

// --- Helper: Send Data when both UI and Data are ready ---
function trySendInitData() {
    if (!uiIsReady && !iframe.contentWindow) return; // Allow if contentWindow exists for forced load

    // 1. Reveal Iframe
    iframe.classList.add('loaded');
    if (skeleton) skeleton.classList.add('hidden');

    const win = iframe.contentWindow;
    if (!win) return;

    // 2. Push Data (if ready)
    if (preFetchedData) {

        // Push Sidebar Behavior (Must be sent before RESTORE_SESSIONS to ensure logic applies correctly)
        win.postMessage({
            action: 'RESTORE_SIDEBAR_BEHAVIOR',
            payload: preFetchedData.geminiSidebarBehavior || 'auto'
        }, '*');

        // Push Sessions
        win.postMessage({
            action: 'RESTORE_SESSIONS',
            payload: preFetchedData.geminiSessions || []
        }, '*');

        // Push Shortcuts
        win.postMessage({
            action: 'RESTORE_SHORTCUTS',
            payload: preFetchedData.geminiShortcuts || null
        }, '*');

        // Push Model
        win.postMessage({
            action: 'RESTORE_MODEL',
            payload: preFetchedData.geminiModel || 'gemini-2.5-flash'
        }, '*');

        // Push Text Selection State
        win.postMessage({
            action: 'RESTORE_TEXT_SELECTION',
            payload: preFetchedData.geminiTextSelectionEnabled !== false
        }, '*');

        // Push Image Tools State
        win.postMessage({
            action: 'RESTORE_IMAGE_TOOLS',
            payload: preFetchedData.geminiImageToolsEnabled !== false
        }, '*');

        // Handle Pending Session Switch
        if (preFetchedData.pendingSessionId) {
            win.postMessage({
                action: 'BACKGROUND_MESSAGE',
                payload: {
                    action: 'SWITCH_SESSION',
                    sessionId: preFetchedData.pendingSessionId
                }
            }, '*');
            // Cleanup
            chrome.storage.local.remove('pendingSessionId');
            delete preFetchedData.pendingSessionId;
        }

        // Handle Pending Image (Screenshot)
        if (preFetchedData.pendingImage) {
            win.postMessage({
                action: 'BACKGROUND_MESSAGE',
                payload: preFetchedData.pendingImage
            }, '*');
            chrome.storage.local.remove('pendingImage');
            delete preFetchedData.pendingImage;
        }
    }

    // Push Language (Confirming storage value)
    win.postMessage({
        action: 'RESTORE_LANGUAGE',
        payload: cachedLang
    }, '*');

    // Push Theme (Confirming storage value)
    win.postMessage({
        action: 'RESTORE_THEME',
        payload: cachedTheme
    }, '*');

    // Push Version
    win.postMessage({
        action: 'RESTORE_VERSION',
        payload: appVersion
    }, '*');
}

// --- Safety Timeout ---
// Force remove skeleton after 1s if something goes wrong with the handshake
setTimeout(() => {
    if (!uiIsReady) {
        console.warn("UI_READY signal timeout, forcing skeleton removal");
        iframe.classList.add('loaded');
        if (skeleton) skeleton.classList.add('hidden');
    }
}, 1000);

// --- Message Handling ---

window.addEventListener('message', (event) => {
    // Only accept messages from our direct iframe
    if (iframe.contentWindow && event.source !== iframe.contentWindow) return;

    const { action, payload } = event.data;

    // --- Fast Handshake: UI Ready ---
    // The sandbox sends this as soon as JS modules load
    if (action === 'UI_READY') {
        uiIsReady = true;
        trySendInitData();
        return;
    }

    // --- Open Full Page in New Tab ---
    if (action === 'OPEN_FULL_PAGE') {
        const url = chrome.runtime.getURL('sidepanel/index.html');
        chrome.tabs.create({ url });
        return;
    }

    // --- Open URL in New Tab (From Sandbox Links) ---
    if (action === 'OPEN_URL') {
        // Handle direct url property (from events.js) or payload structure
        const url = event.data.url || (payload && (payload.url || payload));
        if (url && typeof url === 'string') {
            chrome.tabs.create({ url });
        }
        return;
    }

    // --- Open Tab in Background (without switching focus) ---
    if (action === 'OPEN_TAB_BACKGROUND') {
        chrome.runtime.sendMessage({ action: 'OPEN_TAB_BACKGROUND', url: event.data.url });
        return;
    }

    // --- Standard Message Forwarding ---

    if (action === 'FORWARD_TO_BACKGROUND') {
        chrome.runtime.sendMessage(payload)
            .then(response => {
                // If it's a request demanding a reply (like GET_LOGS), send it back
                // If it's a request demanding a reply (like GET_LOGS), send it back
                const replyActions = ['GET_LOGS', 'MCP_GET_CONFIG', 'MCP_SAVE_CONFIG', 'MCP_GET_TOOLS'];
                if (replyActions.includes(payload.action) && response && iframe.contentWindow) {
                    iframe.contentWindow.postMessage({
                        action: 'BACKGROUND_MESSAGE',
                        payload: response
                    }, '*');
                }
            })
            .catch(err => {
                console.warn("Error forwarding to background:", err);
            });
    }

    // --- Data Requests from Sandbox ---

    // --- GEMS LIST REQUEST ---
    if (action === 'FETCH_GEMS_LIST') {
        const messageId = event.data.messageId;
        const userIndex = event.data.userIndex || '0';
        const forceRefresh = event.data.forceRefresh || false;

        console.log('[Sidepanel] FETCH_GEMS_LIST request received:', { messageId, userIndex, forceRefresh });

        chrome.runtime.sendMessage({
            action: 'FETCH_GEMS_LIST',
            userIndex: userIndex,
            forceRefresh: forceRefresh
        }, (response) => {
            // Check for Chrome runtime errors
            if (chrome.runtime.lastError) {
                console.error('[Sidepanel] FETCH_GEMS_LIST runtime error:', chrome.runtime.lastError.message);
                if (iframe.contentWindow) {
                    iframe.contentWindow.postMessage({
                        action: 'GEMS_LIST_RESPONSE',
                        messageId: messageId,
                        response: { gems: [], error: chrome.runtime.lastError.message }
                    }, '*');
                }
                return;
            }

            console.log('[Sidepanel] FETCH_GEMS_LIST response from background:', response);
            if (iframe.contentWindow) {
                iframe.contentWindow.postMessage({
                    action: 'GEMS_LIST_RESPONSE',
                    messageId: messageId,
                    response: response
                }, '*');
            }
        });
        return;
    }

    // --- MODELS LIST REQUEST ---
    if (action === 'FETCH_MODELS_LIST') {
        const messageId = event.data.messageId;
        const userIndex = event.data.userIndex || '0';
        const forceRefresh = event.data.forceRefresh || false;

        console.log('[Sidepanel] FETCH_MODELS_LIST request received:', { messageId, userIndex, forceRefresh });

        chrome.runtime.sendMessage({
            action: 'FETCH_MODELS_LIST',
            userIndex: userIndex,
            forceRefresh: forceRefresh
        }, (response) => {
            // Check for Chrome runtime errors
            if (chrome.runtime.lastError) {
                console.error('[Sidepanel] FETCH_MODELS_LIST runtime error:', chrome.runtime.lastError.message);
                if (iframe.contentWindow) {
                    iframe.contentWindow.postMessage({
                        action: 'MODELS_LIST_RESPONSE',
                        messageId: messageId,
                        response: { models: [], error: chrome.runtime.lastError.message }
                    }, '*');
                }
                return;
            }

            console.log('[Sidepanel] FETCH_MODELS_LIST response from background:', response);
            if (iframe.contentWindow) {
                iframe.contentWindow.postMessage({
                    action: 'MODELS_LIST_RESPONSE',
                    messageId: messageId,
                    response: response
                }, '*');
            }
        });
        return;
    }

    if (action === 'DOWNLOAD_IMAGE') {
        const { url, filename } = payload;
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return;
    }

    if (action === 'DOWNLOAD_LOGS') {
        const { text, filename } = payload;
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || `gemini-nexus-logs.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return;
    }

    if (action === 'GET_THEME') {
        const theme = localStorage.getItem('geminiTheme') || 'system';
        if (iframe.contentWindow) {
            iframe.contentWindow.postMessage({
                action: 'RESTORE_THEME',
                payload: theme
            }, '*');
        }
    }

    if (action === 'GET_LANGUAGE') {
        const lang = localStorage.getItem('geminiLanguage') || 'system';
        if (iframe.contentWindow) {
            iframe.contentWindow.postMessage({
                action: 'RESTORE_LANGUAGE',
                payload: lang
            }, '*');
        }
    }

    if (action === 'GET_VERSION') {
        const appVersion = chrome.runtime.getManifest().version;
        if (iframe.contentWindow) {
            iframe.contentWindow.postMessage({
                action: 'RESTORE_VERSION',
                payload: appVersion
            }, '*');
        }
    }

    if (action === 'GET_TEXT_SELECTION') {
        chrome.storage.local.get(['geminiTextSelectionEnabled'], (res) => {
            const enabled = res.geminiTextSelectionEnabled !== false; // Default true
            if (iframe.contentWindow) {
                iframe.contentWindow.postMessage({
                    action: 'RESTORE_TEXT_SELECTION',
                    payload: enabled
                }, '*');
            }
        });
    }

    if (action === 'GET_IMAGE_TOOLS') {
        chrome.storage.local.get(['geminiImageToolsEnabled'], (res) => {
            const enabled = res.geminiImageToolsEnabled !== false; // Default true
            if (iframe.contentWindow) {
                iframe.contentWindow.postMessage({
                    action: 'RESTORE_IMAGE_TOOLS',
                    payload: enabled
                }, '*');
            }
        });
    }

    if (action === 'GET_WORKSPACE_SETTINGS') {
        chrome.storage.local.get(['geminiWorkspacePath', 'geminiWorkspacePrompt'], (res) => {
            if (iframe.contentWindow) {
                iframe.contentWindow.postMessage({
                    action: 'RESTORE_WORKSPACE_SETTINGS',
                    payload: {
                        path: res.geminiWorkspacePath || '',
                        prompt: res.geminiWorkspacePrompt !== false // Default true
                    }
                }, '*');
            }
        });
    }

    if (action === 'GET_AUTO_SCROLL_SETTINGS') {
        chrome.storage.local.get(['geminiAutoScrollInterval', 'geminiAutoScrollMaxTime', 'geminiContextLimit'], (res) => {
            if (iframe.contentWindow) {
                iframe.contentWindow.postMessage({
                    action: 'RESTORE_AUTO_SCROLL_SETTINGS',
                    payload: {
                        interval: res.geminiAutoScrollInterval !== undefined ? res.geminiAutoScrollInterval : 200,
                        maxTime: res.geminiAutoScrollMaxTime !== undefined ? res.geminiAutoScrollMaxTime : 15000,
                        contextLimit: res.geminiContextLimit !== undefined ? res.geminiContextLimit : 500000
                    }
                }, '*');
            }
        });
    }

    // --- Sync Storage Updates back to Local Cache (For Speed next time) ---

    if (action === 'SAVE_SESSIONS') {
        chrome.storage.local.set({ geminiSessions: payload });
        if (preFetchedData) preFetchedData.geminiSessions = payload;
    }
    if (action === 'SAVE_SHORTCUTS') {
        chrome.storage.local.set({ geminiShortcuts: payload });
        if (preFetchedData) preFetchedData.geminiShortcuts = payload;
    }
    if (action === 'SAVE_MODEL') {
        chrome.storage.local.set({ geminiModel: payload });
        if (preFetchedData) preFetchedData.geminiModel = payload;
    }
    if (action === 'SAVE_THEME') {
        chrome.storage.local.set({ geminiTheme: payload });
        localStorage.setItem('geminiTheme', payload); // Cache for Sync Load
    }
    if (action === 'SAVE_LANGUAGE') {
        chrome.storage.local.set({ geminiLanguage: payload });
        localStorage.setItem('geminiLanguage', payload); // Cache for Sync Load
    }
    if (action === 'SAVE_TEXT_SELECTION') {
        chrome.storage.local.set({ geminiTextSelectionEnabled: payload });
        if (preFetchedData) preFetchedData.geminiTextSelectionEnabled = payload;
    }
    if (action === 'SAVE_IMAGE_TOOLS') {
        chrome.storage.local.set({ geminiImageToolsEnabled: payload });
        if (preFetchedData) preFetchedData.geminiImageToolsEnabled = payload;
    }
    if (action === 'SAVE_SIDEBAR_BEHAVIOR') {
        chrome.storage.local.set({ geminiSidebarBehavior: payload });
        if (preFetchedData) preFetchedData.geminiSidebarBehavior = payload;
    }
    if (action === 'SAVE_GEM_ID') {
        chrome.storage.local.set({ gemini_gem_id: payload });
        if (preFetchedData) preFetchedData.gemini_gem_id = payload;
    }
    if (action === 'SAVE_WORKSPACE_PATH') {
        chrome.storage.local.set({ geminiWorkspacePath: payload });
    }
    if (action === 'SAVE_WORKSPACE_PROMPT') {
        chrome.storage.local.set({ geminiWorkspacePrompt: payload });
    }
    if (action === 'SAVE_AUTO_SCROLL_SETTINGS') {
        const { interval, maxTime } = payload;
        chrome.storage.local.set({
            geminiAutoScrollInterval: interval,
            geminiAutoScrollMaxTime: maxTime
        });
    }
    if (action === 'SAVE_CONTEXT_LIMIT') {
        chrome.storage.local.set({ geminiContextLimit: payload });
    }

    if (action === 'DOWNLOAD_SVG') {
        const { svg, filename } = payload;

        try {
            const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
            const url = URL.createObjectURL(svgBlob);

            const a = document.createElement('a');
            a.href = url;
            a.download = filename || 'mindmap.svg';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            URL.revokeObjectURL(url);
        } catch (e) {
            console.error("Error in DOWNLOAD_SVG", e);
        }
    }

    if (action === 'DOWNLOAD_MINDMAP_PNG') {
        const { svgHtml, width, height, filename } = payload;

        // Create an off-screen container in the Sidepanel (Trusted Context)
        const container = document.createElement('div');
        container.style.position = 'absolute';
        container.style.top = '-9999px';
        container.style.left = '-9999px';
        container.style.width = width ? `${width}px` : 'auto';
        container.style.height = height ? `${height}px` : 'auto';
        container.style.background = '#ffffff'; // Ensure white background
        container.innerHTML = svgHtml;

        document.body.appendChild(container);

        try {
            // Use html2canvas in this trusted context
            // Note: Since we are in extension context, this should work fine
            window.html2canvas(container, {
                backgroundColor: '#ffffff',
                scale: 2,
                logging: false,
                useCORS: true
            }).then(canvas => {
                canvas.toBlob(blob => {
                    if (blob) {
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = filename || 'mindmap.png';
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                    }
                    // Cleanup
                    document.body.removeChild(container);
                }, 'image/png');
            }).catch(err => {
                console.error("Sidepanel html2canvas failed:", err);
                document.body.removeChild(container);
            });
        } catch (e) {
            console.error("Error initiating html2canvas in Sidepanel:", e);
            if (container.parentNode) document.body.removeChild(container);
        }
    }
});

// Forward messages from Background to Sandbox
chrome.runtime.onMessage.addListener((message) => {
    // Display DEBUG_LOG in sidepanel console for easier debugging
    if (message.action === 'DEBUG_LOG') {
        console.log(`%c${message.message}`, 'color: #ff9800');
        return;
    }

    if (message.action === 'SESSIONS_UPDATED') {
        if (preFetchedData) preFetchedData.geminiSessions = message.sessions;
        if (iframe.contentWindow) {
            iframe.contentWindow.postMessage({
                action: 'RESTORE_SESSIONS',
                payload: message.sessions
            }, '*');
        }
        return;
    }

    if (iframe.contentWindow) {
        iframe.contentWindow.postMessage({
            action: 'BACKGROUND_MESSAGE',
            payload: message
        }, '*');
    }
});
