# Sandbox 模块

[根目录](../CLAUDE.md) > **sandbox**

> **变更记录 (Changelog)**
> - 2026-01-03 17:12:45: 初始化 sandbox 模块文档

## 模块职责

Sandbox 模块是扩展的安全 UI 渲染环境，运行在 Chrome Extension Sandbox 中，负责：

1. **Markdown 渲染** - 安全渲染 AI 返回的 Markdown 内容（使用 Marked.js）
2. **数学公式** - 渲染 LaTeX 公式（使用 KaTeX）
3. **代码高亮** - 语法高亮代码块（使用 Highlight.js）
4. **图表渲染** - 渲染 Mermaid 图表和思维导图（Markmap）
5. **会话管理** - 前端会话状态管理（创建、切换、删除会话）
6. **UI 控制** - 聊天界面、侧边栏、设置面板等
7. **主题切换** - 深色/浅色主题、国际化

## 入口与启动

**入口文件**: `sandbox/index.js`

**双模式启动**：
```javascript
const params = new URLSearchParams(window.location.search);
const isRendererMode = params.get('mode') === 'renderer';

if (isRendererMode) {
    initRendererMode();  // 渲染器模式（用于导出图片等）
} else {
    initAppMode();       // 应用模式（主 UI）
}
```

**App 模式启动流程** (`boot/app.js`):
```javascript
// 1. 延迟加载第三方库
await loadVendors();

// 2. 初始化消息通信
setupMessaging();

// 3. 初始化 UI
initUI();

// 4. 初始化国际化
initI18n();

// 5. 通知父窗口准备就绪
window.parent.postMessage({ action: 'UI_READY' }, '*');
```

## 对外接口

### 接收的消息 (从 Sidepanel)

| 消息 Action | 参数 | 功能 |
|-------------|------|------|
| `UI_READY` 响应 | - | 父窗口准备就绪的确认 |
| `RESTORE_SESSIONS` | `sessions[]` | 恢复会话列表 |
| `RESTORE_SHORTCUTS` | `shortcuts{}` | 恢复快捷键配置 |
| `RESTORE_MODEL` | `model` | 恢复模型选择 |
| `RESTORE_THEME` | `theme` | 恢复主题设置 |
| `RESTORE_LANGUAGE` | `lang` | 恢复语言设置 |
| `RESTORE_TEXT_SELECTION` | `enabled` | 恢复文本选中工具状态 |
| `RESTORE_IMAGE_TOOLS` | `enabled` | 恢复图像工具状态 |
| `RESTORE_SIDEBAR_BEHAVIOR` | `behavior` | 恢复侧边栏行为 |
| `BACKGROUND_MESSAGE` | `payload` | 转发来自 Background 的消息 |
| `GEMS_LIST_RESPONSE` | `{ gems, error }` | Gem 列表响应 |
| `MODELS_LIST_RESPONSE` | `{ models, error }` | 模型列表响应 |

### 发送的消息 (到 Sidepanel)

| 消息 Action | 参数 | 功能 |
|-------------|------|------|
| `UI_READY` | - | 通知 UI 已准备就绪 |
| `FORWARD_TO_BACKGROUND` | `payload` | 转发消息到 Background |
| `SAVE_SESSIONS` | `sessions[]` | 保存会话列表 |
| `SAVE_SHORTCUTS` | `shortcuts{}` | 保存快捷键 |
| `SAVE_MODEL` | `model` | 保存模型选择 |
| `SAVE_THEME` | `theme` | 保存主题 |
| `SAVE_LANGUAGE` | `lang` | 保存语言 |
| `DOWNLOAD_IMAGE` | `{ url, filename }` | 下载图片 |
| `DOWNLOAD_LOGS` | `{ text, filename }` | 下载日志 |
| `DOWNLOAD_SVG` | `{ svg, filename }` | 下载 SVG |
| `DOWNLOAD_MINDMAP_PNG` | `{ svgHtml, width, height, filename }` | 下载思维导图 PNG |
| `FETCH_GEMS_LIST` | `{ messageId, userIndex, forceRefresh }` | 请求 Gem 列表 |
| `FETCH_MODELS_LIST` | `{ messageId, userIndex, forceRefresh }` | 请求模型列表 |

## 关键依赖与配置

### 第三方库 (Vendor)

**延迟加载策略** - 使用动态 `import()` 提升首屏速度：

| 库 | 版本 | 用途 | 加载方式 |
|----|------|------|----------|
| **Marked.js** | - | Markdown 解析 | 延迟加载 |
| **Highlight.js** | - | 代码语法高亮 | 延迟加载 |
| **KaTeX** | - | LaTeX 数学公式渲染 | 延迟加载 |
| **Mermaid** | 11.12.2 | 图表渲染 | 延迟加载 |
| **Markmap** | 0.18.12 | 思维导图渲染 | 延迟加载 |
| **D3.js** | 7.9.0 | 数据可视化（Markmap 依赖） | 延迟加载 |
| **Fuse.js** | - | 模糊搜索 | 延迟加载 |
| **html2canvas** | 1.4.1 | 导出 PNG | 按需加载 |

**加载器**:
- `libs/mermaid-loader.js` - Mermaid 加载器
- `libs/markmap-loader.js` - Markmap 加载器
- `boot/loader.js` - 统一的库加载管理

### 核心控制器

| 控制器 | 职责 |
|--------|------|
| `AppController` | 主应用控制器，协调各模块 |
| `SessionFlowController` | 会话流程控制（创建、切换、删除） |
| `MessageHandler` | 处理来自 Background 的消息 |
| `PromptController` | 处理用户输入和提示词构建 |
| `GemsController` | Gem 列表管理 |
| `ModelsController` | 模型列表管理 |
| `MCPController` | MCP 工具管理 |
| `UIController` | UI 状态管理 |

### 渲染管道

**Pipeline** (`render/pipeline.js`):
```
原始文本 → Markdown 解析 → 代码高亮 → LaTeX 渲染 → Mermaid 渲染 → 最终 HTML
```

**组件**:
- `render/content.js` - 内容渲染
- `render/message.js` - 消息渲染
- `render/math_utils.js` - 数学公式处理
- `render/config.js` - 渲染配置
- `render/clipboard.js` - 剪贴板处理
- `render/generated_image.js` - 生成图片处理

## 数据模型

### Session 对象

```javascript
{
  id: "uuid",
  title: "对话标题",
  messages: [
    {
      role: "user",
      text: "用户输入",
      image: "base64...",  // 可选
      files: [...]         // 可选
    },
    {
      role: "model",
      text: "AI 回复",
      streaming: false
    }
  ],
  createdAt: 1704278400000,
  updatedAt: 1704278400000
}
```

### 主题配置

```javascript
{
  theme: "system" | "light" | "dark",
  language: "system" | "en" | "zh"
}
```

## 测试与质量

**当前状态**: 无自动化测试

**手动测试**:
- 在 Sidepanel iframe 中按 `F12` 打开 DevTools
- 测试 Markdown 渲染、代码高亮、公式渲染
- 测试会话切换、删除、导出功能

**建议补充**:
- 单元测试：渲染管道测试
- 快照测试：UI 组件渲染结果对比
- 性能测试：大量消息渲染性能

## 常见问题 (FAQ)

### Q: Mermaid 图表不显示？
A: 检查 Console 是否有加载错误。Mermaid 是延迟加载的，首次渲染会有短暂延迟。

### Q: 思维导图导出 PNG 失败？
A: 需要在 Sidepanel 的可信环境中调用 `html2canvas`，Sandbox 环境中会被 CSP 阻止。

### Q: 主题切换不生效？
A: 确认 `theme_init.js` 在 `<head>` 中最早加载，避免闪烁。

### Q: 如何调试 Sandbox？
A: 在 Sidepanel 中打开 iframe 对应的 DevTools。注意 Sandbox 无法直接访问 Chrome API。

## 相关文件清单

**核心启动**:
- `index.js` - 主入口
- `boot/app.js` - 应用模式启动
- `boot/renderer.js` - 渲染器模式启动
- `boot/messaging.js` - 消息通信初始化
- `boot/events.js` - 事件监听初始化
- `boot/loader.js` - 库加载管理
- `theme_init.js` - 主题初始化（无闪烁）

**核心逻辑**:
- `core/session_manager.js` - 会话管理
- `core/image_manager.js` - 图片管理
- `core/i18n.js` - 国际化

**控制器**:
- `controllers/app_controller.js` - 主控制器
- `controllers/session_flow.js` - 会话流程
- `controllers/message_handler.js` - 消息处理
- `controllers/prompt.js` - 提示词控制
- `controllers/gems_controller.js` - Gem 管理
- `controllers/models_controller.js` - 模型管理
- `controllers/mcp_controller.js` - MCP 工具

**UI 层**:
- `ui/layout.js` - 布局管理
- `ui/chat.js` - 聊天界面
- `ui/viewer.js` - 查看器
- `ui/sidebar.js` - 侧边栏
- `ui/settings.js` - 设置面板
- `ui/settings/view.js` - 设置视图
- `ui/ui_controller.js` - UI 控制器

**UI 模板**:
- `ui/templates.js` - 模板主入口
- `ui/templates/header.js` - 头部模板
- `ui/templates/chat.js` - 聊天模板
- `ui/templates/sidebar.js` - 侧边栏模板
- `ui/templates/viewer.js` - 查看器模板
- `ui/templates/footer.js` - 底部模板
- `ui/templates/settings.js` - 设置模板

**渲染层**:
- `render/pipeline.js` - 渲染管道
- `render/content.js` - 内容渲染
- `render/message.js` - 消息渲染
- `render/math_utils.js` - 数学公式处理
- `render/config.js` - 渲染配置
- `render/clipboard.js` - 剪贴板处理
- `render/generated_image.js` - 生成图片处理

**第三方库**:
- `vendor/marked.min.js` - Markdown 解析
- `vendor/highlight.min.js` - 代码高亮
- `vendor/katex.min.js` - LaTeX 渲染
- `vendor/auto-render.min.js` - KaTeX 自动渲染
- `vendor/mermaid.js` - Mermaid 图表
- `vendor/markmap-lib.js` - Markmap 核心
- `vendor/markmap-view.js` - Markmap 视图
- `vendor/d3.js` - D3.js
- `vendor/fuse.basic.min.js` - 模糊搜索
- `vendor/html2canvas.js` - Canvas 导出

**库加载器**:
- `libs/mermaid-loader.js` - Mermaid 延迟加载
- `libs/markmap-loader.js` - Markmap 延迟加载

---

**最后更新**: 2026-01-03
