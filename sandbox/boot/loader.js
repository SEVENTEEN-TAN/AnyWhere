// sandbox/boot/loader.js
import { configureMarkdown } from '../render/config.js';

export function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

export function loadCSS(href) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
}

export async function loadLibs() {
    try {
        // Load Marked (Priority for chat rendering)
        // Now loading locally from vendor/ to ensure reliability
        await loadScript('vendor/marked.min.js').catch(e => console.warn("Marked load issue:", e));

        if (typeof window.marked === 'undefined') {
             console.error("Marked.js loaded but 'window.marked' is undefined!");
        }

        // Re-run config now that marked is loaded
        configureMarkdown();

        // Load others in parallel (Local Vendor)
        loadCSS('vendor/katex.min.css');
        loadCSS('vendor/atom-one-dark.min.css');

        // Load most libraries in parallel
        await Promise.all([
            loadScript('vendor/highlight.min.js'),
            loadScript('vendor/fuse.basic.min.js')
        ]);

        // CRITICAL: Load Markmap dependencies in CORRECT SEQUENCE
        // 1. KaTeX must load first (markmap-lib depends on window.katex)
        await loadScript('vendor/katex.min.js');
        console.log("[Loader] KaTeX loaded, window.katex:", typeof window.katex);

        // 2. D3 must load next (markmap-view depends on d3)
        await loadScript('vendor/d3.js');
        console.log("[Loader] D3 loaded, window.d3:", typeof window.d3);

        // 3. Markmap-lib creates window.markmap and adds Transformer
        await loadScript('vendor/markmap-lib.js');
        console.log("[Loader] Markmap-lib loaded, window.markmap:", typeof window.markmap);
        console.log("[Loader] Markmap.Transformer:", window.markmap ? typeof window.markmap.Transformer : 'N/A');

        // 4. Markmap-view extends window.markmap with Markmap renderer
        await loadScript('vendor/markmap-view.js');
        console.log("[Loader] Markmap-view loaded");
        console.log("[Loader] Markmap.Markmap:", window.markmap ? typeof window.markmap.Markmap : 'N/A');
        console.log("[Loader] Available markmap components:", window.markmap ? Object.keys(window.markmap) : 'N/A');

        // Wrap KaTeX to always use strict: false (suppress Unicode warnings)
        if (window.katex && window.katex.renderToString) {
            const originalRender = window.katex.renderToString.bind(window.katex);
            window.katex.renderToString = (tex, options = {}) => {
                return originalRender(tex, { strict: false, ...options });
            };
            console.log("[KaTeX] Wrapped renderToString with strict: false");
        }

        // Disable Markmap CDN providers to enforce local resources only
        if (window.markmap && window.markmap.UrlBuilder) {
            const urlBuilder = window.markmap.UrlBuilder.prototype || window.markmap.UrlBuilder;
            // Override providers with empty object to prevent CDN fallback
            if (urlBuilder.providers) {
                urlBuilder.providers = {};
                console.log("[Markmap] Disabled CDN providers, using local resources only");
            }
        }

        // Auto-render ext for Katex
        await loadScript('vendor/auto-render.min.js');

        console.log("Lazy dependencies loaded from local vendor.");
    } catch (e) {
        console.warn("Deferred loading failed", e);
    }
}