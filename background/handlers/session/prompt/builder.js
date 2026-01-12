// background/handlers/session/prompt/builder.js
import { getActiveTabContent } from '../utils.js';
import { BROWSER_CONTROL_PREAMBLE } from './preamble.js';

export class PromptBuilder {
    constructor(controlManager) {
        this.controlManager = controlManager;
    }

    async build(request) {
        let systemPreamble = "";

        if (request.includePageContext) {
            // Use pre-selected content from element picker if available, otherwise fetch entire page
            let pageContent = request.pageContextContent || await getActiveTabContent();

            if (pageContent) {
                // Apply Context Limit
                const settings = await chrome.storage.local.get('geminiContextLimit');
                const limit = settings.geminiContextLimit !== undefined ? parseInt(settings.geminiContextLimit) : 500000;

                if (limit > 0 && pageContent.length > limit) {
                    console.log(`[PromptBuilder] Configured Limit: ${limit}, Actual: ${pageContent.length}. Truncating...`);
                    // Keep the Last N chars (usually most relevant for reading bottom-up or recent context)
                    // Or first N? Usually Start fits better for "Read this article".
                    // Let's keep Start for now as it contains headers/intros.
                    pageContent = pageContent.slice(0, limit) + `\n\n[...Truncated due to limit ${limit}...]`;
                }

                console.log(`[PromptBuilder] 成功获取网页上下文 (长度: ${pageContent.length}):\n${pageContent}`);
                systemPreamble += `Webpage Context:
\`\`\`text
${pageContent}
\`\`\`

`;
            } else {
                console.log("[PromptBuilder] 未获取到网页上下文 (pageContent 为空)");
            }
        }

        if (request.enableBrowserControl) {
            // Enable control overlay when browser control is requested
            if (this.controlManager) {
                await this.controlManager.enableControlMode();
            }

            systemPreamble += BROWSER_CONTROL_PREAMBLE;

            // Inject Snapshot (Structured Vision)
            if (this.controlManager) {
                try {
                    const snapshot = await this.controlManager.getSnapshot();
                    if (snapshot) {
                        systemPreamble += `
[Current Page Accessibility Tree (Structured Vision)]:
\`\`\`text
${snapshot}
\`\`\`
`;
                    } else {
                        systemPreamble += `\n[System: Could not capture initial snapshot. You may need to navigate to a page or use 'take_snapshot' manually.]\n`;
                    }
                } catch (e) {
                    console.warn("Auto-snapshot injection failed:", e);
                }
            }
        }

        let finalPrompt = request.text;
        if (systemPreamble) {
            finalPrompt = systemPreamble + "Question: " + finalPrompt;
        }

        // Always append instructions for follow-up suggestions
        const suggestionInstruction = `

IMPORTANT: After your response, you MUST provide 3 follow-up question suggestions in the following format:
<suggestions>
["Suggestion 1?", "Suggestion 2?", "Suggestion 3?"]
</suggestions>

The suggestions should be:
- Relevant to your response
- Help users explore the topic further
- Written as questions
- Each 5-15 words long`;

        finalPrompt += suggestionInstruction;

        console.log("[PromptBuilder] ========== 构建最终 Prompt ===========");
        console.log("[PromptBuilder] 原始用户输入:", request.text);
        console.log("[PromptBuilder] 包含网页上下文:", request.includePageContext ? '是' : '否');
        console.log("[PromptBuilder] 浏览器控制模式:", request.enableBrowserControl ? '是' : '否');
        console.log("[PromptBuilder] 最终 Prompt 长度:", finalPrompt.length);
        console.log("[PromptBuilder] 最终 Prompt 内容:\n", finalPrompt);
        console.log("[PromptBuilder] ============================================\n");

        return finalPrompt;
    }
}
