
// services/gemini_api.js
import { fetchRequestParams } from './auth.js';
import { uploadFile } from './upload.js';
import { parseGeminiLine } from './parser.js';
import { getDefaultModels } from './models_api.js';

// Default fallback model configs (used if dynamic fetch fails)
const DEFAULT_MODEL_CONFIGS = {
    // Fast: Gemini 3 Flash
    'gemini-2.5-flash': {
        header: '[1,null,null,null,"9ec249fc9ad08861",null,null,0,[4]]'
    },
    // Thinking: Gemini 3 Flash Thinking
    'gemini-2.5-pro': {
        header: '[1,null,null,null,"4af6c7f5da75d65d",null,null,0,[4]]'
    },
    // 3 Pro: Gemini 3 Pro (Nano Banana Pro)
    'gemini-3.0-pro': {
        header: '[1,null,null,null,"e6fa609c3fa255c0",null,null,null,[4],null,null,2]',
        extraHeaders: {
            'x-goog-ext-525005358-jspb': '["FE27D76F-C4BB-4ACC-AF79-E6DE3BA30712",1]',
            'x-goog-ext-73010989-jspb': '[0]'
        }
    },
    // Gem: Use configured Gem (defaults to Flash if no Gem ID)
    'gem': {
        header: '[1,null,null,null,"9ec249fc9ad08861",null,null,0,[4]]'
    }
};

// Dynamic model configs (loaded from API)
let dynamicModelConfigs = null;

/**
 * Get model configuration by ID
 * @param {string} modelId - Model identifier
 * @returns {object} Model configuration with header and extraHeaders
 */
function getModelConfig(modelId) {
    // Try dynamic configs first
    if (dynamicModelConfigs && dynamicModelConfigs[modelId]) {
        return dynamicModelConfigs[modelId];
    }

    // Fallback to default configs
    return DEFAULT_MODEL_CONFIGS[modelId] || DEFAULT_MODEL_CONFIGS['gemini-2.5-flash'];
}

/**
 * Update dynamic model configs from fetched model list
 * @param {Array} models - Array of model objects from API
 */
export function updateModelConfigs(models) {
    if (!models || models.length === 0) {
        console.warn('[GeminiAPI] No models provided for config update');
        return;
    }

    dynamicModelConfigs = {};

    for (const model of models) {
        if (model.id && model.header) {
            dynamicModelConfigs[model.id] = {
                header: model.header,
                extraHeaders: model.extraHeaders || null
            };
        }
    }

    console.log(`[GeminiAPI] Updated model configs for ${Object.keys(dynamicModelConfigs).length} models`);
}

/**
 * Get all available model configs (for UI)
 * @returns {object} All model configurations
 */
export function getAllModelConfigs() {
    return { ...DEFAULT_MODEL_CONFIGS, ...dynamicModelConfigs };
}

export async function sendGeminiMessage(prompt, context, model, files, signal, onUpdate, gemId = null) {
    // 1. Ensure Auth
    if (!context || !context.atValue) {
        // Fallback: If no context, use '0' (this path usually handled by SessionManager)
        const params = await fetchRequestParams('0');
        context = {
            atValue: params.atValue,
            blValue: params.blValue,
            authUser: params.authUserIndex || '0',
            contextIds: ['', '', '']
        };
    }

    // Handle 'gem' model: Use gemId if provided, otherwise warn
    if (model === 'gem') {
        if (!gemId) {
            console.warn('[GeminiAPI] Gem model selected but no Gem ID provided. Using default Flash model.');
            // Fallback to Flash model if no Gem ID
            model = 'gemini-2.5-flash';
        }
    }

    // Normalize Gem ID (Strip 'model:' and 'gemini-custom-' prefix if present)
    let actualGemId = gemId;
    if (actualGemId) {
        if (actualGemId.startsWith('model:')) {
            actualGemId = actualGemId.substring(6);
        }
        if (actualGemId.startsWith('gemini-custom-')) {
            actualGemId = actualGemId.substring(14);
        }
    }

    let requestUUID = null;
    if (actualGemId || model === 'gem') {
        requestUUID = self.crypto.randomUUID().toUpperCase();
    }

    const modelConfig = getModelConfig(model);

    // 2. Handle File Uploads (Multimodal)
    // Structure: [[[url], filename], [[url], filename], ...]
    let fileList = [];
    if (files && files.length > 0) {
        try {
            // Upload in parallel
            const uploadPromises = files.map(file => uploadFile(file, signal)
                .then(url => [[url], file.name])
            );
            fileList = await Promise.all(uploadPromises);
        } catch (e) {
            if (e.name === 'AbortError') throw e;
            console.error("File upload failed:", e);
            throw e;
        }
    }

    // 3. Construct Payload (Inlined)
    // Structure aligned with Python Gemini-API (v3.0):
    // If files: [prompt, 0, null, fileList]
    // If no files: [prompt]

    let messageStruct;

    // Standard Config
    if (fileList.length > 0) {
        messageStruct = [
            prompt,
            0,
            null,
            fileList
        ];
    } else {
        // Nano Banana Pro / Gemini 3.0 Pro expects a slightly richer message struct
        // The '1' at the end typically signals 'rich response' allowed
        if (model === 'gemini-3.0-pro') {
            messageStruct = [
                prompt,
                0,
                null,
                null,
                null,
                null,
                1
            ];
        } else {
            messageStruct = [prompt];
        }
    }

    const data = [
        messageStruct,
        ['en'], // Language hint (Index 1)
        context.contextIds, // [conversationId, responseId, choiceId] (Index 2)
        null, // 3
        null, // 4
        null, // 5
        null, // 6
        null, // 7
        null, // 8
        null, // 9
        null, // 10
        null, // 11
        null, // 12
        null, // 13
        null, // 14
        null, // 15
        null, // 16
        null, // 17
        null, // 18
        actualGemId // 19: Gem ID injected here (Normalised)
    ];

    // For Gems, we need to inject the UUID at index 59
    if (actualGemId && requestUUID) {
        while (data.length < 60) {
            data.push(null);
        }
        data[59] = requestUUID;
    }

    // The API expects: f.req = JSON.stringify([null, JSON.stringify(data)])
    // This wrapper is still required for Batchexecute-style endpoints like StreamGenerate
    const fReq = JSON.stringify([null, JSON.stringify(data)]);

    const queryParams = new URLSearchParams({
        bl: context.blValue || 'boq_assistant-bard-web-server_20230713.13_p0',
        _reqid: Math.floor(Math.random() * 900000) + 100000,
        rt: 'c'
    });

    // 4. Headers
    const headers = {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'X-Same-Domain': '1',
        'X-Goog-AuthUser': context.authUser,
        // Critical: Use this header for model selection instead of Payload ID
        'x-goog-ext-525001261-jspb': modelConfig.header,
        ...(modelConfig.extraHeaders || {})
    };

    // Gems Header Injection
    // For 'gem' model, proper headers are required
    if (actualGemId || model === 'gem') {
        headers['x-goog-ext-525005358-jspb'] = `["${requestUUID}",1]`;
    }

    // 5. Send Request
    // Log the actual context/prompt being sent for debugging
    if (prompt) {
        try {
            const contextLog = {
                type: 'REQUEST_CONTEXT',
                promptPreview: prompt,
                fullPromptLength: prompt.length,
                files: fileList.map(f => f[1]), // Filenames
                model: model,
                contextIds: context.contextIds,
                timestamp: new Date().toISOString()
            };

            // Send to Sidepanel Console (via Background)
            if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
                chrome.runtime.sendMessage({
                    action: 'DEBUG_LOG',
                    message: JSON.stringify(contextLog, null, 2)
                }).catch(() => { }); // Ignore if background not ready
            }
            console.log('[GeminiAPI] Sending Request:', contextLog);
        } catch (e) {
            console.warn('[GeminiAPI] Logging failed:', e);
        }
    }

    // IMPORTANT: Include /u/{index}/ in URL to ensure cookies match the requested authUser
    const endpoint = `https://gemini.google.com/u/${context.authUser}/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate?${queryParams.toString()}`;

    const response = await fetch(endpoint, {
        method: 'POST',
        signal: signal,
        headers: headers,
        body: new URLSearchParams({
            at: context.atValue,
            'f.req': fReq
        })
    }
    );

    if (!response.ok) {
        throw new Error(`Network Error: ${response.status}`);
    }

    // 6. Handle Stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let finalResult = null;
    let conversationTitle = null; // Store auto-generated title
    let isFirstChunk = true;

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });

            // Validate Login Session on first chunk
            if (isFirstChunk) {
                if (chunk.includes('<!DOCTYPE html>') || chunk.includes('<html') || chunk.includes('Sign in')) {
                    throw new Error("未登录 (Session expired)");
                }
                isFirstChunk = false;
            }

            buffer += chunk;

            // Parse Lines
            let newlineIndex;
            while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                const line = buffer.slice(0, newlineIndex);
                buffer = buffer.slice(newlineIndex + 1);

                const parsed = parseGeminiLine(line);
                if (parsed) {
                    // Check if this line contains the auto-generated title
                    if (parsed.title) {
                        conversationTitle = parsed.title;
                    } else {
                        // Regular message content
                        finalResult = parsed;
                        if (onUpdate) {
                            onUpdate(parsed.text, parsed.thoughts);
                        }
                    }
                }
            }
        }
    } catch (e) {
        if (e.name === 'AbortError') throw e;
        if (e.message.includes("未登录")) throw e;
        console.error("Stream reading error:", e);
    }

    if (buffer.length > 0) {
        const parsed = parseGeminiLine(buffer);
        if (parsed) {
            if (parsed.title) {
                conversationTitle = parsed.title;
            } else {
                finalResult = parsed;
            }
        }
    }

    if (!finalResult) {
        if (buffer.includes('<!DOCTYPE html>')) {
            throw new Error("未登录 (Session expired)");
        }
        if (buffer.includes('429') || buffer.includes('RESOURCE_EXHAUSTED')) {
            throw new Error("请求过于频繁，请稍后再试 (Rate limited)");
        }
        if (buffer.length === 0) {
            throw new Error("服务器无响应，请检查网络连接 (Empty response)");
        }
        throw new Error("响应解析失败，请刷新 Gemini 页面后重试 (Invalid response)");
    }

    // Update context
    context.contextIds = finalResult.ids;

    return {
        text: finalResult.text,
        thoughts: finalResult.thoughts,
        images: finalResult.images || [],
        title: conversationTitle, // Include auto-generated title
        newContext: context
    };
}