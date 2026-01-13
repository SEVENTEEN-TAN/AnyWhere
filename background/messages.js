
// background/messages.js
/**
 * @typedef {import('./managers/session_manager.js').GeminiSessionManager} GeminiSessionManager
 * @typedef {import('./managers/image_manager.js').ImageManager} ImageManager
 * @typedef {import('./managers/control_manager.js').BrowserControlManager} BrowserControlManager
 * @typedef {import('./managers/log_manager.js').LogManager} LogManager
 * @typedef {import('./managers/mcp_manager.js').MCPManager} MCPManager
 * @typedef {import('./managers/video_manager.js').VideoManager} VideoManager
 */

import { SessionMessageHandler } from './handlers/session.js';
import { UIMessageHandler } from './handlers/ui.js';
import { getCachedGemsListAPI } from '../services/gems_api.js';
import { getCachedModelsListAPI } from '../services/models_api.js';
import { deleteSessionFromServer } from '../services/session_api.js';

/**
 * Sets up the global runtime message listener.
 * @param {GeminiSessionManager} sessionManager
 * @param {ImageManager} imageHandler
 * @param {BrowserControlManager} controlManager
 * @param {LogManager} logManager
 * @param {MCPManager} mcpManager
 * @param {VideoManager} videoManager
 */
export function setupMessageListener(sessionManager, imageHandler, controlManager, logManager, mcpManager, videoManager) {

    // Inject MCP Manager into Session Manager so it can use tools
    sessionManager.setMCPManager(mcpManager);

    const sessionHandler = new SessionMessageHandler(sessionManager, imageHandler, controlManager);
    const uiHandler = new UIMessageHandler(imageHandler, videoManager, sessionHandler);

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

        // --- LOGGING SYSTEM ---
        if (request.action === 'LOG_ENTRY') {
            logManager.add(request.entry);
            return false;
        }

        if (request.action === 'GET_LOGS') {
            sendResponse({ logs: logManager.getLogs() });
            return true;
        }

        // --- DEBUG LOG (from content script) ---
        if (request.action === 'DEBUG_LOG') {
            console.log(`[Content→BG] ${request.message}`);
            // Also forward to sidepanel for easier debugging
            chrome.runtime.sendMessage({ action: 'DEBUG_LOG', message: request.message }).catch(() => {});
            return false;
        }

        // Open a tab in background (without switching focus)
        if (request.action === 'OPEN_TAB_BACKGROUND') {
            chrome.tabs.create({ url: request.url, active: false });
            return false;
        }

        // --- ELEMENT PICKER ---
        // Forward START_ELEMENT_PICKER from Sidepanel to Content Script
        if (request.action === 'START_ELEMENT_PICKER') {
            (async () => {
                try {
                    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                    if (!tab?.id) {
                        sendResponse({ success: false, error: 'No active tab' });
                        return;
                    }

                    // Check if it's a restricted URL
                    if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('edge://') || tab.url?.startsWith('about:')) {
                        sendResponse({ success: false, error: 'Cannot run on browser internal pages' });
                        return;
                    }

                    try {
                        // Try to send message to existing content script
                        await chrome.tabs.sendMessage(tab.id, { action: 'START_ELEMENT_PICKER' });
                        sendResponse({ success: true });
                    } catch (e) {
                        // Content script not loaded, try to inject it first
                        console.log('[Background] Content script not loaded, injecting...');

                        try {
                            // Inject the required scripts
                            await chrome.scripting.executeScript({
                                target: { tabId: tab.id },
                                files: [
                                    'content/scroll_utils.js',
                                    'content/element_picker.js'
                                ]
                            });

                            // Wait a bit for scripts to initialize
                            await new Promise(resolve => setTimeout(resolve, 100));

                            // Try again
                            await chrome.tabs.sendMessage(tab.id, { action: 'START_ELEMENT_PICKER' });
                            sendResponse({ success: true });
                        } catch (injectError) {
                            console.error('[Background] Failed to inject scripts:', injectError);
                            sendResponse({ success: false, error: 'Failed to inject element picker. Please refresh the page.' });
                        }
                    }
                } catch (e) {
                    console.error('[Background] START_ELEMENT_PICKER error:', e);
                    sendResponse({ success: false, error: e.message });
                }
            })();
            return true;
        }

        // Forward ELEMENT_PICKED from Content Script to Sidepanel
        if (request.action === 'ELEMENT_PICKED') {
            chrome.runtime.sendMessage({
                action: 'BACKGROUND_MESSAGE',
                payload: {
                    action: 'ELEMENT_PICKED',
                    payload: request.payload
                }
            }).catch(() => {
                // Sidepanel might not be open, ignore error
            });
            return false;
        }

        // Forward ELEMENT_PICKER_CANCELLED from Content Script to Sidepanel
        if (request.action === 'ELEMENT_PICKER_CANCELLED') {
            chrome.runtime.sendMessage({
                action: 'BACKGROUND_MESSAGE',
                payload: {
                    action: 'ELEMENT_PICKER_CANCELLED'
                }
            }).catch(() => {
                // Sidepanel might not be open, ignore error
            });
            return false;
        }

        // --- PROXY FETCH (CORS Bypass) ---
        if (request.action === 'PROXY_FETCH') {
            (async () => {
                try {
                    const { url, options = {} } = request;
                    console.log(`[Background] Proxy fetching: ${url}`);
                    
                    const response = await fetch(url, options);
                    
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    
                    const contentType = response.headers.get('content-type') || '';
                    let data;
                    if (contentType.includes('application/json')) {
                        data = await response.json();
                    } else {
                        data = await response.text();
                    }

                    sendResponse({ success: true, data: data });
                } catch (error) {
                    console.error('[Background] Proxy fetch failed:', error);
                    sendResponse({ success: false, error: error.message });
                }
            })();
            return true;
        }

        // --- MCP MANAGEMENT ---
        if (request.action === 'MCP_SAVE_CONFIG') {
            mcpManager.saveConfig(request.json).then(result => {
                sendResponse(result);
            });
            return true;
        }

        if (request.action === 'MCP_GET_CONFIG') {
            chrome.storage.local.get('mcpConfig').then(data => {
                const config = data.mcpConfig || { mcpServers: {} };
                sendResponse(JSON.stringify(config, null, 2));
            });
            return true;
        }

        if (request.action === 'MCP_GET_TOOLS') {
            const tools = mcpManager.getAllTools();
            sendResponse({ tools: tools });
            return true;
        }

        if (request.action === 'MCP_GET_STATUS') {
            const debugInfo = mcpManager.getDebugInfo();
            sendResponse({ servers: debugInfo });
            return true;
        }

        // --- GEMS MANAGEMENT ---
        if (request.action === 'FETCH_GEMS_LIST') {
            const userIndex = request.userIndex || '0';
            const forceRefresh = request.forceRefresh || false;
            console.log(`[Background] FETCH_GEMS_LIST request: userIndex=${userIndex}, forceRefresh=${forceRefresh}`);
            getCachedGemsListAPI(userIndex, forceRefresh).then(gems => {
                console.log(`[Background] FETCH_GEMS_LIST response: ${gems.length} gems`);
                sendResponse({ gems: gems });
            }).catch(error => {
                console.error('[Background] Failed to fetch Gems:', error);
                console.error('[Background] Error stack:', error.stack);
                sendResponse({ gems: [], error: error.message });
            });
            return true;
        }
        
        // --- MODELS MANAGEMENT ---
        if (request.action === 'FETCH_MODELS_LIST') {
            const userIndex = request.userIndex || '0';
            const forceRefresh = request.forceRefresh || false;
            console.log(`[Background] FETCH_MODELS_LIST request: userIndex=${userIndex}, forceRefresh=${forceRefresh}`);
            getCachedModelsListAPI(userIndex, forceRefresh).then(models => {
                console.log(`[Background] FETCH_MODELS_LIST response: ${models.length} models`);
                sendResponse({ models: models });
            }).catch(error => {
                console.error('[Background] Failed to fetch Models:', error);
                console.error('[Background] Error stack:', error.stack);
                sendResponse({ models: [], error: error.message });
            });
            return true;
        }
        
        // --- SESSION MANAGEMENT ---
        if (request.action === 'DELETE_SESSION_FROM_SERVER') {
            const conversationId = request.conversationId;
            const userIndex = '0'; // Single account mode
            
            console.log(`[Background] DELETE_SESSION_FROM_SERVER: ${conversationId}`);
            
            // Delete asynchronously, don't wait for response
            deleteSessionFromServer(conversationId, userIndex)
                .then(success => {
                    if (success) {
                        console.log(`[Background] Session deleted from server: ${conversationId}`);
                    } else {
                        console.warn(`[Background] Failed to delete session from server: ${conversationId}`);
                    }
                })
                .catch(error => {
                    console.error('[Background] Error deleting session from server:', error);
                });
            
            // Return immediately, don't wait for server response
            sendResponse({ success: true });
            return false;
        }

        // Delegate to Session Handler (Prompt, Context, Quick Ask, Browser Control)
        if (sessionHandler.handle(request, sender, sendResponse)) {
            return true;
        }

        // Delegate to UI Handler (Image, Capture, Sidepanel)
        if (uiHandler.handle(request, sender, sendResponse)) {
            return true;
        }

        return false;
    });
}
