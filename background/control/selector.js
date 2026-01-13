
// background/control/selector.js
/**
 * Enhanced Element Selector Engine
 * Supports CSS selectors, XPath, and fuzzy text matching
 * Extends UID-based selection with more flexible query methods
 */

/**
 * @typedef {Object} ElementInfo
 * @property {string} [uid] - Element unique ID
 * @property {string} [role] - Element role
 * @property {string} [name] - Element name
 * @property {string} [text] - Element text content
 * @property {string} [tag] - Element tag name
 * @property {boolean} [visible] - Element visibility
 * @property {string} [error] - Error message if query failed
 */

export class SelectorEngine {
    constructor(connection, snapshotManager) {
        this.connection = connection;
        this.snapshotManager = snapshotManager;
    }

    /**
     * Find elements by CSS selector
     * @param {string} selector - CSS selector
     * @returns {Promise<ElementInfo[] | {error: string}>}
     */
    async findByCssSelector(selector) {
        try {
            const result = await this.connection.sendCommand("Runtime.evaluate", {
                expression: `
                    Array.from(document.querySelectorAll('${selector.replace(/'/g, "\\'")}'))
                        .map(el => ({
                            text: el.innerText || el.value || '',
                            role: el.getAttribute('role') || el.tagName.toLowerCase(),
                            visible: el.offsetParent !== null,
                            tag: el.tagName.toLowerCase()
                        }))
                `,
                returnByValue: true
            });

            if (result.exceptionDetails) {
                return { error: `CSS Selector Error: ${result.exceptionDetails.text}` };
            }

            return result.result.value || [];
        } catch (e) {
            return { error: `Failed to query CSS selector: ${e.message}` };
        }
    }

    /**
     * Find elements by XPath
     * @param {string} xpath - XPath expression
     * @returns {Promise<ElementInfo[] | {error: string}>}
     */
    async findByXPath(xpath) {
        try {
            const result = await this.connection.sendCommand("Runtime.evaluate", {
                expression: `
                    (function() {
                        const xpath = '${xpath.replace(/'/g, "\\'")}';
                        const result = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
                        const elements = [];
                        for (let i = 0; i < result.snapshotLength; i++) {
                            const el = result.snapshotItem(i);
                            elements.push({
                                text: el.innerText || el.value || '',
                                role: el.getAttribute('role') || el.tagName.toLowerCase(),
                                visible: el.offsetParent !== null,
                                tag: el.tagName.toLowerCase()
                            });
                        }
                        return elements;
                    })()
                `,
                returnByValue: true
            });

            if (result.exceptionDetails) {
                return { error: `XPath Error: ${result.exceptionDetails.text}` };
            }

            return result.result.value || [];
        } catch (e) {
            return { error: `Failed to query XPath: ${e.message}` };
        }
    }

    /**
     * Find elements by text content (fuzzy matching)
     * @param {string} text - Text to search for
     * @param {object} options - { exact, contains, fuzzy }
     * @returns {Promise<ElementInfo[] | {error: string}>}
     */
    async findByText(text, options = {}) {
        const { exact = false, contains = false } = options;
        try {
            const result = await this.connection.sendCommand("Runtime.evaluate", {
                expression: `
                    (function() {
                        const searchText = '${text.replace(/'/g, "\\'")}';
                        const exact = ${exact};
                        const contains = ${contains};
                        
                        function textMatch(el, search) {
                            const text = el.innerText || el.value || el.textContent || '';
                            if (exact) return text.trim() === search;
                            if (contains) return text.includes(search);
                            return text.toLowerCase().includes(search.toLowerCase());
                        }
                        
                        const elements = [];
                        const allElements = document.querySelectorAll('button, input, select, a, label, [role="button"]');
                        
                        for (const el of allElements) {
                            if (textMatch(el, searchText)) {
                                elements.push({
                                    text: el.innerText || el.value || el.textContent || '',
                                    tag: el.tagName.toLowerCase(),
                                    role: el.getAttribute('role') || 'generic',
                                    visible: el.offsetParent !== null
                                });
                            }
                        }
                        return elements;
                    })()
                `,
                returnByValue: true
            });

            if (result.exceptionDetails) {
                return { error: `Text Search Error: ${result.exceptionDetails.text}` };
            }

            return result.result.value || [];
        } catch (e) {
            return { error: `Failed to search by text: ${e.message}` };
        }
    }

    /**
     * Find element by accessibility properties
     * @param {object} props - { name, role, label }
     * @returns {Promise<ElementInfo[] | {error: string}>}
     */
    async findByAccessibility(props) {
        try {
            const { name, role, label } = props;
            const conditions = [];
            
            if (name) conditions.push(`(el.getAttribute('aria-label') || '').includes('${name}')`);
            if (role) conditions.push(`(el.getAttribute('role') || '').includes('${role}')`);
            if (label) conditions.push(`(el.getAttribute('aria-labelledby') || el.id || '').includes('${label}')`);

            const expr = conditions.length > 0 ? conditions.join(' || ') : 'true';

            const result = await this.connection.sendCommand("Runtime.evaluate", {
                expression: `
                    Array.from(document.querySelectorAll('*'))
                        .filter(el => (${expr}))
                        .slice(0, 10)
                        .map(el => ({
                            text: el.innerText || el.value || '',
                            role: el.getAttribute('role') || el.tagName.toLowerCase(),
                            ariaLabel: el.getAttribute('aria-label'),
                            visible: el.offsetParent !== null
                        }))
                `,
                returnByValue: true
            });

            if (result.exceptionDetails) {
                return { error: `Accessibility Search Error: ${result.exceptionDetails.text}` };
            }

            return result.result.value || [];
        } catch (e) {
            return { error: `Failed accessibility search: ${e.message}` };
        }
    }

    /**
     * Generate CSS/XPath selectors for a given element UID
     * Useful for converting UID-based results back to standard selectors
     * @param {string} uid - Element UID
     * @returns {Promise<{css: string, xpath: string} | {error: string}>}
     */
    async generateSelectors(uid) {
        const backendNodeId = this.snapshotManager.getBackendNodeId(uid);
        if (!backendNodeId) {
            return { error: `UID ${uid} not found in snapshot` };
        }

        try {
            const result = await this.connection.sendCommand("Runtime.evaluate", {
                expression: `
                    (function() {
                        // This is a simplified version - in production you'd want more robust selector generation
                        const getPath = (el) => {
                            let path = [];
                            while (el.parentElement) {
                                let selector = el.tagName.toLowerCase();
                                if (el.id) {
                                    selector += '#' + el.id;
                                    path.unshift(selector);
                                    break;
                                } else {
                                    const parent = el.parentElement;
                                    const children = Array.from(parent.children).filter(c => c.tagName === el.tagName);
                                    if (children.length > 1) {
                                        const index = children.indexOf(el) + 1;
                                        selector += ':nth-of-type(' + index + ')';
                                    }
                                }
                                path.unshift(selector);
                                el = parent;
                            }
                            return path.join(' > ');
                        };
                        
                        return { css: 'Not implemented yet', xpath: 'Not implemented yet' };
                    })()
                `,
                returnByValue: true
            });

            return result.result.value || { css: 'N/A', xpath: 'N/A' };
        } catch (e) {
            return { error: `Failed to generate selectors: ${e.message}` };
        }
    }

    /**
     * Validate if a selector is valid (dry run)
     * @param {string} selector - CSS or XPath selector
     * @param {string} type - 'css' or 'xpath'
     * @returns {Promise<boolean>}
     */
    async validateSelector(selector, type = 'css') {
        try {
            if (type === 'css') {
                await this.connection.sendCommand("Runtime.evaluate", {
                    expression: `document.querySelector('${selector.replace(/'/g, "\\'")}')`
                });
                return true;
            } else if (type === 'xpath') {
                const result = await this.connection.sendCommand("Runtime.evaluate", {
                    expression: `document.evaluate('${selector.replace(/'/g, "\\'")}', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)`
                });
                return !result.exceptionDetails;
            }
            return false;
        } catch (e) {
            return false;
        }
    }
}
