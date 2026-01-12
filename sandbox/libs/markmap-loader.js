
// sandbox/libs/markmap-loader.js

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.head.appendChild(script);
    });
}

let loaded = false;

export async function loadMarkmap() {
    if (loaded) return {
        Transformer: window.markmap.Transformer,
        Markmap: window.markmap.Markmap
    };

    if (window.markmap && window.d3) {
        loaded = true;
        return {
            Transformer: window.markmap.Transformer,
            Markmap: window.markmap.Markmap
        };
    }

    try {
        // CRITICAL: Correct dependency chain for Markmap

        // 1. Load KaTeX first (markmap-lib depends on window.katex)
        if (!window.katex) {
            console.log("[Markmap Loader] Loading KaTeX...");
            await loadScript('vendor/katex.min.js');
            console.log("[Markmap Loader] KaTeX loaded:", typeof window.katex);
        }

        // 2. Load D3 (markmap-view depends on d3)
        if (!window.d3) {
            console.log("[Markmap Loader] Loading D3...");
            await loadScript('vendor/d3.js');
            console.log("[Markmap Loader] D3 loaded:", typeof window.d3);
        }

        // 3. Load Markmap-lib (creates window.markmap, adds Transformer)
        console.log("[Markmap Loader] Loading Markmap-lib...");
        await loadScript('vendor/markmap-lib.js');
        console.log("[Markmap Loader] Markmap-lib loaded");
        console.log("[Markmap Loader] window.markmap:", typeof window.markmap);
        console.log("[Markmap Loader] window.markmap.Transformer:", window.markmap ? typeof window.markmap.Transformer : 'N/A');

        // 4. Load Markmap-view (extends window.markmap, adds Markmap renderer)
        console.log("[Markmap Loader] Loading Markmap-view...");
        await loadScript('vendor/markmap-view.js');
        console.log("[Markmap Loader] Markmap-view loaded");
        console.log("[Markmap Loader] window.markmap.Markmap:", window.markmap ? typeof window.markmap.Markmap : 'N/A');
        console.log("[Markmap Loader] Available components:", window.markmap ? Object.keys(window.markmap) : 'markmap not found');

        // Disable CDN providers after loading to enforce local-only resources
        if (window.markmap && window.markmap.UrlBuilder) {
            const UrlBuilderClass = window.markmap.UrlBuilder;
            if (UrlBuilderClass.prototype && UrlBuilderClass.prototype.providers) {
                UrlBuilderClass.prototype.providers = {};
            }
            // Also patch any existing instances
            if (UrlBuilderClass.defaultProviders) {
                UrlBuilderClass.defaultProviders = {};
            }
            console.log("[Markmap Loader] CDN providers disabled");
        }

        loaded = true;
        return {
            Transformer: window.markmap.Transformer,
            Markmap: window.markmap.Markmap
        };
    } catch (e) {
        console.error("Markmap load failed", e);
        throw e;
    }
}
