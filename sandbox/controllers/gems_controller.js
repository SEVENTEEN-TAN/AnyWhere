// sandbox/controllers/gems_controller.js

export class GemsController {
    constructor() {
        this.gems = [];
        this.isLoading = false;
        this.modelSelects = [];
    }

    /**
     * Register model select elements to be populated with Gems
     * @param {HTMLSelectElement[]} selects - Array of model select elements
     */
    registerModelSelects(selects) {
        this.modelSelects = selects;
    }

    /**
     * Fetch Gems list from background
     * @param {boolean} forceRefresh - Force refresh bypassing cache
     * @returns {Promise<Array>} Array of Gem objects
     */
    async fetchGems(forceRefresh = false) {
        if (this.isLoading) {
            console.log('[GemsController] Already loading Gems...');
            return this.gems;
        }

        this.isLoading = true;
        console.log('[GemsController] Fetching Gems list...');

        try {
            const response = await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Request timeout after 15 seconds'));
                }, 15000);

                const messageId = `gems_${Date.now()}`;

                const handleResponse = (event) => {
                    if (event.data.action === 'GEMS_LIST_RESPONSE' && 
                        event.data.messageId === messageId) {
                        clearTimeout(timeout);
                        window.removeEventListener('message', handleResponse);
                        resolve(event.data.response);
                    }
                };

                window.addEventListener('message', handleResponse);

                // Send to parent (sidepanel)
                window.parent.postMessage({
                    action: 'FETCH_GEMS_LIST',
                    messageId: messageId,
                    userIndex: '0', // You can make this configurable
                    forceRefresh: forceRefresh
                }, '*');
            });

            if (response && response.gems && response.gems.length > 0) {
                this.gems = response.gems;
                console.log(`[GemsController] Loaded ${this.gems.length} Gems`);
                this.populateModelSelects();
                return this.gems;
            } else if (response && response.error) {
                console.error('[GemsController] API error:', response.error);
                return [];
            } else {
                console.warn('[GemsController] No Gems found');
                return [];
            }
        } catch (error) {
            console.error('[GemsController] Error fetching Gems:', error);
            return [];
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * Populate all registered model select elements with Gems
     */
    populateModelSelects() {
        if (!this.gems || this.gems.length === 0) {
            console.warn('[GemsController] No Gems to populate');
            return;
        }

        console.log(`[GemsController] ===== 开始填充Gem列表 =====`);
        console.log(`[GemsController] 获取到 ${this.gems.length} 个Gems:`, this.gems);

        this.modelSelects.forEach((select, index) => {
            if (!select) return;

            const currentValue = select.value;
            console.log(`[GemsController] 选择器 #${index} 当前值: ${currentValue}`);
            
            // Remove old Gem options (those with gem: prefix)
            const optionsToRemove = [];
            for (let i = 0; i < select.options.length; i++) {
                if (select.options[i].value.startsWith('gem:')) {
                    optionsToRemove.push(select.options[i]);
                }
            }
            if (optionsToRemove.length > 0) {
                console.log(`[GemsController] 移除 ${optionsToRemove.length} 个旧的Gem选项`);
                optionsToRemove.forEach(opt => opt.remove());
            }

            // Add optgroup for Gems
            let gemGroup = select.querySelector('optgroup[label="Google Gems"]');
            if (!gemGroup) {
                gemGroup = document.createElement('optgroup');
                gemGroup.label = 'Google Gems';
                select.appendChild(gemGroup);
                console.log(`[GemsController] 创建了 "Google Gems" 分组`);
            } else {
                // Clear existing Gem options in the group
                gemGroup.innerHTML = '';
                console.log(`[GemsController] 清空了现有Gem选项`);
            }

            // Add Gem options
            this.gems.forEach(gem => {
                const option = document.createElement('option');
                option.value = `gem:${gem.id}`;
                option.textContent = gem.name;
                option.title = gem.description || gem.name;
                gemGroup.appendChild(option);
                console.log(`[GemsController] 添加Gem: gem:${gem.id.substring(0, 12)}... (${gem.name})`);
            });

            // Restore previous selection if it still exists
            if (currentValue) {
                const optionExists = Array.from(select.options).some(opt => opt.value === currentValue);
                if (optionExists) {
                    select.value = currentValue;
                    console.log(`[GemsController] 恢复选中值: ${currentValue}`);
                } else {
                    console.log(`[GemsController] 原选中值不存在: ${currentValue}`);
                }
            }

            console.log(`[GemsController] 选择器 #${index} 最终共有 ${select.options.length} 个选项`);
        });
        
        console.log(`[GemsController] ===== Gem列表填充完成 =====`);
    }

    /**
     * Get Gem ID from a model value
     * @param {string} modelValue - The model select value (e.g., "gem:4c81ac3f4657")
     * @returns {string|null} Gem ID or null
     */
    getGemIdFromValue(modelValue) {
        if (!modelValue || !modelValue.startsWith('gem:')) {
            return null;
        }
        return modelValue.substring(4); // Remove "gem:" prefix
    }

    /**
     * Check if a model value is a Gem
     * @param {string} modelValue - The model select value
     * @returns {boolean}
     */
    isGemModel(modelValue) {
        return modelValue && modelValue.startsWith('gem:');
    }

    /**
     * Get the base model for a Gem (for API requests)
     * @param {string} modelValue - The model select value
     * @returns {string} Base model name
     */
    getBaseModel(modelValue) {
        if (this.isGemModel(modelValue)) {
            return 'gem'; // This will be handled by gemini_api.js
        }
        return modelValue;
    }
}
