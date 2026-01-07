# 06. 工具与图像生成 (Tools & Image Generation)

Gemini API 支持调用多种内置工具（如图像生成、深度搜索等）。这些功能通常通过标准的聊天接口 (`StreamGenerate`) 触发，但依赖于客户端的能力配置。

## 1. 工具能力检查 (Capabilities Check)

**RPC ID**: `ESY5D`

在初始化或加载特定功能前，客户端会发送一个巨大的配置检查请求，告知服务器当前客户端支持哪些特性（Flags）。

**请求 Payload (`f.req`)**:
这是一个包含大量字符串 Flag 的数组，例如：
```json
[[["ESY5D","[[[\"bard_activity_enabled\",\"enable_advanced_mode\",\"disable_image_upload_tooltip\",...]]]",null,"generic"]]]
```
- **用途**: 协商客户端和服务端的功能支持情况。
- **关联数据**: 响应中通常确认这些特性的启用状态。用户界面的“工具列表”往往来源于此配置或 `window.WIZ_global_data`。

## 2. 图像生成 (Image Generation)

图像生成不是通过独立的 RPC 调用完成的，而是通过**标准聊天交互**包含在对话流中。

### 流程
1.  **用户请求**: 向 `StreamGenerate` 发送自然语言提示词（如“生成一只猫的照片”）。
2.  **模型处理**: 模型识别意图，自己在后端调用图像生成工具。
3.  **响应解析**: 图像数据（URL）嵌入在返回的流式 JSON 中。

### 响应数据结构示例
在 `StreamGenerate` 的响应 JSON 中，查找包含图像 URL 的嵌套数组结构：

```json
[
  null,
  "filename.png",
  "https://lh3.googleusercontent.com/gg-dl/ABS2GS...", 
  null, 
  "$ASc9OV...", 
  null, 
  [1024, 1024] 
]
```
- **URL**: `https://lh3.googleusercontent.com/...` 是生成的图片地址。
- **尺寸**: 结尾的 `[1024, 1024]` 通常表示图片分辨率。
- **有效期**: 这些链接通常有访问时效性。

### 验证方法
观察 `StreamGenerate` 的响应，查找以 `http` 开头并指向 `googleusercontent.com` 的字符串，通常即为生成的图像资源。

## 3. 其他工具 (深度搜索等)
类似图像生成，大多数高级工具（Extension）都是由模型根据上下文自动调用的。
- 客户端无需显式调用 `ExecuteTool`。
- 客户端只需正确传递上下文 (`conversation_id`, `context_token`)，模型会根据 `window.WIZ_global_data` 中声明的可用工具自动决策。
