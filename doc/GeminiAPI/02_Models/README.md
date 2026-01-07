# 02. 模型发现 (Models)

Gemini 的可用模型列表并不是通过独立的 API 端点动态加载的，而是在页面初次加载时，直接嵌入在 HTML 的全局 JavaScript 对象 `window.WIZ_global_data` 中。

## 1. 数据源定位
- **URL**: `https://gemini.google.com/app`
- **HTTP Method**: `GET`
- **关键对象**: `window.WIZ_global_data`
- **关键属性**: `TSDtV`

## 2. 提取步骤

1.  发送 `GET` 请求获取页面 HTML。
2.  使用正则表达式或 HTML 解析器提取 `window.WIZ_global_data` 的 JSON 内容。
    - 正则示例: `window\.WIZ_global_data\s*=\s*(\{.*?\});`
3.  解析 JSON 对象，读取 `TSDtV` 字段。

## 3. 数据结构示例

`TSDtV` 字段通常是一个字符串数组，包含当前账户可用的所有模型 ID。

```json
{
  "TSDtV": [
    "gemini-2.0-flash",
    "gemini-2.5-flash-preview-04-17",
    "gemini-2.5-flash-preview-05-20",
    "imagen-3.0-generate-001"
  ]
  // ... 其他字段
}
```

## 4. 模型 ID 与选择 (Model IDs & Selection)

虽然 `TSDtV` 提供了可读的模型名称，但在实际的 `StreamGenerate` (Chat) RPC 调用中，Gemini API 使用特定的 HTTP 头来指定模型。

### 关键 Header: `x-goog-ext-525001261-jspb`

该 Header 的值是一个包含模型 Hash ID 的 JSON 数组字符串。

**已知的 Model Hash IDs**:
- **Gemini 2.0 Flash (Fast)**: `56fdd199312815e2`
- **Gemini 2.0 Flash (Thinking)**: `e051ce1aa80aa576`
- **Gemini 3.0 Pro (Default)**: `e6fa609c3fa255c0` (具体 ID 可能随账户或版本变化，请以 `TSDtV` 或实际抓包为准)

**请求示例**:
如果要使用 "Thinking" 模式，需要在 `StreamGenerate` 请求中添加：
```http
x-goog-ext-525001261-jspb: ["e051ce1aa80aa576"]
```
如果不包含此 Header，通常默认为基础模型 (Pro 或 Flash)。
