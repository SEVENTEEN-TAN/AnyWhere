// lib/performance_monitor.js

/**
 * ✅ P1: 性能监控工具类
 * 用于监控关键路径的性能指标
 */
export class PerformanceMonitor {
    static enabled = true; // 可通过设置禁用

    /**
     * 标记性能测量点
     * @param {string} name - 标记名称
     */
    static mark(name) {
        if (!this.enabled || typeof performance === 'undefined') return;
        try {
            performance.mark(name);
        } catch (e) {
            console.warn('[Perf] Mark failed:', e);
        }
    }

    /**
     * 测量两个标记点之间的时间
     * @param {string} name - 测量名称
     * @param {string} startMark - 起始标记
     * @param {string} endMark - 结束标记
     * @returns {number|null} - 持续时间（毫秒）
     */
    static measure(name, startMark, endMark) {
        if (!this.enabled || typeof performance === 'undefined') return null;
        
        try {
            performance.measure(name, startMark, endMark);
            const measure = performance.getEntriesByName(name)[0];
            const duration = measure.duration;
            
            // 输出到控制台（开发模式）
            if (duration > 100) {
                console.warn(`[Perf] ${name}: ${duration.toFixed(2)}ms (⚠️ slow)`);
            } else {
                console.log(`[Perf] ${name}: ${duration.toFixed(2)}ms`);
            }
            
            // 清理标记和测量
            performance.clearMarks(startMark);
            performance.clearMarks(endMark);
            performance.clearMeasures(name);
            
            return duration;
        } catch (e) {
            console.warn('[Perf] Measurement failed:', e);
            return null;
        }
    }

    /**
     * 便捷方法：自动测量函数执行时间
     * @param {string} name - 测量名称
     * @param {Function} fn - 要执行的函数
     * @returns {any} - 函数返回值
     */
    static async measureAsync(name, fn) {
        const startMark = `${name}-start`;
        const endMark = `${name}-end`;
        
        this.mark(startMark);
        try {
            const result = await fn();
            this.mark(endMark);
            this.measure(name, startMark, endMark);
            return result;
        } catch (e) {
            this.mark(endMark);
            this.measure(name, startMark, endMark);
            throw e;
        }
    }

    /**
     * 同步版本的 measureAsync
     * @param {string} name - 测量名称
     * @param {Function} fn - 要执行的函数
     * @returns {any} - 函数返回值
     */
    static measureSync(name, fn) {
        const startMark = `${name}-start`;
        const endMark = `${name}-end`;
        
        this.mark(startMark);
        try {
            const result = fn();
            this.mark(endMark);
            this.measure(name, startMark, endMark);
            return result;
        } catch (e) {
            this.mark(endMark);
            this.measure(name, startMark, endMark);
            throw e;
        }
    }

    /**
     * 获取所有性能指标
     * @returns {Array} - 性能指标数组
     */
    static getMetrics() {
        if (typeof performance === 'undefined') return [];
        return performance.getEntries();
    }

    /**
     * 清除所有性能指标
     */
    static clearAll() {
        if (typeof performance === 'undefined') return;
        performance.clearMarks();
        performance.clearMeasures();
    }

    /**
     * 启用/禁用性能监控
     * @param {boolean} enabled
     */
    static setEnabled(enabled) {
        this.enabled = enabled;
    }
}
