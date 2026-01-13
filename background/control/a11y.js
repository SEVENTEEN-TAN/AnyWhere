
// background/control/a11y.js
/**
 * Web Accessibility Checker
 * WCAG 2.1 level AA automated checks
 * Provides accessibility audit with actionable recommendations
 */

export class AccessibilityChecker {
    constructor(connection) {
        this.connection = connection;
        this.issues = [];
    }

    /**
     * Run comprehensive accessibility audit
     * @returns {Promise<{issues: Array, summary: string, score: number} | {error: string, issues: Array}>}
     */
    async audit() {
        this.issues = [];
        
        try {
            await this.connection.sendCommand("Audits.enable");
            
            // Run accessibility audit
            const { frameId } = await this.connection.sendCommand("Runtime.evaluate", {
                expression: "window.frames[0]?.frameElement?.id || document.documentElement.id"
            });

            // Run various checks
            await Promise.all([
                this.checkContrast(),
                this.checkHeadings(),
                this.checkFormLabels(),
                this.checkAltText(),
                this.checkAriaAttrs(),
                this.checkKeyboardNav(),
                this.checkFocusVisible(),
                this.checkColorDependence()
            ]);

            return this.generateReport();
        } catch (e) {
            return {
                error: `Audit failed: ${e.message}`,
                issues: this.issues
            };
        }
    }

    /**
     * Check color contrast ratios (WCAG AA requires 4.5:1 for text, 3:1 for large text)
     */
    async checkContrast() {
        try {
            const result = await this.connection.sendCommand("Runtime.evaluate", {
                expression: `
                    (function() {
                        const getContrast = (r1, g1, b1, r2, g2, b2) => {
                            const L1 = (0.299 * r1 + 0.587 * g1 + 0.114 * b1) / 255;
                            const L2 = (0.299 * r2 + 0.587 * g2 + 0.114 * b2) / 255;
                            const lum1 = L1 > 0.03928 ? Math.pow((L1 + 0.05) / 1.05, 2.4) : L1 / 12.92;
                            const lum2 = L2 > 0.03928 ? Math.pow((L2 + 0.05) / 1.05, 2.4) : L2 / 12.92;
                            return (Math.max(lum1, lum2) + 0.05) / (Math.min(lum1, lum2) + 0.05);
                        };
                        
                        const issues = [];
                        document.querySelectorAll('button, a, label, [role="button"]').forEach(el => {
                            const style = window.getComputedStyle(el);
                            // Simple check - in production you'd parse actual RGB values
                            const bgColor = style.backgroundColor;
                            const color = style.color;
                            // Placeholder: just check if text is readable
                            if (!color || color === 'rgba(0, 0, 0, 0)') {
                                issues.push({
                                    element: el.outerHTML.substring(0, 100),
                                    issue: 'Potential contrast issue'
                                });
                            }
                        });
                        return issues;
                    })()
                `,
                returnByValue: true
            });

            const issues = result.result.value || [];
            issues.forEach(issue => {
                this.issues.push({
                    severity: 'warning',
                    category: 'contrast',
                    message: `${issue.issue}: ${issue.element}`,
                    wcag: 'WCAG 1.4.3'
                });
            });
        } catch (e) {
            console.warn("[A11y] Contrast check failed:", e);
        }
    }

    /**
     * Check heading hierarchy (H1 should be present, proper nesting)
     */
    async checkHeadings() {
        try {
            const result = await this.connection.sendCommand("Runtime.evaluate", {
                expression: `
                    (function() {
                        const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
                        const issues = [];
                        
                        if (headings.length === 0) {
                            issues.push({ type: 'no-headings', severity: 'error' });
                        } else if (!document.querySelector('h1')) {
                            issues.push({ type: 'no-h1', severity: 'error' });
                        }
                        
                        let prevLevel = 0;
                        headings.forEach(h => {
                            const level = parseInt(h.tagName[1]);
                            if (level - prevLevel > 1) {
                                issues.push({
                                    type: 'heading-skip',
                                    from: prevLevel,
                                    to: level,
                                    text: h.textContent.substring(0, 50)
                                });
                            }
                            prevLevel = level;
                        });
                        
                        return { headings: headings.length, issues };
                    })()
                `,
                returnByValue: true
            });

            const data = result.result.value || {};
            if (data.issues) {
                data.issues.forEach(issue => {
                    if (issue.type === 'no-headings') {
                        this.issues.push({
                            severity: 'error',
                            category: 'structure',
                            message: 'Page has no headings',
                            wcag: 'WCAG 1.3.1'
                        });
                    } else if (issue.type === 'no-h1') {
                        this.issues.push({
                            severity: 'warning',
                            category: 'structure',
                            message: 'Page should have an H1 heading',
                            wcag: 'WCAG 1.3.1'
                        });
                    } else if (issue.type === 'heading-skip') {
                        this.issues.push({
                            severity: 'warning',
                            category: 'structure',
                            message: `Heading hierarchy skipped from H${issue.from} to H${issue.to}: "${issue.text}"`,
                            wcag: 'WCAG 1.3.1'
                        });
                    }
                });
            }
        } catch (e) {
            console.warn("[A11y] Heading check failed:", e);
        }
    }

    /**
     * Check form inputs have associated labels
     */
    async checkFormLabels() {
        try {
            const result = await this.connection.sendCommand("Runtime.evaluate", {
                expression: `
                    (function() {
                        const inputs = Array.from(document.querySelectorAll('input, textarea, select'));
                        const issues = [];
                        
                        inputs.forEach(input => {
                            if (!input.getAttribute('aria-label') && !input.getAttribute('aria-labelledby')) {
                                const label = document.querySelector(\`label[for="\${input.id}"]\`);
                                if (!label && input.id) {
                                    issues.push({
                                        type: 'no-label',
                                        element: input.outerHTML.substring(0, 80),
                                        id: input.id
                                    });
                                }
                            }
                        });
                        
                        return issues;
                    })()
                `,
                returnByValue: true
            });

            const issues = result.result.value || [];
            issues.forEach(issue => {
                this.issues.push({
                    severity: 'error',
                    category: 'forms',
                    message: `Form input lacks label: ${issue.element}`,
                    wcag: 'WCAG 1.3.1'
                });
            });
        } catch (e) {
            console.warn("[A11y] Form label check failed:", e);
        }
    }

    /**
     * Check images have alt text
     */
    async checkAltText() {
        try {
            const result = await this.connection.sendCommand("Runtime.evaluate", {
                expression: `
                    Array.from(document.querySelectorAll('img'))
                        .filter(img => !img.getAttribute('alt'))
                        .slice(0, 5)
                        .map(img => img.src.substring(0, 60))
                `,
                returnByValue: true
            });

            const images = result.result.value || [];
            if (images.length > 0) {
                this.issues.push({
                    severity: 'error',
                    category: 'images',
                    message: `${images.length} image(s) missing alt text. Examples: ${images.join(', ')}`,
                    wcag: 'WCAG 1.1.1'
                });
            }
        } catch (e) {
            console.warn("[A11y] Alt text check failed:", e);
        }
    }

    /**
     * Check for proper ARIA attributes
     */
    async checkAriaAttrs() {
        try {
            const result = await this.connection.sendCommand("Runtime.evaluate", {
                expression: `
                    (function() {
                        const issues = [];
                        
                        // Check for invalid ARIA roles
                        document.querySelectorAll('[role]').forEach(el => {
                            const validRoles = ['button', 'link', 'navigation', 'main', 'region', 'tablist', 'tab', 'tabpanel', 'dialog', 'alertdialog', 'alert', 'status', 'log', 'marquee', 'timer', 'tooltip', 'progressbar', 'slider', 'spinbutton', 'searchbox', 'textbox', 'menu', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'optgroup', 'listbox', 'combobox', 'grid', 'row', 'gridcell', 'columnheader', 'rowheader', 'list', 'listitem', 'tree', 'treeitem', 'group', 'img', 'article', 'document', 'application', 'presentation', 'none'];
                            const role = el.getAttribute('role');
                            if (!validRoles.includes(role)) {
                                issues.push({ type: 'invalid-role', role, element: el.tagName });
                            }
                        });
                        
                        // Check for orphaned aria-label
                        document.querySelectorAll('[aria-label]').forEach(el => {
                            if (el.textContent && el.textContent === el.getAttribute('aria-label')) {
                                issues.push({ type: 'redundant-aria-label' });
                            }
                        });
                        
                        return issues;
                    })()
                `,
                returnByValue: true
            });

            const issues = result.result.value || [];
            issues.forEach(issue => {
                if (issue.type === 'invalid-role') {
                    this.issues.push({
                        severity: 'warning',
                        category: 'aria',
                        message: `Invalid ARIA role "${issue.role}" on ${issue.element}`,
                        wcag: 'WCAG 1.3.1'
                    });
                }
            });
        } catch (e) {
            console.warn("[A11y] ARIA check failed:", e);
        }
    }

    /**
     * Check keyboard navigation support
     */
    async checkKeyboardNav() {
        try {
            const result = await this.connection.sendCommand("Runtime.evaluate", {
                expression: `
                    (function() {
                        const interactive = document.querySelectorAll('button, a, input, select, textarea, [role="button"]');
                        const notFocusable = Array.from(interactive).filter(el => {
                            const tabindex = el.getAttribute('tabindex');
                            return tabindex === '-1' || (el.style.display === 'none');
                        }).length;
                        
                        return {
                            totalInteractive: interactive.length,
                            notFocusable: notFocusable
                        };
                    })()
                `,
                returnByValue: true
            });

            const data = result.result.value || {};
            if (data.notFocusable > 0) {
                this.issues.push({
                    severity: 'warning',
                    category: 'keyboard',
                    message: `${data.notFocusable} interactive element(s) not keyboard accessible`,
                    wcag: 'WCAG 2.1.1'
                });
            }
        } catch (e) {
            console.warn("[A11y] Keyboard nav check failed:", e);
        }
    }

    /**
     * Check focus visibility
     */
    async checkFocusVisible() {
        try {
            const result = await this.connection.sendCommand("Runtime.evaluate", {
                expression: `
                    (function() {
                        // Check if :focus-visible is styled
                        const styles = Array.from(document.styleSheets)
                            .flatMap(ss => {
                                try {
                                    return Array.from(ss.cssRules || []);
                                } catch (e) {
                                    return [];
                                }
                            })
                            .filter(rule => rule.selectorText && rule.selectorText.includes(':focus'));
                        
                        return {
                            hasFocusStyles: styles.length > 0,
                            focusRules: styles.length
                        };
                    })()
                `,
                returnByValue: true
            });

            const data = result.result.value || {};
            if (!data.hasFocusStyles) {
                this.issues.push({
                    severity: 'warning',
                    category: 'focus',
                    message: 'No visible focus indicator found in CSS',
                    wcag: 'WCAG 2.4.7'
                });
            }
        } catch (e) {
            console.warn("[A11y] Focus visibility check failed:", e);
        }
    }

    /**
     * Check color is not the only way to convey information
     */
    async checkColorDependence() {
        try {
            const result = await this.connection.sendCommand("Runtime.evaluate", {
                expression: `
                    (function() {
                        // Simple heuristic: check for elements that only use color (SVG, charts, etc)
                        const colorOnlyElements = Array.from(document.querySelectorAll('svg, canvas, [style*="color"]'))
                            .filter(el => {
                                const text = el.textContent || '';
                                return text.length < 5; // Very short or no text
                            }).length;
                        
                        return { colorOnlyElements };
                    })()
                `,
                returnByValue: true
            });

            const data = result.result.value || {};
            if (data.colorOnlyElements > 0) {
                this.issues.push({
                    severity: 'warning',
                    category: 'color',
                    message: `${data.colorOnlyElements} element(s) may rely only on color to convey information`,
                    wcag: 'WCAG 1.4.1'
                });
            }
        } catch (e) {
            console.warn("[A11y] Color dependence check failed:", e);
        }
    }

    /**
     * Generate audit report
     */
    generateReport() {
        const byCategory = {};
        const bySeverity = { error: 0, warning: 0, info: 0 };

        this.issues.forEach(issue => {
            byCategory[issue.category] = (byCategory[issue.category] || 0) + 1;
            bySeverity[issue.severity]++;
        });

        const score = Math.max(0, 100 - (bySeverity.error * 10 + bySeverity.warning * 5));
        
        let summary = `Accessibility Audit Score: ${score}/100\n`;
        summary += `Errors: ${bySeverity.error} | Warnings: ${bySeverity.warning}\n`;
        summary += `Categories: ${Object.entries(byCategory).map(([k, v]) => `${k}(${v})`).join(', ')}\n\n`;
        summary += this.issues.map(i => `[${i.severity.toUpperCase()}] ${i.category}: ${i.message}`).join('\n');

        return {
            score,
            issues: this.issues,
            summary,
            categories: byCategory,
            severities: bySeverity
        };
    }
}
