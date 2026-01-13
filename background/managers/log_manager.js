
// background/managers/log_manager.js

export class LogManager {
    constructor() {
        this.logs = [];
        this.MAX_LOGS = 2000;
        this.STORAGE_KEY = 'gemini_nexus_logs';
        this.init();
    }

    async init() {
        try {
            const result = await chrome.storage.local.get(this.STORAGE_KEY);
            if (result[this.STORAGE_KEY] && Array.isArray(result[this.STORAGE_KEY])) {
                this.logs = result[this.STORAGE_KEY];
            }
            this.add({
                level: 'INFO',
                context: 'Background',
                message: 'LogManager initialized',
                timestamp: Date.now()
            });
        } catch (e) {
            console.error("Failed to load logs", e);
        }
    }

    add(entry) {
        if (!entry.timestamp) entry.timestamp = Date.now();
        
        this.logs.push(entry);
        
        // Prune if too large
        if (this.logs.length > this.MAX_LOGS) {
            this.logs = this.logs.slice(-this.MAX_LOGS);
        }
        
        this._save();
    }

    _save() {
        // We rely on chrome.storage.local's efficiency, but could debounce if needed.
        chrome.storage.local.set({ [this.STORAGE_KEY]: this.logs }).catch(() => {});
    }

    getLogs() {
        return this.logs;
    }
    
    clear() {
        this.logs = [];
        this._save();
        this.add({ 
            level: 'INFO', 
            context: 'Background', 
            message: 'Logs cleared', 
            timestamp: Date.now() 
        });
    }
}
