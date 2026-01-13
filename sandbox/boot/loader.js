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

        // Re-run config now that marked is loaded
        configureMarkdown();

        // Load others in parallel (Local Vendor)
        loadCSS('vendor/katex.min.css');
        loadCSS('vendor/atom-one-dark.min.css');

        // Load independent libraries in parallel
        Promise.all([
            loadScript('vendor/highlight.min.js'),
            loadScript('vendor/katex.min.js'),
            loadScript('vendor/fuse.basic.min.js')
        ]).then(async () => {
            // Wrap KaTeX to always use strict: false (suppress Unicode warnings)
            if (window.katex && window.katex.renderToString) {
                const originalRender = window.katex.renderToString.bind(window.katex);
                window.katex.renderToString = (tex, options = {}) => {
                    return originalRender(tex, { strict: false, ...options });
                };
                console.log("[KaTeX] Wrapped renderToString with strict: false");
            }
            // Auto-render ext for Katex
            await loadScript('vendor/auto-render.min.js');

            // CRITICAL: Load Markmap libraries in STRICT ORDER (they have dependencies)
            // 1. D3 first (markmap-view depends on it)
            console.log("[Loader] Loading D3...");
            await loadScript('vendor/d3.js');
            console.log("[Loader] D3 loaded:", typeof window.d3);

            // 2. Markmap-lib (creates window.markmap namespace)
            console.log("[Loader] Loading Markmap-lib...");
            await loadScript('vendor/markmap-lib.js');
            console.log("[Loader] Markmap-lib loaded:", typeof window.markmap);

            // 3. Markmap-view last (extends window.markmap, uses d3)
            console.log("[Loader] Loading Markmap-view...");
            await loadScript('vendor/markmap-view.js');
            console.log("[Loader] Markmap-view loaded");
            console.log("[Loader] Markmap.Markmap:", window.markmap ? typeof window.markmap.Markmap : 'N/A');
        }).catch(e => console.warn("Optional libs load failed", e));

        console.log("Lazy dependencies loaded from local vendor.");
    } catch (e) {
        console.warn("Deferred loading failed", e);
    }
}
