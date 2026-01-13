
// background/control/actions/navigation.js
import { BaseActionHandler } from './base.js';

export class NavigationActions extends BaseActionHandler {
    async navigatePage({ url, type }) {
        // Use currentTabId (attached) or fallback to targetTabId (intent)
        const tabId = this.connection.currentTabId || this.connection.targetTabId;
        if (!tabId) return "Error: No target tab identified.";

        let action = "";
        
        await this.waitHelper.execute(async () => {
            if (type === 'back') {
                await chrome.tabs.goBack(tabId);
                action = "Navigated back";
            } else if (type === 'forward') {
                await chrome.tabs.goForward(tabId);
                action = "Navigated forward";
            } else if (type === 'reload') {
                await chrome.tabs.reload(tabId);
                action = "Reloaded page";
            } else if (url) {
                await chrome.tabs.update(tabId, { url });
                action = `Navigating to ${url}`;
            }
        });

        return action || "Error: Invalid navigation arguments.";
    }

    async newPage({ url }) {
        const targetUrl = url || 'about:blank';
        const tab = await chrome.tabs.create({ url: targetUrl });
        return `Created new page (id: ${tab.id}) loading ${targetUrl}`;
    }

    async closePage({ index }) {
        if (index === undefined) return "Error: 'index' is required.";
        const tabs = await chrome.tabs.query({ currentWindow: true });
        const tab = tabs[index];
        if (!tab) return `Error: Page index ${index} not found.`;
        
        await chrome.tabs.remove(tab.id);
        return `Closed page ${index}: ${tab.title || 'Untitled'}`;
    }

    async listPages(args = {}) {
        const tabs = await chrome.tabs.query({ currentWindow: true });
        return tabs.map((t, idx) => `${idx}: ${t.title} (${t.url})`).join("\n");
    }

    async selectPage({ index }) {
        const tabs = await chrome.tabs.query({ currentWindow: true });
        const tab = tabs[index];
        if (!tab) return `Error: Index ${index} not found.`;

        await chrome.tabs.update(tab.id, { active: true });
        return `Switched to page ${index}: ${tab.title}`;
    }

    // ========== P2 Enhancement: Tab Stack Navigation ==========

    /**
     * Switch to a specific tab by ID
     * @param {Object} args - Arguments
     * @param {number} args.tabId - Tab ID to switch to
     * @param {boolean} [args.pushToStack=true] - Whether to push current tab to stack
     */
    async switchToTab({ tabId, pushToStack = true }) {
        try {
            await this.connection.switchToTab(tabId, pushToStack);

            // Get tab info
            const tab = await chrome.tabs.get(tabId);
            return `Switched to tab ${tabId}: ${tab.title || 'Untitled'}`;
        } catch (e) {
            return `Error switching to tab ${tabId}: ${e.message}`;
        }
    }

    /**
     * Return to the previous tab in the stack
     */
    async returnToPreviousTab() {
        try {
            const success = await this.connection.returnToPreviousTab();
            if (!success) {
                return 'No previous tab in stack to return to';
            }

            // Get current tab info
            const tab = await chrome.tabs.get(this.connection.currentTabId);
            return `Returned to previous tab: ${tab.title || 'Untitled'}`;
        } catch (e) {
            return `Error returning to previous tab: ${e.message}`;
        }
    }

    /**
     * Get the current tab stack
     */
    async getTabStack() {
        const stack = this.connection.getTabStack();
        if (stack.length === 0) {
            return 'Tab stack is empty';
        }

        // Get tab info for each tab in stack
        const tabInfos = await Promise.all(
            stack.map(async (tabId) => {
                try {
                    const tab = await chrome.tabs.get(tabId);
                    return `  ${tabId}: ${tab.title || 'Untitled'}`;
                } catch (e) {
                    return `  ${tabId}: (Tab no longer exists)`;
                }
            })
        );

        return `Tab stack (${stack.length} tabs):\n${tabInfos.join('\n')}`;
    }

    /**
     * Clear the tab stack
     */
    async clearTabStack() {
        this.connection.clearTabStack();
        return 'Tab stack cleared';
    }
}