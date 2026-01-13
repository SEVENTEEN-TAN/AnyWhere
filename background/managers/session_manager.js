
// background/managers/session_manager.js
import { sendGeminiMessage } from '../../services/gemini_api.js';
import { AuthManager } from './auth_manager.js';
import { ResponseCache } from '../../lib/response_cache.js';

export class GeminiSessionManager {
    constructor() {
        this.auth = new AuthManager();
        this.abortController = null;
        this.mcpManager = null;
        // ✅ P2: 添加响应缓存（最多缓存 50 条）
        this.cache = new ResponseCache(50);
    }

    setMCPManager(manager) {
        this.mcpManager = manager;
    }

    async ensureInitialized() {
        await this.auth.ensureInitialized();
    }

    async handleSendPrompt(request, onUpdate) {
        // ✅ P2: 尝试从缓存获取（仅限无文件的请求）
        if (!request.files || request.files.length === 0) {
            const cached = this.cache.get(request);
            if (cached) {
                return cached;
            }
        }
        
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

                // ✅ P2: MCP 多轮工具调用支持
                response = await this._handleToolCallChain(
                    response,
                    request,
                    signal,
                    onUpdate
                );

                // Success!
                await this.auth.updateContext(response.newContext, request.model);

                const result = {
                    action: "GEMINI_REPLY",
                    text: response.text,
                    thoughts: response.thoughts,
                    images: response.images,
                    title: response.title, // Include auto-generated title
                    status: "success",
                    context: response.newContext
                };
                
                // ✅ P2: 缓存响应（仅限无文件的请求）
                if (!request.files || request.files.length === 0) {
                    this.cache.set(request, result);
                }
                
                return result;

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

    /**
     * ✅ P2: 处理多轮工具调用链
     * @private
     */
    async _handleToolCallChain(response, request, signal, onUpdate) {
        const MAX_ITERATIONS = 5; // 防止无限循环
        let currentResponse = response;
        let iteration = 0;
        
        while (iteration < MAX_ITERATIONS) {
            const toolCall = this.parseToolCall(currentResponse.text);
            if (!toolCall || !this.mcpManager) {
                break; // 没有工具调用或 MCP 不可用
            }
            
            iteration++;
            console.log(`[SessionManager] Tool call iteration ${iteration}/${MAX_ITERATIONS}`);
            
            try {
                // 通知用户工具执行
                if (onUpdate) onUpdate({
                    action: "GEMINI_STREAM",
                    text: currentResponse.text + `\n\n> ⚙️ [${iteration}] Executing: ${toolCall.tool}...`
                });
                
                // 执行工具
                const result = await this.mcpManager.executeTool(toolCall.tool, toolCall.args);
                const resultText = `Tool Result (${toolCall.tool}):\n${JSON.stringify(result, null, 2)}`;
                
                // 更新上下文
                await this.auth.updateContext(currentResponse.newContext, request.model);
                const nextContext = await this.auth.getOrFetchContext();
                
                // 继续对话
                currentResponse = await sendGeminiMessage(
                    resultText,
                    nextContext,
                    request.model,
                    [],
                    signal,
                    onUpdate,
                    request.gemId
                );
                
            } catch (e) {
                console.error(`[SessionManager] Tool execution error (iteration ${iteration}):`, e);
                if (onUpdate) onUpdate({
                    action: "GEMINI_STREAM",
                    text: currentResponse.text + `\n\n> ❌ Tool Error: ${e.message}`
                });
                currentResponse.text += `\n\n> ❌ Tool execution failed: ${e.message}`;
                break; // 错误时终止链
            }
        }
        
        if (iteration >= MAX_ITERATIONS) {
            console.warn('[SessionManager] Max tool call iterations reached');
            currentResponse.text += '\n\n> ⚠️ Max tool call iterations reached. Stopping.';
        }
        
        return currentResponse;
    }

    // ✅ P0 优化: 单次扫描 + 早期返回，减少正则回溯和重复解析
    parseToolCall(text) {
        if (!text || typeof text !== 'string') return null;
        
        // 1. 快速路径：查找关键字
        if (!text.includes('call_tool')) return null;
        
        // 2. 尝试代码块（最常见）
        const codeMatch = /```json\s*(\{[\s\S]*?\})\s*```/.exec(text);
        if (codeMatch) {
            const result = this._parseToolJson(codeMatch[1]);
            if (result) return result;
        }
        
        // 3. 尝试裸 JSON
        const jsonMatch = /\{[^{}]*"action"\s*:\s*"call_tool"[^{}]*\}/.exec(text);
        if (jsonMatch) {
            const result = this._parseToolJson(jsonMatch[0]);
            if (result) return result;
        }
        
        // 4. 最后尝试：手动匹配括号
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

            const jsonStr = text.substring(jsonStartIndex, endIndex);
            const result = this._parseToolJson(jsonStr);
            if (result) return result;
        }
        
        return null;
    }

    /**
     * 解析工具调用 JSON
     * @private
     */
    _parseToolJson(jsonStr) {
        try {
            const json = JSON.parse(jsonStr);
            if (json.action === "call_tool" && json.tool) {
                return { tool: json.tool, args: json.args || {} };
            }
        } catch (e) {
            console.warn('[SessionManager] Failed to parse tool call JSON:', e.message);
        }
        return null;
    }
}
