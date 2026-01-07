# Google Gemini API 研究报告

## 概述
本文档详细介绍了 Google Gemini 网络应用程序 (`https://gemini.google.com/app`) 的内部 API。该 API 基于 Google 的 "Batchexecute" 和 RPC 风格，使用包含嵌套 JSON 和类似 Protobuf 结构的 `POST` 请求（URL 编码表单数据 `f.req`）。

## 目录 (Table of Contents)

1.  [**01_Authorization** (身份验证)](01_Authorization/README.md) - Cookie, Headers, Tokens (`f.sid`, `at`).
2.  [**02_Models** (模型发现)](02_Models/README.md) - 从 `WIZ_global_data` 获取可用模型.
3.  [**03_Chat** (聊天交互)](03_Chat/README.md) - `StreamGenerate` API 详解.
4.  [**04_Gems** (Gems 列表)](04_Gems/README.md) - 获取系统工具和自定义 Gems (`CNgdBe`).
5.  [**05_Session** (会话管理)](05_Session/README.md) - 列表 (`MaZiqc`), 内容 (`hNvQHb`), 删除 (`qWymEb`).
6.  [**06_Tools** (工具与图像)](06_Tools/README.md) - 能力检查 (`ESY5D`) 与图像生成.

---

## 概述
本文档详细介绍了 Google Gemini 网络应用程序 (`https://gemini.google.com/app`) 的内部 API。该 API 基于 Google 的 "Batchexecute" 和 RPC 风格，使用包含嵌套 JSON 和类似 Protobuf 结构的 `POST` 请求（URL 编码表单数据 `f.req`）。

## 身份验证 (Authentication)
请求需要标准的 Google 会话 Cookie 以及用于安全和路由的特定查询参数。

### 必需的 Cookie
- `__Secure-1PSID`
- `__Secure-3PSID`
- `SIDCC`
- `NID` (可选但推荐)

### 关键参数
- `bl`: 后端标签 (Backend Label)，例如 `boq_assistant-bard-web-server_20251217.07_p5`。可在 DOM 或初始请求中找到。
- `f.sid`: 会话 ID (Session ID)，例如 `2381316716580828117`。
- `_reqid`: 顺序请求 ID (Sequential Request ID)，递增的整数。
- `rt`: 响应类型 (Response Type)，通常为 `c`。
- `at`: 反 XSRF 令牌 (Anti-XSRF Token)，例如 `APwZiaqNA...`。可在 `window.WIZ_global_data.SNlM0e` 中找到。

## 1. 可用模型 (Available Models)
可用模型列表在页面初始加载 (`GET /app`) 时，通过全局 JavaScript 对象 `window.WIZ_global_data` 进行引导加载。

**数据源:** `window.WIZ_global_data.TSDtV`

**示例数据:**
```json
[
  "gemini-2.0-flash",
  "gemini-2.5-flash-preview-04-17",
  "gemini-2.5-flash-preview-05-20"
]
```

**提取逻辑:**
1.  请求 `https://gemini.google.com/app`。
2.  解析 HTML 以定位 `window.WIZ_global_data`。
3.  提取 `TSDtV` 属性（JSON 数组）。

## 2. 已配置的 Gems (Configured Gems)
用户的 Gems（自定义助手）同样可能在 `WIZ_global_data` 中加载，或者通过专用的 `batchexecute` RPC 获取。
*注意：在已分析的日志中，未明确识别出显式的 Gem 列表 RPC，但在 `WIZ_global_data` 中发现了诸如 `google_calendar`, `workspace_tool` 等工具的引用。*

## 3. 聊天交互 (Chat Interaction - StreamGenerate)
发送消息并接收流式响应。

**端点 (Endpoint):** `POST /_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate`

**请求体 (`f.req`):**
`f.req` 参数是一个 JSON 编码的数组，其中包含 RPC 负载。

```json
[
  null,
  "[[[\"YOUR_MESSAGE\",0,null,null,null,null,0],[\"zh-CN\"],[\"\",\"\",\"\",null,null,null,null,null,null,\"\"],\"CONTEXT_TOKEN\",\"CONVERSATION_ID\",null,[0],1,null,null,1,0,null,null,null,null,null,[[0]],0,null,null,null,null,null,null,null,null,1,null,null,[4],null,null,null,null,null,null,null,null,null,null,[1],null,null,null,null,null,null,null,null,null,null,null,0,null,null,null,null,null,\"CLIENT_ID\",null,[],null,null,null,null,[]]]"
]
```

**关键字段:**
- `YOUR_MESSAGE`: 用户输入的文本内容。
- `CONTEXT_TOKEN`: 以 `!PD-lP...` 开头的长字符串，用于保持对话状态。如果是新对话，可能传 `null` 或空（需进一步验证）。
- `CONVERSATION_ID`: 当前会话的 ID (例如 `c_b48cd2590a75bd23`)。
- `CLIENT_ID`: 客户端会话的 UUID (例如 `385DBE9E-...`)。

**响应格式:**
响应是流式的 JSON 数组（分行或通过封包）。

```json
[["wrb.fr",null,"[null,[\"c_b48cd2590a75bd23\",\"r_a9228903ed365b7c\"],null,null,[[\"rc_...\",[\"响应文本块\"],...]]]"]]
```
- `c_...`: 会话 ID (Conversation ID)。
- `r_...`: 响应 ID (Response ID)。
- 内部数组包含实际的文本块，会增量更新。

## 4. 会话管理 (Session Management)
### 创建会话 (Create Session)
通过 `StreamGenerate` 发送第一条消息时隐式创建。服务器会在响应中返回新的会话 ID (`c_...`)。

### 列表 / 删除 / 重命名 (List / Delete / Rename)
*在提供的日志中未观察到这些操作。*
这些操作通常通过 `/_/BardChatUi/data/batchexecute` 配合特定的 `rpcids` 执行。
- **列表 (List)**: 极有可能包含在初始视图的 `WIZ_global_data` 中，或者是类似 `ListSummaries` 的 RPC。
- **删除 (Delete)**: 可能是 `DeleteSummary` 或 `DeleteConversation` RPC。

## 5. 其他调用 (Capabilities)
**RPC ID:** `ESY5D`
**端点:** `/_/BardChatUi/data/batchexecute`
用于检查客户端/账户的功能特性（例如 `bard_activity_enabled`, `adaptive_device_responses_enabled`）。

**Payload:**
```json
[[["ESY5D","[[[\"bard_activity_enabled\"]]]",null,"generic"]]]
```
