// lib/response_cache.js

/**
 * ✅ P2: LRU (Least Recently Used) 缓存实现
 * 用于缓存 API 响应，提升性能
 */
export class ResponseCache {
    /**
     * @param {number} maxSize - 最大缓存条目数
     */
    constructor(maxSize = 100) {
        this.cache = new Map();
        this.maxSize = maxSize;
    }

    /**
     * 生成缓存键
     * @private
     */
    _hash(request) {
        const key = `${request.text}|${request.model}|${request.gemId || ''}`;
        // 使用简单哈希避免键过长
        return this._simpleHash(key);
    }

    /**
     * 简单哈希函数
     * @private
     */
    _simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return hash.toString(36);
    }

    /**
     * 获取缓存
     * @param {Object} request - 请求对象
     * @returns {Object|null} - 缓存的响应或 null
     */
    get(request) {
        const key = this._hash(request);
        if (this.cache.has(key)) {
            const value = this.cache.get(key);
            // LRU: 移到最后（最近使用）
            this.cache.delete(key);
            this.cache.set(key, value);
            console.log('[Cache] Hit:', request.text.substring(0, 50) + '...');
            return value;
        }
        console.log('[Cache] Miss:', request.text.substring(0, 50) + '...');
        return null;
    }

    /**
     * 设置缓存
     * @param {Object} request - 请求对象
     * @param {Object} response - 响应对象
     */
    set(request, response) {
        const key = this._hash(request);
        
        // 检查缓存大小，删除最早的条目
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
            console.log('[Cache] Evicted oldest entry');
        }
        
        this.cache.set(key, response);
        console.log('[Cache] Stored:', request.text.substring(0, 50) + '...');
    }

    /**
     * 清空缓存
     */
    clear() {
        this.cache.clear();
        console.log('[Cache] Cleared all entries');
    }

    /**
     * 获取缓存大小
     * @returns {number}
     */
    size() {
        return this.cache.size;
    }

    /**
     * 删除特定缓存
     * @param {Object} request - 请求对象
     * @returns {boolean} - 是否删除成功
     */
    delete(request) {
        const key = this._hash(request);
        return this.cache.delete(key);
    }
}
