# 04. Gems 与工具列表 (Gems & Tools)

在提供的日志中，并未发现专门用于“列出所有 Gems”的独立 RPC 请求（如 `ListGems`）。
根据分析，Gems 和集成工具（Extensions）的配置信息主要来源于页面初始加载时的 `window.WIZ_global_data`。

## 1. 系统工具 (System Tools)
从 `window.WIZ_global_data.TSDtV` 中可以找到已启用的系统级工具集成。

**关键数据标识**:
在 `TSDtV` 数组中，查找包含已知工具名称（如 `google_calendar`）的条目。

**日志样本分析**:
```json
[
  45706766,
  null,
  null,
  null,
  null,
  null,
  "sGkvhc",
  [
    "[[\"gemkick_corpus\",\"google_calendar\",\"google_calendar_2\",\"google_keep\",\"google_reminders\",\"keep\",\"reminder\",\"workspace_tool\"]]"
  ]
]
```

- **ID**: `45706766` (此 ID 可能会随版本变动，建议通过内容匹配)
- **内容**: 一个 JSON 字符串数组，列出了当前会话启用的扩展工具。
    - `google_calendar`: Google 日历
    - `google_keep`: Google Keep 笔记
    - `workspace_tool`: Google Workspace 集成

## 2. 自定义 Gems (Custom Gems)
经确认，获取用户自定义 Gems 列表的 RPC 为 `CNgdBe`。

**请求示例**:
- **Endpoint**: `/batchexecute`
- **RPC ID**: `CNgdBe`
- **Payload (`f.req`)**:
  ```json
  [[["CNgdBe","[1,[\"zh-CN\"],0]",null,"generic"]]]
  ```
  - `zh-CN`: 语言代码。
  - `[1, ..., 0]`: 分页或上下文参数。

**响应数据**:
响应中包含用户的 Gems 列表，每个 Gem 包含：
- **ID**: Gem 的唯一标识符（如 `model:gemini-custom-xxx`）。
- **Name**: 显示名称。
- **Instructions**: 预设指令（系统提示词）。

## 3. 在聊天中使用 Gems
要与特定的 Gem 对话，通常需要在 `StreamGenerate` 请求的 `f.req` 中指定该 Gem 的 ID 或模型标识符。

- **标准模型**: 隐式使用（默认）。
- **特定 Gem**: 可能需要修改请求负载中的 `bot_id` 或 `model_params` 字段（对应 `f.req` 数组中的某个 `null` 或预留位）。
