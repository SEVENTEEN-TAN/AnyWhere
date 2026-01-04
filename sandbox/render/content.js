
// sandbox/render/content.js
import { transformMarkdown } from './pipeline.js';

// Helper: Render Markdown/Math/Text into an element
export function renderContent(contentDiv, text, role) {
    // Render Markdown and Math for AI responses
    if (role === 'ai') {

        // Use shared pipeline
        const html = transformMarkdown(text);
        contentDiv.innerHTML = html;

        // Render Math (KaTeX Auto-render extension)
        // This processes the specific DOM element after HTML insertion
        if (typeof renderMathInElement !== 'undefined') {
            renderMathInElement(contentDiv, {
                delimiters: [
                    { left: '$$', right: '$$', display: true },
                    { left: '$', right: '$', display: false },
                    { left: '\\(', right: '\\)', display: false },
                    { left: '\\[', right: '\\]', display: true }
                ],
                throwOnError: false,
                strict: false  // Suppress warnings for Unicode text in math mode (e.g., Chinese chars)
            });
        }
    } else {
        // User message
        // Enable Markdown for user messages to support links (e.g. Summarize [Title](URL))
        const html = transformMarkdown(text);
        contentDiv.innerHTML = html;
    }
}
