
// messaging.js

export function sendToBackground(payload) {
    window.parent.postMessage({
        action: 'FORWARD_TO_BACKGROUND',
        payload: payload
    }, '*');
}

function requestFromParent({ requestAction, responseAction, timeoutMs = 15000, ...data }) {
    return new Promise((resolve, reject) => {
        const messageId = `${requestAction}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        const timeout = setTimeout(() => {
            window.removeEventListener('message', handleResponse);
            reject(new Error(`Request timeout after ${timeoutMs}ms`));
        }, timeoutMs);

        const handleResponse = (event) => {
            const evt = event?.data;
            if (!evt || evt.action !== responseAction || evt.messageId !== messageId) return;
            clearTimeout(timeout);
            window.removeEventListener('message', handleResponse);
            resolve(evt.response);
        };

        window.addEventListener('message', handleResponse);

        if (!window.parent) {
            clearTimeout(timeout);
            window.removeEventListener('message', handleResponse);
            reject(new Error('No parent window found'));
            return;
        }

        window.parent.postMessage({ action: requestAction, messageId, ...data }, '*');
    });
}

export function fetchTabsList(timeoutMs = 15000) {
    return requestFromParent({ requestAction: 'FETCH_TABS_LIST', responseAction: 'TABS_LIST_RESPONSE', timeoutMs });
}

export function fetchTabsContent(tabIds, timeoutMs = 60000) {
    return requestFromParent({ requestAction: 'FETCH_TABS_CONTENT', responseAction: 'TABS_CONTENT_RESPONSE', timeoutMs, tabIds });
}

export function saveSessionsToStorage(sessions) {
    window.parent.postMessage({
        action: 'SAVE_SESSIONS',
        payload: sessions
    }, '*');
}

export function saveShortcutsToStorage(shortcuts) {
    window.parent.postMessage({
        action: 'SAVE_SHORTCUTS',
        payload: shortcuts
    }, '*');
}

export function requestThemeFromStorage() {
    window.parent.postMessage({ action: 'GET_THEME' }, '*');
}

export function saveThemeToStorage(theme) {
    window.parent.postMessage({
        action: 'SAVE_THEME',
        payload: theme
    }, '*');
}

export function requestLanguageFromStorage() {
    window.parent.postMessage({ action: 'GET_LANGUAGE' }, '*');
}

export function saveLanguageToStorage(lang) {
    window.parent.postMessage({
        action: 'SAVE_LANGUAGE',
        payload: lang
    }, '*');
}

export function requestTextSelectionFromStorage() {
    window.parent.postMessage({ action: 'GET_TEXT_SELECTION' }, '*');
}

export function saveTextSelectionToStorage(enabled) {
    window.parent.postMessage({
        action: 'SAVE_TEXT_SELECTION',
        payload: enabled
    }, '*');
}

export function requestImageToolsFromStorage() {
    window.parent.postMessage({ action: 'GET_IMAGE_TOOLS' }, '*');
}

export function saveImageToolsToStorage(enabled) {
    window.parent.postMessage({
        action: 'SAVE_IMAGE_TOOLS',
        payload: enabled
    }, '*');
}

export function saveSidebarBehaviorToStorage(behavior) {
    window.parent.postMessage({
        action: 'SAVE_SIDEBAR_BEHAVIOR',
        payload: behavior
    }, '*');
}

export function requestGemIdFromStorage() {
    window.parent.postMessage({ action: 'GET_GEM_ID' }, '*');
}

export function saveGemIdToStorage(gemId) {
    window.parent.postMessage({
        action: 'SAVE_GEM_ID',
        payload: gemId
    }, '*');
}

export function requestWorkspaceSettingsFromStorage() {
    window.parent.postMessage({ action: 'GET_WORKSPACE_SETTINGS' }, '*');
}

export function saveWorkspacePathToStorage(path) {
    window.parent.postMessage({
        action: 'SAVE_WORKSPACE_PATH',
        payload: path
    }, '*');
}

export function saveWorkspacePromptToStorage(enabled) {
    window.parent.postMessage({
        action: 'SAVE_WORKSPACE_PROMPT',
        payload: enabled
    }, '*');
}

export function requestAutoScrollSettingsFromStorage() {
    window.parent.postMessage({ action: 'GET_AUTO_SCROLL_SETTINGS' }, '*');
}

export function saveAutoScrollSettingsToStorage(interval, maxTime) {
    window.parent.postMessage({
        action: 'SAVE_AUTO_SCROLL_SETTINGS',
        payload: { interval, maxTime }
    }, '*');
}

export function saveContextLimitToStorage(limit) {
    window.parent.postMessage({
        action: 'SAVE_CONTEXT_LIMIT',
        payload: limit
    }, '*');
}
