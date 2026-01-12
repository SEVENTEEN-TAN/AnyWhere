
// sandbox/boot/renderer.js
import { loadLibs } from './loader.js';
import { transformMarkdown } from '../render/pipeline.js';
import { WatermarkRemover } from '../../lib/watermark_remover.js';
import { getHighResImageUrl } from '../../lib/utils.js';

export function initRendererMode() {
    document.body.innerHTML = ''; // Clear UI

    // Load libs immediately and track loading state
    let libsLoadedPromise = loadLibs().catch(e => {
        console.error("Failed to load libs in renderer mode", e);
        return null;
    });

    window.addEventListener('message', async (e) => {
        // 1. Text & Image Rendering (Unified)
        if (e.data.action === 'RENDER') {
            const { text, reqId, images } = e.data;
            
            try {
                // Use shared pipeline
                let html = transformMarkdown(text);
                
                // Process KaTeX if available
                if (typeof katex !== 'undefined') {
                    // Pre-process math blocks that might be missed by math_utils.js
                    // Specifically handle \[ \] and \( \) which are common in some outputs
                    // Note: math_utils.js handles $$...$$ and $...$ mostly, but let's be robust
                    
                    // Replace block math \[ ... \]
                    html = html.replace(/\\\[([\s\S]+?)\\\]/g, (m, c) => {
                        try { return katex.renderToString(c, { displayMode: true, throwOnError: false, strict: false }); } catch(err){ return m; }
                    });
                    
                    // Replace inline math \( ... \)
                    html = html.replace(/\\\(([\s\S]+?)\\\)/g, (m, c) => {
                        try { return katex.renderToString(c, { displayMode: false, throwOnError: false, strict: false }); } catch(err){ return m; }
                    });

                    // Standard delimiters
                    html = html.replace(/\$\$([\s\S]+?)\$\$/g, (m, c) => {
                        try { return katex.renderToString(c, { displayMode: true, throwOnError: false, strict: false }); } catch(err){ return m; }
                    });
                    html = html.replace(/(?<!\$)\$(?!\$)([^$\n]+?)(?<!\$)\$/g, (m, c) => {
                         try { return katex.renderToString(c, { displayMode: false, throwOnError: false, strict: false }); } catch(err){ return m; }
                    });
                }

                // Process Generated Images (if passed from content script)
                const fetchTasks = [];
                if (images && Array.isArray(images) && images.length > 0) {
                    let imageHtml = '<div class="generated-images-grid">';
                    // Only display the first generated image for floating UI
                    const displayImages = [images[0]];
                    
                    displayImages.forEach(imgData => {
                        const imgReqId = "gen_img_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
                        const targetUrl = getHighResImageUrl(imgData.url);
                        
                        imageHtml += `<img class="generated-image loading" alt="${imgData.alt || 'Generated Image'}" src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxIDEiPjwvc3ZnPg==" data-req-id="${imgReqId}">`;
                        
                        fetchTasks.push({ reqId: imgReqId, url: targetUrl });
                    });
                    imageHtml += '</div>';
                    html += imageHtml;
                }

                e.source.postMessage({ action: 'RENDER_RESULT', html: html, reqId, fetchTasks }, { targetOrigin: '*' });
                
                // --- Post-Render: Render Markmap ---
                // Wait a tick for DOM to update (in the parent context, the HTML is inserted)
                // Actually, the Sandbox doesn't insert the HTML, it sends it back.
                // The PARENT (bridge.js) needs to handle Markmap rendering if it inserts it?
                // NO, the Sandbox mode=renderer is an iframe. If we are in 'renderer' mode, 
                // we might be displaying it inside the iframe?
                // Wait, bridge.js says: this.requests[reqId]({ html, fetchTasks });
                // So the HTML is sent BACK to the host context (Sidepanel or Content Script).
                // If Markmap needs to run, it must run WHERE the HTML is inserted.
                
                // If the Renderer is used purely for transformation (string -> string), 
                // then the HOST must have Markmap libraries to render the SVG.
                // BUT, if we want the Sandbox to handle it, we should render it inside the Sandbox?
                
                // Re-reading bridge.js: It gets HTML and does what with it?
                // It likely inserts it into the UI (chat interface).
                // The Chat Interface (ui.js / messages_renderer.js) needs to handle the Markmap script execution.
                
            } catch (err) {
                console.error("Render error", err);
                e.source.postMessage({ action: 'RENDER_RESULT', html: text, reqId }, { targetOrigin: '*' });
            }
        }

        // 2. Image Processing (Watermark Removal)
        if (e.data.action === 'PROCESS_IMAGE') {
            const { base64, reqId } = e.data;
            try {
                const result = await WatermarkRemover.process(base64);
                e.source.postMessage({ action: 'PROCESS_IMAGE_RESULT', base64: result, reqId }, { targetOrigin: '*' });
            } catch (err) {
                console.warn("Watermark removal failed in renderer", err);
                e.source.postMessage({ action: 'PROCESS_IMAGE_RESULT', base64: base64, reqId, error: err.message }, { targetOrigin: '*' });
            }
        }
        
        // 3. Markmap Rendering (SVG Generation)
        if (e.data.action === 'RENDER_MARKMAP') {
            const { markdown, reqId } = e.data;
            try {
                // Ensure libraries are loaded before rendering
                await libsLoadedPromise;

                if (!window.markmap || !window.d3) {
                     throw new Error("Markmap or D3 libraries not loaded");
                }

                const { Markmap, Transformer } = window.markmap;

                // 1. Transform Markdown to Data
                const transformer = new Transformer();
                const { root, features } = transformer.transform(markdown);

                // 2. Create a temporary SVG container
                // We need to render it to string. Markmap usually renders to an existing SVG element.
                // We can create an SVG in the DOM, render to it, then serialize it.

                const container = document.createElement('div');
                const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                svg.setAttribute('width', '100%');
                svg.setAttribute('height', '300px'); // Default height
                container.appendChild(svg);
                document.body.appendChild(container); // Must be in DOM for layout? Maybe.

                // 3. Render
                const mm = Markmap.create(svg, null, root);
                
                // Wait for potential layout calculation
                setTimeout(() => {
                    try {
                        mm.fit(); // Fit to view
                        
                        // Serialize SVG
                        const serializer = new XMLSerializer();
                        let svgString = serializer.serializeToString(svg);
                        
                        // Cleanup
                        container.remove();
                        
                        e.source.postMessage({ action: 'RENDER_MARKMAP_RESULT', svg: svgString, reqId }, { targetOrigin: '*' });
                    } catch(err) {
                        if (container.parentNode) container.remove();
                        throw err;
                    }
                }, 100);
                
            } catch (err) {
                console.error("Markmap render error", err);
                e.source.postMessage({ action: 'RENDER_MARKMAP_RESULT', error: err.message, reqId }, { targetOrigin: '*' });
            }
        }
    });
}
