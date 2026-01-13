/**
 * 全局类型声明文件
 * 用于扩展 Window 接口和声明全局变量
 */

interface Window {
  /**
   * KaTeX - LaTeX 数学公式渲染库
   * 通过 <script> 标签加载到全局环境
   */
  katex?: {
    renderToString: (tex: string, options?: any) => string;
    render: (tex: string, element: HTMLElement, options?: any) => void;
    [key: string]: any;
  };

  /**
   * Markmap - 思维导图渲染库
   */
  markmap?: {
    Markmap?: any;
    Transformer?: any;
    UrlBuilder?: any;
    [key: string]: any;
  };

  /**
   * Mermaid - 图表渲染库
   */
  mermaid?: any;

  /**
   * D3 - 数据可视化库
   */
  d3?: any;

  /**
   * Marked - Markdown 解析库
   */
  marked?: {
    parse: (markdown: string, options?: any) => string;
    [key: string]: any;
  };

  /**
   * Highlight.js - 代码高亮库
   */
  hljs?: {
    highlight: (code: string, options: { language: string }) => { value: string };
    highlightAuto: (code: string) => { value: string; language: string };
    getLanguage: (name: string) => any;
    [key: string]: any;
  };

  /**
   * Gemini Extension - Content Script 全局变量
   */
  GeminiScrollUtils?: any;
  GeminiElementPicker?: any;
  GeminiNexusOverlay?: any;
  GeminiToolbarController?: any;
  GeminiSelectionObserver?: any;
  GeminiToolbarStrings?: any;
  GeminiToolbarActions?: any;
  GeminiRendererBridge?: any;
  GeminiToolbarUI?: any;
  GeminiImageDetector?: any;
  GeminiStreamHandler?: any;
  GeminiInputManager?: any;
  GeminiToolbarDispatcher?: any;
  GeminiImageCropper?: any;
  GeminiViewUtils?: any;
  GeminiToolbarEvents?: any;
  GeminiToolbarIcons?: any;
  GeminiStyles?: any;
  GeminiToolbarStyles?: any;
  GeminiToolbarTemplates?: any;
  GeminiToolbarUIActions?: any;
  GeminiCodeCopyHandler?: any;
  GeminiUIGrammar?: any;
  GeminiToolbarDOM?: any;
  GeminiToolbarView?: any;
  GeminiDragController?: any;
  GeminiUIRenderer?: any;

  _geminiElementPickerListenerAdded?: boolean;
}

/**
 * 全局变量声明（直接使用，不带 window 前缀）
 */

/**
 * KaTeX - LaTeX 数学公式渲染库
 */
declare const katex: {
  renderToString: (tex: string, options?: any) => string;
  render: (tex: string, element: HTMLElement, options?: any) => void;
  [key: string]: any;
} | undefined;

/**
 * Marked - Markdown 解析库
 */
declare const marked: {
  parse: (markdown: string, options?: any) => string;
  [key: string]: any;
} | undefined;

/**
 * Highlight.js - 代码语法高亮库
 */
declare const hljs: {
  highlight: (code: string, options: { language: string }) => { value: string };
  highlightAuto: (code: string) => { value: string; language: string };
  getLanguage: (name: string) => any;
  [key: string]: any;
} | undefined;

/**
 * renderMathInElement - KaTeX auto-render 扩展函数
 * 自动在 DOM 元素中查找并渲染数学公式
 */
declare function renderMathInElement(
  elem: HTMLElement,
  options?: {
    delimiters?: Array<{
      left: string;
      right: string;
      display: boolean;
    }>;
    throwOnError?: boolean;
    strict?: boolean | string;
    [key: string]: any;
  }
): void;
