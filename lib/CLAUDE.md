# Lib 模块

[根目录](../CLAUDE.md) > **lib**

> **变更记录 (Changelog)**
> - 2026-01-03 17:12:45: 初始化 lib 模块文档

## 模块职责

Lib 模块提供通用工具函数和常量，供其他模块复用，负责：

1. **常量定义** - 全局常量（颜色、配置、消息类型等）
2. **消息通信** - Sandbox 与父窗口的消息封装
3. **日志记录** - 统一的日志接口
4. **图像处理** - 裁剪、水印移除等工具
5. **工具函数** - 通用的辅助函数

## 入口与启动

Lib 模块无独立入口，作为工具库被其他模块导入使用。

**主要文件**：
- `constants.js` - 常量定义
- `messaging.js` - 消息通信封装
- `logger.js` - 日志记录
- `utils.js` - 工具函数
- `crop_utils.js` - 裁剪工具
- `watermark_remover.js` - 水印移除

## 对外接口

### Constants (constants.js)

**颜色常量**：
```javascript
export const COLORS = {
    PRIMARY: '#1A73E8',
    SECONDARY: '#5F6368',
    SUCCESS: '#34A853',
    ERROR: '#EA4335',
    WARNING: '#FBBC04'
};
```

**配置常量**：
```javascript
export const CONFIG = {
    MAX_MESSAGE_LENGTH: 32768,
    AUTO_SCROLL_INTERVAL: 200,
    AUTO_SCROLL_MAX_TIME: 15000,
    // ...
};
```

**消息类型**：
```javascript
export const MESSAGE_TYPES = {
    SEND_PROMPT: 'SEND_PROMPT',
    GEMINI_STREAM: 'GEMINI_STREAM',
    // ...
};
```

### Messaging (messaging.js)

**消息发送函数**：

| 函数 | 参数 | 功能 |
|------|------|------|
| `sendToBackground` | `payload` | 发送消息到 Background |
| `saveSessionsToStorage` | `sessions[]` | 保存会话到存储 |
| `saveShortcutsToStorage` | `shortcuts{}` | 保存快捷键 |
| `saveThemeToStorage` | `theme` | 保存主题 |
| `saveLanguageToStorage` | `lang` | 保存语言 |
| `requestThemeFromStorage` | - | 请求主题 |
| `requestLanguageFromStorage` | - | 请求语言 |
| `saveTextSelectionToStorage` | `enabled` | 保存文本选中工具状态 |
| `saveImageToolsToStorage` | `enabled` | 保存图像工具状态 |
| `saveSidebarBehaviorToStorage` | `behavior` | 保存侧边栏行为 |
| `saveGemIdToStorage` | `gemId` | 保存 Gem ID |
| `saveWorkspacePathToStorage` | `path` | 保存工作区路径 |
| `saveWorkspacePromptToStorage` | `enabled` | 保存工作区提示状态 |
| `saveAutoScrollSettingsToStorage` | `interval, maxTime` | 保存自动滚动设置 |
| `saveContextLimitToStorage` | `limit` | 保存上下文限制 |

**实现原理**：
```javascript
export function sendToBackground(payload) {
    window.parent.postMessage({
        action: 'FORWARD_TO_BACKGROUND',
        payload: payload
    }, '*');
}
```

### Logger (logger.js)

**日志接口**：
```javascript
export const Logger = {
    log: (message, ...args) => { /* ... */ },
    error: (message, ...args) => { /* ... */ },
    warn: (message, ...args) => { /* ... */ },
    info: (message, ...args) => { /* ... */ },
    debug: (message, ...args) => { /* ... */ }
};
```

**特性**：
- 统一前缀（如 `[Anywhere]`）
- 环境检测（开发/生产）
- 可选的日志级别过滤

### Utils (utils.js)

**工具函数**（示例）：
```javascript
export function debounce(fn, delay) { /* ... */ }
export function throttle(fn, interval) { /* ... */ }
export function generateUUID() { /* ... */ }
export function formatTimestamp(ts) { /* ... */ }
export function sanitizeHTML(html) { /* ... */ }
```

### Crop Utils (crop_utils.js)

**裁剪工具**：
```javascript
export function cropImage(imageBase64, cropArea) {
    // 在 Canvas 上裁剪图片
    // 返回裁剪后的 Base64
}

export function calculateCropArea(startX, startY, endX, endY) {
    // 计算裁剪区域
}
```

### Watermark Remover (watermark_remover.js)

**水印移除**：
```javascript
export function removeWatermark(imageBase64) {
    // 检测并移除图片中的水印
    // 返回处理后的 Base64
}
```

**应用场景**：
- 移除 Gemini 生成图片中的水印标识
- 清理截图中的 UI 元素水印

## 关键依赖与配置

### 无外部依赖

Lib 模块为纯工具库，不依赖第三方库。

### 内部依赖关系

```
messaging.js → 依赖 window.parent (Sandbox 环境)
logger.js → 依赖 console
crop_utils.js → 依赖 Canvas API
watermark_remover.js → 依赖 Canvas API
```

## 数据模型

### Crop Area 对象

```javascript
{
    x: 100,       // 左上角 X 坐标
    y: 100,       // 左上角 Y 坐标
    width: 400,   // 宽度
    height: 300   // 高度
}
```

## 测试与质量

**当前状态**: 无自动化测试

**建议补充**:
- 单元测试：测试工具函数（debounce、throttle、UUID 生成等）
- 集成测试：测试消息通信流程
- 性能测试：测试图像处理函数的性能

## 常见问题 (FAQ)

### Q: 为什么使用 `window.parent.postMessage` 而不是 `chrome.runtime.sendMessage`？
A: Sandbox 环境中无法直接访问 Chrome API，需要通过 `postMessage` 与父窗口（Sidepanel）通信。

### Q: Logger 在生产环境会输出日志吗？
A: 取决于实现。建议在生产环境中禁用 debug 级别日志。

### Q: 图像处理函数支持哪些格式？
A: 支持所有浏览器 Canvas API 支持的格式（PNG、JPEG、WebP 等）。

## 相关文件清单

**核心文件**:
- `constants.js` - 常量定义
- `messaging.js` - 消息通信封装
- `logger.js` - 日志记录
- `utils.js` - 工具函数
- `crop_utils.js` - 裁剪工具
- `watermark_remover.js` - 水印移除

---

**最后更新**: 2026-01-03
