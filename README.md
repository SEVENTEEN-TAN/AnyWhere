<div align="center">
  <img src="logo.png" alt="Gemini Nexus" width="80" height="80">
  <h1>Gemini Nexus</h1>
  <p>🚀 一款强大的 AI 助手 Chrome 扩展，由 Google Gemini 驱动</p>
  <p>
    <a href="#features">功能</a> •
    <a href="#installation">安装</a> •
    <a href="#architecture">架构</a> •
    <a href="#usage">使用</a>
  </p>
</div>

---

## ✨ Features

- 🗨️ **侧边栏对话** - 随时与 Gemini 进行 AI 对话
- 📝 **智能总结** - 一键总结网页内容，生成交互式思维导图
- 🖼️ **图像分析** - 上传图片进行 AI 识别和分析
- 🎯 **文本选中工具** - 选中文本后快速提问、翻译、解释
- 🌐 **浏览器控制** - AI 可直接操作浏览器执行任务
- 🔄 **会话管理** - 支持多轮对话和历史记录
- 🌙 **深色/浅色主题** - 自动适配系统主题
- 🌍 **中英双语** - 完整的国际化支持

## 🛠️ Installation

### 开发模式

1. **克隆仓库**
   ```bash
   git clone https://github.com/SEVENTEEN-TAN/gemini-nexus.git
   cd gemini-nexus
   ```

2. **安装依赖**
   ```bash
   npm install
   ```

3. **加载扩展**
   - 打开 Chrome，访问 `chrome://extensions/`
   - 开启「开发者模式」
   - 点击「加载已解压的扩展程序」
   - 选择项目根目录

4. **登录 Gemini**
   - 确保已在 [gemini.google.com](https://gemini.google.com) 登录 Google 账号

## 🏗️ Architecture

```
gemini-nexus/
├── background/          # Service Worker (API 调用、会话管理)
│   ├── handlers/        # 消息处理器
│   └── managers/        # 认证、会话、日志管理
├── content/             # Content Scripts (浮动工具栏)
│   └── toolbar/         # 文本选中工具栏
├── sandbox/             # 沙盒环境 (Markdown 渲染)
│   ├── boot/            # 应用启动逻辑
│   ├── render/          # 内容渲染
│   └── vendor/          # 第三方库 (Marked, KaTeX, Mermaid, Markmap)
├── sidepanel/           # 侧边栏主界面
├── services/            # Gemini API 服务
└── css/                 # 样式文件
```

## 📖 Usage

### 快捷键

| 操作 | 快捷键 |
|------|--------|
| 打开侧边栏 | `Alt + S` |
| 聚焦输入框 | `Ctrl/Cmd + P` |

### 工具按钮

- **📄 总结** - 总结当前网页并生成交互式思维导图
- **🌐 浏览器控制** - 让 AI 控制浏览器执行任务
- **📎 页面上下文** - 将网页内容作为对话上下文
- **📷 OCR** - 截图识别文字
- **✂️ 截图翻译** - 截图并翻译图中文字

## 🔧 Configuration

在设置面板中可配置：

- **模型选择** - 切换 Gemini 模型 (Flash/Pro)
- **账号索引** - 多账号切换
- **工具开关** - 启用/禁用文本选中工具、图像工具

## 📄 License

MIT License

---

<div align="center">
  <sub>Made with ❤️ by SEVENTEEN-TAN</sub>
</div>
