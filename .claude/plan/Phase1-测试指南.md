# Phase 1 功能测试指南

**测试日期**: 2026-01-13
**测试目标**: 验证点击预检查、Shadow DOM 支持、智能重试功能

---

## 🎯 测试准备

### 1. 启动扩展
1. 打开 `chrome://extensions/`
2. 确保 Anywhere 扩展已加载
3. 点击 Service Worker 的 "Inspect" 打开控制台

### 2. 打开测试页面
使用下面的测试 HTML 文件（稍后创建）

---

## 📋 测试场景

### 场景 1: 正常按钮点击
**目的**: 验证基本功能和预检查不影响正常操作

**步骤**:
1. 打开测试页面
2. 让 AI 点击 "正常按钮"
3. 观察控制台日志

**预期结果**:
- ✅ 按钮成功点击
- ✅ 日志显示预检查通过
- ✅ 总耗时 < 200ms

---

### 场景 2: 禁用按钮（3秒后启用）
**目的**: 验证智能等待功能

**步骤**:
1. 刷新测试页面
2. 让 AI 点击 "禁用按钮"
3. 观察按钮在 3 秒后自动启用

**预期结果**:
- ✅ 日志显示 `[PreCheck] Element is disabled, waiting...`
- ✅ 等待约 3 秒后成功点击
- ✅ 按钮文本变为 "已点击"

---

### 场景 3: 被遮挡的按钮
**目的**: 验证遮挡检测和处理

**步骤**:
1. 点击 "显示遮罩" 按钮
2. 让 AI 点击被遮挡的按钮
3. 观察是否成功点击

**预期结果**:
- ✅ 日志显示 `[PreCheck] Element is obscured`
- ✅ 尝试重新滚动
- ✅ 最终使用 JS Fallback 成功点击

---

### 场景 4: Shadow DOM 按钮
**目的**: 验证 Shadow DOM 支持

**步骤**:
1. 让 AI 点击 Shadow DOM 内的按钮
2. 观察控制台日志

**预期结果**:
- ✅ 物理点击可能失败
- ✅ JS Fallback 成功
- ✅ 日志显示 `Successfully clicked element in Shadow DOM`

---

### 场景 5: 动态加载按钮
**目的**: 验证重试机制

**步骤**:
1. 点击 "触发动态加载" 按钮
2. 让 AI 点击动态加载的按钮（2秒后出现）
3. 使用自定义重试配置

**预期结果**:
- ✅ 前几次尝试失败（元素未加载）
- ✅ 日志显示重试次数
- ✅ 元素加载后成功点击

---

## 🔍 日志检查清单

在 Service Worker 控制台中查找以下日志：

### 预检查日志
```
[PreCheck] Element xxx is not visible, waiting...
[PreCheck] Element xxx is disabled, waiting...
[PreCheck] Element xxx is obscured by another element
```

### 重试日志
```
Physical click attempt 1/3 failed: ...
Physical click attempt 2/3 failed: ...
```

### Fallback 日志
```
[JSFallback] Attempting JS click for xxx
[JSFallback] Successfully clicked element in Shadow DOM
```

---

## ✅ 成功标准

- [ ] 所有 5 个场景测试通过
- [ ] 日志输出清晰易懂
- [ ] 没有未捕获的错误
- [ ] 性能开销可接受（正常场景 < 200ms）

---

**下一步**: 创建测试 HTML 页面
