
// services/auth.js
import { extractFromHTML } from '../lib/utils.js';

// Get 'at' (SNlM0e), 'bl' (cfb2h), and user index values
// Supports fetching from specific user index URL to get correct tokens for that account.
export async function fetchRequestParams(userIndex = '0') {
    // Based on user feedback, account URLs differ slightly:
    // Default (0): https://gemini.google.com/app
    // Others (X): https://gemini.google.com/u/X/app
    let url = 'https://gemini.google.com/app';
    if (userIndex && userIndex !== '0') {
        url = `https://gemini.google.com/u/${userIndex}/app`;
    }

    console.log(`Fetching Gemini credentials for index ${userIndex} via ${url}...`);

    try {
        const resp = await fetch(url, {
            method: 'GET',
            credentials: 'include',  // Include cookies
            headers: {
                'User-Agent': navigator.userAgent
            }
        });

        if (!resp.ok) {
            console.warn(`[Auth] HTTP ${resp.status} ${resp.statusText} for ${url}`);
            throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
        }

        const html = await resp.text();

        const atValue = extractFromHTML('SNlM0e', html);
        const blValue = extractFromHTML('cfb2h', html);

        // Try to find the user index (authuser) to support multiple accounts
        // Usually found in the URL or implied, but scraping data-index is safer if available
        let authUserIndex = userIndex; // Default to requested index

        const authMatch = html.match(/data-index="(\d+)"/);
        if (authMatch) {
            authUserIndex = authMatch[1];
        }

        if (!atValue) {
            console.error('[Auth] SNlM0e token not found in HTML - user may not be logged in');
            throw new Error(`Not logged in for account ${userIndex}. Please log in to gemini.google.com.`);
        }

        console.log('[Auth] Successfully fetched credentials');
        return { atValue, blValue, authUserIndex, html };

    } catch (error) {
        console.error(`[Auth] Failed to fetch credentials:`, error);

        // Provide helpful error messages
        if (error.message.includes('Failed to fetch')) {
            throw new Error(`Network error: Cannot reach ${url}. Check your internet connection or try logging in to gemini.google.com manually.`);
        }

        throw error;
    }
}
