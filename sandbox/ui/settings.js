
// sandbox/ui/settings.js
import { saveShortcutsToStorage, saveThemeToStorage, requestThemeFromStorage, saveLanguageToStorage, requestLanguageFromStorage, saveTextSelectionToStorage, requestTextSelectionFromStorage, saveSidebarBehaviorToStorage, saveImageToolsToStorage, requestImageToolsFromStorage, saveAccountIndicesToStorage, requestAccountIndicesFromStorage, sendToBackground } from '../../lib/messaging.js';
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
        this.accountIndices = "0";

        // Initialize View
        this.view = new SettingsView({
            onOpen: () => this.handleOpen(),
            onSave: (data) => this.saveSettings(data),
            onReset: () => this.resetSettings(),

            onThemeChange: (theme) => this.setTheme(theme),
            onLanguageChange: (lang) => this.setLanguage(lang),

            onTextSelectionChange: (val) => { this.textSelectionEnabled = (val === 'on' || val === true); saveTextSelectionToStorage(this.textSelectionEnabled); },
            onImageToolsChange: (val) => { this.imageToolsEnabled = (val === 'on' || val === true); saveImageToolsToStorage(this.imageToolsEnabled); },
            onSidebarBehaviorChange: (val) => saveSidebarBehaviorToStorage(val),
            onDownloadLogs: () => this.downloadLogs(),
            onSaveMcp: (json) => this.saveMcpConfig(json)
        });

        // External Trigger Binding
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

                // MCP Config Check (heuristic: starts with mcpServers key or checking known structure, 
                // but since GET_CONFIG returns stringified JSON...)
                // Actually, background/messages.js sends response directly.
                // sidepanel wraps it in { payload: response }.

                // If it looks like MCP config (string)
                if (typeof payload === 'string' && payload.includes('"mcpServers"')) {
                    this.view.setMcpConfig(payload);
                    return;
                }

                // If it's a save result
                if (payload.success !== undefined && payload.mcpServers === undefined) {
                    // Assume it's save result if prompt save returns success
                    // But wait, saveConfig returns { success: true/false }
                    if (payload.success) {
                        alert("MCP Configuration Saved!");
                    } else if (payload.error) {
                        alert("Error Saving MCP Config: " + payload.error);
                    }
                }
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
        this.view.setAccountIndices(this.accountIndices);

        // Refresh from storage
        requestTextSelectionFromStorage();
        requestImageToolsFromStorage();
        requestAccountIndicesFromStorage();

        // Fetch MCP Config
        this.fetchMcpConfig();

        this.fetchGithubStars();
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

        // Accounts
        let val = data.accountIndices.trim();
        if (!val) val = "0";
        this.accountIndices = val;
        const cleaned = val.replace(/[^0-9,]/g, '');
        saveAccountIndicesToStorage(cleaned);
    }

    resetSettings() {
        this.view.setShortcuts(this.defaultShortcuts);
        this.view.setAccountIndices("0");
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

    updateAccountIndices(indicesString) {
        this.accountIndices = indicesString || "0";
        this.view.setAccountIndices(this.accountIndices);
    }

    async fetchGithubStars() {
        if (this.view.hasFetchedStars()) return;

        try {
            const res = await fetch('https://api.github.com/repos/yeahhe365/gemini-nexus');
            if (res.ok) {
                const data = await res.json();
                this.view.displayStars(data.stargazers_count);
            }
        } catch (e) {
            this.view.displayStars(null);
        }
    }

    // --- MCP Methods ---

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
