// sandbox/controllers/models_controller.js

export class ModelsController {
    constructor() {
        this.models = [];
        this.isLoading = false;
        this.modelSelects = [];
    }

    /**
     * Register model select elements to be populated with models
     * @param {HTMLSelectElement[]} selects - Array of model select elements
     */
    registerModelSelects(selects) {
        this.modelSelects = selects;
    }

    /**
     * Fetch models list from background
     * @param {boolean} forceRefresh - Force refresh bypassing cache
     * @returns {Promise<Array>} Array of model objects
     */
    async fetchModels(forceRefresh = false) {
        if (this.isLoading) {
            console.log('[ModelsController] Already loading models...');
            return this.models;
        }

        this.isLoading = true;
        console.log('[ModelsController] Fetching models list...');

        try {
            const response = await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Request timeout after 15 seconds'));
                }, 15000);

                const messageId = `models_${Date.now()}`;

                const handleResponse = (event) => {
                    if (event.data.action === 'MODELS_LIST_RESPONSE' && 
                        event.data.messageId === messageId) {
                        clearTimeout(timeout);
                        window.removeEventListener('message', handleResponse);
                        resolve(event.data.response);
                    }
                };

                window.addEventListener('message', handleResponse);

                // Send to parent (sidepanel)
                window.parent.postMessage({
                    action: 'FETCH_MODELS_LIST',
                    messageId: messageId,
                    userIndex: '0',
                    forceRefresh: forceRefresh
                }, '*');
            });

            if (response && response.models && response.models.length > 0) {
                this.models = response.models;
                console.log(`[ModelsController] Loaded ${this.models.length} models`);
                this.populateModelSelects();
                return this.models;
            } else if (response && response.error) {
                console.error('[ModelsController] API error:', response.error);
                return [];
            } else {
                console.warn('[ModelsController] No models found, using defaults');
                return [];
            }
        } catch (error) {
            console.error('[ModelsController] Error fetching models:', error);
            return [];
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * Populate model select elements with fetched models
     */
    populateModelSelects() {
        if (!this.models || this.models.length === 0) {
            console.warn('[ModelsController] No models to populate');
            return;
        }

        console.log(`[ModelsController] ===== 开始填充模型列表 =====`);
        console.log(`[ModelsController] 获取到 ${this.models.length} 个模型:`, this.models);

        this.modelSelects.forEach((select, index) => {
            // Save current value
            const currentValue = select.value;
            console.log(`[ModelsController] 选择器 #${index} 当前值: ${currentValue}`);

            // Find or create "Standard Models" optgroup
            let modelGroup = select.querySelector('optgroup[label="Standard Models"]');
            if (!modelGroup) {
                modelGroup = document.createElement('optgroup');
                modelGroup.label = 'Standard Models';
                // Insert at the beginning
                select.insertBefore(modelGroup, select.firstChild);
                console.log(`[ModelsController] 创建了 "Standard Models" 分组`);
            }

            // Clear existing options in this group
            modelGroup.innerHTML = '';

            // Add model options
            for (const model of this.models) {
                const option = document.createElement('option');
                option.value = model.id;
                option.textContent = model.name || model.id;
                modelGroup.appendChild(option);
                console.log(`[ModelsController] 添加模型: ${model.id} (${model.name})`);
            }

            // Restore previous selection if it exists
            const optionExists = Array.from(select.options).some(opt => opt.value === currentValue);
            if (optionExists) {
                select.value = currentValue;
                console.log(`[ModelsController] 恢复选中值: ${currentValue}`);
            } else if (select.options.length > 0) {
                // Select first option if previous value doesn't exist
                select.value = select.options[0].value;
                console.log(`[ModelsController] 前值不存在,选中第一个选项: ${select.options[0].value}`);
            }

            console.log(`[ModelsController] 选择器 #${index} 最终共有 ${select.options.length} 个选项`);
        });
        
        console.log(`[ModelsController] ===== 模型列表填充完成 =====`);
    }

    /**
     * Get model by ID
     * @param {string} modelId - Model identifier
     * @returns {object|null} Model object or null
     */
    getModelById(modelId) {
        return this.models.find(m => m.id === modelId) || null;
    }

    /**
     * Get all models
     * @returns {Array} All models
     */
    getAllModels() {
        return this.models;
    }
}
