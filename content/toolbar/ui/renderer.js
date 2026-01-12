
// content/toolbar/ui/renderer.js
(function() {
    /**
     * Handles the rendering of results in the toolbar window,
     * including Markdown transformation (via Bridge) and Generated Images grid.
     */
    class UIRenderer {
        constructor(view, bridge) {
            this.view = view;
            this.bridge = bridge;
            this.currentResultText = '';
        }

        /**
         * Renders the text result and optionally processes generated images.
         */
        async show(text, title, isStreaming, images = []) {
            this.currentResultText = text;
            
            // Delegate rendering to iframe (Offscreen Renderer)
            // The bridge now handles both Markdown AND Image HTML generation to share logic with Sandbox
            let html = text;
            let tasks = [];

            if (this.bridge) {
                try {
                    const result = await this.bridge.render(text, isStreaming ? [] : images);
                    html = result.html;
                    tasks = result.fetchTasks || [];
                } catch (e) {
                    console.warn("Bridge render failed, falling back to simple escape");
                    html = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
                }
            }

            // Pass to view
            this.view.showResult(html, title, isStreaming);
            
            // Post-Render: Handle Markmap
            if (!isStreaming) {
                // We need to trigger Markmap rendering in the context of the View
                // Since Markmap libraries are NOT loaded in the content script (CSP issues usually),
                // we might need a way to render it.
                //
                // Wait! If we are in the Content Script, we CANNOT easily run external libs unless injected.
                // BUT, our "View" (Toolbar) is Shadow DOM? No, it is likely injected into the page.
                
                // If we want to render Markmap, we should do it inside the Bridge (Sandbox) and return SVG?
                // OR, we load Markmap in the content script (might be blocked by page CSP).
                
                // SAFE APPROACH: Render Markmap in the Sandbox (Renderer) and return the SVG string.
                // This requires `transformMarkdown` to be async or return a placeholder that we replace later.
                
                // ALTERNATIVE: Use the Bridge to "renderMarkmap" for specific code blocks.
                // 1. Find <div class="markmap-source">...</div>
                // 2. Extract content.
                // 3. Send to Bridge -> Render -> Get SVG.
                // 4. Replace.
                
                this._processMarkmaps(this.view.elements.resultText);
            }
                 
            // Execute fetch tasks (images) if any
            if (tasks.length > 0) {
                this._executeImageFetchTasks(tasks);
            }
        }
        
        async _processMarkmaps(container) {
            if (!container) return;
            const sources = container.querySelectorAll('.markmap-source');
            if (sources.length === 0) return;
            
            // Load Markmap Libs if not present (Lazy Load in Content Script context?)
            // Actually, we should ask the Bridge to render it to SVG string.
            
            for (const sourceDiv of sources) {
                const markdown = sourceDiv.textContent;
                const containerDiv = sourceDiv.nextElementSibling; // .markmap-container
                
                if (containerDiv && !containerDiv.hasAttribute('data-rendered')) {
                    try {
                        containerDiv.innerHTML = '<div class="loading-spinner">Loading Mindmap...</div>';
                        // Request Bridge to render
                        const svgHtml = await this.bridge.renderMarkmap(markdown);
                        containerDiv.innerHTML = svgHtml;
                        containerDiv.setAttribute('data-rendered', 'true');
                    } catch (e) {
                        console.error('Markmap render failed:', e);
                        containerDiv.innerHTML = `<div class="error">Mindmap Error: ${e.message}</div>`;
                    }
                }
            }
        }

        _executeImageFetchTasks(tasks) {
            const container = this.view.elements.resultText;
            if(!container) return;

            tasks.forEach(task => {
                const img = container.querySelector(`img[data-req-id="${task.reqId}"]`);
                if(img) {
                    // Send message to background to fetch actual image
                    chrome.runtime.sendMessage({ 
                        action: "FETCH_GENERATED_IMAGE", 
                        url: task.url, 
                        reqId: task.reqId 
                    });
                }
            });
        }
        
        handleGeneratedImageResult(request) {
             const container = this.view.elements.resultText;
             if(!container) return;
             
             const img = container.querySelector(`img[data-req-id="${request.reqId}"]`);
             if (img) {
                 if (request.base64) {
                     img.src = request.base64;
                     img.classList.remove('loading');
                     img.style.minHeight = "auto";
                 } else {
                     img.style.background = "#ffebee";
                     img.alt = "Failed to load";
                 }
             }
        }

        get currentText() {
            return this.currentResultText;
        }
    }

    window.GeminiUIRenderer = UIRenderer;
})();
