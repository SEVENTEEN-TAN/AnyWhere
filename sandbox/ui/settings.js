
// sandbox/ui/settings.js
import { saveShortcutsToStorage, saveThemeToStorage, requestThemeFromStorage, saveLanguageToStorage, requestLanguageFromStorage, saveTextSelectionToStorage, requestTextSelectionFromStorage, saveSidebarBehaviorToStorage, saveImageToolsToStorage, requestImageToolsFromStorage, sendToBackground, requestWorkspaceSettingsFromStorage, saveWorkspacePathToStorage, saveWorkspacePromptToStorage, requestAutoScrollSettingsFromStorage, saveAutoScrollSettingsToStorage, saveContextLimitToStorage, requestDefaultModelFromStorage, saveDefaultModelToStorage } from '../../lib/messaging.js';
import { setLanguagePreference, getLanguagePreference } from '../core/i18n.js';
import { SettingsView } from './settings/view.js';
import { DEFAULT_SHORTCUTS } from '../../lib/constants.js';

export class SettingsController {
    constructor(callbacks) {
        this.callbacks = callbacks || {};

        // State
        this.defaultShortcuts = { ...DEFAULT_SHORTCUTS };
        this.shortcuts = { ...this.defaultShortcuts };

        this.textSelectionEnabled = true;
        this.imageToolsEnabled = true;
        this.defaultModelId = null;
        this.lastFetchedModels = [];

        // Initialize View
        this.view = new SettingsView({
            onOpen: () => this.handleOpen(),
            onSave: (data) => this.saveSettings(data),
            onReset: () => this.resetSettings(),

            onThemeChange: (theme) => this.setTheme(theme),
            onLanguageChange: (lang) => this.setLanguage(lang),

            onTextSelectionChange: (val) => { this.textSelectionEnabled = (val === 'on' || val === true); saveTextSelectionToStorage(this.textSelectionEnabled); },
            onImageToolsChange: (val) => { this.imageToolsEnabled = (val === 'on' || val === true); saveImageToolsToStorage(this.imageToolsEnabled); },
            onDefaultModelChange: (modelId) => this.saveDefaultModel(modelId),
            onSaveMcp: (json) => this.saveMcpConfig(json),
            onWorkspacePathChange: (path) => this.saveWorkspacePath(path),
            onWorkspacePromptChange: (enabled) => this.saveWorkspacePrompt(enabled),
            onAutoScrollChange: (interval, maxTime) => this.saveAutoScrollSettings(interval, maxTime),
            onContextLimitChange: (limit) => this.saveContextLimit(limit)
        });

        // Monitor external trigger
        const trigger = document.getElementById('settings-btn');
        if (trigger) {
            trigger.addEventListener('click', () => {
                this.open();
                if (this.callbacks.onOpen) this.callbacks.onOpen();
            });
        }

        // Listen for log data & MCP responses
        window.addEventListener('message', (e) => {
            if (e.data.action === 'BACKGROUND_MESSAGE' && e.data.payload) {
                const payload = e.data.payload;

                // Logs
                if (payload.logs) {
                    this.saveLogFile(payload.logs);
                    return;
                }

                // MCP Config
                if (typeof payload === 'string' && payload.includes('"mcpServers"')) {
                    this.view.setMcpConfig(payload);
                    return;
                }

                // Save Result
                if (payload.success !== undefined && payload.mcpServers === undefined) {
                    if (payload.success) {
                        alert("MCP Configuration Saved!");
                    } else if (payload.error) {
                        alert("Error Saving MCP Config: " + payload.error);
                    }
                }
            }

            // Workspace Settings Response
            if (e.data.action === 'RESTORE_WORKSPACE_SETTINGS') {
                const { path, prompt } = e.data.payload;
                this.view.setWorkspacePath(path || '');
                this.view.setWorkspacePrompt(prompt !== false);
            }

            // Auto-Scroll Settings Response
            if (e.data.action === 'RESTORE_AUTO_SCROLL_SETTINGS') {
                const { interval, maxTime, contextLimit } = e.data.payload;
                this.view.setAutoScrollSettings(
                    interval !== undefined ? interval : 200,
                    maxTime !== undefined ? maxTime : 15000,
                    contextLimit !== undefined ? contextLimit : 500000
                );
            }

            // Version Response
            if (e.data.action === 'RESTORE_VERSION') {
                this.view.setVersion(e.data.payload);
            }

            if (e.data.action === 'RESTORE_DEFAULT_MODEL') {
                this.defaultModelId = e.data.payload || null;
                this.view.setDefaultModelValue(this.defaultModelId);
                this.view.showDefaultModelInvalid(this.defaultModelId && !this.lastFetchedModels.some(m => m.id === this.defaultModelId));
            }
        });
    }

    open() {
        this.view.open();
    }

    close() {
        this.view.close();
    }

    handleOpen() {
        // Sync state to view
        this.view.setShortcuts(this.shortcuts);
        this.view.setLanguageValue(getLanguagePreference());
        this.view.setToggles(this.textSelectionEnabled, this.imageToolsEnabled);

        // Refresh from storage
        requestTextSelectionFromStorage();
        requestImageToolsFromStorage();

        // Load workspace settings via messaging
        requestWorkspaceSettingsFromStorage();

        // Fetch MCP Config
        this.fetchMcpConfig();

        // Fetch Version (ensure it is up to date)
        this.fetchVersion();

        this.fetchGithubStars();

        // Load Auto Scroll Settings via messaging
        requestAutoScrollSettingsFromStorage();

        this.refreshDefaultModelOptions();
        requestDefaultModelFromStorage();
    }

    async refreshDefaultModelOptions() {
        try {
            const response = await this.fetchModelsList(false);
            const models = (response && response.models) ? response.models : [];
            this.lastFetchedModels = [...models].sort((a, b) => {
                const aName = (a.name || a.id || '').toLowerCase();
                const bName = (b.name || b.id || '').toLowerCase();
                return aName.localeCompare(bName);
            });
            this.view.setDefaultModelOptions(this.lastFetchedModels);
            this.view.setDefaultModelValue(this.defaultModelId);
            this.view.showDefaultModelInvalid(this.defaultModelId && !this.lastFetchedModels.some(m => m.id === this.defaultModelId));
        } catch (e) {
            this.lastFetchedModels = [];
            this.view.setDefaultModelOptions([]);
            this.view.showDefaultModelInvalid(false);
        }
    }

    fetchModelsList(forceRefresh = false) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Request timeout after 15 seconds')), 15000);
            const messageId = `settings_models_${Date.now()}`;

            const handleResponse = (event) => {
                if (event.data.action === 'MODELS_LIST_RESPONSE' && event.data.messageId === messageId) {
                    clearTimeout(timeout);
                    window.removeEventListener('message', handleResponse);
                    resolve(event.data.response);
                }
            };

            window.addEventListener('message', handleResponse);

            if (!window.parent) {
                clearTimeout(timeout);
                window.removeEventListener('message', handleResponse);
                reject(new Error('No parent window found'));
                return;
            }

            window.parent.postMessage({
                action: 'FETCH_MODELS_LIST',
                messageId,
                userIndex: '0',
                forceRefresh
            }, '*');
        });
    }

    saveDefaultModel(modelId) {
        this.defaultModelId = modelId || null;
        saveDefaultModelToStorage(this.defaultModelId);
        this.view.showDefaultModelInvalid(this.defaultModelId && !this.lastFetchedModels.some(m => m.id === this.defaultModelId));
    }

    updateDefaultModel(modelId) {
        this.defaultModelId = modelId || null;
        this.view.setDefaultModelValue(this.defaultModelId);
        this.view.showDefaultModelInvalid(this.defaultModelId && !this.lastFetchedModels.some(m => m.id === this.defaultModelId));
    }

    saveSettings(data) {
        // Shortcuts
        this.shortcuts = data.shortcuts;
        saveShortcutsToStorage(this.shortcuts);

        // General Toggles
        this.textSelectionEnabled = data.textSelection;
        saveTextSelectionToStorage(this.textSelectionEnabled);

        this.imageToolsEnabled = data.imageTools;
        saveImageToolsToStorage(this.imageToolsEnabled);
    }

    resetSettings() {
        this.view.setShortcuts(this.defaultShortcuts);
    }

    downloadLogs() {
        sendToBackground({ action: 'GET_LOGS' });
    }

    saveLogFile(logs) {
        if (!logs || logs.length === 0) {
            alert("No logs to download.");
            return;
        }

        const text = logs.map(l => {
            const time = new Date(l.timestamp).toISOString();
            const dataStr = l.data ? ` | Data: ${JSON.stringify(l.data)}` : '';
            return `[${time}] [${l.level}] [${l.context}] ${l.message}${dataStr}`;
        }).join('\n');

        // Send to parent to handle download (Sandbox restriction workaround)
        window.parent.postMessage({
            action: 'DOWNLOAD_LOGS',
            payload: {
                text: text,
                filename: `gemini-nexus-logs-${Date.now()}.txt`
            }
        }, '*');
    }

    // --- State Updates (From View or Storage) ---

    setTheme(theme) {
        this.view.applyVisualTheme(theme);
        saveThemeToStorage(theme);
    }

    updateTheme(theme) {
        this.view.setThemeValue(theme);
    }

    setLanguage(newLang) {
        setLanguagePreference(newLang);
        saveLanguageToStorage(newLang);
        document.dispatchEvent(new CustomEvent('gemini-language-changed'));
    }

    updateLanguage(lang) {
        setLanguagePreference(lang);
        this.view.setLanguageValue(lang);
        document.dispatchEvent(new CustomEvent('gemini-language-changed'));
    }

    updateShortcuts(payload) {
        if (payload) {
            this.shortcuts = { ...this.defaultShortcuts, ...payload };
            this.view.setShortcuts(this.shortcuts);
        }
    }

    updateTextSelection(enabled) {
        this.textSelectionEnabled = enabled;
        this.view.setToggles(this.textSelectionEnabled, this.imageToolsEnabled);
    }

    updateImageTools(enabled) {
        this.imageToolsEnabled = enabled;
        this.view.setToggles(this.textSelectionEnabled, this.imageToolsEnabled);
    }

    updateSidebarBehavior(behavior) {
        this.view.setSidebarBehavior(behavior);
    }

    // --- Workspace Settings ---

    saveWorkspacePath(path) {
        saveWorkspacePathToStorage(path);
        console.log('[Settings] Workspace path saved:', path || 'default');
    }

    saveWorkspacePrompt(enabled) {
        saveWorkspacePromptToStorage(enabled);
        console.log('[Settings] Workspace prompt setting saved:', enabled);
    }

    saveAutoScrollSettings(interval, maxTime) {
        const i = parseInt(interval) || 200;
        const m = parseInt(maxTime) || 15000;
        saveAutoScrollSettingsToStorage(i, m);
        console.log('[Settings] Auto-Scroll settings saved:', i, m);
    }

    saveContextLimit(limit) {
        const l = parseInt(limit);
        saveContextLimitToStorage(isNaN(l) ? 500000 : l);
        console.log('[Settings] Context limit saved:', l);
    }

    async fetchGithubStars() {
        if (this.view.hasFetchedStars()) return;

        try {
            const res = await fetch('https://api.github.com/repos/SEVENTEEN-TAN/AnyWhere');
            if (res.ok) {
                const data = await res.json();
                this.view.displayStars(data.stargazers_count);
            }
        } catch (e) {
            this.view.displayStars(null);
        }
    }

    // --- MCP Methods ---

    fetchVersion() {
        window.parent.postMessage({ action: 'GET_VERSION' }, '*');
    }

    fetchMcpConfig() {
        sendToBackground({ action: 'MCP_GET_CONFIG' });
    }

    saveMcpConfig(jsonStr) {
        // Basic validation
        try {
            JSON.parse(jsonStr);
        } catch (e) {
            alert("Invalid JSON format");
            return;
        }
        sendToBackground({ action: 'MCP_SAVE_CONFIG', json: jsonStr });
    }
}
