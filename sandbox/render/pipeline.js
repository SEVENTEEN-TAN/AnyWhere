
// sandbox/render/pipeline.js
import { MathHandler } from './math_utils.js';
import { PerformanceMonitor } from '../../lib/performance_monitor.js';

/**
 * Escapes HTML entities to prevent XSS attacks
 * @param {string} text - Text to escape
 * @returns {string} - Escaped HTML string
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ✅ P1 优化: 复用 MathHandler 单例，避免重复创建
const mathHandler = new MathHandler();

/**
 * Transforms raw text into HTML with Math placeholders protected/restored.
 * @param {string | null | undefined} text - Raw Markdown text (can be null or undefined)
 * @returns {string} - HTML string
 */
export function transformMarkdown(text) {
    // ✅ P1: 添加性能监控
    PerformanceMonitor.mark('markdown-render-start');
    
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

    // (mathHandler 已在模块级别创建)

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
            // ✅ P0 修复: 转义 HTML 防止 XSS 攻击
            // Support 'markmap' language - keep it raw for the Markmap Loader to handle
            if (lang === 'markmap') {
                // Escape HTML entities to prevent XSS
                const escapedCode = escapeHtml(code);
                return `<div class="markmap-source" style="display:none;">${escapedCode}</div><div class="markmap-container"></div>`;
            }
            // Support 'mermaid' language - keep it raw for the Mermaid Loader to handle
            if (lang === 'mermaid') {
                // Escape HTML entities to prevent XSS
                const escapedCode = escapeHtml(code);
                return `<div class="mermaid">${escapedCode}</div>`;
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
    
    // ✅ P1: 性能监控结束
    PerformanceMonitor.mark('markdown-render-end');
    PerformanceMonitor.measure('markdown-render', 'markdown-render-start', 'markdown-render-end');

    return html;
}