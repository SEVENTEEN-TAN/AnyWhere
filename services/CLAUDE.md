# Services 模块

[根目录](../CLAUDE.md) > **services**

> **变更记录 (Changelog)**
> - 2026-01-03 17:12:45: 初始化 services 模块文档

## 模块职责

Services 模块封装与 Gemini API 的通信逻辑，负责：

1. **API 调用** - 通过逆向工程封装的 Gemini API 接口
2. **认证管理** - 提取和管理 Gemini 网页的认证信息
3. **文件上传** - 处理图片、文档等文件上传
4. **流式解析** - 解析 Gemini 的 SSE (Server-Sent Events) 流式响应
5. **Gem 管理** - 获取用户的 Gem 列表
6. **模型管理** - 获取可用的 Gemini 模型列表
7. **会话 API** - 管理对话会话的 Context

## 入口与启动

**核心入口**: `services/gemini_api.js`

**主要导出函数**：
```javascript
export async function sendGeminiMessage(
    text,           // 用户输入文本
    context,        // 会话上下文
    model,          // 模型 ID
    files,          // 文件数组
    signal,         // AbortSignal
    onUpdate,       // 流式更新回调
    gemId           // Gem ID（可选）
)
```

**调用流程**：
```
1. 获取认证参数 (fetchRequestParams)
2. 上传文件（如有）
3. 构建请求体
4. 发送 POST 请求到 Gemini API
5. 解析 SSE 流式响应
6. 调用 onUpdate 回调传递增量文本
7. 返回完整响应和新 Context
```

## 对外接口

### API 函数

| 函数 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `sendGeminiMessage` | `text, context, model, files, signal, onUpdate, gemId` | `{ text, newContext }` | 发送消息到 Gemini |
| `fetchRequestParams` | `userIndex` | `{ SNLM0e, FDriveWEJj1QnjWO }` | 获取认证参数 |
| `uploadFile` | `file, userIndex` | `uploadedUrl` | 上传文件 |
| `parseGeminiLine` | `line` | `{ text?, finished? }` | 解析 SSE 响应行 |
| `fetchGemsList` | `userIndex, forceRefresh` | `{ gems: [...] }` | 获取 Gem 列表 |
| `fetchModelsList` | `userIndex, forceRefresh` | `{ models: [...] }` | 获取模型列表 |
| `getDefaultModels` | - | `models[]` | 获取默认模型列表 |
| `updateModelConfigs` | `models` | - | 更新动态模型配置 |
| `getAllModelConfigs` | - | `configs{}` | 获取所有模型配置 |

### 认证参数

通过解析 Gemini 网页获取：
- **SNLM0e**: 用于 API 请求的认证 token
- **FDriveWEJj1QnjWO**: 用于文件上传的认证 token

**获取方式**：
```javascript
// 打开 gemini.google.com 标签页
const tab = await chrome.tabs.create({ url: 'https://gemini.google.com/', active: false });

// 执行脚本提取认证信息
const result = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
        const scripts = document.querySelectorAll('script');
        // 解析脚本中的 SNlM0e 和 FDriveWEJj1QnjWO
        // ...
    }
});
```

## 关键依赖与配置

### 模型配置

**默认模型** (`DEFAULT_MODEL_CONFIGS`):
```javascript
{
    'gemini-2.5-flash': {
        header: '[1,null,null,null,"9ec249fc9ad08861",null,null,0,[4]]'
    },
    'gemini-2.5-pro': {
        header: '[1,null,null,null,"4af6c7f5da75d65d",null,null,0,[4]]'
    },
    'gemini-3.0-pro': {
        header: '[1,null,null,null,"e6fa609c3fa255c0",null,null,null,[4],null,null,2]',
        extraHeaders: {
            'x-goog-ext-525005358-jspb': '["FE27D76F-C4BB-4ACC-AF79-E6DE3BA30712",1]',
            'x-goog-ext-73010989-jspb': '[0]'
        }
    }
}
```

**动态模型**：
- 从 `models_api.js` 获取最新模型列表
- 支持运行时更新模型配置

### 文件上传

**支持的文件类型**：
- 图片：`image/png`, `image/jpeg`, `image/webp`, `image/gif`
- 文档：`application/pdf`, `text/plain`, 等

**上传流程**：
```javascript
1. 转换为 Blob（如果是 Base64）
2. 构建 FormData
3. POST 到 https://gemini.google.com/upload
4. 解析返回的文件 URL
```

## 数据模型

### 文件对象

```javascript
{
    base64: "data:image/png;base64,...",  // Base64 数据
    type: "image/png",                    // MIME 类型
    name: "screenshot.png"                // 文件名
}
```

### Context 对象

```javascript
{
    conversationId: "c_abc123...",
    responseId: "r_xyz789...",
    choiceId: "rc_def456...",
    // ... 其他上下文参数
}
```

### Gem 对象

```javascript
{
    id: "gem_abc123",
    name: "我的 Gem",
    description: "Gem 描述",
    // ... 其他属性
}
```

### Model 对象

```javascript
{
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    header: "[1,null,null,null,\"...\",null,null,0,[4]]",
    extraHeaders: { ... }  // 可选
}
```

## 测试与质量

**当前状态**: 无自动化测试

**手动测试**:
- 在 Background Service Worker Console 中测试 API 调用
- 使用 `chrome.storage.local.get` 检查缓存的认证参数
- 监控网络请求（DevTools Network 面板）

**建议补充**:
- 单元测试：测试解析器（`parseGeminiLine`）
- 集成测试：Mock Gemini API 响应
- 错误处理测试：测试网络失败、认证失败等场景

## 常见问题 (FAQ)

### Q: 为什么不使用官方 Gemini SDK？
A: 官方 SDK 仅支持 API Key 方式，无法使用网页版 Gemini 的免费额度。通过逆向工程封装网页接口可享受免费使用。

### Q: 认证参数过期怎么办？
A: 认证参数会定期自动刷新。如果失败，需要重新在 [gemini.google.com](https://gemini.google.com) 登录。

### Q: 如何调试 API 调用？
A: 在 Background Service Worker Console 中查看网络请求和响应日志。

### Q: 支持哪些 Gemini 模型？
A: 支持 Gemini 2.5 Flash、2.5 Pro、3.0 Pro，以及用户自定义的 Gem。

### Q: 文件上传失败？
A: 检查文件大小（有上限）、格式是否支持、认证参数是否有效。

## 相关文件清单

**核心文件**:
- `gemini_api.js` - Gemini API 主接口
- `auth.js` - 认证管理（提取 SNLM0e 和 FDriveWEJj1QnjWO）
- `upload.js` - 文件上传
- `parser.js` - SSE 响应解析
- `gems_api.js` - Gem 列表 API
- `models_api.js` - 模型列表 API
- `session_api.js` - 会话 API（Context 管理）
- `gems.js` - Gem 工具函数（已废弃或重复？）

**API 端点**:
- `https://gemini.google.com/_/BardChatUi/data/...` - 主 API 端点
- `https://gemini.google.com/upload` - 文件上传端点
- `https://gemini.google.com/api/...` - 其他 API 端点

---

**最后更新**: 2026-01-03
