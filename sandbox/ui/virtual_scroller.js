// sandbox/ui/virtual_scroller.js

/**
 * ✅ P2: 虚拟滚动优化 - 用于大量消息列表
 * 只渲染可见区域的消息，提升性能
 */
export class VirtualScroller {
    /**
     * @param {HTMLElement} container - 容器元素
     * @param {Array} items - 数据数组
     * @param {Function} renderItem - 渲染单项的函数 (item, index) => HTMLElement
     * @param {Object} options - 配置选项
     */
    constructor(container, items, renderItem, options = {}) {
        this.container = container;
        this.items = items;
        this.renderItem = renderItem;
        
        // 配置
        this.estimatedItemHeight = options.estimatedItemHeight || 100;
        this.overscan = options.overscan || 3; // 上下额外渲染的项数
        this.threshold = options.threshold || 50; // 启用虚拟滚动的最小项数
        
        // 状态
        this.visibleRange = { start: 0, end: 20 };
        this.itemHeights = new Map(); // 缓存实际高度
        this.enabled = items.length > this.threshold;
        
        // 初始化
        this._init();
    }

    /**
     * 初始化
     * @private
     */
    _init() {
        if (!this.enabled) {
            // 项目少，直接渲染全部
            this._renderAll();
            return;
        }

        // 创建滚动容器结构
        this.scrollContainer = document.createElement('div');
        this.scrollContainer.style.height = `${this.items.length * this.estimatedItemHeight}px`;
        this.scrollContainer.style.position = 'relative';
        
        this.content = document.createElement('div');
        this.content.style.position = 'absolute';
        this.content.style.top = '0';
        this.content.style.left = '0';
        this.content.style.right = '0';
        
        this.scrollContainer.appendChild(this.content);
        this.container.appendChild(this.scrollContainer);
        
        // 监听滚动
        this.container.addEventListener('scroll', this._handleScroll.bind(this));
        
        // 首次渲染
        this._render();
    }

    /**
     * 渲染全部（非虚拟滚动）
     * @private
     */
    _renderAll() {
        const fragment = document.createDocumentFragment();
        this.items.forEach((item, index) => {
            const el = this.renderItem(item, index);
            fragment.appendChild(el);
        });
        this.container.innerHTML = '';
        this.container.appendChild(fragment);
    }

    /**
     * 处理滚动事件
     * @private
     */
    _handleScroll() {
        if (!this.enabled) return;
        
        const scrollTop = this.container.scrollTop;
        const containerHeight = this.container.clientHeight;
        
        // 计算可见范围
        const startIndex = Math.floor(scrollTop / this.estimatedItemHeight);
        const endIndex = Math.ceil((scrollTop + containerHeight) / this.estimatedItemHeight);
        
        // 添加 overscan
        const newStart = Math.max(0, startIndex - this.overscan);
        const newEnd = Math.min(this.items.length, endIndex + this.overscan);
        
        // 判断是否需要重新渲染
        if (newStart !== this.visibleRange.start || newEnd !== this.visibleRange.end) {
            this.visibleRange = { start: newStart, end: newEnd };
            this._render();
        }
    }

    /**
     * 渲染可见项
     * @private
     */
    _render() {
        if (!this.enabled) return;
        
        const fragment = document.createDocumentFragment();
        
        for (let i = this.visibleRange.start; i < this.visibleRange.end; i++) {
            if (i >= this.items.length) break;
            
            const item = this.items[i];
            const el = this.renderItem(item, i);
            
            // 记录实际高度
            el.dataset.index = i;
            fragment.appendChild(el);
        }
        
        // 计算偏移
        const offset = this.visibleRange.start * this.estimatedItemHeight;
        this.content.style.transform = `translateY(${offset}px)`;
        
        // 替换内容
        this.content.innerHTML = '';
        this.content.appendChild(fragment);
    }

    /**
     * 更新数据
     * @param {Array} newItems - 新数据数组
     */
    update(newItems) {
        this.items = newItems;
        this.enabled = newItems.length > this.threshold;
        
        if (!this.enabled) {
            this._renderAll();
        } else {
            // 更新滚动容器高度
            this.scrollContainer.style.height = `${this.items.length * this.estimatedItemHeight}px`;
            this._render();
        }
    }

    /**
     * 滚动到指定项
     * @param {number} index - 项索引
     */
    scrollToIndex(index) {
        if (index < 0 || index >= this.items.length) return;
        
        const offset = index * this.estimatedItemHeight;
        this.container.scrollTop = offset;
    }

    /**
     * 滚动到底部
     */
    scrollToBottom() {
        this.scrollToIndex(this.items.length - 1);
    }

    /**
     * 销毁
     */
    destroy() {
        if (this.container) {
            this.container.removeEventListener('scroll', this._handleScroll.bind(this));
            this.container.innerHTML = '';
        }
    }
}
