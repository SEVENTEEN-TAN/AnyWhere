# Phase 1 测试执行步骤

**测试日期**: 2026-01-13
**测试文件**: `.claude/plan/test-phase1.html`

---

## 🚀 快速开始

### 步骤 1: 打开测试页面
```bash
# 在浏览器中打开测试页面
# 方法 1: 直接拖拽 HTML 文件到浏览器
# 方法 2: 使用文件路径
file:///E:/Project/GitHub/AnyWhere/AnyWhere/.claude/plan/test-phase1.html
```

### 步骤 2: 打开开发者工具
1. 打开 `chrome://extensions/`
2. 找到 Anywhere 扩展
3. 点击 "Service Worker" 下的 **Inspect** 按钮
4. 在控制台中准备查看日志

### 步骤 3: 打开扩展侧边栏
- 按 `Alt + S` 或点击扩展图标打开侧边栏

---

## 📋 测试场景执行

### 场景 1: 正常按钮点击 ✅

**AI 指令**:
```
请点击页面上的"正常按钮"
```

**预期行为**:
1. 按钮文本变为 "已点击 ✓"
2. 按钮变为绿色
3. 显示成功状态

**控制台日志检查**:
```
✅ 应该看到: Clicked element xxx at xxx,xxx
✅ 不应该看到: [PreCheck] 警告（因为元素正常）
✅ 不应该看到: JS Fallback
```

**成功标准**:
- [ ] 点击成功
- [ ] 耗时 < 200ms
- [ ] 无错误日志

---

### 场景 2: 禁用按钮（智能等待）⏳

**AI 指令**:
```
请点击页面上的"禁用按钮"
```

**预期行为**:
1. AI 检测到按钮被禁用
2. 等待约 3 秒（按钮自动启用）
3. 成功点击按钮
4. 按钮变为绿色

**控制台日志检查**:
```
✅ 应该看到: [PreCheck] Element xxx is disabled, waiting...
✅ 应该看到: [WaitForHelper] Condition met after X attempts
✅ 应该看到: Clicked element xxx at xxx,xxx
```

**成功标准**:
- [ ] 自动等待 3 秒
- [ ] 等待后成功点击
- [ ] 日志显示等待过程

---

### 场景 3: 被遮挡的按钮 🚧

**准备步骤**:
1. 先点击 "显示遮罩" 按钮（手动或让 AI 点击）
2. 确认遮罩层显示

**AI 指令**:
```
请点击页面上的"被遮挡的按钮"
```

**预期行为**:
1. AI 检测到按钮被遮挡
2. 尝试重新滚动
3. 可能使用 JS Fallback
4. 最终成功点击

**控制台日志检查**:
```
✅ 应该看到: [PreCheck] Element xxx is obscured by another element
✅ 可能看到: Physical click attempt X/3 failed
✅ 可能看到: [JSFallback] Attempting JS click
✅ 最终看到: Clicked element xxx (可能带 JS Fallback)
```

**成功标准**:
- [ ] 检测到遮挡
- [ ] 尝试处理遮挡
- [ ] 最终成功点击

---

### 场景 4: Shadow DOM 按钮 🌓

**AI 指令**:
```
请点击页面上的"Shadow DOM 按钮"
```

**预期行为**:
1. 物理点击可能失败（Shadow DOM 限制）
2. 自动使用 JS Fallback
3. 成功点击 Shadow DOM 内的按钮
4. 按钮变为绿色

**控制台日志检查**:
```
✅ 可能看到: Physical click failed, attempting JS fallback
✅ 应该看到: [JSFallback] Attempting JS click for xxx
✅ 应该看到: [JSFallback] Successfully clicked element in Shadow DOM
✅ 应该看到: Clicked element xxx (JS Fallback)
```

**成功标准**:
- [ ] JS Fallback 成功
- [ ] 日志显示 Shadow DOM 检测
- [ ] 按钮状态正确更新

---

### 场景 5: 动态加载按钮 ⏱️

**准备步骤**:
1. 先点击 "触发动态加载" 按钮
2. 等待 2 秒（按钮会出现）

**AI 指令（使用自定义重试配置）**:
```
请点击页面上的"动态加载的按钮"，如果失败请重试最多 5 次
```

**预期行为**:
1. 前几次尝试失败（元素未加载）
2. 自动重试
3. 2 秒后元素加载完成
4. 成功点击

**控制台日志检查**:
```
✅ 应该看到: Physical click attempt 1/X failed
✅ 应该看到: Physical click attempt 2/X failed
✅ 应该看到: Clicked element xxx at xxx,xxx
```

**成功标准**:
- [ ] 显示重试日志
- [ ] 元素加载后成功点击
- [ ] 重试次数合理（2-3次）

---

## 🔍 日志分析指南

### 正常流程日志
```
1. Clicked element xxx at xxx,xxx
   → 物理点击成功，无需 Fallback
```

### 预检查流程日志
```
1. [PreCheck] Element xxx is not visible, waiting...
2. [WaitForHelper] Condition met after 15 attempts
3. Clicked element xxx at xxx,xxx
   → 等待元素可见后成功点击
```

### 重试流程日志
```
1. Physical click attempt 1/3 failed: No box model found
2. Physical click attempt 2/3 failed: No box model found
3. [JSFallback] Attempting JS click for xxx
4. Clicked element xxx (JS Fallback)
   → 物理点击失败，Fallback 成功
```

### Shadow DOM 流程日志
```
1. Physical click failed, attempting JS fallback: ...
2. [JSFallback] Attempting JS click for xxx
3. [JSFallback] Successfully clicked element in Shadow DOM
4. Clicked element xxx (JS Fallback)
   → Shadow DOM 元素通过 Fallback 成功点击
```

---

## ✅ 测试检查清单

### 功能验证
- [ ] 场景 1: 正常点击成功
- [ ] 场景 2: 智能等待成功
- [ ] 场景 3: 遮挡处理成功
- [ ] 场景 4: Shadow DOM 支持成功
- [ ] 场景 5: 重试机制成功

### 日志验证
- [ ] 预检查日志清晰
- [ ] 重试日志显示次数
- [ ] Fallback 日志详细
- [ ] Shadow DOM 检测正确

### 性能验证
- [ ] 正常场景耗时 < 200ms
- [ ] 等待场景耗时合理（~3秒）
- [ ] 重试场景耗时合理（~1-2秒）

### 错误处理
- [ ] 无未捕获的异常
- [ ] 错误信息清晰
- [ ] 失败后有明确提示

---

## 🐛 常见问题排查

### 问题 1: 点击没有反应
**可能原因**:
- 扩展未正确加载
- Service Worker 未运行
- 页面未正确加载

**解决方法**:
1. 刷新扩展页面
2. 重新加载测试页面
3. 检查控制台错误

### 问题 2: 日志没有显示
**可能原因**:
- 未打开 Service Worker 控制台
- 日志被过滤

**解决方法**:
1. 确认在 Service Worker 控制台中查看
2. 检查控制台过滤器设置

### 问题 3: Shadow DOM 测试失败
**可能原因**:
- Shadow DOM 未正确创建
- UID 属性未设置

**解决方法**:
1. 检查页面元素结构
2. 确认 Shadow Root 已创建

---

## 📊 测试报告模板

```markdown
## Phase 1 测试报告

**测试日期**: 2026-01-13
**测试人员**: [您的名字]

### 测试结果
- 场景 1: ✅ 通过 / ❌ 失败
- 场景 2: ✅ 通过 / ❌ 失败
- 场景 3: ✅ 通过 / ❌ 失败
- 场景 4: ✅ 通过 / ❌ 失败
- 场景 5: ✅ 通过 / ❌ 失败

### 发现的问题
1. [问题描述]
2. [问题描述]

### 性能数据
- 正常点击平均耗时: XXms
- 等待场景平均耗时: XXms
- 重试场景平均耗时: XXms

### 建议
- [改进建议]
```

---

## 🎯 下一步

测试完成后：
1. 填写测试报告
2. 记录发现的问题
3. 决定是否需要调整
4. 考虑是否继续 Phase 2 优化

---

**创建者**: Claude Code (Sonnet 4.5)
**相关文档**:
- `.claude/plan/Phase1-测试指南.md`
- `.claude/plan/Phase1-实施总结.md`
