# 05. 会话管理 (Session Management)

本章节详细说明如何管理用户的会话（Conversations），包括获取列表、读取历史记录以及删除会话。

## 1. 获取会话列表 (List Sessions)

**RPC Endpoint**: `/batchexecute`
**RPC ID**: `MaZiqc`

### 请求 Payload (`f.req`)
```json
[[["MaZiqc","[13,null,[1,null,1]]",null,"generic"]]]
```
- `13`: 可能表示请求的条目数量或分页大小。

### 响应解析
响应包含一个会话元数据列表，每个条目通常包含：
- **Conversation ID**: 会话的唯一标识符（以 `c_` 开头，如 `c_b48cd2590a75bd23`）。
- **Title**: 会话标题。
- **Timestamp**: 最后一次交互的时间戳。

---

## 2. 获取会话内容 (Get Session Content)

**RPC Endpoint**: `/batchexecute`
**RPC ID**: `hNvQHb`

### 请求 Payload (`f.req`)
```json
[[["hNvQHb","[\"c_b48cd2590a75bd23\",10,null,1,[0],[4],null,1]",null,"generic"]]]
```
**关键参数**:
1.  `"c_b48cd2590a75bd23"`: **Conversation ID** (目标会话 ID)。
2.  `10`: 获取的消息数量（分页大小）。
3.  `[0],[4]`: 数据类型过滤器（可能对应文本、工具响应等）。

### 响应解析
返回该会话的历史消息记录，包含用户输入 (`User`) 和模型回复 (`Model`)，以及相关的上下文信息。

---

## 3. 删除会话 (Delete Session)

**RPC Endpoint**: `/batchexecute`
**RPC ID**: `qWymEb`

### 请求 Payload (`f.req`)
```json
[[["qWymEb","[\"c_b48cd2590a75bd23\",[1,null,0,1]]",null,"generic"]]]
```
**关键参数**:
1.  `"c_b48cd2590a75bd23"`: **Conversation ID** (要删除的会话 ID)。

### 注意事项
- 删除操作是不可逆的。
- 成功响应通常比较简洁，仅确认操作完成。

---

## 4. 总结
| 操作 | RPC ID | 关键参数 |
| :--- | :--- | :--- |
| **列表** | `MaZiqc` | 分页参数 |
| **内容** | `hNvQHb` | `conversation_id`, `limit` |
| **删除** | `qWymEb` | `conversation_id` |
