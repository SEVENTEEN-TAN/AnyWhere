
// services/models_api.js
// API for fetching available models from Gemini
// Refactored to scrape from WIZ_global_data and extract critical Model Hash IDs.

import { fetchRequestParams } from './auth.js';

/**
 * Fetch available models by scraping the Gemini app page
 * @param {string} userIndex - Account index (default: '0')
 * @returns {Promise<Array>} List of models with config headers where applicable
 */
export async function fetchModelsListAPI(userIndex = '0') {
    try {
        console.log(`[ModelsAPI] Fetching gemini app page for account ${userIndex}...`);

        // 1. Fetch the main page HTML
        const { html } = await fetchRequestParams(userIndex);

        if (!html) {
            console.warn('[ModelsAPI] No HTML returned from auth fetch');
            return getDefaultModels();
        }

        // 2. Parse WIZ_global_data -> TSDtV
        console.log('[ModelsAPI] Parsing WIZ_global_data...');
        const models = parseModelsFromGlobalData(html);

        if (models.length === 0) {
            console.warn('[ModelsAPI] No models found in TSDtV, using defaults');
            return getDefaultModels();
        }

        console.log(`[ModelsAPI] Parsed ${models.length} models from page source`);
        return models;

    } catch (error) {
        console.error('[ModelsAPI] Error fetching models:', error);
        return getDefaultModels();
    }
}

/**
 * Parse TSDtV from the HTML source
 * Extracts both named models (gemini-*) and specific routing Hashes (thinking=..., fast=...)
 * @param {string} html 
 * @returns {Array} List of models
 */
function parseModelsFromGlobalData(html) {
    const models = [];
    const seenIds = new Set();

    // Config Extraction: Find the "thinking" and "fast" hash mappings
    // Pattern: "[[... \"thinking\\u003dHASH,OTHER\", \"fast\\u003dHASH,OTHER\" ...]]"
    let thinkingHash = null;
    let fastHash = null;

    try {
        // Regex to find the config string containing model mappings
        // Looks for encoded JSON string containing "thinking=" or "fast="
        const configRegex = /"\[\[\\"[^"]*?(?:thinking|fast)\\\\u003d([a-f0-9]+)[^"]*?\\"\]\]"/;

        // We might need to iterate or search specifically because they might be in separate blocks
        // Let's try to find them individually
        const thinkingMatch = html.match(/thinking\\\\u003d([a-f0-9]+)/);
        if (thinkingMatch) {
            thinkingHash = thinkingMatch[1];
            console.log('[ModelsAPI] Found Thinking Hash:', thinkingHash);
        }

        const fastMatch = html.match(/fast\\\\u003d([a-f0-9]+)/);
        if (fastMatch) {
            fastHash = fastMatch[1];
            console.log('[ModelsAPI] Found Fast Hash:', fastHash);
        }

    } catch (e) {
        console.warn('[ModelsAPI] Error parsing config hashes:', e);
    }

    const addModel = (id, overrides = {}) => {
        if (id && !seenIds.has(id)) {
            // Determine display name
            let name = id;
            if (id.startsWith('gemini-')) {
                name = id.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            }
            if (overrides.name) name = overrides.name;

            const modelObj = {
                id,
                name,
                header: overrides.header || null,
                extraHeaders: overrides.extraHeaders || null
            };

            models.push(modelObj);
            seenIds.add(id);
        }
    };

    // 1. Add Special Models if Hashes Found
    if (thinkingHash) {
        addModel('gemini-2.0-flash-thinking', {
            name: 'Gemini 2.0 Flash Thinking',
            extraHeaders: {
                'x-goog-ext-525001261-jspb': `["${thinkingHash}"]`
            }
        });
    }

    // 2. Scan for standard "gemini-" models
    try {
        // Pattern observed in raw data (triple escaped quotes level):
        // [45702952, ..., "NEP3Ab", ["[[\\\"gemini-2.0-flash\\\",\\\"gemini-2.5-flash-preview-04-17\\\"...]]"]]
        // The HTML source often has these inside a larger JSON string, adding more escaping.

        // We use a broader regex to capture the list string:
        // Look for: [[ \"gemini- or [[ \\"gemini-
        // OR simply scan for ANY valid model ID string that appears in the global data.
        // This is robust against the variable nesting depth of TSDtV.

        // Regex: Matches "gemini-..." or \"gemini-...\" or \\"gemini-...\\"
        // We capture the ID part only.
        const possibleIdsRegex = /(?:\\+|"|'|^)((?:gemini|imagen)-[a-z0-9.\-]+?)(?:\\+|"|'|$)/g;

        let match;
        while ((match = possibleIdsRegex.exec(html)) !== null) {
            const id = match[1];
            // Valid models usually:
            // - don't contain slashes or weird chars (already filtered by [a-z0-9.\-])
            // - often follow a version pattern

            // Filter out known false positives or non-model keys
            if (!id.includes('flattened') &&
                !id.includes('preview-tts') &&
                !id.includes('upsell') &&
                !id.includes('advanced')) {
                addModel(id);
            }
        }
    } catch (e) {
        console.error('[ModelsAPI] Error parsing regex models:', e);
    }

    // 3. Fallbacks / Defaults
    const defaults = getDefaultModels();

    // If we have a Fast hash, update the default Flash model to use it if needed, 
    // or ensure we have a reliable Flash model
    if (fastHash) {
        // We can either update the existing retrieved 'gemini-2.0-flash' or add a specific one
        // For now, let's add a robust "Flash (Fast)" entry
        addModel('gemini-2.0-flash-fast', {
            name: 'Gemini 2.0 Flash (Fast)',
            extraHeaders: {
                'x-goog-ext-525001261-jspb': `["${fastHash}"]`
            }
        });
    }

    // Add remaining defaults if not present
    for (const def of defaults) {
        if (!seenIds.has(def.id)) {
            models.push(def);
        }
    }

    return models;
}

/**
 * Get default hardcoded models (fallback)
 */
export function getDefaultModels() {
    return [
        {
            id: 'gemini-2.0-flash',
            name: 'Gemini 2.0 Flash',
            header: null, // Let backend decide or generic
            extraHeaders: null
        },
        {
            id: 'gemini-2.0-pro',
            name: 'Gemini 2.0 Pro',
            header: null,
            extraHeaders: null
        },
        // Legacy fallback
        {
            id: 'gemini-1.5-pro',
            name: 'Gemini 1.5 Pro',
            header: null,
            extraHeaders: null
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

const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

/**
 * Get models list with caching
 */
export async function getCachedModelsListAPI(userIndex = '0', forceRefresh = false) {
    const now = Date.now();

    if (!forceRefresh &&
        modelsCache.data &&
        modelsCache.accountIndex === userIndex &&
        (now - modelsCache.timestamp) < CACHE_DURATION) {
        console.log('[ModelsAPI] Returning cached data');
        return modelsCache.data;
    }

    const models = await fetchModelsListAPI(userIndex);

    modelsCache = {
        data: models,
        timestamp: now,
        accountIndex: userIndex
    };

    return models;
}
