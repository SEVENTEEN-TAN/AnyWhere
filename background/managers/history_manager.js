
// background/managers/history_manager.js
import { generateUUID } from '../../lib/utils.js';

/**
 * Saves a completed interaction to the chat history in local storage.
 * @param {string} text - The user's prompt.
 * @param {object} result - The result object from the session manager.
 * @param {Array|object} filesObj - Optional file data { base64 } or array of such objects.
 * @returns {object} The new session object or null on error.
 */
export async function saveToHistory(text, result, filesObj = null) {
    try {
        const { geminiSessions = [] } = await chrome.storage.local.get(['geminiSessions']);
        
        const sessionId = generateUUID();
        // Use auto-generated title if available, otherwise fallback to user prompt
        const title = result.title || (text.length > 30 ? text.substring(0, 30) + "..." : text);

        // Normalize image data to array of base64 strings
        let storedImages = null;
        if (filesObj) {
            if (Array.isArray(filesObj)) {
                storedImages = filesObj.map(f => f.base64);
            } else if (filesObj.base64) {
                storedImages = [filesObj.base64];
            }
        }

        const newSession = {
            id: sessionId,
            title: title || "Quick Ask",
            timestamp: Date.now(),
            messages: [
                {
                    role: 'user',
                    text: text,
                    image: storedImages // Now stores array of base64 strings
                },
                {
                    role: 'ai',
                    text: result.text,
                    thoughts: result.thoughts, // Save thoughts if present
                    generatedImages: result.images // Save generated images
                }
            ],
            context: result.context
        };
        
        // Update title with auto-generated one if available
        if (result.title && newSession.title === "Quick Ask") {
            newSession.title = result.title.substring(0, 50) + (result.title.length > 50 ? "..." : "");
        }

        geminiSessions.unshift(newSession);
        await chrome.storage.local.set({ geminiSessions });
        
        // Notify Sidepanel to reload if open
        chrome.runtime.sendMessage({ 
            action: "SESSIONS_UPDATED", 
            sessions: geminiSessions 
        }).catch(() => {}); 
        
        return newSession;
    } catch(e) {
        console.error("Error saving history:", e);
        return null;
    }
}

/**
 * Appends an AI response to an existing session in local storage.
 * Critical for ensuring history is saved even if the UI is closed during generation.
 * @param {string} sessionId 
 * @param {object} result 
 */
export async function appendAiMessage(sessionId, result) {
    try {
        const { geminiSessions = [] } = await chrome.storage.local.get(['geminiSessions']);
        const sessionIndex = geminiSessions.findIndex(s => s.id === sessionId);
        
        if (sessionIndex !== -1) {
            const session = geminiSessions[sessionIndex];
            
            session.messages.push({
                role: 'ai',
                text: result.text,
                thoughts: result.thoughts,
                generatedImages: result.images
            });
            session.context = result.context; // Update context
            
            // Update session title with auto-generated title if available and current title is default
            // Check both English "New Chat" and Chinese "新对话" (internationalized default)
            // Also update if current title looks like it was auto-generated from user input (ends with "...")
            const isDefaultTitle = session.title === "New Chat" || 
                                   session.title === "新对话" || 
                                   session.title === "Quick Ask" ||
                                   (session.title.endsWith("...") && session.messages.length <= 2); // Likely first message truncation
            
            if (result.title && isDefaultTitle) {
                console.log("[HistoryManager] ===== 自动更新会话标题 =====");
                console.log("[HistoryManager] 原标题:", session.title);
                console.log("[HistoryManager] 新标题:", result.title);
                session.title = result.title.substring(0, 50) + (result.title.length > 50 ? "..." : "");
                console.log("[HistoryManager] 截断后标题:", session.title);
                console.log("[HistoryManager] ===============================\n");
            }
            
            session.timestamp = Date.now();
            
            // Move to top
            geminiSessions.splice(sessionIndex, 1);
            geminiSessions.unshift(session);
            
            await chrome.storage.local.set({ geminiSessions });
            
            chrome.runtime.sendMessage({ 
                action: "SESSIONS_UPDATED", 
                sessions: geminiSessions 
            }).catch(() => {});
            
            return true;
        }
        return false;
    } catch (e) {
        console.error("Error appending history:", e);
        return false;
    }
}

/**
 * Appends a User message (or Tool Output) to an existing session.
 * Used for the automated browser control loop.
 * @param {string} sessionId 
 * @param {string} text 
 * @param {Array} images - Optional array of base64 image strings
 */
export async function appendUserMessage(sessionId, text, images = null) {
    try {
        const { geminiSessions = [] } = await chrome.storage.local.get(['geminiSessions']);
        const sessionIndex = geminiSessions.findIndex(s => s.id === sessionId);
        
        if (sessionIndex !== -1) {
            const session = geminiSessions[sessionIndex];
            
            session.messages.push({
                role: 'user',
                text: text,
                image: images // Store image array if present
            });
            session.timestamp = Date.now();
            
            // Move to top
            geminiSessions.splice(sessionIndex, 1);
            geminiSessions.unshift(session);
            
            await chrome.storage.local.set({ geminiSessions });
            
            chrome.runtime.sendMessage({ 
                action: "SESSIONS_UPDATED", 
                sessions: geminiSessions 
            }).catch(() => {});
            
            return true;
        }
        return false;
    } catch (e) {
        console.error("Error appending user message:", e);
        return false;
    }
}
