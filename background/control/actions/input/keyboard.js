
// background/control/actions/input/keyboard.js
import { BaseActionHandler } from '../base.js';

export class KeyboardActions extends BaseActionHandler {
    
    async fillElement({ uid, value }) {
        const objectId = await this.getObjectIdFromUid(uid);
        
        await this.waitHelper.execute(async () => {
            // Enhanced JS injection to handle Select and ContentEditable
            // Pass value as argument to avoid syntax errors with special chars
            await this.cmd("Runtime.callFunctionOn", {
                objectId: objectId,
                functionDeclaration: `function(val) {
                    this.focus();

                    const tagName = this.tagName;
                    const isSelect = tagName === 'SELECT';
                    const isContentEditable = this.isContentEditable;
                    const isInput = tagName === 'INPUT' || tagName === 'TEXTAREA';

                    if (isSelect) {
                        let found = false;
                        // 1. Try matching by value attribute
                        for (let i = 0; i < this.options.length; i++) {
                            if (this.options[i].value === val) {
                                // Use prototype setter to bypass React/Vue tracking
                                try {
                                    const proto = window.HTMLSelectElement.prototype;
                                    const nativeSetter = Object.getOwnPropertyDescriptor(proto, "selectedIndex").set;
                                    nativeSetter.call(this, i);
                                } catch (e) {
                                    this.selectedIndex = i;
                                }
                                found = true;
                                break;
                            }
                        }
                        // 2. Try matching by visible text
                        if (!found) {
                            for (let i = 0; i < this.options.length; i++) {
                                if (this.options[i].text === val) {
                                    // Use prototype setter
                                    try {
                                        const proto = window.HTMLSelectElement.prototype;
                                        const nativeSetter = Object.getOwnPropertyDescriptor(proto, "selectedIndex").set;
                                        nativeSetter.call(this, i);
                                    } catch (e) {
                                        this.selectedIndex = i;
                                    }
                                    found = true;
                                    break;
                                }
                            }
                        }
                        // 3. Fallback to direct assignment (also via prototype)
                        if (!found) {
                            try {
                                const proto = window.HTMLSelectElement.prototype;
                                const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value").set;
                                nativeSetter.call(this, val);
                            } catch (e) {
                                this.value = val;
                            }
                        }
                    } else if (isContentEditable) {
                        // Use execCommand for better undo history support where possible
                        // First select all content to replace it
                        document.execCommand('selectAll', false, null);
                        document.execCommand('insertText', false, val);

                        // Fallback if execCommand fails or adds nothing (e.g. empty string)
                        if (this.innerText !== val && val !== "") {
                            this.innerText = val;
                        }
                    } else {
                        // Standard input/textarea
                        // Use prototype setter to bypass React/Vue tracking
                        const proto = window.HTMLInputElement.prototype;
                        const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value").set;
                        // For textarea, use HTMLTextAreaElement prototype
                        if (tagName === 'TEXTAREA') {
                            try {
                                 const textAreaProto = window.HTMLTextAreaElement.prototype;
                                 const textAreaSetter = Object.getOwnPropertyDescriptor(textAreaProto, "value").set;
                                 textAreaSetter.call(this, val);
                            } catch (e) {
                                 this.value = val;
                            }
                        } else {
                            try {
                                 nativeSetter.call(this, val);
                            } catch (e) {
                                 this.value = val;
                            }
                        }
                    }

                    // Dispatch standard events to trigger framework listeners (React, Vue, etc.)
                    // Key: 'bubbles: true' AND 'composed: true' for Shadow DOM support
                    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                    this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));

                    // Specific for some selects
                    if (isSelect) {
                        this.dispatchEvent(new Event('click', { bubbles: true, composed: true }));
                    }
                }`,
                arguments: [{ value: value }]
            });
        });

        return `Filled element ${uid}`;
    }

    async pressKey({ key }) {
        const keyMap = {
            'Enter': { windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, key: 'Enter', code: 'Enter', text: '\r' },
            'Backspace': { windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8, key: 'Backspace', code: 'Backspace' },
            'Tab': { windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9, key: 'Tab', code: 'Tab' },
            'Escape': { windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27, key: 'Escape', code: 'Escape' },
            'Delete': { windowsVirtualKeyCode: 46, nativeVirtualKeyCode: 46, key: 'Delete', code: 'Delete' },
            'ArrowDown': { windowsVirtualKeyCode: 40, nativeVirtualKeyCode: 40, key: 'ArrowDown', code: 'ArrowDown' },
            'ArrowUp': { windowsVirtualKeyCode: 38, nativeVirtualKeyCode: 38, key: 'ArrowUp', code: 'ArrowUp' },
            'ArrowLeft': { windowsVirtualKeyCode: 37, nativeVirtualKeyCode: 37, key: 'ArrowLeft', code: 'ArrowLeft' },
            'ArrowRight': { windowsVirtualKeyCode: 39, nativeVirtualKeyCode: 39, key: 'ArrowRight', code: 'ArrowRight' },
            'PageUp': { windowsVirtualKeyCode: 33, nativeVirtualKeyCode: 33, key: 'PageUp', code: 'PageUp' },
            'PageDown': { windowsVirtualKeyCode: 34, nativeVirtualKeyCode: 34, key: 'PageDown', code: 'PageDown' },
            'End': { windowsVirtualKeyCode: 35, nativeVirtualKeyCode: 35, key: 'End', code: 'End' },
            'Home': { windowsVirtualKeyCode: 36, nativeVirtualKeyCode: 36, key: 'Home', code: 'Home' },
            'Space': { windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32, key: ' ', code: 'Space', text: ' ' }
        };

        try {
            await this.waitHelper.execute(async () => {
                if (keyMap[key]) {
                    const def = keyMap[key];
                    // Sending both keyDown and keyUp
                    await this.cmd("Input.dispatchKeyEvent", { type: 'keyDown', ...def });
                    await this.cmd("Input.dispatchKeyEvent", { type: 'keyUp', ...def });
                } else if (key.length === 1) {
                    // Character input
                    await this.cmd("Input.dispatchKeyEvent", { type: 'keyDown', text: key, key: key });
                    await this.cmd("Input.dispatchKeyEvent", { type: 'keyUp', text: key, key: key });
                } else {
                    throw new Error(`Key '${key}' not supported.`);
                }
            });

            return `Pressed key: ${key}`;
        } catch (e) {
            return `Error pressing key ${key}: ${e.message}`;
        }
    }
}
