
export const FooterTemplate = `
    <!-- FOOTER -->
    <div class="footer">
        <div id="status"></div>
        
        <div class="tools-container">
            <button id="tools-scroll-left" class="scroll-nav-btn left" aria-label="Scroll Left">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
            
            <div class="tools-row" id="tools-row">
                <button id="summarize-btn" class="tool-btn" data-i18n-title="summarizeTooltip" title="Summarize current page">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="8" y1="6" x2="21" y2="6"></line>
                        <line x1="8" y1="12" x2="21" y2="12"></line>
                        <line x1="8" y1="18" x2="21" y2="18"></line>
                        <line x1="3" y1="6" x2="3.01" y2="6"></line>
                        <line x1="3" y1="12" x2="3.01" y2="12"></line>
                        <line x1="3" y1="18" x2="3.01" y2="18"></line>
                    </svg>
                    <span data-i18n="summarize">Summarize</span>
                </button>

                <button id="browser-control-btn" class="tool-btn" data-i18n-title="browserControlTooltip" title="Allow model to control browser">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="m3 3 7.07 16.97 2.51-7.39 7.39-2.51L3 3z"></path>
                        <path d="m13 13 6 6"></path>
                    </svg>
                    <span data-i18n="browserControl">Control</span>
                </button>
                <button id="page-context-btn" class="tool-btn context-aware" data-i18n-title="pageContextTooltip" title="Toggle chat with page content">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="9" y1="3" x2="9" y2="21"></line>
                    </svg>
                    <span data-i18n="pageContext">Page</span>
                </button>
                <button id="quote-btn" class="tool-btn context-aware" data-i18n-title="quoteTooltip" title="Quote selected text from page">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/>
                        <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/>
                    </svg>
                    <span data-i18n="quote">Quote</span>
                </button>
                <button id="ocr-btn" class="tool-btn context-aware" data-i18n-title="ocrTooltip" title="Capture area and extract text">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M4 7V4h3"></path>
                        <path d="M20 7V4h-3"></path>
                        <path d="M4 17v3h3"></path>
                        <path d="M20 17v3h-3"></path>
                        <line x1="9" y1="12" x2="15" y2="12"></line>
                    </svg>
                    <span data-i18n="ocr">OCR</span>
                </button>
                <button id="screenshot-translate-btn" class="tool-btn context-aware" data-i18n-title="screenshotTranslateTooltip" title="Capture area and translate text">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="m5 8 6 6"></path><path d="m4 14 6-6 2-3"></path><path d="M2 5h12"></path><path d="M7 2h1"></path><path d="m22 22-5-10-5 10"></path><path d="M14 18h6"></path>
                    </svg>
                    <span data-i18n="screenshotTranslate">Translate</span>
                </button>
                <button id="snip-btn" class="tool-btn context-aware" data-i18n-title="snipTooltip" title="Capture area to input">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M6 2v14a2 2 0 0 0 2 2h14"></path>
                        <path d="M18 22V8a2 2 0 0 0-2-2H2"></path>
                    </svg>
                    <span data-i18n="snip">Snip</span>
                </button>
            </div>

            <button id="tools-scroll-right" class="scroll-nav-btn right" aria-label="Scroll Right">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
        </div>

        <div class="input-wrapper">
            <!-- Dynamic Image Preview Container -->
            <div id="image-preview" class="image-preview"></div>
            
            <!-- MCP Tags Container (shows selected MCP servers) -->
            <div id="mcp-tags" class="mcp-tags-container"></div>
            
            <div class="input-row">
                <div class="action-menu-container">
                    <button id="upload-btn" class="icon-btn action-trigger" data-i18n-title="addAttachmentTooltip" title="Add Attachment / Tool">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                    </button>
                    <!-- Action Menu -->
                    <div id="action-menu" class="action-menu hidden">
                        <div class="menu-item" id="action-upload">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
                            <span data-i18n="uploadFile">Upload File</span>
                        </div>
                        <div class="menu-item" id="action-mcp">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
                            <span data-i18n="mcpTools">MCP Tools</span>
                        </div>
                    </div>
                    
                    <!-- MCP Server Picker Modal -->
                    <div id="mcp-picker" class="mcp-picker hidden">
                        <div class="mcp-picker-header">
                            <span data-i18n="selectMcpServer">Select MCP Server</span>
                        </div>
                        <div id="mcp-server-list" class="mcp-server-list">
                            <!-- Dynamically populated -->
                        </div>
                    </div>
                    
                    <!-- Hidden File Input for Trigger -->
                    <input type="file" id="image-input" multiple accept="image/*, .pdf, .txt, .js, .py, .html, .css, .json, .csv, .md" style="display: none;">
                </div>

                <textarea id="prompt" data-i18n-placeholder="askPlaceholder" placeholder="Ask Anywhere..." rows="1"></textarea>
                <button id="send" data-i18n-title="sendMessageTooltip" title="Send message">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                </button>
            </div>
        </div>
    </div>
`;