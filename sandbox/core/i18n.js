
// sandbox/core/i18n.js

export const translations = {
    en: {
        "searchPlaceholder": "Search for chats",
        "recentLabel": "Recent",
        "noConversations": "No conversations found.",
        "settings": "Settings",
        "chatHistory": "Chat History",
        "newChat": "New Chat",
        "pageContext": "Tabs",
        "browserControl": "Control",
        "quote": "Quote",
        "ocr": "OCR",
        "snip": "Capture",
        "screenshotTranslate": "Translate",
        "summarize": "Summarize",
        "videoSummary": "Video Summary",
        "uploadImage": "Upload Image",
        "askPlaceholder": "Ask Anywhere...",
        "sendMessage": "Send message",
        "stopGenerating": "Stop generating",
        "settingsTitle": "Settings",
        "general": "General",
        "textSelection": "Text Selection Toolbar",
        "textSelectionDesc": "Show floating toolbar when selecting text.",
        "imageToolsToggle": "Show Image Tools Button",
        "imageToolsToggleDesc": "Show the AI button when hovering over images.",
        "sidebarBehavior": "When Sidebar Reopens",
        "sidebarBehaviorAuto": "Auto restore or restart",
        "sidebarBehaviorAutoDesc": "Restore if opened within 10 mins, otherwise start new chat.",
        "sidebarBehaviorRestore": "Always restore previous chat",
        "sidebarBehaviorNew": "Always start new chat",
        "appearance": "Appearance",
        "theme": "Theme",
        "language": "Language",
        "keyboardShortcuts": "Keyboard Shortcuts",
        "shortcutDesc": "Click input and press keys to change.",
        "quickAsk": "Quick Ask (Floating)",
        "openSidePanel": "Open Side Panel",
        "openExtension": "Open Extension",
        "shortcutFocusInput": "Focus Input",
        "shortcutSwitchModel": "Switch Model (in Input)",
        "resetDefault": "Reset Default",
        "saveChanges": "Save Changes",
        "systemTheme": "System",
        "debugLogs": "Debug Logs",
        "downloadLogs": "Download Logs",
        "about": "About",
        "githubRepo": "Source Code",
        "systemDefault": "System Default",
        "light": "Light",
        "dark": "Dark",
        "pageContextActive": "Chat with page is already active",
        "pageContextEnabled": "Chat will include page content",
        "cancelled": "Cancelled.",
        "thinking": "Gemini is thinking...",
        "deleteChatConfirm": "Delete this chat?",
        "delete": "Delete",
        "rename": "Rename",
        "imageSent": "Image sent",
        "selectOcr": "Select area for OCR...",
        "selectSnip": "Select area to capture...",
        "selectTranslate": "Select area to translate...",
        "processingImage": "Processing image...",
        "failedLoadImage": "Failed to load image.",
        "errorScreenshot": "Error processing screenshot.",
        "noTextSelected": "No text selected on page.",
        "ocrPrompt": "Please OCR this image. Extract the text content exactly as is, without any explanation.",
        "screenshotTranslatePrompt": "Please extract the text from this image and translate it into English. Output ONLY the translation.",
        "loadingImage": "Loading image...",

        // Tooltips
        "toggleHistory": "Chat History",
        "newChatTooltip": "New Chat",
        "pageContextTooltip": "Include page content in chat",
        "browserControlTooltip": "Let the model control the browser",
        "quoteTooltip": "Quote selected text from page",
        "ocrTooltip": "Capture area and extract text (OCR)",
        "screenshotTranslateTooltip": "Capture area and translate text",
        "summarizeTooltip": "Summarize this page",
        "videoSummaryTooltip": "Summarize this video",
        "mindMap": "MindMap",
        "mindMapTooltip": "Generate MindMap Summary (Mermaid)",
        "mindMapPrompt": "Please summarize the core content of this page and organize it into a [Mermaid MindMap].\nRequirements:\n1. Use the same language as the page content.\n2. Root node is the page title.\n3. Output directly a mermaid code block:\n```mermaid\nmindmap\n  root((Page Title))\n    Concept 1\n      Detail A\n      Detail B\n```",
        "snipTooltip": "Capture area to input",
        "removeImage": "Remove image",
        "uploadImageTooltip": "Upload Image",
        "zoomOut": "Zoom Out",
        "zoomIn": "Zoom In",
        "resetZoom": "Fit to Screen",
        "downloadImage": "Download Image",
        "close": "Close",
        "sendMessageTooltip": "Send message",
        "openFullPageTooltip": "Open in full page",
        "modelSelectTooltip": "Select Model (Tab to cycle)",

        // Auto-Scroll Settings
        "autoScrollSettings": "Auto-Scroll Settings",
        "autoScrollSettingsDesc": "Configure behavior when summarizing full pages. Press ESC to cancel scrolling.",
        "scrollInterval": "Scroll Interval (ms)",
        "scrollIntervalDesc": "Time between scrolls. Default: 200ms",
        "scrollMaxDuration": "Max Duration (ms)",
        "scrollMaxDurationDesc": "Max scroll time. Default: 15000ms (15s)",
        "contextLimit": "Max Context Length (chars)",
        "contextLimitDesc": "0 = unlimited. Truncates if exceeded. Default: 500000",

        // MCP Settings
        "mcpTitle": "Model Context Protocol (MCP)",
        "mcpDesc": "Connect external tools via JSON configuration.",
        "saveMcpConfig": "Save MCP Config",

        // Workspace Settings
        "workspacePath": "AI Workspace Path",
        "workspacePathDesc": "Choose where AI saves files. Leave empty for default Downloads/gemini-workspace",
        "workspacePathPlaceholder": "e.g., MyProjects/AI-Data",
        "workspacePrompt": "Prompt for Save Location",
        "workspacePromptDesc": "Ask where to save each file (recommended for important files)",
        "reset": "Reset",
        "loading": "Loading...",
        "defaultModel": "Default Model",
        "defaultModelDesc": "Used as initial selection for new chats/windows. You can still switch models anytime.",
        "defaultModelInvalid": "Default model is no longer available. Please reselect."
    },
    zh: {
        "searchPlaceholder": "搜索对话",
        "recentLabel": "最近",
        "noConversations": "未找到对话。",
        "settings": "设置",
        "chatHistory": "历史记录",
        "newChat": "新对话",
        "pageContext": "标签页",
        "browserControl": "接管",
        "quote": "引用",
        "ocr": "识字",
        "snip": "截图",
        "screenshotTranslate": "翻译",
        "summarize": "总结",
        "videoSummary": "视频",
        "mindMap": "脑图",
        "mindMapTooltip": "生成思维导图 (Mermaid)",
        "mindMapPrompt": "请总结当前网页的核心内容，并将其整理为一个【Mermaid思维导图】(MindMap)。\n要求：\n1. 使用中文。\n2. 根节点是网页标题，子节点是关键章节或概念。\n3. 直接输出 mermaid 代码块，格式如下：\n```mermaid\nmindmap\n  root((网页标题))\n    关键概念1\n      细节A\n      细节B\n    关键概念2\n      细节C\n```",
        "uploadImage": "上传图片",
        "askPlaceholder": "询问 Gemini...",
        "sendMessage": "发送消息",
        "stopGenerating": "停止生成",
        "settingsTitle": "设置",
        "general": "常规",
        "textSelection": "划词工具栏",
        "textSelectionDesc": "选中网页文本时显示悬浮工具栏。",
        "imageToolsToggle": "显示图片工具按钮",
        "imageToolsToggleDesc": "鼠标悬停在图片上时显示 AI 按钮。",
        "sidebarBehavior": "当侧边栏重新打开时",
        "sidebarBehaviorAuto": "自动恢复或重新开始",
        "sidebarBehaviorAutoDesc": "如果在10分钟内重新打开，聊天将恢复；如果超过10分钟，将开始新的聊天",
        "sidebarBehaviorRestore": "始终恢复上次的聊天",
        "sidebarBehaviorNew": "始终开始新的聊天",
        "appearance": "外观",
        "theme": "主题",
        "language": "语言",
        "keyboardShortcuts": "快捷键",
        "shortcutDesc": "点击输入框并按下按键以修改。",
        "quickAsk": "快速提问 (悬浮)",
        "openSidePanel": "打开侧边栏",
        "openExtension": "打开扩展",
        "shortcutFocusInput": "聚焦输入框",
        "shortcutSwitchModel": "切换模型 (输入框内)",
        "resetDefault": "恢复默认",
        "saveChanges": "保存更改",
        "systemTheme": "系统",
        "debugLogs": "调试日志",
        "downloadLogs": "下载日志",
        "about": "关于",
        "githubRepo": "源代码",
        "systemDefault": "跟随系统",
        "light": "浅色",
        "dark": "深色",
        "pageContextActive": "网页对话已激活",
        "pageContextEnabled": "对话将包含网页内容",
        "cancelled": "已取消",
        "thinking": "Anywhere 正在思考...",
        "deleteChatConfirm": "确认删除此对话？",
        "delete": "删除",
        "imageSent": "图片已发送",
        "selectOcr": "请框选要识别的区域...",
        "selectSnip": "请框选要截图的区域...",
        "selectTranslate": "请框选要翻译的区域...",
        "processingImage": "正在处理图片...",
        "failedLoadImage": "图片加载失败。",
        "errorScreenshot": "截图处理出错。",
        "noTextSelected": "页面上未选择文本。",
        "ocrPrompt": "请识别并提取这张图片中的文字 (OCR)。仅输出识别到的文本内容，不需要任何解释。",
        "screenshotTranslatePrompt": "请识别这张图片中的文字并将其翻译成中文。仅输出翻译后的内容。",
        "loadingImage": "正在加载图片...",

        // Tooltips
        "toggleHistory": "历史记录",
        "newChatTooltip": "新对话",
        "pageContextTooltip": "让对话包含网页内容",
        "browserControlTooltip": "允许模型接管并操作网页",
        "quoteTooltip": "引用网页选中内容",
        "ocrTooltip": "区域截图并识别文字",
        "screenshotTranslateTooltip": "区域截图并翻译文字",
        "summarizeTooltip": "总结当前网页",
        "videoSummaryTooltip": "总结当前视频",
        "snipTooltip": "区域截图 (作为图片输入)",
        "removeImage": "移除图片",
        "uploadImageTooltip": "上传图片",
        "zoomOut": "缩小",
        "zoomIn": "放大",
        "resetZoom": "适应屏幕",
        "downloadImage": "下载图片",
        "close": "关闭",
        "sendMessageTooltip": "发送消息",
        "openFullPageTooltip": "新标签页打开",
        "modelSelectTooltip": "选择模型 (按 Tab 切换)",

        // Auto-Scroll Settings
        "autoScrollSettings": "自动滚动设置",
        "autoScrollSettingsDesc": "配置总结整个页面时的滚动行为。按 ESC 可取消滚动。",
        "scrollInterval": "滚动间隔 (毫秒)",
        "scrollIntervalDesc": "每次滚动之间的时间间隔。默认：200ms",
        "scrollMaxDuration": "最大时长 (毫秒)",
        "scrollMaxDurationDesc": "滚动的最大持续时间。默认：15000ms (15秒)",
        "contextLimit": "最大上下文长度 (字符)",
        "contextLimitDesc": "0 = 不限制。超过时会截断。默认：500000",

        // MCP Settings
        "mcpTitle": "模型上下文协议 (MCP)",
        "mcpDesc": "通过 JSON 配置连接外部工具。",
        "saveMcpConfig": "保存 MCP 配置",

        // Workspace Settings
        "workspacePath": "AI 工作区路径",
        "workspacePathDesc": "选择 AI 保存文件的位置。留空则使用默认的 Downloads/gemini-workspace",
        "workspacePathPlaceholder": "例如：MyProjects/AI-Data",
        "workspacePrompt": "保存位置提示",
        "workspacePromptDesc": "每次保存文件时询问位置（适合重要文件）",
        "reset": "重置",
        "loading": "加载中...",
        "defaultModel": "默认模型",
        "defaultModelDesc": "用于新窗口/新会话的默认选择，你仍可随时手动切换模型。",
        "defaultModelInvalid": "默认模型已失效，请在设置中重新选择。"
    }
};

export function resolveLanguage(pref) {
    if (pref === 'system') {
        return navigator.language.startsWith('zh') ? 'zh' : 'en';
    }
    return pref;
}

let savedPreference = 'system';
let currentLang = resolveLanguage(savedPreference);

// Apply initial lang attribute for CSS/DOM consistency
try {
    document.documentElement.lang = currentLang;
} catch (e) { }

export function setLanguagePreference(pref) {
    savedPreference = pref;
    currentLang = resolveLanguage(pref);
    document.documentElement.lang = currentLang;
}

export function getLanguagePreference() {
    return savedPreference;
}

export function t(key) {
    return translations[currentLang][key] || key;
}

export function applyTranslations() {
    // 1. Text Content
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(el => {
        const key = el.getAttribute('data-i18n');
        const text = t(key);
        if (text) el.textContent = text;
    });

    // 2. Placeholders
    const placeholders = document.querySelectorAll('[data-i18n-placeholder]');
    placeholders.forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        const text = t(key);
        if (text) el.placeholder = text;
    });

    // 3. Titles (Tooltips)
    const titles = document.querySelectorAll('[data-i18n-title]');
    titles.forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        const text = t(key);
        if (text) el.title = text;
    });
}
