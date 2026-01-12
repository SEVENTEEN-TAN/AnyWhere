
// content/toolbar/bridge.js
(function() {
    class RendererBridge {
        constructor(hostElement) {
            this.host = hostElement;
            this.iframe = null;
            this.requests = {}; // Stores both render and image callbacks
            this.reqId = 0;
            this.init();
        }

        init() {
            this.iframe = document.createElement('iframe');
            this.iframe.src = chrome.runtime.getURL('sandbox/index.html?mode=renderer');
            this.iframe.style.display = 'none';
            // Append to main host (outside shadow) to ensure it loads
            this.host.appendChild(this.iframe);
            
            window.addEventListener('message', (e) => {
                // Handle Render Results
                if (e.data.action === 'RENDER_RESULT') {
                    const { html, reqId, fetchTasks } = e.data;
                    if (this.requests[reqId]) {
                        this.requests[reqId]({ html, fetchTasks });
                        delete this.requests[reqId];
                    }
                }
                // Handle Image Process Results
                if (e.data.action === 'PROCESS_IMAGE_RESULT') {
                    const { base64, reqId } = e.data;
                    if (this.requests[reqId]) {
                        this.requests[reqId](base64);
                        delete this.requests[reqId];
                    }
                }
                // Handle Markmap Results
                if (e.data.action === 'RENDER_MARKMAP_RESULT') {
                    const { svg, error, reqId } = e.data;
                    if (this.requests[reqId]) {
                        this.requests[reqId]({ svg, error });
                        delete this.requests[reqId];
                    }
                }
            });
        }
        
        async render(text, images = []) {
            const id = this.reqId++;
            return new Promise((resolve) => {
                this.requests[id] = resolve;
                if (this.iframe.contentWindow) {
                     this.iframe.contentWindow.postMessage({ action: 'RENDER', text, images, reqId: id }, '*');
                } else {
                     resolve({ html: text, fetchTasks: [] }); // Fallback
                }
            });
        }

        async processImage(base64) {
            const id = this.reqId++;
            return new Promise((resolve) => {
                this.requests[id] = resolve;
                if (this.iframe.contentWindow) {
                     this.iframe.contentWindow.postMessage({ action: 'PROCESS_IMAGE', base64, reqId: id }, '*');
                } else {
                     resolve(base64); // Fallback to original
                }
            });
        }
        
        async renderMarkmap(markdown) {
            const id = this.reqId++;
            return new Promise((resolve, reject) => {
                this.requests[id] = resolve;
                // Add timeout
                const timer = setTimeout(() => {
                    if (this.requests[id]) {
                        delete this.requests[id];
                        reject(new Error("Markmap Render Timeout"));
                    }
                }, 5000);
                
                // Override resolve to clear timeout
                const originalResolve = resolve;
                this.requests[id] = (result) => {
                    clearTimeout(timer);
                    if (result.error) reject(new Error(result.error));
                    else originalResolve(result.svg);
                };

                if (this.iframe.contentWindow) {
                     this.iframe.contentWindow.postMessage({ action: 'RENDER_MARKMAP', markdown, reqId: id }, '*');
                } else {
                     reject(new Error("Renderer not ready"));
                }
            });
        }
    }

    window.GeminiRendererBridge = RendererBridge;
})();