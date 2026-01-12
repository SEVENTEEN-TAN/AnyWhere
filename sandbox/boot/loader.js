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

        Promise.all([
            loadScript('vendor/highlight.min.js'),
            loadScript('vendor/katex.min.js'),
            loadScript('vendor/fuse.basic.min.js'),
            // Load Markmap libraries
            loadScript('vendor/d3.js'),
            loadScript('vendor/markmap-view.js'),
            loadScript('vendor/markmap-lib.js')
        ]).then(() => {
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
            return loadScript('vendor/auto-render.min.js');
        }).catch(e => console.warn("Optional libs load failed", e));

        console.log("Lazy dependencies loaded from local vendor.");
    } catch (e) {
        console.warn("Deferred loading failed", e);
    }
}