
// background/managers/video_manager.js

export class VideoManager {
    constructor() {
        this.PROMPT_TEMPLATE = `
请将以下视频内容重构为一份【结构化深度研报】,严格按以下格式输出:

## 1. 核心摘要
用100-200字概括视频的核心要点、背景及价值。

## 2. 知识脑图 (Markmap)
生成markmap代码块,可视化展示逻辑结构。根节点用 #,子节点用 ## 或 -。

\`\`\`markmap
# 主题(用实际内容替换)
## 核心板块1
  - 关键点1.1
  - 关键点1.2
## 核心板块2
  - 关键点2.1
  - 关键点2.2
\`\`\`

## 3. 深度内容明细
将思维导图"文字化",层层拆解内容。

**格式要求**:
- 必须使用 H3(###) 和 H4(####) 标题
- 每个H4下必须有详细段落(含数据/案例/原理)
- 禁止简单列表或一句话敷衍

## 4. 总结与启示
用精炼语言总结,给出1-2个核心结论或启发。

---

**重要**:回答完上述4个部分后,必须在末尾生成3个追问问题。

要求:
1. 短小精悍(≤20字),直击好奇心/痛点
2. 侧重"如何应用"、"底层逻辑"、"反直觉细节"

严格使用此格式:
<suggestions>
["问题1", "问题2", "问题3"]
</suggestions>

---

视频标题：{{title}}
平台：{{platform}}

字幕内容：
{{subtitles}}
`;
    }

    async summarizeVideo(tab, sessionId, model, gemId, sessionHandler) {
        if (!tab || !tab.id) {
            throw new Error('No active tab found');
        }

        console.log(`[VideoManager] Starting summary for tab ${tab.id} (${tab.url})`);

        try {
            // 1. Inject Extractor Script
            await this._injectScript(tab.id);

            // 2. Extract Subtitles
            // We use a direct message to the tab. The content script listens for 'EXTRACT_VIDEO_SUBTITLES'.
            const response = await chrome.tabs.sendMessage(tab.id, { action: 'EXTRACT_VIDEO_SUBTITLES' });

            if (!response || !response.success) {
                throw new Error(response?.error || 'Failed to extract subtitles');
            }

            const { text, title, platform, useExtension, url } = response.data;
            console.log(`[VideoManager] Extracted data from ${platform}. useExtension: ${useExtension}`);

            let prompt;

            if (useExtension && platform === 'YouTube') {
                // --- YouTube Extension Mode ---
                // We don't send subtitles. We send a prompt that triggers Gemini's YouTube Extension.
                // Prompt: "Analyze the video at {url} ..."
                
                const langInstruction = "The summary should clearly present the main points, key insights, and important details, organized in a structured manner, and conclude with any significant takeaways or conclusions discussed in the video.";
                
                prompt = `Analyze the video at ${url}\n\nIf the title contains a question, answer it first. Then provide a comprehensive summary in Chinese (Simplified). ${langInstruction}\n\nStrictly follow this format:\n\n## 1. 核心摘要\n(100-200字)\n\n## 2. 知识脑图 (Markmap)\n(Use \`\`\`markmap code block)\n\n## 3. 深度内容明细\n(Use H3/H4 headers)\n\n## 4. 总结与启示\n\n<suggestions>\n["问题1", "问题2", "问题3"]\n</suggestions>`;
                
            } else {
                // --- Standard Mode (Bilibili / Raw Subtitles) ---
                console.log(`[VideoManager] Using raw subtitles (${text.length} chars)`);
                prompt = this.PROMPT_TEMPLATE
                    .replace('{{title}}', title || 'Unknown Video')
                    .replace('{{platform}}', platform || 'Unknown Platform')
                    .replace('{{subtitles}}', text);
            }

            // 4. Send to Session Handler
            // We simulate a user request.
            // Construct a request object compatible with SessionMessageHandler.handle
            const request = {
                action: 'SEND_PROMPT',
                sessionId: sessionId,
                text: prompt,
                model: model,
                gemId: gemId,
                files: []
            };
            
            // Mock sender from the sidepanel/extension
            const sender = {
                tab: null, // Internal request
                id: chrome.runtime.id
            };

            // Call handler directly
            // We need to ensure we don't break the response chain if the handler expects one.
            // SessionHandler.handle returns true/false (async).
            // It sends messages via chrome.runtime.sendMessage to update UI.
            sessionHandler.handle(request, sender, () => {});

            return { success: true };

        } catch (e) {
            console.error('[VideoManager] Error:', e);
            // Send error message to frontend with sessionId
            // This will display as an error in the chat
            chrome.runtime.sendMessage({
                action: 'GEMINI_REPLY',
                sessionId: sessionId,
                error: e.message,
                isError: true
            }).catch(() => {});

            throw e;
        }
    }

    async _injectScript(tabId) {
        // Check if script is already there?
        // We can just inject again, it's idempotent-ish (re-registers listener).
        // Or we can check via variable if we want to be fancy.
        // For now, just inject.
        
        try {
            await chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: ['content/video_extractor.js']
            });
        } catch (e) {
            console.error('[VideoManager] Script injection failed:', e);
            throw new Error('Failed to inject extractor script. Please refresh the page.');
        }
    }
}
