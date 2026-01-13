
// sandbox/render/pipeline.js
import { MathHandler } from './math_utils.js';

/**
 * Transforms raw text into HTML with Math placeholders protected/restored.
 * @param {string | null | undefined} text - Raw Markdown text (can be null or undefined)
 * @returns {string} - HTML string
 */
export function transformMarkdown(text) {
    // Handle case where text is an object (e.g., message object passed by mistake)
    if (text && typeof text === 'object') {
        if (typeof text.text === 'string') {
            text = text.text;
        } else {
            console.warn('[Pipeline] transformMarkdown received object:', text);
            return String(text);
        }
    }

    // Ensure text is a string
    if (typeof text !== 'string') {
        return text == null ? '' : String(text);
    }

    if (typeof marked === 'undefined') {
        // Library loads asynchronously; app will rerender when ready.
        // Return raw text in the meantime without polluting console.
        return text;
    }

    const mathHandler = new MathHandler();

    // 1. Protect Math blocks first (before any other processing)
    let processedText = mathHandler.protect(text || '');

    // 2. Fix common Markdown escape errors from AI generation
    // Gemini sometimes over-escapes Markdown characters like \#\#\# or \*\*
    processedText = processedText
        .replace(/\\#/g, '#')      // Fix: \# → #
        .replace(/\\\*/g, '*')     // Fix: \* → *
        .replace(/\\_/g, '_')      // Fix: \_ → _
        .replace(/\\\[/g, '[')     // Fix: \[ → [ (not in math context, already protected)
        .replace(/\\\]/g, ']')     // Fix: \] → ]
        .replace(/\\`/g, '`')      // Fix: \` → `
        .replace(/\\>/g, '>')      // Fix: \> → >
        .replace(/\\-/g, '-');     // Fix: \- → -

    // 3. Parse Markdown
    // Configure marked to use highlight.js for code blocks
    let html = marked.parse(processedText, {
        highlight: function(code, lang) {
            // Support 'markmap' language - keep it raw for the Markmap Loader to handle
            if (lang === 'markmap') {
                // Ensure we don't double-escape, marked might escape inside code blocks
                // We return a special div that our post-processor or loader will find
                return `<div class="markmap-source" style="display:none;">${code}</div><div class="markmap-container"></div>`;
            }
            // Support 'mermaid' language - keep it raw for the Mermaid Loader to handle
            if (lang === 'mermaid') {
                return `<div class="mermaid">${code}</div>`;
            }
            if (typeof hljs !== 'undefined') {
                const language = hljs.getLanguage(lang) ? lang : 'plaintext';
                return hljs.highlight(code, { language }).value;
            }
            return code;
        }
    });

    // 4. Restore Math blocks
    html = mathHandler.restore(html);

    return html;
}