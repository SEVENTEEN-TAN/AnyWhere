
export const SettingsTemplate = `
    <!-- SETTINGS -->
    <div id="settings-modal" class="settings-modal">
        <div class="settings-content">
            <div class="settings-header">
                <h3 data-i18n="settingsTitle">Settings</h3>
                <button id="close-settings" class="icon-btn small" data-i18n-title="close" title="Close">✕</button>
            </div>
            <div class="settings-body">
                <div class="setting-group">
                    <h4 data-i18n="general">General</h4>
                    
                    <div class="shortcut-row" style="margin-bottom: 12px;">
                        <div style="flex: 1;">
                            <label data-i18n="textSelection" style="font-weight: 500; display: block; margin-bottom: 2px;">Text Selection Toolbar</label>
                            <span class="setting-desc" data-i18n="textSelectionDesc">Show floating toolbar when selecting text.</span>
                        </div>
                        <input type="checkbox" id="text-selection-toggle" style="width: 20px; height: 20px; cursor: pointer;">
                    </div>

                    <div class="shortcut-row" style="margin-bottom: 12px;">
                        <div style="flex: 1;">
                            <label data-i18n="imageToolsToggle" style="font-weight: 500; display: block; margin-bottom: 2px;">Show Image Tools Button</label>
                            <span class="setting-desc" data-i18n="imageToolsToggleDesc">Show the AI button when hovering over images.</span>
                        </div>
                        <input type="checkbox" id="image-tools-toggle" style="width: 20px; height: 20px; cursor: pointer;">
                    </div>

                    <div class="shortcut-row" style="margin-bottom: 12px; align-items: flex-start;">
                        <div style="flex: 1; margin-right: 12px;">
                            <label data-i18n="accountIndices" style="font-weight: 500; display: block; margin-bottom: 2px;">Account Indices</label>
                            <span class="setting-desc" data-i18n="accountIndicesDesc">Comma-separated user indices (e.g., 0, 1, 2) for polling.</span>
                        </div>
                        <input type="text" id="account-indices-input" class="shortcut-input" style="width: 100px; text-align: left;" placeholder="0">
                    </div>

                    <div style="margin-top: 16px;">
                        <h5 data-i18n="sidebarBehavior" style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: var(--text-primary);">When Sidebar Reopens</h5>
                        
                        <div style="display: flex; flex-direction: column; gap: 12px;">
                            <label style="display: flex; align-items: flex-start; gap: 8px; cursor: pointer;">
                                <input type="radio" name="sidebar-behavior" value="auto" style="margin-top: 3px;">
                                <div>
                                    <div data-i18n="sidebarBehaviorAuto" style="font-weight: 500; font-size: 14px; color: var(--text-primary);">Auto restore or restart</div>
                                    <div data-i18n="sidebarBehaviorAutoDesc" style="font-size: 12px; color: var(--text-tertiary);">Restore if opened within 10 mins, otherwise start new chat.</div>
                                </div>
                            </label>
                            
                            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                <input type="radio" name="sidebar-behavior" value="restore">
                                <span data-i18n="sidebarBehaviorRestore" style="font-size: 14px; color: var(--text-primary);">Always restore previous chat</span>
                            </label>
                            
                            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                <input type="radio" name="sidebar-behavior" value="new">
                                <span data-i18n="sidebarBehaviorNew" style="font-size: 14px; color: var(--text-primary);">Always start new chat</span>
                            </label>
                        </div>
                    </div>
                </div>

                <div class="setting-group">
                    <h4 style="display:flex; align-items:center; gap:6px;">
                        <span>Model Context Protocol (MCP)</span>
                        <span class="badge" style="background:#4caf50; color:#fff; font-size:10px; padding:2px 6px; border-radius:4px;">BETA</span>
                    </h4>
                    <p class="setting-desc" style="margin-bottom: 8px;">Connect external tools via JSON configuration.</p>
                    
                    <textarea id="mcp-config-json" class="shortcut-input" style="width: 100%; height: 120px; font-family: monospace; font-size: 12px; resize: vertical;" placeholder='{"mcpServers": {"demo": {"endpoint": "http://localhost:3000/sse"}}}'></textarea>
                    
                    <div class="settings-actions" style="margin-top: 8px;">
                        <button id="save-mcp-config" class="btn-primary" style="width: 100%;">Save MCP Config</button>
                    </div>
                </div>

                <div class="setting-group">
                    <h4 data-i18n="appearance">Appearance</h4>
                    <div class="shortcut-row">
                        <label data-i18n="theme">Theme</label>
                        <select id="theme-select" class="shortcut-input" style="width: auto; padding: 6px 12px; text-align: left;">
                            <option value="system" data-i18n="system">System Default</option>
                            <option value="light" data-i18n="light">Light</option>
                            <option value="dark" data-i18n="dark">Dark</option>
                        </select>
                    </div>
                    <div class="shortcut-row">
                        <label data-i18n="language">Language</label>
                        <select id="language-select" class="shortcut-input" style="width: auto; padding: 6px 12px; text-align: left;">
                            <option value="system" data-i18n="system">System Default</option>
                            <option value="en">English</option>
                            <option value="zh">中文</option>
                        </select>
                    </div>
                </div>

                <div class="setting-group">
                    <h4 data-i18n="keyboardShortcuts">Keyboard Shortcuts</h4>
                    <p class="setting-desc" style="margin-bottom: 12px;" data-i18n="shortcutDesc">Click input and press keys to change.</p>
                    
                    <div class="shortcut-row">
                        <label data-i18n="quickAsk">Quick Ask (Floating)</label>
                        <input type="text" id="shortcut-quick-ask" class="shortcut-input" readonly value="Ctrl+G">
                    </div>
                    
                    <div class="shortcut-row">
                        <label data-i18n="openSidePanel">Open Side Panel</label>
                        <input type="text" id="shortcut-open-panel" class="shortcut-input" readonly value="Alt+S">
                    </div>

                    <div class="shortcut-row">
                        <label data-i18n="shortcutFocusInput">Focus Input</label>
                        <input type="text" class="shortcut-input" readonly value="Ctrl+P">
                    </div>

                    <div class="shortcut-row">
                        <label data-i18n="shortcutSwitchModel">Switch Model</label>
                        <input type="text" class="shortcut-input" readonly value="Tab">
                    </div>

                    <div class="settings-actions">
                        <button id="reset-shortcuts" class="btn-secondary" data-i18n="resetDefault">Reset Default</button>
                        <button id="save-shortcuts" class="btn-primary" data-i18n="saveChanges">Save Changes</button>
                    </div>
                </div>

                <div class="setting-group">
                    <h4 data-i18n="system">System</h4>
                    <div class="shortcut-row">
                        <label data-i18n="debugLogs">Debug Logs</label>
                        <button id="download-logs" class="btn-secondary" style="padding: 6px 12px; font-size: 12px;" data-i18n="downloadLogs">Download Logs</button>
                    </div>
                </div>

                <div class="setting-group">
                    <h4 data-i18n="about">About</h4>
                    <p class="setting-info"><strong>Gemini Nexus</strong> v4.0.0</p>
                    
                    <div style="display: flex; gap: 16px; margin-top: 8px; flex-wrap: wrap;">
                        <a href="https://github.com/yeahhe365/gemini-nexus" target="_blank" class="github-link" style="margin-top: 0;">
                            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path></svg>
                            <span data-i18n="sourceCode">Source Code</span>
                            <span id="star-count" class="star-badge"></span>
                        </a>
                        
                        <a href="https://github.com/yeahhe365/gemini-nexus/blob/main/README.md" target="_blank" class="github-link" style="margin-top: 0;">
                            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M18 8h1a4 4 0 0 1 0 8h-1"></path>
                                <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"></path>
                                <line x1="6" y1="1" x2="6" y2="4"></line>
                                <line x1="10" y1="1" x2="10" y2="4"></line>
                                <line x1="14" y1="1" x2="14" y2="4"></line>
                            </svg>
                            <span data-i18n="buyMeCoffee">Buy Me a Coffee</span>
                        </a>
                    </div>
                </div>
            </div>
        </div>
    </div>
`;
