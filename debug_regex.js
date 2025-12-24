
const text = `行动建议：

短期（现在）： 深耕 B2B 定制，解决生存问题，选定如“王家卫奢品风”等垂直风格形成差异化。
中期（1-3年）： 沉淀工作流并产品化，同时打造具有辨识度的原创 IP。
长期（3-5年）： 布局 AI 原生互动内容，占领下一代数字内容的制高点。
<suggestions>
["如何针对 AI 漫剧和小红书平台设计一套高效的引流私域转化话术？", "在 B2B 商业定制中，AI 生成内容如何与传统 CG 流程进行深度结合以满足高端客户需求？", "目前全球有哪些知名 AI 电影节，其评选标准和投稿流程是怎样的？"]
</suggestions>`;

function parseSuggestions(text) {
    console.log("Testing text length:", text.length);
    if (!text) return { text: '', suggestions: [] };

    // The current regex in the codebase
    const regex = /(?:```[\w]*\s*)?<suggestions>\s*([\s\S]*?)\s*<\/suggestions>(?:\s*```)?/i;
    const suggestionsMatch = text.match(regex);

    if (suggestionsMatch) {
        console.log("Match found!");
        console.log("Caught content:", suggestionsMatch[1]);
        return true;
    } else {
        console.log("No match found.");
        return false;
    }
}

parseSuggestions(text);
