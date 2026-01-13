// sandbox/prompts/summarize.js
// ✅ 将 JSON 转换为 JS 模块以避免 MIME 类型错误

export const promptTemplates = {
  "summarize": {
    "zh": {
      "instruction": "请对以下内容进行全面而深入的总结分析：",
      "structure": {
        "title": "**输出结构**:",
        "items": [
          "1. **核心摘要** - 简明扼要概括要点（100-200字）",
          "2. **思维导图** - 用 ```markmap 代码块可视化内容结构",
          "3. **深度解析** - 充分展开论述，用标题和段落组织，突出重点、数据和案例",
          "4. **总结与追问** - 提炼洞察，并生成 3 个追问建议"
        ]
      },
      "format": {
        "title": "**格式说明**:",
        "items": [
          "- 使用 Markdown 标题层级（`###` 或 `####`）组织内容",
          "- Markmap 格式：根节点 `#`，子节点 `##`，要点 `-`，层级不超过 3 层",
          "- 追问格式：`<suggestions>[\"问题1\", \"问题2\", \"问题3\"]</suggestions>`"
        ]
      },
      "requirements": {
        "title": "**内容要求**:",
        "items": [
          "- 重点突出核心观点、关键数据和实际价值",
          "- 深度解析部分要充分展开，避免简单罗列",
          "- 追问要具体、实用，侧重应用/原理/细节"
        ]
      },
      "separator": "---",
      "content_prefix": "以下是需要总结的内容：",
      "display_prefix": "总结"
    },
    "en": {
      "instruction": "Please provide a comprehensive and in-depth summary of the following content:",
      "structure": {
        "title": "**Output Structure**:",
        "items": [
          "1. **Core Summary** - Concise overview (100-200 words)",
          "2. **Mind Map** - Visualize structure using ```markmap code block",
          "3. **In-depth Analysis** - Comprehensive discussion with headings, highlighting key points, data, and examples",
          "4. **Conclusion & Follow-up** - Extract insights and generate 3 follow-up questions"
        ]
      },
      "format": {
        "title": "**Format Instructions**:",
        "items": [
          "- Use Markdown heading levels (`###` or `####`) for organization",
          "- Markmap format: root `#`, children `##`, items `-`, max 3 levels",
          "- Follow-up format: `<suggestions>[\"Question 1\", \"Question 2\", \"Question 3\"]</suggestions>`"
        ]
      },
      "requirements": {
        "title": "**Content Requirements**:",
        "items": [
          "- Highlight core viewpoints, key data, and practical value",
          "- In-depth analysis should be comprehensive, avoid simple lists",
          "- Follow-up questions should be specific, practical, focus on application/principles/details"
        ]
      },
      "separator": "---",
      "content_prefix": "Content to summarize:",
      "display_prefix": "Summarize"
    }
  }
};
