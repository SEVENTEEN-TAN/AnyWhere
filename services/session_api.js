// services/session_api.js
import { fetchRequestParams } from './auth.js';

/**
 * Delete a session from Gemini official server
 * @param {string} conversationId - The conversation ID to delete (e.g., "c_59e546e19a06fb57")
 * @param {string} userIndex - User account index (default: '0')
 * @returns {Promise<boolean>} Success status
 */
export async function deleteSessionFromServer(conversationId, userIndex = '0') {
    try {
        console.log('[SessionAPI] Deleting session from server:', conversationId);
        
        // Get authentication parameters
        const auth = await fetchRequestParams(userIndex);
        
        // Step 1: Delete the session using GzXR5e RPC
        const deleteParams = new URLSearchParams({
            'rpcids': 'GzXR5e',
            'source-path': userIndex === '0' ? '/app' : `/u/${userIndex}/app`,
            'bl': auth.blValue || 'boq_assistant-bard-web-server_20251217.07_p5',
            'hl': 'zh-CN',
            '_reqid': Math.floor(Math.random() * 900000) + 100000,
            'rt': 'c'
        });
        
        const deleteUrl = `https://gemini.google.com/u/${userIndex}/_/BardChatUi/data/batchexecute?${deleteParams.toString()}`;
        
        // Construct the f.req payload for deletion
        const deleteData = [conversationId];
        const deleteFReq = JSON.stringify([
            [["GzXR5e", JSON.stringify(deleteData), null, "generic"]]
        ]);
        
        const deleteResponse = await fetch(deleteUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                'X-Same-Domain': '1',
                'X-Goog-AuthUser': userIndex
            },
            body: new URLSearchParams({
                'at': auth.atValue,
                'f.req': deleteFReq
            }),
            credentials: 'include'
        });
        
        if (!deleteResponse.ok) {
            console.error('[SessionAPI] Delete session failed:', deleteResponse.status);
            return false;
        }
        
        const deleteText = await deleteResponse.text();
        console.log('[SessionAPI] Delete response:', deleteText.substring(0, 200));
        
        // Step 2: Refresh session list using aPya6c RPC
        const refreshParams = new URLSearchParams({
            'rpcids': 'aPya6c',
            'source-path': userIndex === '0' ? '/app' : `/u/${userIndex}/app`,
            'bl': auth.blValue || 'boq_assistant-bard-web-server_20251217.07_p5',
            'hl': 'zh-CN',
            '_reqid': Math.floor(Math.random() * 900000) + 100000,
            'rt': 'c'
        });
        
        const refreshUrl = `https://gemini.google.com/u/${userIndex}/_/BardChatUi/data/batchexecute?${refreshParams.toString()}`;
        
        // Construct the f.req payload for refresh (empty array)
        const refreshFReq = JSON.stringify([
            [["aPya6c", "[]", null, "generic"]]
        ]);
        
        const refreshResponse = await fetch(refreshUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                'X-Same-Domain': '1',
                'X-Goog-AuthUser': userIndex
            },
            body: new URLSearchParams({
                'at': auth.atValue,
                'f.req': refreshFReq
            }),
            credentials: 'include'
        });
        
        if (!refreshResponse.ok) {
            console.warn('[SessionAPI] Refresh session list failed:', refreshResponse.status);
            // Don't return false here, deletion was successful
        } else {
            const refreshText = await refreshResponse.text();
            console.log('[SessionAPI] Refresh response:', refreshText.substring(0, 200));
        }
        
        console.log('[SessionAPI] Session deleted successfully');
        return true;
        
    } catch (error) {
        console.error('[SessionAPI] Error deleting session:', error);
        return false;
    }
}

/**
 * Batch delete multiple sessions from Gemini official server
 * @param {string[]} conversationIds - Array of conversation IDs to delete
 * @param {string} userIndex - User account index (default: '0')
 * @returns {Promise<{success: number, failed: number}>} Delete results
 */
export async function batchDeleteSessions(conversationIds, userIndex = '0') {
    console.log('[SessionAPI] Batch deleting sessions:', conversationIds.length);
    
    let success = 0;
    let failed = 0;
    
    for (const conversationId of conversationIds) {
        const result = await deleteSessionFromServer(conversationId, userIndex);
        if (result) {
            success++;
        } else {
            failed++;
        }
        
        // Add small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log('[SessionAPI] Batch delete completed:', { success, failed });
    return { success, failed };
}
