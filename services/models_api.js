
// services/models_api.js
// API for fetching available models from Gemini

import { fetchRequestParams } from './auth.js';

/**
 * Fetch available models using the batchexecute API
 * @param {string} userIndex - Account index (default: '0')
 * @returns {Promise<Array>} List of models
 */
export async function fetchModelsListAPI(userIndex = '0') {
    try {
        console.log(`[ModelsAPI] Fetching available models for account ${userIndex}...`);
        
        // Get authentication parameters
        const auth = await fetchRequestParams(userIndex);
        
        // Construct the batchexecute URL
        // Note: The RPC ID for model list might need to be discovered from Gemini web app
        // For now, we'll use a hypothetical RPC ID - this needs to be verified
        const params = new URLSearchParams({
            'rpcids': 'DM7hJb', // This RPC ID needs to be discovered from the official Gemini app
            'source-path': userIndex === '0' ? '/app' : `/u/${userIndex}/app`,
            'bl': auth.blValue || 'boq_assistant-bard-web-server_20251217.07_p5',
            'hl': 'zh-CN',
            '_reqid': Math.floor(Math.random() * 900000) + 100000,
            'rt': 'c'
        });
        
        const url = `https://gemini.google.com/u/${userIndex}/_/BardChatUi/data/batchexecute?${params.toString()}`;
        
        // Construct the f.req payload
        const rpcData = [1, ["zh-CN"], 0];
        const fReq = JSON.stringify([
            [
                ["DM7hJb", JSON.stringify(rpcData), null, "generic"]
            ]
        ]);
        
        console.log('[ModelsAPI] Request URL:', url);
        console.log('[ModelsAPI] f.req payload:', fReq);
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                'X-Same-Domain': '1',
                'X-Goog-AuthUser': userIndex
            },
            body: new URLSearchParams({
                'at': auth.atValue,
                'f.req': fReq
            }),
            credentials: 'include'
        });
        
        if (!response.ok) {
            console.warn(`[ModelsAPI] API request failed: ${response.status} ${response.statusText}`);
            // Return default models on failure
            return getDefaultModels();
        }
        
        const text = await response.text();
        console.log('[ModelsAPI] Response length:', text.length, 'chars');
        
        // Parse the response
        const models = parseModelsResponse(text);
        
        if (models.length === 0) {
            console.warn('[ModelsAPI] No models found in response, using defaults');
            return getDefaultModels();
        }
        
        console.log(`[ModelsAPI] Parsed ${models.length} models`);
        return models;
        
    } catch (error) {
        console.error('[ModelsAPI] Error fetching models:', error);
        // Return default models on error
        return getDefaultModels();
    }
}

/**
 * Parse the batchexecute response to extract models
 */
function parseModelsResponse(responseText) {
    const models = [];
    
    try {
        const lines = responseText.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
            if (!line.startsWith('[')) continue;
            
            try {
                const data = JSON.parse(line);
                
                // Look for the model list response
                // Format: [["wrb.fr", "DM7hJb", "[...]"]]
                if (Array.isArray(data) && data.length > 0) {
                    for (const item of data) {
                        if (Array.isArray(item) && item.length >= 3 && item[1] === 'DM7hJb') {
                            const modelsData = JSON.parse(item[2]);
                            
                            // Parse model data structure
                            // The exact structure needs to be discovered from actual API response
                            if (Array.isArray(modelsData)) {
                                extractModelsFromData(modelsData, models);
                            }
                        }
                    }
                }
            } catch (e) {
                continue;
            }
        }
        
    } catch (error) {
        console.error('[ModelsAPI] Error parsing response:', error);
    }
    
    return models;
}

/**
 * Extract models from parsed data structure
 */
function extractModelsFromData(data, models) {
    // This function needs to be implemented based on actual API response structure
    // For now, we'll try to find model-like structures
    
    if (!Array.isArray(data)) return;
    
    for (const item of data) {
        if (Array.isArray(item) && item.length >= 2) {
            // Look for model ID and name patterns
            const modelId = item[0];
            const modelName = item[1];
            
            if (typeof modelId === 'string' && typeof modelName === 'string') {
                models.push({
                    id: modelId,
                    name: modelName,
                    header: item[2] || null,
                    extraHeaders: item[3] || null
                });
            }
        }
    }
}

/**
 * Get default hardcoded models (fallback)
 */
export function getDefaultModels() {
    return [
        {
            id: 'gemini-2.5-flash',
            name: 'Gemini 2.5 Flash',
            header: '[1,null,null,null,"9ec249fc9ad08861",null,null,0,[4]]',
            extraHeaders: null
        },
        {
            id: 'gemini-2.5-pro',
            name: 'Gemini 2.5 Pro',
            header: '[1,null,null,null,"4af6c7f5da75d65d",null,null,0,[4]]',
            extraHeaders: null
        },
        {
            id: 'gemini-3.0-pro',
            name: 'Gemini 3.0 Pro',
            header: '[1,null,null,null,"e6fa609c3fa255c0",null,null,null,[4],null,null,2]',
            extraHeaders: {
                'x-goog-ext-525005358-jspb': '["FE27D76F-C4BB-4ACC-AF79-E6DE3BA30712",1]',
                'x-goog-ext-73010989-jspb': '[0]'
            }
        }
    ];
}

/**
 * Cache for models list
 */
let modelsCache = {
    data: null,
    timestamp: 0,
    accountIndex: null
};

const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes (longer than Gems)

/**
 * Get models list with caching
 */
export async function getCachedModelsListAPI(userIndex = '0', forceRefresh = false) {
    const now = Date.now();
    
    // Return cached data if valid
    if (!forceRefresh && 
        modelsCache.data && 
        modelsCache.accountIndex === userIndex &&
        (now - modelsCache.timestamp) < CACHE_DURATION) {
        console.log('[ModelsAPI] Returning cached data');
        return modelsCache.data;
    }
    
    // Fetch new data
    const models = await fetchModelsListAPI(userIndex);
    
    // Update cache
    modelsCache = {
        data: models,
        timestamp: now,
        accountIndex: userIndex
    };
    
    return models;
}
