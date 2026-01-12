// sandbox/render/config.js

export function configureMarkdown() {
    const markedLib = window.marked || (typeof marked !== 'undefined' ? marked : undefined);
    if (typeof markedLib === 'undefined') return;

    const renderer = new markedLib.Renderer();

    // Helper to escape HTML safely (used when syntax highlighting fails or for plaintext)
    const escapeHtml = (text) => {
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    };

    renderer.code = function (codeOrToken, language) {
        let code = codeOrToken;
        let lang = language;

        // Handle Marked v13+ breaking change: renderer receives a token object as first argument
        if (typeof codeOrToken === 'object' && codeOrToken !== null) {
            code = codeOrToken.text || '';
            lang = codeOrToken.lang || '';
        }

        const validLang = (lang && typeof hljs !== 'undefined' && hljs.getLanguage(lang)) ? lang : 'plaintext';
        let highlighted;

        if (typeof hljs !== 'undefined' && validLang !== 'plaintext') {
            try {
                highlighted = hljs.highlight(code, { language: validLang }).value;
            } catch (e) {
                // Fallback to manual escape if highlight fails
                highlighted = escapeHtml(code);
            }
        } else {
            // Manual escape for plaintext or if hljs is missing
            highlighted = escapeHtml(code);
        }

        // Special handling for diagram languages
        if (lang === 'mermaid') {
            return `<div class="mermaid">${code}</div>`;
        }

        if (lang === 'markmap') {
            // Output a container that message.js will pick up and render
            return `<div class="markmap-source" style="display:none;">${escapeHtml(code)}</div>`;
        }

        return `
<div class="code-block-wrapper">
    <div class="code-header">
        <span class="code-lang">${validLang}</span>
        <button class="copy-code-btn" aria-label="Copy code">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            <span>Copy</span>
        </button>
    </div>
    <pre><code class="hljs language-${validLang}">${highlighted}</code></pre>
</div>`;
    };

    // Add explicit link renderer to ensure target="_blank"
    renderer.link = function(href, title, text) {
        // Handle token object in newer marked versions
        if (typeof href === 'object' && href !== null) {
            const token = href;
            href = token.href;
            title = token.title;
            text = token.text;
        }

        const titleAttr = title ? ` title="${title}"` : '';
        return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
    };

    const options = {
        breaks: true,
        gfm: true,
        renderer: renderer
    };

    // Use marked.use() if available (v5+), otherwise fallback to setOptions (deprecated)
    if (typeof markedLib.use === 'function') {
        markedLib.use(options);
    } else if (typeof markedLib.setOptions === 'function') {
        markedLib.setOptions(options);
    }
}