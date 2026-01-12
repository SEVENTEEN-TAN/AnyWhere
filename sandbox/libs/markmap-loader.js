
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
        // Load D3 first
        if (!window.d3) await loadScript('vendor/d3.js');
        // Load Markmap Lib (Transformer) logic is usually in markmap-lib.
        // CHECK: markmap-lib UMD exposes window.markmap.Transformer?
        // CHECK: markmap-view UMD exposes window.markmap.Markmap?

        await loadScript('vendor/markmap-view.js');
        await loadScript('vendor/markmap-lib.js');

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
