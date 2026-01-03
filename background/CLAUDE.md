# Background 模块

[根目录](../CLAUDE.md) > **background**

> **变更记录 (Changelog)**
> - 2026-01-03 17:12:45: 初始化 background 模块文档

## 模块职责

Background 模块是扩展的核心后台服务 Worker，负责：

1. **会话管理** - 管理与 Gemini API 的对话会话（`GeminiSessionManager`）
2. **API 调用** - 封装与 Gemini 服务的通信（依赖 `services/`）
3. **认证管理** - 提取和维护 Gemini 认证上下文（`AuthManager`）
4. **浏览器控制** - 基于 CDP 实现 AI 自动化操作（`BrowserControlManager`）
5. **MCP 协议** - 支持外部工具调用（`MCPManager`）
6. **图像处理** - 截图、裁剪、上传（`ImageManager`）
7. **日志记录** - 运行时日志收集（`LogManager`）
8. **消息路由** - 处理来自 Content/Sidepanel 的消息

## 入口与启动

**入口文件**: `background/index.js`

**启动流程**：
```javascript
// 1. 初始化管理器
const logManager = new LogManager();
const sessionManager = new GeminiSessionManager();
const imageManager = new ImageManager();
const controlManager = new BrowserControlManager();
const mcpManager = new MCPManager();

// 2. 启动 MCP 连接
mcpManager.init();

// 3. 设置右键菜单
setupContextMenus(imageManager);

// 4. 监听消息
setupMessageListener(sessionManager, imageManager, controlManager, logManager, mcpManager);

// 5. 保活机制（防止 Service Worker 休眠）
keepAliveManager.init();
```

**Service Worker 生命周期**：
- Chrome Manifest V3 要求 Background 必须是 Service Worker
- 空闲 30 秒后会进入休眠状态
- 使用 `keepAliveManager` 维持活跃状态

## 对外接口

### 消息处理器 (setupMessageListener)

| 消息 Action | 参数 | 功能 | 返回 |
|-------------|------|------|------|
| `SEND_PROMPT` | `text`, `image`, `files`, `model`, `gemId` | 发送对话到 Gemini | 流式响应 (`GEMINI_STREAM`) |
| `CANCEL_REQUEST` | - | 取消当前请求 | - |
| `CAPTURE_SCREENSHOT` | `mode`, `source` | 截取屏幕 | 图片 Base64 |
| `OPEN_SIDE_PANEL` | - | 打开侧边栏 | - |
| `BROWSER_CONTROL_*` | 各种控制参数 | 浏览器自动化操作 | 执行结果 |
| `FETCH_GEMS_LIST` | `userIndex`, `forceRefresh` | 获取 Gem 列表 | `{ gems: [...] }` |
| `FETCH_MODELS_LIST` | `userIndex`, `forceRefresh` | 获取模型列表 | `{ models: [...] }` |
| `MCP_*` | MCP 相关参数 | MCP 工具调用 | 工具执行结果 |
| `GET_LOGS` | - | 获取日志 | `{ logs: [...] }` |

### 右键菜单（Context Menus）

通过 `setupContextMenus()` 创建：
- **快速提问** - 选中文本快速提问
- **截图分析** - 截图后分析
- **总结页面** - 总结当前网页

## 关键依赖与配置

### 外部依赖

- **Services 模块**:
  - `services/gemini_api.js` - Gemini API 调用
  - `services/auth.js` - 认证管理
  - `services/upload.js` - 文件上传
  - `services/gems_api.js` - Gem 列表获取
  - `services/models_api.js` - 模型列表获取

- **Chrome APIs**:
  - `chrome.runtime` - 消息通信
  - `chrome.tabs` - 标签页管理
  - `chrome.debugger` - CDP 调试协议（用于浏览器控制）
  - `chrome.storage` - 本地存储
  - `chrome.sidePanel` - 侧边栏管理

### 配置项

通过 `chrome.storage.local` 管理：
- `geminiSessions` - 会话列表
- `geminiModel` - 当前选择的模型
- `gemini_gem_id` - 当前选择的 Gem ID
- `mcpConfig` - MCP 服务器配置

## 数据模型

### Session 对象

```javascript
{
  id: "session_uuid",
  title: "对话标题",
  messages: [
    { role: "user", text: "...", image: "..." },
    { role: "model", text: "..." }
  ],
  createdAt: 1704278400000,
  updatedAt: 1704278400000
}
```

### MCP 配置

```javascript
{
  mcpServers: {
    "server_name": {
      url: "http://localhost:3000/sse",
      type: "sse" | "streamable_http"
    }
  }
}
```

## 测试与质量

**当前状态**: 无自动化测试

**手动测试**:
- 在 `chrome://extensions/` > Service Worker > Inspect
- 查看控制台日志
- 使用 `LogManager` 收集运行时日志

**建议补充**:
- 单元测试：测试各 Manager 的核心逻辑
- 集成测试：测试 API 调用流程
- Mock：模拟 Gemini API 响应

## 常见问题 (FAQ)

### Q: Service Worker 为何会自动休眠？
A: Chrome Manifest V3 的限制，空闲 30 秒后会休眠。使用 `keepAliveManager` 定期发送心跳保持活跃。

### Q: 如何调试 Background 代码？
A: 在 `chrome://extensions/` 找到扩展，点击 Service Worker 下的「Inspect」。

### Q: 消息通信失败怎么办？
A: 检查 `chrome.runtime.lastError`，确保发送端和接收端的 Action 名称匹配。

### Q: 浏览器控制功能无法使用？
A: 确认目标页面不是 `chrome://` 或 `edge://` 等受限页面，且已成功 attach debugger。

## 相关文件清单

**核心管理器**:
- `managers/session_manager.js` - 会话管理
- `managers/auth_manager.js` - 认证管理
- `managers/control_manager.js` - 浏览器控制
- `managers/mcp_manager.js` - MCP 协议管理
- `managers/image_manager.js` - 图像处理
- `managers/log_manager.js` - 日志管理
- `managers/keep_alive.js` - 保活机制

**消息处理**:
- `handlers/session.js` - 会话处理器
- `handlers/session/prompt_handler.js` - Prompt 处理
- `handlers/session/context_handler.js` - 上下文处理
- `handlers/session/quick_ask_handler.js` - 快速提问处理
- `handlers/ui.js` - UI 事件处理
- `messages.js` - 消息监听器

**浏览器控制**:
- `control/connection.js` - CDP 连接管理
- `control/actions.js` - 浏览器动作封装
- `control/snapshot.js` - 页面快照
- `control/selector.js` - 元素选择器
- `control/a11y.js` - 无障碍检查
- `control/file_operations.js` - 文件操作（AI 工作区）
- `control/control_overlay.js` - 控制指示器
- `control/breakpoint_overlay.js` - 断点面板

**其他**:
- `menus.js` - 右键菜单设置
- `lib/trace_processor.js` - 轨迹处理

---

**最后更新**: 2026-01-03
