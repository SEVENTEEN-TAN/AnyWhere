
// sandbox/ui/settings/view.js

export class SettingsView {
    constructor(callbacks) {
        this.callbacks = callbacks || {};
        this.elements = {};

        this.queryElements();
        this.bindEvents();
    }

    queryElements() {
        const get = (id) => document.getElementById(id);

        this.elements = {
            modal: get('settings-modal'),
            btnClose: get('close-settings'),

            themeSelect: get('theme-select'),
            languageSelect: get('language-select'),

            textSelectionToggle: get('text-selection-toggle'),
            imageToolsToggle: get('image-tools-toggle'),

            inputQuickAsk: get('shortcut-quick-ask'),
            inputOpenPanel: get('shortcut-open-panel'),

            btnSave: get('save-shortcuts'),
            btnReset: get('reset-shortcuts'),

            btnDownloadLogs: get('download-logs'),

            mcpConfigInput: get('mcp-config-json'),
            btnSaveMcp: get('save-mcp-config'),

            workspacePath: get('workspace-path'),
            btnClearWorkspacePath: get('clear-workspace-path'),
            workspacePromptToggle: get('workspace-prompt-toggle'),

            starEl: get('star-count'),

            sidebarRadios: document.querySelectorAll('input[name="sidebar-behavior"]'),

            scrollIntervalInput: get('scroll-interval'),
            scrollMaxTimeInput: get('scroll-max-time'),
            contextLimitInput: get('context-limit')
        };
    }

    bindEvents() {
        const { modal, btnClose, btnSave, btnReset, themeSelect, languageSelect,
            inputQuickAsk, inputOpenPanel, textSelectionToggle, imageToolsToggle,
            sidebarRadios, btnDownloadLogs, btnSaveMcp, mcpConfigInput,
            workspacePath, btnClearWorkspacePath, workspacePromptToggle,
            scrollIntervalInput, scrollMaxTimeInput, contextLimitInput } = this.elements;

        // Modal actions
        if (btnClose) btnClose.addEventListener('click', () => this.close());
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.close();
            });
        }

        // Action Buttons
        if (btnSave) btnSave.addEventListener('click', () => this.handleSave());
        if (btnReset) btnReset.addEventListener('click', () => this.handleReset());

        if (btnSaveMcp) {
            btnSaveMcp.addEventListener('click', () => {
                if (mcpConfigInput) this.fire('onSaveMcp', mcpConfigInput.value);
            });
        }

        if (btnDownloadLogs) {
            btnDownloadLogs.addEventListener('click', () => this.fire('onDownloadLogs'));
        }

        // Workspace Path
        if (btnClearWorkspacePath) {
            btnClearWorkspacePath.addEventListener('click', () => {
                if (workspacePath) workspacePath.value = '';
                this.fire('onWorkspacePathChange', '');
            });
        }
        if (workspacePath) {
            workspacePath.addEventListener('blur', (e) => {
                this.fire('onWorkspacePathChange', e.target.value.trim());
            });
        }
        if (workspacePromptToggle) {
            workspacePromptToggle.addEventListener('change', (e) => {
                this.fire('onWorkspacePromptChange', e.target.checked);
            });
        }

        // Auto-Scroll Settings (Auto-save on blur)
        if (scrollIntervalInput) {
            scrollIntervalInput.addEventListener('blur', (e) => {
                this.fire('onAutoScrollChange', e.target.value, scrollMaxTimeInput ? scrollMaxTimeInput.value : 15000);
            });
        }
        if (scrollMaxTimeInput) {
            scrollMaxTimeInput.addEventListener('blur', (e) => {
                this.fire('onAutoScrollChange', scrollIntervalInput ? scrollIntervalInput.value : 200, e.target.value);
            });
        }
        if (contextLimitInput) {
            contextLimitInput.addEventListener('blur', (e) => this.fire('onContextLimitChange', e.target.value));
        }

        // Instant Updates
        if (themeSelect) {
            themeSelect.addEventListener('change', (e) => this.fire('onThemeChange', e.target.value));
        }
        if (languageSelect) {
            languageSelect.addEventListener('change', (e) => this.fire('onLanguageChange', e.target.value));
        }

        // Toggles
        if (textSelectionToggle) {
            textSelectionToggle.addEventListener('change', (e) => this.fire('onTextSelectionChange', e.target.checked));
        }
        if (imageToolsToggle) {
            imageToolsToggle.addEventListener('change', (e) => this.fire('onImageToolsChange', e.target.checked));
        }
        if (sidebarRadios) {
            sidebarRadios.forEach(radio => {
                radio.addEventListener('change', (e) => {
                    if (e.target.checked) this.fire('onSidebarBehaviorChange', e.target.value);
                });
            });
        }

        // Shortcuts
        this.setupShortcutInput(inputQuickAsk);
        this.setupShortcutInput(inputOpenPanel);

        // System Theme Listener
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
            if (themeSelect && themeSelect.value === 'system') {
                this.applyVisualTheme('system');
            }
        });

        // Keyboard
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal && modal.classList.contains('visible')) {
                this.close();
            }
        });
    }

    setAutoScrollSettings(interval, maxTime, contextLimit) {
        if (this.elements.scrollIntervalInput) this.elements.scrollIntervalInput.value = interval;
        if (this.elements.scrollMaxTimeInput) this.elements.scrollMaxTimeInput.value = maxTime;
        if (this.elements.contextLimitInput) this.elements.contextLimitInput.value = contextLimit;
    }

    handleSave() {
        const { inputQuickAsk, inputOpenPanel, textSelectionToggle, imageToolsToggle } = this.elements;

        const data = {
            shortcuts: {
                quickAsk: inputQuickAsk ? inputQuickAsk.value : null,
                openPanel: inputOpenPanel ? inputOpenPanel.value : null,
            },
            textSelection: textSelectionToggle ? textSelectionToggle.checked : true,
            imageTools: imageToolsToggle ? imageToolsToggle.checked : true
        };

        this.fire('onSave', data);
        this.close();
    }

    handleReset() {
        this.fire('onReset');
    }

    setupShortcutInput(inputEl) {
        if (!inputEl) return;
        inputEl.addEventListener('keydown', (e) => {
            e.preventDefault(); e.stopPropagation();
            if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;

            const keys = [];
            if (e.ctrlKey) keys.push('Ctrl');
            if (e.altKey) keys.push('Alt');
            if (e.shiftKey) keys.push('Shift');
            if (e.metaKey) keys.push('Meta');

            let k = e.key.toUpperCase();
            if (k === ' ') k = 'Space';
            keys.push(k);

            inputEl.value = keys.join('+');
        });
    }

    // --- Public API ---

    open() {
        if (this.elements.modal) {
            this.elements.modal.classList.add('visible');
            this.fire('onOpen');
        }
    }

    close() {
        if (this.elements.modal) {
            this.elements.modal.classList.remove('visible');
        }
    }

    setShortcuts(shortcuts) {
        if (this.elements.inputQuickAsk) this.elements.inputQuickAsk.value = shortcuts.quickAsk;
        if (this.elements.inputOpenPanel) this.elements.inputOpenPanel.value = shortcuts.openPanel;
    }

    setThemeValue(theme) {
        if (this.elements.themeSelect) this.elements.themeSelect.value = theme;
        this.applyVisualTheme(theme);
    }

    setLanguageValue(lang) {
        if (this.elements.languageSelect) this.elements.languageSelect.value = lang;
    }

    setToggles(textSelection, imageTools) {
        if (this.elements.textSelectionToggle) this.elements.textSelectionToggle.checked = textSelection;
        if (this.elements.imageToolsToggle) this.elements.imageToolsToggle.checked = imageTools;
    }

    setSidebarBehavior(behavior) {
        if (this.elements.sidebarRadios) {
            const val = behavior || 'auto';
            this.elements.sidebarRadios.forEach(radio => {
                radio.checked = (radio.value === val);
            });
        }
    }

    setMcpConfig(jsonStr) {
        if (this.elements.mcpConfigInput) this.elements.mcpConfigInput.value = jsonStr || "";
    }

    setWorkspacePath(path) {
        if (this.elements.workspacePath) this.elements.workspacePath.value = path || '';
    }

    setWorkspacePrompt(enabled) {
        if (this.elements.workspacePromptToggle) this.elements.workspacePromptToggle.checked = enabled !== false;
    }

    applyVisualTheme(theme) {
        let applied = theme;
        if (theme === 'system') {
            applied = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        document.documentElement.setAttribute('data-theme', applied);
    }

    displayStars(count) {
        const { starEl } = this.elements;
        if (!starEl) return;

        if (count) {
            const formatted = count > 999 ? (count / 1000).toFixed(1) + 'k' : count;
            starEl.textContent = `★ ${formatted}`;
            starEl.style.display = 'inline-flex';
            starEl.dataset.fetched = "true";
        } else {
            starEl.style.display = 'none';
        }
    }

    hasFetchedStars() {
        return this.elements.starEl && this.elements.starEl.dataset.fetched === "true";
    }

    fire(event, ...args) {
        if (this.callbacks[event]) this.callbacks[event](...args);
    }
}
