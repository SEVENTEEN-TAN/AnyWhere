
// sandbox/render/pipeline.js
import { MathHandler } from './math_utils.js';

/**
 * Transforms raw text into HTML with Math placeholders protected/restored.
 * @param {string} text - Raw Markdown text
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
    let html = marked.parse(processedText);

    // 4. Restore Math blocks
    html = mathHandler.restore(html);

    return html;
}