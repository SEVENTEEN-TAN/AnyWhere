# Sidepanel 模块

[根目录](../CLAUDE.md) > **sidepanel**

> **变更记录 (Changelog)**
> - 2026-01-03 17:12:45: 初始化 sidepanel 模块文档

## 模块职责

Sidepanel 模块是侧边栏的桥接层，负责：

1. **Iframe 管理** - 加载和管理 Sandbox iframe
2. **消息转发** - 在 Background、Content 和 Sandbox 之间转发消息
3. **数据预取** - 提前从 `chrome.storage` 加载数据，加速 UI 初始化
4. **下载代理** - 处理 Sandbox 中的下载请求（文件、图片、日志等）
5. **主题同步** - 使用 localStorage 缓存主题和语言，实现无闪烁加载
6. **骨架屏** - 显示加载骨架屏，提升用户体验

## 入口与启动

**入口文件**: `sidepanel/index.js`
**HTML 文件**: `sidepanel/index.html`

**启动流程**：
```javascript
// 1. 读取 localStorage 缓存（同步，无阻塞）
const cachedTheme = localStorage.getItem('geminiTheme') || 'system';
const cachedLang = localStorage.getItem('geminiLanguage') || 'system';

// 2. 立即加载 iframe（带主题和语言参数）
iframe.src = `../sandbox/index.html?theme=${cachedTheme}&lang=${cachedLang}`;

// 3. 并行异步获取完整数据
chrome.storage.local.get([
    'geminiSessions',
    'pendingSessionId',
    'geminiShortcuts',
    'geminiModel',
    'pendingImage',
    // ...
], (result) => {
    preFetchedData = result;
    trySendInitData();
});

// 4. 等待 Sandbox 发送 UI_READY 信号
window.addEventListener('message', (event) => {
    if (event.data.action === 'UI_READY') {
        uiIsReady = true;
        trySendInitData();  // 推送数据到 Sandbox
    }
});
```

**优化策略**：
- **同步缓存**：主题和语言使用 `localStorage`，避免异步等待
- **并行加载**：iframe 加载和数据获取并行进行
- **骨架屏**：iframe 透明时显示骨架屏，加载完成后淡入
- **安全超时**：1 秒后强制移除骨架屏，防止卡住

## 对外接口

### 接收的消息 (从 Sandbox)

| 消息 Action | 参数 | 功能 | 处理方式 |
|-------------|------|------|----------|
| `UI_READY` | - | Sandbox UI 已准备就绪 | 触发数据推送 |
| `OPEN_FULL_PAGE` | - | 在新标签页打开完整界面 | 创建新标签页 |
| `OPEN_TAB_BACKGROUND` | `url` | 后台打开新标签页 | 转发到 Background |
| `FORWARD_TO_BACKGROUND` | `payload` | 转发到 Background | 通过 `chrome.runtime.sendMessage` |
| `FETCH_GEMS_LIST` | `{ messageId, userIndex, forceRefresh }` | 请求 Gem 列表 | 转发并回传结果 |
| `FETCH_MODELS_LIST` | `{ messageId, userIndex, forceRefresh }` | 请求模型列表 | 转发并回传结果 |
| `DOWNLOAD_IMAGE` | `{ url, filename }` | 下载图片 | 创建 `<a>` 元素触发下载 |
| `DOWNLOAD_LOGS` | `{ text, filename }` | 下载日志 | 创建 Blob 触发下载 |
| `DOWNLOAD_SVG` | `{ svg, filename }` | 下载 SVG | 创建 Blob 触发下载 |
| `DOWNLOAD_MINDMAP_PNG` | `{ svgHtml, width, height, filename }` | 导出思维导图 PNG | 使用 `html2canvas` 生成 PNG |
| `GET_THEME` | - | 获取主题设置 | 返回 localStorage 缓存值 |
| `GET_LANGUAGE` | - | 获取语言设置 | 返回 localStorage 缓存值 |
| `GET_TEXT_SELECTION` | - | 获取文本选中工具状态 | 从 `chrome.storage` 读取 |
| `GET_IMAGE_TOOLS` | - | 获取图像工具状态 | 从 `chrome.storage` 读取 |
| `GET_WORKSPACE_SETTINGS` | - | 获取工作区设置 | 从 `chrome.storage` 读取 |
| `GET_AUTO_SCROLL_SETTINGS` | - | 获取自动滚动设置 | 从 `chrome.storage` 读取 |
| `SAVE_SESSIONS` | `sessions[]` | 保存会话 | 写入 `chrome.storage` |
| `SAVE_SHORTCUTS` | `shortcuts{}` | 保存快捷键 | 写入 `chrome.storage` |
| `SAVE_MODEL` | `model` | 保存模型 | 写入 `chrome.storage` |
| `SAVE_THEME` | `theme` | 保存主题 | 写入 `chrome.storage` 和 `localStorage` |
| `SAVE_LANGUAGE` | `lang` | 保存语言 | 写入 `chrome.storage` 和 `localStorage` |
| `SAVE_*` | 各种配置 | 保存各种设置 | 写入 `chrome.storage` |

### 发送的消息 (到 Sandbox)

| 消息 Action | 参数 | 功能 |
|-------------|------|------|
| `RESTORE_SESSIONS` | `sessions[]` | 恢复会话列表 |
| `RESTORE_SHORTCUTS` | `shortcuts{}` | 恢复快捷键 |
| `RESTORE_MODEL` | `model` | 恢复模型选择 |
| `RESTORE_THEME` | `theme` | 恢复主题 |
| `RESTORE_LANGUAGE` | `lang` | 恢复语言 |
| `RESTORE_TEXT_SELECTION` | `enabled` | 恢复文本选中工具状态 |
| `RESTORE_IMAGE_TOOLS` | `enabled` | 恢复图像工具状态 |
| `RESTORE_SIDEBAR_BEHAVIOR` | `behavior` | 恢复侧边栏行为 |
| `RESTORE_WORKSPACE_SETTINGS` | `{ path, prompt }` | 恢复工作区设置 |
| `RESTORE_AUTO_SCROLL_SETTINGS` | `{ interval, maxTime, contextLimit }` | 恢复自动滚动设置 |
| `BACKGROUND_MESSAGE` | `payload` | 转发来自 Background 的消息 |
| `GEMS_LIST_RESPONSE` | `{ messageId, response }` | Gem 列表响应 |
| `MODELS_LIST_RESPONSE` | `{ messageId, response }` | 模型列表响应 |

### 接收的消息 (从 Background)

| 消息 Action | 参数 | 功能 |
|-------------|------|------|
| `SESSIONS_UPDATED` | `sessions[]` | 会话列表更新通知 |
| 其他消息 | - | 透传到 Sandbox |

## 关键依赖与配置

### 核心依赖

- **Chrome APIs**:
  - `chrome.storage.local` - 本地存储
  - `chrome.runtime.sendMessage` - 消息通信
  - `chrome.tabs.create` - 创建标签页

- **第三方库**:
  - `html2canvas` - 导出思维导图 PNG（在 Sidepanel 可信环境中调用）

### 数据流

```
Background ←→ Sidepanel ←→ Sandbox
              ↓ (storage)
         chrome.storage.local
              ↓ (cache)
         localStorage
```

**数据同步策略**：
- 读取：优先使用 `localStorage` 缓存（同步），异步从 `chrome.storage` 获取完整数据
- 写入：同时写入 `chrome.storage`（持久化）和 `localStorage`（加速下次读取）

## 测试与质量

**当前状态**: 无自动化测试

**手动测试**:
- 打开侧边栏，观察骨架屏加载过程
- 检查 DevTools Console 是否有错误
- 测试主题切换、会话管理、下载功能

**建议补充**:
- 集成测试：测试消息转发流程
- 性能测试：测量首屏加载时间
- 边界测试：测试 iframe 加载失败、超时等情况

## 常见问题 (FAQ)

### Q: 骨架屏一直不消失？
A: 检查 Sandbox 是否成功发送 `UI_READY` 信号。有 1 秒安全超时会强制移除骨架屏。

### Q: 主题切换有闪烁？
A: 确认 `localStorage` 缓存正常。iframe 应带主题参数加载。

### Q: 下载功能不工作？
A: 检查浏览器下载权限。某些下载（如 PNG 导出）需要 `html2canvas` 库加载成功。

### Q: 如何调试 Sidepanel？
A: 在侧边栏右键「检查」，或在扩展页面点击 Sidepanel 下的「Inspect」。

## 相关文件清单

**核心文件**:
- `index.html` - Sidepanel HTML 入口
- `index.js` - Sidepanel 脚本入口

**依赖**:
- `../sandbox/index.html` - Sandbox iframe 源
- `../sandbox/vendor/html2canvas.js` - PNG 导出库

---

**最后更新**: 2026-01-03
