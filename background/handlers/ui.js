
// background/handlers/ui.js

export class UIMessageHandler {
    constructor(imageHandler) {
        this.imageHandler = imageHandler;
    }

    handle(request, sender, sendResponse) {

        // --- IMAGE FETCHING (USER INPUT) ---
        if (request.action === "FETCH_IMAGE") {
            (async () => {
                try {
                    const result = await this.imageHandler.fetchImage(request.url);
                    chrome.runtime.sendMessage(result).catch(() => { });
                } catch (e) {
                    console.error("Fetch image error", e);
                } finally {
                    sendResponse({ status: "completed" });
                }
            })();
            return true;
        }

        // --- IMAGE FETCHING (GENERATED DISPLAY) ---
        if (request.action === "FETCH_GENERATED_IMAGE") {
            (async () => {
                try {
                    const result = await this.imageHandler.fetchImage(request.url);

                    const payload = {
                        action: "GENERATED_IMAGE_RESULT",
                        reqId: request.reqId,
                        base64: result.base64,
                        error: result.error
                    };

                    // Send back to the specific sender (Tab or Extension Page)
                    if (sender.tab) {
                        chrome.tabs.sendMessage(sender.tab.id, payload).catch(() => { });
                    } else {
                        chrome.runtime.sendMessage(payload).catch(() => { });
                    }

                } catch (e) {
                    console.error("Fetch generated image error", e);
                    const payload = {
                        action: "GENERATED_IMAGE_RESULT",
                        reqId: request.reqId,
                        error: e.message
                    };
                    if (sender.tab) {
                        chrome.tabs.sendMessage(sender.tab.id, payload).catch(() => { });
                    } else {
                        chrome.runtime.sendMessage(payload).catch(() => { });
                    }
                } finally {
                    sendResponse({ status: "completed" });
                }
            })();
            return true;
        }

        if (request.action === "CAPTURE_SCREENSHOT") {
            (async () => {
                try {
                    const result = await this.imageHandler.captureScreenshot();
                    chrome.runtime.sendMessage(result).catch(() => { });
                } catch (e) {
                    console.error("Screenshot error", e);
                } finally {
                    sendResponse({ status: "completed" });
                }
            })();
            return true;
        }

        // --- SIDEPANEL & SELECTION ---

        if (request.action === "OPEN_SIDE_PANEL") {
            this._handleOpenSidePanel(request, sender).finally(() => {
                sendResponse({ status: "opened" });
            });
            return true;
        }

        if (request.action === "INITIATE_CAPTURE") {
            (async () => {
                const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
                if (tab) {
                    // Pre-capture for the overlay background
                    const capture = await this.imageHandler.captureScreenshot();
                    chrome.tabs.sendMessage(tab.id, {
                        action: "START_SELECTION",
                        image: capture.base64,
                        mode: request.mode, // Forward the mode (ocr, snip, translate)
                        source: request.source // Forward the source (sidepanel or local)
                    }).catch(() => { });
                }
            })();
            return false;
        }

        if (request.action === "AREA_SELECTED") {
            (async () => {
                try {
                    const result = await this.imageHandler.captureArea(request.area);
                    if (result && sender.tab) {
                        // Send specifically to the tab that initiated the selection
                        chrome.tabs.sendMessage(sender.tab.id, result).catch(() => { });
                    }
                } catch (e) {
                    console.error("Area capture error", e);
                } finally {
                    sendResponse({ status: "completed" });
                }
            })();
            return true;
        }

        if (request.action === "PROCESS_CROP_IN_SIDEPANEL") {
            // Broadcast the crop result to runtime so Side Panel can pick it up
            chrome.runtime.sendMessage(request.payload).catch(() => { });
            sendResponse({ status: "forwarded" });
            return true;
        }

        if (request.action === "GET_ACTIVE_SELECTION") {
            (async () => {
                const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
                if (tab) {
                    try {
                        const response = await chrome.tabs.sendMessage(tab.id, { action: "GET_SELECTION" });
                        chrome.runtime.sendMessage({
                            action: "SELECTION_RESULT",
                            text: response ? response.selection : ""
                        }).catch(() => { });
                    } catch (e) {
                        chrome.runtime.sendMessage({ action: "SELECTION_RESULT", text: "" }).catch(() => { });
                    }
                }
                sendResponse({ status: "completed" });
            })();
            return true;
        }

        if (request.action === "GET_ACTIVE_TAB_INFO") {
            (async () => {
                const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
                if (tab) {
                    chrome.runtime.sendMessage({
                        action: "ACTIVE_TAB_INFO",
                        title: tab.title,
                        url: tab.url
                    }).catch(() => { });
                } else {
                    chrome.runtime.sendMessage({
                        action: "ACTIVE_TAB_INFO",
                        title: "",
                        url: ""
                    }).catch(() => { });
                }
                sendResponse({ status: "completed" });
            })();
            return true;
        }

        return false;
    }

    async _handleOpenSidePanel(request, sender) {
        if (sender.tab) {
            const openPromise = chrome.sidePanel.open({ tabId: sender.tab.id, windowId: sender.tab.windowId })
                .catch(err => console.error("Could not open side panel:", err));

            if (request.sessionId) {
                await chrome.storage.local.set({ pendingSessionId: request.sessionId });
                setTimeout(() => chrome.storage.local.remove('pendingSessionId'), 5000);
            }

            try { await openPromise; } catch (e) { }

            if (request.sessionId) {
                setTimeout(() => {
                    chrome.runtime.sendMessage({
                        action: "SWITCH_SESSION",
                        sessionId: request.sessionId
                    }).catch(() => { });
                }, 500);
            }
        }
    }
}
