
// services/gems_api.js
// API for fetching and managing Gems (Custom Assistants)
// Uses RPC: CNgdBe

import { fetchRequestParams } from './auth.js';

const BAT_RPC_URL = 'https://gemini.google.com/_/BardChatUi/data/batchexecute';

/**
 * Fetch available Gems for the user
 * @param {string} userIndex - Account index
 * @returns {Promise<Array>} List of Gems
 */
export async function fetchGemsListAPI(userIndex = '0') {
    try {
        console.log(`[GemsAPI] Fetching Gems for account ${userIndex}...`);

        // 1. Get Auth Tokens (at/bl)
        const { atValue, blValue } = await fetchRequestParams(userIndex);
        if (!atValue || !blValue) {
            throw new Error('Missing auth tokens (at/bl)');
        }

        // 2. Construct RPC Payload
        // RPC ID: CNgdBe
        // Req: [1, ["zh-CN"], 0] (Approximate args specific to listing gems)
        const rpcPayload = [
            [["CNgdBe", "[1,[\"zh-CN\"],0]", null, "generic"]]
        ];

        const formData = new URLSearchParams();
        formData.append('f.req', JSON.stringify(rpcPayload));
        formData.append('at', atValue);

        // 3. Execute Request
        let url = BAT_RPC_URL;
        if (userIndex && userIndex !== '0') {
            // Adjust base URL for multi-login if needed
            // However, typical behavior is to leverage cookies
        }

        // Construct query params
        const params = new URLSearchParams({
            'rpcids': 'CNgdBe',
            'bl': blValue,
            'rt': 'c', // response type: callback/json
            '_reqid': generateReqId()
        });

        const resp = await fetch(`${url}?${params.toString()}`, {
            method: 'POST',
            body: formData,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
            }
        });

        if (!resp.ok) {
            throw new Error(`RPC failed: ${resp.status}`);
        }

        const text = await resp.text();

        // 4. Parse Response
        const gems = parseGemsResponse(text);
        console.log(`[GemsAPI] Found ${gems.length} Gems`);
        return gems;

    } catch (error) {
        console.error('[GemsAPI] Error fetching gems:', error);
        return [];
    }
}

/**
 * Parse the generic batchexecute response for Gems
 * @param {string} responseText 
 */
function parseGemsResponse(responseText) {
    const gems = [];

    try {
        // batchexecute response returns multiple lines.
        // Line 1: )]}'
        // Line 2: Length
        // Line 3: JSON Content
        // ...

        const lines = responseText.split('\n');

        for (const line of lines) {
            const trimmed = line.trim();
            // Skip prefix and lengths (numeric only lines)
            if (!trimmed || trimmed === ")]}'" || /^\d+$/.test(trimmed)) {
                continue;
            }

            try {
                const json = JSON.parse(trimmed);

                // Locate the inner payload for CNgdBe in this chunk
                // Structure: [['wrb.fr', 'CNgdBe', '[ "INNER_JSON", ... ]']]
                if (Array.isArray(json)) {
                    for (const chunk of json) {
                        if (Array.isArray(chunk) && chunk[1] === 'CNgdBe') {
                            const innerPayloadStr = chunk[2];
                            if (innerPayloadStr) {
                                // console.log('[GemsAPI] Raw Inner Payload:', innerPayloadStr.substring(0, 500) + '...'); 
                                const innerData = JSON.parse(innerPayloadStr);
                                extractGemsFromData(innerData, gems);
                            }
                        }
                    }
                }
            } catch (lineError) {
                // Ignore invalid lines (maybe partial chunks)
                // console.warn('[GemsAPI] Skipped invalid line:', lineError);
            }
        }

    } catch (e) {
        console.error('[GemsAPI] Parse error:', e);
    }

    return gems;
}

/**
 * Parse specific Gem structure from CNgdBe response
 * Structure observed: [null, null, [[Gem1], [Gem2]]]
 * Gem Entry: ["HASH_ID", ["NAME", ...], ["INSTRUCTIONS", ...], ...]
 */
function extractGemsFromData(innerData, list) {
    if (!Array.isArray(innerData) || innerData.length < 3 || !Array.isArray(innerData[2])) {
        // Fallback to recursive if structure doesn't match standard
        // extractGemsRecursively(innerData, list); // Disabled to prevent false positives for now
        return;
    }

    const gemsList = innerData[2];

    for (const gemEntry of gemsList) {
        if (Array.isArray(gemEntry) && gemEntry.length > 1) {
            const hashId = gemEntry[0];
            const metadata = gemEntry[1];

            if (typeof hashId === 'string' && Array.isArray(metadata)) {
                const name = metadata[0];
                let instructions = '';

                // Try to find instructions in metadata first (index 1 is usually description/instructions)
                if (metadata.length > 1 && typeof metadata[1] === 'string') {
                    instructions = metadata[1];
                }

                // Construct ID (assuming model:gemini-custom- format is expected by controller)
                const fullId = `model:gemini-custom-${hashId}`;

                console.log(`[GemsAPI] Parsed Gem: ${name} (${fullId})`);

                list.push({
                    id: fullId,
                    name: name,
                    instructions: typeof instructions === 'string' ? instructions.substring(0, 100) + '...' : ''
                });
            }
        }
    }
}

function generateReqId() {
    return Math.floor(Math.random() * 100000) + 10000;
}

/**
 * Cache for gems list
 */
let gemsCache = {
    data: null,
    timestamp: 0,
    accountIndex: null
};

const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

/**
 * Get gems list with caching
 */
export async function getCachedGemsListAPI(userIndex = '0', forceRefresh = false) {
    const now = Date.now();

    // Return cached data if valid
    if (!forceRefresh &&
        gemsCache.data &&
        gemsCache.accountIndex === userIndex &&
        (now - gemsCache.timestamp) < CACHE_DURATION) {
        console.log('[GemsAPI] Returning cached data');
        return gemsCache.data;
    }

    // Fetch new data
    const gems = await fetchGemsListAPI(userIndex);

    // Update cache only if we got results (or if we are sure it's not an error)
    // To be safe, if gems is empty, we don't cache it, so we retry next time.
    if (gems && gems.length > 0) {
        gemsCache = {
            data: gems,
            timestamp: now,
            accountIndex: userIndex
        };
    }

    return gems;
}
