
// background/managers/session_manager.js
import { sendGeminiMessage } from '../../services/gemini_api.js';
import { AuthManager } from './auth_manager.js';

export class GeminiSessionManager {
    constructor() {
        this.auth = new AuthManager();
        this.abortController = null;
        this.mcpManager = null;
    }

    setMCPManager(manager) {
        this.mcpManager = manager;
    }

    async ensureInitialized() {
        await this.auth.ensureInitialized();
    }

    async handleSendPrompt(request, onUpdate) {
        // Cancel previous if exists
        this.cancelCurrentRequest();

        this.abortController = new AbortController();
        const signal = this.abortController.signal;

        try {
            await this.ensureInitialized();

            // Construct files array
            let files = [];
            if (request.files && Array.isArray(request.files)) {
                files = request.files;
            } else if (request.image) {
                files = [{
                    base64: request.image,
                    type: request.imageType,
                    name: request.imageName || "image.png"
                }];
            }

            try {
                this.auth.checkModelChange(request.model);
                const context = await this.auth.getOrFetchContext();

                // --- MCP INJECTION ---
                let finalText = request.text;
                let mcpPrompt = null;
                if (this.mcpManager && request.mcpIds && request.mcpIds.length > 0) {
                    // Use selected MCP servers only
                    mcpPrompt = this.mcpManager.getSystemPromptForServers(request.mcpIds);
                    if (mcpPrompt) {
                        finalText = `${mcpPrompt}\n\nUser Query: ${request.text}`;
                    }
                }
                // ---------------------

                console.log("[SessionManager] 准备发送给 Gemini 的最终文本:", JSON.stringify(finalText, null, 2));

                let response = await sendGeminiMessage(
                    finalText,
                    context,
                    request.model,
                    files,
                    signal,
                    onUpdate,
                    request.gemId // Pass Gem ID
                );

                // --- MCP EXECUTION LOOP (Simple 1-turn) ---
                // Check if response contains tool call
                const toolCall = this.parseToolCall(response.text);
                if (toolCall && this.mcpManager) {
                    try {
                        if (onUpdate) onUpdate({
                            action: "GEMINI_STREAM",
                            text: response.text + `\n\n> ⚙️ Executing tool: ${toolCall.tool}...`
                        });

                        const result = await this.mcpManager.executeTool(toolCall.tool, toolCall.args);
                        const resultText = `Tool Result (${toolCall.tool}):\n${JSON.stringify(result, null, 2)}`;

                        // Feed back to Gemini
                        // We need to update context from the first response first
                        await this.auth.updateContext(response.newContext, request.model);
                        const nextContext = await this.auth.getOrFetchContext(); // Should be the updated one

                        response = await sendGeminiMessage(
                            resultText,
                            nextContext,
                            request.model,
                            [],
                            signal,
                            onUpdate,
                            request.gemId // Pass Gem ID
                        );

                    } catch (e) {
                        console.error("MCP Execution Error", e);
                        if (onUpdate) onUpdate({
                            action: "GEMINI_STREAM",
                            text: response.text + `\n\n> ❌ Tool Error: ${e.message}`
                        });
                        // Continue with original response if tool fails? Or let the error stand?
                        // Let's just append the error to the response text so the user sees it.
                        response.text += `\n\n> ❌ Tool execution failed: ${e.message}`;
                    }
                }
                // ------------------------------------------

                // Success!
                await this.auth.updateContext(response.newContext, request.model);

                return {
                    action: "GEMINI_REPLY",
                    text: response.text,
                    thoughts: response.thoughts,
                    images: response.images,
                    title: response.title, // Include auto-generated title
                    status: "success",
                    context: response.newContext
                };

            } catch (err) {
                throw err; // Throw to outer catch
            }

        } catch (error) {
            if (error.name === 'AbortError') {
                return null;
            }

            console.error("Gemini Error:", error);

            let errorMessage = error.message || "Unknown error";
            const isZh = chrome.i18n.getUILanguage().startsWith('zh');

            if (errorMessage.includes("未登录") || errorMessage.includes("Not logged in") || errorMessage.includes("Session expired")) {
                this.auth.forceContextRefresh();
                await chrome.storage.local.remove(['geminiContext']);

                const loginUrl = 'https://gemini.google.com/';

                if (isZh) {
                    errorMessage = `🔑 未登录或会话已过期。<br><a href="#" class="gemini-link" data-url="${loginUrl}">👉 点击前往 Gemini 登录</a>`;
                } else {
                    errorMessage = `🔑 Not logged in or session expired.<br><a href="#" class="gemini-link" data-url="${loginUrl}">👉 Click to open Gemini login</a>`;
                }
            } else if (errorMessage.includes("Rate limited") || errorMessage.includes("请求过于频繁")) {
                if (isZh) {
                    errorMessage = "⏳ 请求过于频繁，Gemini 暂时限制了访问。请等待几分钟后再试。";
                } else {
                    errorMessage = "⏳ Too many requests. Gemini has temporarily limited access. Please wait a few minutes.";
                }
            } else if (errorMessage.includes("Empty response") || errorMessage.includes("服务器无响应")) {
                const refreshUrl = "https://gemini.google.com/";
                if (isZh) {
                    errorMessage = `🔌 服务器无响应。<br><a href="#" class="gemini-link" data-url="${refreshUrl}">👉 点击前往 Gemini 刷新</a>`;
                } else {
                    errorMessage = `🔌 No response from server.<br><a href="#" class="gemini-link" data-url="${refreshUrl}">👉 Click to refresh Gemini</a>`;
                }
            } else if (errorMessage.includes("Invalid response") || errorMessage.includes("响应解析失败")) {
                const refreshUrl = "https://gemini.google.com/";
                if (isZh) {
                    errorMessage = `⚠️ 响应解析失败。<br><a href="#" class="gemini-link" data-url="${refreshUrl}">👉 点击前往 Gemini 刷新后重试</a>`;
                } else {
                    errorMessage = `⚠️ Failed to parse response.<br><a href="#" class="gemini-link" data-url="${refreshUrl}">👉 Click to refresh Gemini and retry</a>`;
                }
            }

            return {
                action: "GEMINI_REPLY",
                text: "Error: " + errorMessage,
                status: "error"
            };
        } finally {
            this.abortController = null;
        }
    }

    cancelCurrentRequest() {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
            return true;
        }
        return false;
    }

    async setContext(context, model) {
        await this.auth.updateContext(context, model);
    }

    async resetContext() {
        await this.auth.resetContext();
    }

    parseToolCall(text) {
        if (!text) return null;

        // Pattern 1: Look for ```json ... ``` blocks containing "action": "call_tool"
        const codeBlockRegex = /```json\s*(\{[\s\S]*?\})\s*```/g;
        let match;
        while ((match = codeBlockRegex.exec(text)) !== null) {
            try {
                const json = JSON.parse(match[1]);
                if (json.action === "call_tool" && json.tool) {
                    return { tool: json.tool, args: json.args || {} };
                }
            } catch (e) {
                // Ignore invalid JSON
            }
        }

        // Pattern 2: Look for bare JSON object (not in code block)
        // Match from first { to last } that contains "action": "call_tool"
        const bareJsonRegex = /\{[^{}]*"action"\s*:\s*"call_tool"[^{}]*\}/g;
        while ((match = bareJsonRegex.exec(text)) !== null) {
            try {
                const json = JSON.parse(match[0]);
                if (json.action === "call_tool" && json.tool) {
                    return { tool: json.tool, args: json.args || {} };
                }
            } catch (e) {
                // Try to find a larger JSON by scanning for balanced braces
                // This is a simplistic approach - for complex nested objects we'd need a proper parser
            }
        }

        // Pattern 3: Try to extract any JSON-like structure with "call_tool"
        // More aggressive: find opening brace and try to parse until closing brace
        const jsonStartIndex = text.indexOf('{"action":"call_tool"') !== -1
            ? text.indexOf('{"action":"call_tool"')
            : text.indexOf('{"action": "call_tool"');

        if (jsonStartIndex !== -1) {
            let braceCount = 0;
            let endIndex = jsonStartIndex;
            for (let i = jsonStartIndex; i < text.length; i++) {
                if (text[i] === '{') braceCount++;
                if (text[i] === '}') braceCount--;
                if (braceCount === 0) {
                    endIndex = i + 1;
                    break;
                }
            }

            try {
                const jsonStr = text.substring(jsonStartIndex, endIndex);
                const json = JSON.parse(jsonStr);
                if (json.action === "call_tool" && json.tool) {
                    return { tool: json.tool, args: json.args || {} };
                }
            } catch (e) {
                // Final fallback failed
            }
        }

        return null;
    }
}
