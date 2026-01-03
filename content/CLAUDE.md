# Content 模块

[根目录](../CLAUDE.md) > **content**

> **变更记录 (Changelog)**
> - 2026-01-03 17:12:45: 初始化 content 模块文档

## 模块职责

Content 模块负责在网页中注入脚本，提供：

1. **浮动工具栏** - 文本选中后的快捷操作面板
2. **截图裁剪** - 在选中区域后裁剪截图
3. **快捷键监听** - 监听全局快捷键（如 `Ctrl+G` 快速提问）
4. **页面内容提取** - 获取网页文本、选中内容
5. **自动滚动** - 智能滚动页面以触发懒加载内容
6. **覆盖层 UI** - 选择框、浮动面板等临时 UI

## 入口与启动

**入口文件**: `content/index.js`

**注入配置** (在 `manifest.json`):
```json
{
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": [
      "content/overlay.js",
      "content/toolbar/icons.js",
      "content/toolbar/styles/*.js",
      "content/toolbar/view/*.js",
      "content/toolbar/ui/*.js",
      "content/index.js"
    ],
    "run_at": "document_end"
  }]
}
```

**启动流程**：
```javascript
// 1. 初始化覆盖层（选择框）
const selectionOverlay = new window.GeminiNexusOverlay();

// 2. 初始化浮动工具栏
const floatingToolbar = new window.GeminiToolbarController();

// 3. 监听来自 Background 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // 处理各种 Action...
});

// 4. 监听快捷键
document.addEventListener('keydown', (e) => {
  // 快捷键匹配与处理
});
```

## 对外接口

### 接收的消息

| 消息 Action | 参数 | 功能 | 返回 |
|-------------|------|------|------|
| `CONTEXT_MENU_ACTION` | `mode` | 处理右键菜单触发的操作 | `{ status: "ok" }` |
| `FOCUS_INPUT` | - | 聚焦页面输入框 | `{ status: "ok" }` |
| `START_SELECTION` | `image`, `source`, `mode` | 启动截图选择模式 | `{ status: "selection_started" }` |
| `CROP_SCREENSHOT` | 裁剪参数 | 处理裁剪后的截图 | `{ status: "ok" }` |
| `GENERATED_IMAGE_RESULT` | 图片结果 | 处理生成的图片结果 | `{ status: "ok" }` |
| `GET_SELECTION` | - | 获取当前选中文本 | `{ selection: "..." }` |
| `GET_PAGE_CONTENT` | - | 获取页面全部文本内容（带自动滚动） | `{ content: "..." }` |

### 发送的消息

向 Background 发送：
- `OPEN_SIDE_PANEL` - 打开侧边栏
- `PROCESS_CROP_IN_SIDEPANEL` - 将裁剪结果转发到侧边栏

## 关键依赖与配置

### 核心组件

**Toolbar (浮动工具栏)**:
- `toolbar/controller.js` - 主控制器
- `toolbar/view/` - UI 视图组件
- `toolbar/ui/` - 交互逻辑（代码复制、语法高亮、渲染等）
- `toolbar/styles/` - 样式注入（CSS-in-JS）

**Overlay (覆盖层)**:
- `overlay.js` - 选择框覆盖层
- `selection.js` - 文本选中处理

### 配置项

通过 `chrome.storage.local` 读取：
- `geminiShortcuts` - 快捷键配置
- `geminiTextSelectionEnabled` - 文本选中工具开关
- `geminiImageToolsEnabled` - 图像工具开关
- `geminiAutoScrollInterval` - 自动滚动间隔（毫秒）
- `geminiAutoScrollMaxTime` - 自动滚动最大时长（毫秒）

### 样式系统

使用 CSS-in-JS 动态注入样式：
- `toolbar/styles/core.js` - 核心样式
- `toolbar/styles/panel/` - 面板布局样式
- `toolbar/styles/markdown.js` - Markdown 渲染样式

**优势**：
- 避免与页面样式冲突
- 支持动态主题切换
- 完全隔离的样式作用域

## 数据模型

### Shortcut 配置

```javascript
{
  quickAsk: "Ctrl+G",    // 快速提问
  openPanel: "Alt+S"     // 打开侧边栏
}
```

### Selection Overlay 状态

```javascript
{
  isActive: boolean,           // 是否激活
  captureSource: string,       // 'sidepanel' | 'local'
  currentMode: string,         // 'ocr' | 'translate' | ...
  cropArea: { x, y, w, h }     // 裁剪区域
}
```

## 测试与质量

**当前状态**: 无自动化测试

**手动测试**:
- 在任意网页按 `F12` 打开 DevTools
- 在 Console 中检查是否有 `Gemini Nexus v4.0.0 Ready` 日志
- 测试文本选中工具、快捷键、截图功能

**建议补充**:
- E2E 测试：使用 Puppeteer 模拟用户交互
- 样式回归测试：截图对比
- 兼容性测试：不同网站的注入测试

## 常见问题 (FAQ)

### Q: 浮动工具栏为何在某些网站不显示？
A: 可能被网站的 CSP 策略阻止，或与网站自身的 z-index 冲突。检查 DevTools Console 是否有错误。

### Q: 快捷键不生效？
A: 确认快捷键配置是否与网站自身快捷键冲突。可在设置中修改。

### Q: 自动滚动卡住怎么办？
A: 按 `ESC` 可取消自动滚动。可在设置中调整滚动间隔和最大时长。

### Q: 如何调试 Content Script？
A: 在任意网页按 `F12`，Console 中可查看 Content Script 日志。Source 面板中可找到注入的脚本。

## 相关文件清单

**核心入口**:
- `index.js` - Content Script 主入口
- `overlay.js` - 选择框覆盖层
- `selection.js` - 文本选中处理

**Toolbar (浮动工具栏)**:
- `toolbar/controller.js` - 主控制器
- `toolbar/bridge.js` - 与 Background 通信桥接
- `toolbar/dispatch.js` - 消息分发器
- `toolbar/actions.js` - 动作定义
- `toolbar/events.js` - 事件监听
- `toolbar/crop.js` - 裁剪功能
- `toolbar/image.js` - 图像处理
- `toolbar/stream.js` - 流式响应处理
- `toolbar/i18n.js` - 国际化
- `toolbar/templates.js` - HTML 模板

**Toolbar - View 层**:
- `toolbar/view/index.js` - 视图主控制器
- `toolbar/view/widget.js` - 浮动组件
- `toolbar/view/window.js` - 窗口管理
- `toolbar/view/dom.js` - DOM 操作
- `toolbar/view/utils.js` - 视图工具

**Toolbar - UI 层**:
- `toolbar/ui/manager.js` - UI 管理器
- `toolbar/ui/renderer.js` - 渲染器
- `toolbar/ui/code_copy.js` - 代码复制
- `toolbar/ui/grammar.js` - 语法高亮
- `toolbar/ui/actions_delegate.js` - 动作委托

**Toolbar - Styles 层**:
- `toolbar/styles/index.js` - 样式主入口
- `toolbar/styles/core.js` - 核心样式
- `toolbar/styles/widget.js` - 组件样式
- `toolbar/styles/markdown.js` - Markdown 样式
- `toolbar/styles/panel/` - 面板布局样式

**Toolbar - Utils**:
- `toolbar/utils/drag.js` - 拖拽功能
- `toolbar/utils/input.js` - 输入处理

---

**最后更新**: 2026-01-03
