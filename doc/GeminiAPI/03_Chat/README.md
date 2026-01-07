# 03. 聊天功能 (Chat)

聊天交互是 Gemini API 的核心。它使用 `StreamGenerate` RPC 发送用户消息并接收流式响应。

## 1. 端点信息
- **URL**: `https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate`
- **Method**: `POST`
- **Content-Type**: `application/x-www-form-urlencoded;charset=UTF-8`

## 2. 请求参数 (Query Parameters)
在 URL 中必须包含以下参数 (详见 `01_Authorization`):
- `f.sid`: Session ID
- `_reqid`: Request ID (递增)
- `rt`: `c`

### HTTP Headers
除了标准的 Cookie 和 Origin 外，模型选择依赖于特殊的扩展头：
- **`x-goog-ext-525001261-jspb`**: 用于指定使用的模型 (Model Hash ID)。
  - 示例: `["e051ce1aa80aa576"]` (Thinking Mode)

## 3. 请求负载 (Payload)
`POST` body 中包含 `f.req` 和 `at`。

### `at`
反 XSRF 令牌。

### `f.req` (核心负载)
这是一个 JSON 编码的数组，其结构高度嵌套。以下是其基本结构的解构：

```json
[
  null,
  "[[[\"YOUR_MESSAGE\",0,null,null,null,null,0],[\"zh-CN\"],[\"\",\"\",\"\",null,null,null,null,null,null,\"\"],\"CONTEXT_TOKEN\",\"CONVERSATION_ID\",null,[0],1,null,null,1,0,null,null,null,null,null,[[0]],0,null,null,null,null,null,null,null,null,1,null,null,[4],null,null,null,null,null,null,null,null,null,null,[1],null,null,null,null,null,null,null,null,null,null,null,0,null,null,null,null,null,\"CLIENT_ID\",null,[],null,null,null,null,[]]]"
]
```

可以看到，外层是一个数组 `[null, "JSON_STRING"]`。那个 `JSON_STRING` 才是真正的 RPC 参数。我们需要再次解码该字符串。

**内部结构 (JSON_STRING 解码后):**

```json
[
  [
    ["YOUR_MESSAGE", 0, null, null, null, null, 0], // Index 0: 消息内容
    ["zh-CN"],                                      // Index 1: 语言代码
    ["", "", "", null, ...],                        // Index 2: 看起来像是一些上下文或预留字段
    "CONTEXT_TOKEN",                                // Index 3: 上下文令牌 (!PD-lP...)
    "CONVERSATION_ID",                              // Index 4: 会话 ID (c_...)
    null,
    [0],
    1,
    // ... 更多参数
    "CLIENT_ID",                                    // Index 32 (大约): 客户端 ID (UUID)
    // ...
  ]
]
```

- **`YOUR_MESSAGE`**: 用户输入的文本。
- **`CONTEXT_TOKEN`**:维持多轮对话的关键。
    - **新会话**: 留空或 `null` (需测试)。
    - **后续对话**: 从上一轮响应中提取。通常以 `!PD-lP` 开头。
- **`CONVERSATION_ID`**:
    - **新会话**: 留空或 `null`。
    - **后续对话**: 从上一轮响应中提取 (例如 `c_b48cd2590...`)。
- **`CLIENT_ID`**: 客户端生成的 UUID，用于标识当前浏览器标签页/会话实例。

## 4. 响应解析 (Streaming Response)
响应内容是一系列 JSON 数组，第一行通常是长度前缀，或者以 `)]}'` 开头的防 Hijack 前缀。

**典型的响应行:**

```json
[["wrb.fr",null,"[\"wrb.fr\",\"rc_...\",\"[...]\"]"]]
```

响应数据同样包含在嵌套的 JSON 字符串中。

**解析逻辑:**
1.  **分块读取**: 响应是流式的，需要按行或按块读取。
2.  **去前缀**: 去掉 `)]}'` (如果存在)。
3.  **JSON 解析**: 解析外层数组。
4.  **寻找 `wrb.fr`**: 这是一个标记，表示包含文本响应的块。
5.  **提取文本**: 在嵌套结构中，通常在 `payload[0][2]` (再次 JSON 解析) -> `payload[4][0][1][0]` 附近可以找到生成的文本。

**响应数据关键字段:**
- **生成的文本**: 机器人的回答。
- **Conversation ID (`c_...`)**: 用于下一轮对话。
- **Response ID (`r_...`)**: 当前响应的唯一 ID。
- **Context Token**: 用于下一轮对话的上下文。
