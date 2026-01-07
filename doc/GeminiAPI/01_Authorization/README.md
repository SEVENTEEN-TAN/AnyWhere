# 01. 授权机制 (Authorization)

Gemini Web API 的授权并不依赖标准的 OAuth 令牌，而是基于浏览器的 **Session Cookies** 和页面上下文中的 **令牌 (Tokens)**。

要成功发起 API 请求，必须正确模拟浏览器的这些状态。

## 1. 必需的 Cookies
所有请求都必须包含以下 Cookie。这些 Cookie 标识了登录的 Google 账户和会话状态。

| Cookie 名称 | 说明 | 示例值 (截断) |
| :--- | :--- | :--- |
| `__Secure-1PSID` | **核心身份凭证**。用于标识主会话。 | `g.a0004ghm...` |
| `__Secure-3PSID` | **核心身份凭证**。用于跨域/第三方上下文。 | `g.a0004ghm...` |
| `SIDCC` | 安全会话标识，通常用于防止重放或验证会话有效性。 | `AKEyXz...` |
| `NID` | 偏好设置 Cookie (可选，但强烈建议包含)。 | `511=...` |

> **⚠️ 安全警告**: 这些 Cookie 具有完全的账户访问权限。**切勿**将其硬编码在公开的代码库中。请使用环境变量或安全的配置文件。

## 2. 关键请求头 (Headers)
为了通过 Google 的反爬虫和安全检查，必须包含以下 HTTP 头：

```http
Content-Type: application/x-www-form-urlencoded;charset=UTF-8
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) ... (建议与真实浏览器一致)
X-Same-Domain: 1
Origin: https://gemini.google.com
Referer: https://gemini.google.com/
```

- **`X-Same-Domain: 1`**: 这是一个 Google 特有的头，用于指示请求来自同一域下的脚本（通常配合 Protobuf 请求使用）。没有它，请求通常会失败。

## 3. 动态令牌与参数
除了静态的 Cookie，每个 API 请求 (`POST`) 还需要从页面上下文中提取特定的动态参数。这些参数通常在页面初次加载 (`GET /app`) 的 HTML 中查找。

### 3.1 `f.sid` (Session ID)
这是当前的会话 ID，通常是一个长整数字符串。
- **获取方式**: 在页面源码中搜索 `FdrFJe` 或直接观察 `batchexecute` 请求的 URL 参数。
- **示例**: `2381316716580828117`

### 3.2 `bl` (Backend Label)
标识后端服务器版本的标签。
- **获取方式**: 在页面源码中搜索 `cfb2h`。
- **示例**: `boq_assistant-bard-web-server_20251217.07_p5`

### 3.3 `at` / `SNlM0e` (Anti-XSRF Token)
这是最重要的安全令牌，用于防止跨站请求伪造。它必须包含在所有 `batchexecute` 请求的表单数据中。
- **变量名**: `SNlM0e` (在 `window.WIZ_global_data` 中)。
- **获取方式**:
    1. 获取 `https://gemini.google.com/app` 的 HTML。
    2. 正则匹配 `SNlM0e":"(.*?)"`。
- **示例**: `APwZiaqNAa2-zGuMmxVaY...`

## 4. 请求构造示例
一个典型的 API 请求 URL 结构如下：

```
POST https://gemini.google.com/_/BardChatUi/data/batchexecute?rpcids=[RPC_ID]&source-path=/app&bl=[BL]&f.sid=[F_SID]&hl=zh-CN&_reqid=[REQ_ID]&rt=c
```

- **`rpcids`**: 要调用的功能 ID (例如 `StreamGenerate` 对应 RPC ID，或直接写在 path 中)。
- **`_reqid`**: 请求计数器。通常从 `1000` 或类似数字开始，每次请求 `+1000` 或 `+1`。

### 代码伪逻辑 (Python 风格)

```python
headers = {
    "Cookie": "__Secure-1PSID=...; __Secure-3PSID=...",
    "X-Same-Domain": "1"
}

params = {
    "bl": "boq_assistant-bard-web-server_...",
    "f.sid": "12345...",
    "rt": "c"
}

data = {
    "f.req": json.dumps([ ... payload ... ]),
    "at": "APwZia..."  # 必须包含
}

response = requests.post(url, headers=headers, params=params, data=data)
```
