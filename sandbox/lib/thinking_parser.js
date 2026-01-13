// sandbox/lib/thinking_parser.js
// Multi-format thinking tag parser
// Inspired by LinuxDO script - supports 12+ thinking tag formats

/**
 * Parse thinking/reasoning content from AI responses
 * Supports multiple tag formats including standard tags, escaped tags, pipe tags, and bracket tags
 *
 * @param {string} text - The AI response text to parse
 * @returns {{thinking: string, content: string}} - Separated thinking process and main content
 *
 * @example
 * const result = parseThinkingContent("<think>Let me analyze...</think>The answer is 42.");
 * // => { thinking: "Let me analyze...", content: "The answer is 42." }
 */
export function parseThinkingContent(text) {
    if (!text || typeof text !== 'string') {
        return { thinking: '', content: text || '' };
    }

    const thinkingParts = [];
    let mainContent = text;

    // =========================================================================
    // PHASE 1: Extract closed/paired thinking tags
    // =========================================================================

    /**
     * Supported thinking tag formats:
     * 1. Standard XML-style: <think>...</think>, <thinking>...</thinking>
     * 2. Semantic variants: <reason>...</reason>, <reasoning>...</reasoning>
     * 3. Reflection tags: <reflection>...</reflection>, <inner_thought>...</inner_thought>
     * 4. Escaped closing: <think>...</\think>, <thinking>...</\thinking> (backslash escaped)
     * 5. Pipe-style: <|think|>...</|/think|>, <|thinking|>...</|/thinking|>
     * 6. Bracket-style: [think]...[/think], [thinking]...[/thinking]
     */
    const thinkingPatterns = [
        // Standard XML-style tags
        /<think>([\s\S]*?)<\/think>/gi,
        /<thinking>([\s\S]*?)<\/thinking>/gi,
        /<reason>([\s\S]*?)<\/reason>/gi,
        /<reasoning>([\s\S]*?)<\/reasoning>/gi,
        /<reflection>([\s\S]*?)<\/reflection>/gi,
        /<inner_thought>([\s\S]*?)<\/inner_thought>/gi,

        // Escaped closing tags (backslash before closing tag)
        /<think>([\s\S]*?)<\\think>/gi,
        /<thinking>([\s\S]*?)<\\thinking>/gi,

        // Pipe-style tags (used by some AI models)
        /<\|think\|>([\s\S]*?)<\|\/think\|>/gi,
        /<\|thinking\|>([\s\S]*?)<\|\/thinking\|>/gi,

        // Bracket-style tags
        /\[think\]([\s\S]*?)\[\/think\]/gi,
        /\[thinking\]([\s\S]*?)\[\/thinking\]/gi,
    ];

    // Extract all thinking content and remove from main text
    for (const pattern of thinkingPatterns) {
        // Reset regex state to avoid lastIndex issues
        pattern.lastIndex = 0;

        let match;
        while ((match = pattern.exec(mainContent)) !== null) {
            const thinkContent = match[1].trim();
            if (thinkContent) {
                thinkingParts.push(thinkContent);
            }

            // Remove the matched thinking tag from main content
            mainContent = mainContent.replace(match[0], '');

            // Reset lastIndex after replacement to avoid skipping
            pattern.lastIndex = 0;
        }
    }

    // =========================================================================
    // PHASE 2: Detect unclosed thinking tags
    // =========================================================================

    /**
     * Sometimes AI models generate thinking tags but don't close them.
     * We detect these and extract the remaining content with a ⏳ indicator.
     */
    const unclosedPatterns = [
        {
            start: /<think>/i,
            end: /<\/think>|<\\think>/i,
            tag: '<think>'
        },
        {
            start: /<thinking>/i,
            end: /<\/thinking>|<\\thinking>/i,
            tag: '<thinking>'
        },
        {
            start: /<\|think\|>/i,
            end: /<\|\/think\|>/i,
            tag: '<|think|>'
        },
    ];

    for (const { start, end, tag } of unclosedPatterns) {
        const startMatch = mainContent.match(start);

        // If we find a start tag but no corresponding end tag
        if (startMatch && !end.test(mainContent)) {
            const startIdx = mainContent.indexOf(startMatch[0]);
            const thinkContent = mainContent.slice(startIdx + startMatch[0].length).trim();

            if (thinkContent) {
                // Add ⏳ emoji to indicate incomplete thinking process
                thinkingParts.push(thinkContent + ' ⏳');

                // Remove everything from the start tag onwards
                mainContent = mainContent.slice(0, startIdx);
            }

            // Only process the first unclosed tag found
            break;
        }
    }

    // =========================================================================
    // PHASE 3: Clean up and return
    // =========================================================================

    // Join all thinking parts with double line breaks
    const thinking = thinkingParts.join('\n\n').trim();

    // Clean up main content (remove extra whitespace)
    const content = mainContent
        .replace(/\n{3,}/g, '\n\n')  // Max 2 consecutive newlines
        .trim();

    return {
        thinking,
        content
    };
}

/**
 * Check if text contains any thinking tags
 * @param {string} text - Text to check
 * @returns {boolean} - True if thinking tags are found
 */
export function hasThinkingTags(text) {
    if (!text || typeof text !== 'string') return false;

    const patterns = [
        /<think>/i,
        /<thinking>/i,
        /<reason>/i,
        /<reasoning>/i,
        /<reflection>/i,
        /<inner_thought>/i,
        /<\|think\|>/i,
        /<\|thinking\|>/i,
        /\[think\]/i,
        /\[thinking\]/i
    ];

    return patterns.some(pattern => pattern.test(text));
}
