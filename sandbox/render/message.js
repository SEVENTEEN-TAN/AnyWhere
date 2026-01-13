// sandbox/render/message.js
import { renderContent } from './content.js';
import { copyToClipboard } from './clipboard.js';
import { createGeneratedImage } from './generated_image.js';
import { loadMarkmap } from '../libs/markmap-loader.js';
import { parseThinkingContent } from '../lib/thinking_parser.js';


// Appends a message to the chat history and returns an update controller
// attachment can be:
// - string: single user image (URL/Base64)
// - array of strings: multiple user images
// - array of objects {url, alt}: AI generated images
// mcpIds: array of MCP server IDs used for this message (for AI messages)
// model: model name (e.g., "gemini-2.5-flash" or "gem")
// gemName: (optional) Gem display name if model is 'gem'
export function appendMessage(container, text, role, attachment = null, thoughts = null, mcpIds = null, model = null, gemName = null) {
    const div = document.createElement('div');
    div.className = `msg ${role}`;

    // Parse embedded thinking tags from text (for AI messages)
    let parsedThinking = '';
    let parsedContent = text || "";

    if (role === 'ai' && parsedContent) {
        const parsed = parseThinkingContent(parsedContent);
        parsedThinking = parsed.thinking;
        parsedContent = parsed.content;
    }

    // Store current text state
    let currentText = parsedContent;
    // Merge API-provided thoughts with parsed thinking tags
    let currentThoughts = thoughts || "";
    if (parsedThinking) {
        currentThoughts = currentThoughts
            ? `${currentThoughts}\n\n---\n\n${parsedThinking}`
            : parsedThinking;
    }
    let currentMcpIds = mcpIds || [];
    let currentModel = model || "";
    let currentGemName = gemName || "";

    // 1. User Uploaded Images
    if (role === 'user' && attachment) {
        const imagesContainer = document.createElement('div');
        imagesContainer.className = 'user-images-grid';
        // Style inline for grid layout if multiple
        imagesContainer.style.display = 'flex';
        imagesContainer.style.flexWrap = 'wrap';
        imagesContainer.style.gap = '8px';
        imagesContainer.style.marginBottom = '8px';

        const imageSources = Array.isArray(attachment) ? attachment : [attachment];

        imageSources.forEach(src => {
            if (typeof src === 'string') {
                const img = document.createElement('img');
                img.src = src;
                img.className = 'chat-image';

                // Allow full display by containing image within a reasonable box, or just auto
                if (imageSources.length > 1) {
                    img.style.maxWidth = '150px';
                    img.style.maxHeight = '200px';
                    img.style.width = 'auto';
                    img.style.height = 'auto';
                    img.style.objectFit = 'contain';
                    img.style.background = 'rgba(0,0,0,0.05)'; // Subtle background
                }

                // Click to enlarge
                img.addEventListener('click', () => {
                    document.dispatchEvent(new CustomEvent('gemini-view-image', { detail: src }));
                });
                imagesContainer.appendChild(img);
            }
        });

        if (imagesContainer.hasChildNodes()) {
            div.appendChild(imagesContainer);
        }
    }

    // Add MCP badges for user messages
    if (role === 'user' && currentMcpIds.length > 0) {
        const userMcpContainer = document.createElement('div');
        userMcpContainer.className = 'mcp-badge-container user-mcp-badges';
        userMcpContainer.style.marginTop = '6px';

        currentMcpIds.forEach(mcpId => {
            const badge = document.createElement('span');
            badge.className = 'mcp-badge';
            badge.textContent = mcpId; // Simplified
            userMcpContainer.appendChild(badge);
        });

        div.appendChild(userMcpContainer);
    }

    let contentContainer = div; // Default to div for user
    let footerContainer = null;
    let mcpBadgeContainer = null;
    let contentDiv = null;
    let thoughtsDiv = null;
    let thoughtsContent = null;

    // AI Bubble Logic
    if (role === 'ai') {
        const bubble = document.createElement('div');
        bubble.className = 'ai-bubble';
        // Explicit background for visibility
        bubble.style.background = 'var(--bg-ai-msg)'; // Adaptive theme support
        bubble.style.borderRadius = '12px';
        bubble.style.padding = '14px 16px';
        bubble.style.marginTop = '4px';
        bubble.style.border = '1px solid rgba(0,0,0,0.06)';

        div.appendChild(bubble);
        contentContainer = bubble; // Render content inside bubble
    }

    // Allow creating empty AI bubbles for streaming
    if (currentText || currentThoughts || role === 'ai') {

        // --- Thinking Process (Optional) ---
        if (role === 'ai') {
            thoughtsDiv = document.createElement('div');
            thoughtsDiv.className = 'thoughts-container';
            // Only show if we have thoughts
            if (!currentThoughts) thoughtsDiv.style.display = 'none';

            const details = document.createElement('details');
            if (currentThoughts) details.open = true; // Open by default if present initially

            const summary = document.createElement('summary');
            summary.textContent = "Thinking Process"; // Can be localized

            thoughtsContent = document.createElement('div');
            thoughtsContent.className = 'thoughts-content';
            renderContent(thoughtsContent, currentThoughts || "", 'ai');

            details.appendChild(summary);
            details.appendChild(thoughtsContent);
            thoughtsDiv.appendChild(details);
            contentContainer.appendChild(thoughtsDiv);
        }


        // Create content div
        contentDiv = document.createElement('div');
        // Add class 'markdown-body' or simply ensure styles target .msg.ai direct children
        // But previously it was appending directly to bubble.
        // Let's keep contentDiv but ensure it doesn't break styles.
        // Actually, CSS targets .msg.ai p, .msg.ai h1 etc.
        // So contentDiv needs to be transparent or removed if possible, 
        // OR we just ensure it inherits/doesn't block.
        contentDiv.className = 'markdown-content';
        contentContainer.appendChild(contentDiv);

        // Initial Render
        // For initial render (history load), we use the text as-is, then refine it.
        renderContent(contentDiv, currentText, role);

        // IMMEDIATE POST-PROCESSING (Fixes: Mindmaps on Switch, Suggestions from DOM)
        // This runs immediately after appending to DOM, ensuring static history is interactive.
        processRenderedContent(contentContainer, contentDiv);


        // 2. AI Generated Images (Array of objects {url, alt})
        // Note: AI images are distinct from user attachments
        if (role === 'ai' && Array.isArray(attachment) && attachment.length > 0) {
            // Check if these are generated images (objects)
            if (typeof attachment[0] === 'object') {
                const grid = document.createElement('div');
                grid.className = 'generated-images-grid';

                // Only show the first generated image
                const firstImage = attachment[0];
                grid.appendChild(createGeneratedImage(firstImage));

                contentContainer.appendChild(grid);
            }
        }

        // --- Footer (Model Info & Copy) ---
        if (role === 'ai') {
            footerContainer = document.createElement('div');
            footerContainer.className = 'msg-footer';
            footerContainer.style.display = 'flex';
            footerContainer.style.alignItems = 'center';
            footerContainer.style.marginTop = '8px';
            footerContainer.style.fontSize = '11px';
            footerContainer.style.color = 'var(--text-tertiary)';
            footerContainer.style.gap = '8px';
            footerContainer.style.paddingTop = '8px';
            footerContainer.style.borderTop = '1px solid var(--border-color)';

            // Model Name (with Gem name if applicable)
            if (currentModel) {
                const modelSpan = document.createElement('span');
                modelSpan.className = 'model-name';

                // Format: if it's a Gem, show "Gem-[Name]", otherwise show model name
                let displayModel = currentModel;
                if (currentModel === 'gem' && currentGemName) {
                    displayModel = `Gem-${currentGemName}`;
                }

                modelSpan.innerHTML = `⚡ ${escapeHtml(displayModel)}`;
                footerContainer.appendChild(modelSpan);
            }

            // MCP Badges (moved to footer)
            mcpBadgeContainer = document.createElement('div');
            mcpBadgeContainer.className = 'mcp-badge-container';
            mcpBadgeContainer.style.marginLeft = 'auto'; // push to right

            if (currentMcpIds.length > 0) {
                currentMcpIds.forEach(mcpId => {
                    const badge = document.createElement('span');
                    badge.className = 'mcp-badge';
                    // Simplify SVG for compactness
                    badge.innerHTML = `<span>${escapeHtml(mcpId)}</span>`;
                    mcpBadgeContainer.appendChild(badge);
                });
            }
            footerContainer.appendChild(mcpBadgeContainer);

            // Copy Button - uses same class as user for consistent hover behavior
            const copyBtn = document.createElement('button');
            copyBtn.className = 'copy-btn'; // Same class for CSS hover hiding
            copyBtn.title = 'Copy';

            const copyIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
            const checkIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4caf50" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';

            copyBtn.innerHTML = copyIcon;

            copyBtn.addEventListener('click', async () => {
                try {
                    await copyToClipboard(currentText);
                    copyBtn.innerHTML = checkIcon;
                    setTimeout(() => copyBtn.innerHTML = copyIcon, 2000);
                } catch (err) { }
            });
            footerContainer.appendChild(copyBtn);

            // Footer goes OUTSIDE bubble (appended to div, not contentContainer)
            div.appendChild(footerContainer);
        } else {
            // User Copy Button (Traditional)
            const copyBtn = document.createElement('button');
            copyBtn.className = 'copy-btn';
            copyBtn.title = 'Copy content';

            const copyIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
            const checkIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4caf50" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';

            copyBtn.innerHTML = copyIcon;

            copyBtn.addEventListener('click', async () => {
                try {
                    // Use currentText closure to get latest streaming text
                    await copyToClipboard(currentText);
                    copyBtn.innerHTML = checkIcon;
                    setTimeout(() => {
                        copyBtn.innerHTML = copyIcon;
                    }, 2000);
                } catch (err) {
                    console.error('Failed to copy text: ', err);
                }
            });

            div.appendChild(copyBtn);
        }
    }

    container.appendChild(div);

    // --- Scroll Logic ---
    // Instead of scrolling to bottom, we scroll to the top of the NEW message.
    // This allows users to read from the start while content streams in below.
    setTimeout(() => {
        const topPos = div.offsetTop - 20; // 20px padding context
        container.scrollTo({
            top: topPos,
            behavior: 'smooth'
        });
    }, 10);

    // Return controller
    return {
        div,
        update: (newText, newThoughts) => {
            if (newText !== undefined) {
                // Parse thinking tags from streaming text (for AI messages)
                if (role === 'ai') {
                    const parsed = parseThinkingContent(newText);
                    currentText = parsed.content;

                    // Merge with API-provided thoughts
                    if (parsed.thinking) {
                        const apiThoughts = newThoughts || "";
                        currentThoughts = apiThoughts
                            ? `${apiThoughts}\n\n---\n\n${parsed.thinking}`
                            : parsed.thinking;

                        // Update thinking display
                        if (thoughtsContent && currentThoughts) {
                            renderContent(thoughtsContent, currentThoughts, 'ai');
                            if (thoughtsDiv) {
                                thoughtsDiv.style.display = 'block';
                            }
                        }
                    } else if (newThoughts !== undefined) {
                        currentThoughts = newThoughts;
                    }
                } else {
                    currentText = newText;
                    if (newThoughts !== undefined) {
                        currentThoughts = newThoughts;
                    }
                }

                if (contentDiv) {
                    renderContent(contentDiv, currentText, role);
                    // Process DOM again after update
                    processRenderedContent(contentContainer, contentDiv);
                }
            } else if (newThoughts !== undefined && thoughtsContent) {
                // Only thoughts update (no text change)
                currentThoughts = newThoughts;
                renderContent(thoughtsContent, currentThoughts || "", 'ai');
                if (currentThoughts) {
                    thoughtsDiv.style.display = 'block';
                }
            }
        },
        // Function to update images if they arrive late (though mostly synchronous in final reply)

        addImages: (images) => {
            if (Array.isArray(images) && images.length > 0 && !div.querySelector('.generated-images-grid')) {
                const grid = document.createElement('div');
                grid.className = 'generated-images-grid';

                // Only show the first generated image
                const firstImage = images[0];
                grid.appendChild(createGeneratedImage(firstImage));

                // Insert before footer (which is a direct child)
                const footer = div.querySelector('.msg-footer');
                if (footer) {
                    div.insertBefore(grid, footer);
                } else {
                    // Fallback if footer missing (unlikely)
                    div.appendChild(grid);
                }
                // Do not force scroll here either
            }
        },
        // Function to set MCP badges
        setMcpIds: (mcpIds) => {
            if (mcpBadgeContainer && mcpIds && mcpIds.length > 0) {
                mcpBadgeContainer.innerHTML = '';
                mcpBadgeContainer.style.display = 'flex';
                mcpIds.forEach(mcpId => {
                    const badge = document.createElement('span');
                    badge.className = 'mcp-badge';
                    badge.innerHTML = `
                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                            <line x1="8" y1="21" x2="16" y2="21"></line>
                            <line x1="12" y1="17" x2="12" y2="21"></line>
                        </svg>
                        <span>${escapeHtml(mcpId)}</span>
                    `;
                    mcpBadgeContainer.appendChild(badge);
                });
            }
        }
    };
}


/**
 * Central logic to enhance rendered content (Markmap, Suggestions, etc.)
 * This is safe to call multiple times as it checks for existence/state.
 */
function processRenderedContent(container, contentDiv) {
    if (!contentDiv) return;

    // 1. Initialize Markmaps
    // Find all markmap source blocks that haven't been processed yet
    const markmapNodes = contentDiv.querySelectorAll('.markmap-source:not(.processed-markmap)');
    if (markmapNodes.length > 0) {
        // Mark them immediately to prevent double processing in next tick
        markmapNodes.forEach(n => n.classList.add('processed-markmap'));

        loadMarkmap().then(({ Transformer, Markmap }) => {
            const transformer = new Transformer();

            markmapNodes.forEach(node => {
                const markdown = node.textContent;
                if (!markdown.trim()) return;

                // Transform markdown to mindmap data
                const { root } = transformer.transform(markdown);

                // Create container
                const mmContainer = document.createElement('div');
                mmContainer.className = 'markmap-container';
                mmContainer.style.width = '100%';
                mmContainer.style.height = '350px';
                mmContainer.style.border = '1px solid #ddd';
                mmContainer.style.borderRadius = '8px';
                mmContainer.style.overflow = 'hidden';
                mmContainer.style.background = '#fafafa';
                mmContainer.style.position = 'relative'; // For absolute positioning of button

                const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                svg.style.width = '100%';
                svg.style.height = '100%';

                mmContainer.appendChild(svg);

                // --- Mindmap Tools Container ---
                const toolsContainer = document.createElement('div');
                toolsContainer.style.position = 'absolute';
                toolsContainer.style.top = '10px';
                toolsContainer.style.right = '10px';
                toolsContainer.style.zIndex = '10';
                toolsContainer.style.display = 'flex';
                toolsContainer.style.gap = '8px';

                // Common Button Styles
                const btnStyle = `
                    background: white;
                    border: 1px solid #ccc;
                    border-radius: 4px;
                    padding: 4px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    width: 28px;
                    height: 28px;
                    color: #444;
                    box-sizing: border-box;
                    margin: 0;
                `;

                // 1. Download as PNG Button
                const downloadImgBtn = document.createElement('button');
                downloadImgBtn.style.cssText = btnStyle;
                downloadImgBtn.title = 'Download as PNG';
                const downloadIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2-2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
                downloadImgBtn.innerHTML = downloadIcon;

                downloadImgBtn.onclick = async () => {
                    try {
                        const svgClone = svg.cloneNode(true);
                        const bbox = svg.getBBox();
                        const padding = 20;
                        const w = mmContainer.clientWidth || bbox.width;
                        const h = mmContainer.clientHeight || bbox.height;

                        const width = Math.max(w, bbox.width + padding * 2);
                        const height = Math.max(h, bbox.height + padding * 2);

                        svgClone.setAttribute('width', width);
                        svgClone.setAttribute('height', height);
                        svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
                        svgClone.style.backgroundColor = '#ffffff';

                        const allElements = svgClone.querySelectorAll('*');
                        const originalElements = svg.querySelectorAll('*');

                        if (allElements.length === originalElements.length) {
                            for (let i = 0; i < allElements.length; i++) {
                                const el = allElements[i];
                                const orig = originalElements[i];
                                const computed = window.getComputedStyle(orig);

                                const stylesToInline = [
                                    'fill', 'stroke', 'stroke-width',
                                    'font-family', 'font-size', 'font-weight', 'font-style',
                                    'opacity', 'visibility'
                                ];

                                const inlineStyle = stylesToInline
                                    .map(prop => `${prop}:${computed.getPropertyValue(prop)}`)
                                    .join(';');

                                el.setAttribute('style', (el.getAttribute('style') || '') + ';' + inlineStyle);
                            }
                        }

                        const serializer = new XMLSerializer();
                        const svgString = serializer.serializeToString(svgClone);

                        window.parent.postMessage({
                            action: 'DOWNLOAD_MINDMAP_PNG',
                            payload: {
                                svgHtml: svgString,
                                width: width,
                                height: height,
                                filename: 'mindmap.png'
                            }
                        }, '*');

                        const originalHTML = downloadImgBtn.innerHTML;
                        downloadImgBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4caf50" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
                        setTimeout(() => {
                            downloadImgBtn.innerHTML = originalHTML;
                        }, 2000);

                    } catch (e) {
                        console.error('Failed to initiate PNG download', e);
                    }
                };

                // 2. Copy as Text Button
                const copyBtn = document.createElement('button');
                copyBtn.className = 'markmap-copy-btn';
                copyBtn.style.cssText = btnStyle;
                copyBtn.title = 'Copy as Hierarchical Text';
                const copyIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
                const checkIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4caf50" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';

                copyBtn.innerHTML = copyIcon;

                copyBtn.onclick = async () => {
                    try {
                        const decodeHtml = (html) => {
                            const txt = document.createElement('textarea');
                            txt.innerHTML = html;
                            return txt.value;
                        };

                        const generateText = (n, depth = 0) => {
                            const indent = '  '.repeat(depth);
                            let content = n.content.replace(/<[^>]*>/g, '');
                            content = decodeHtml(content);

                            let text = `${indent}${content}\n`;
                            if (n.children && n.children.length > 0) {
                                n.children.forEach(child => {
                                    text += generateText(child, depth + 1);
                                });
                            }
                            return text;
                        };

                        const hierarchicalText = generateText(root);
                        await copyToClipboard(hierarchicalText.trim());

                        copyBtn.innerHTML = checkIcon;
                        setTimeout(() => {
                            copyBtn.innerHTML = copyIcon;
                        }, 2000);
                    } catch (err) {
                        console.error("Failed to copy mindmap text", err);
                    }
                };

                toolsContainer.appendChild(downloadImgBtn);
                toolsContainer.appendChild(copyBtn);
                mmContainer.appendChild(toolsContainer);

                // Replace the hidden source div with the chart container
                node.replaceWith(mmContainer);

                // Render interactive mindmap
                Markmap.create(svg, null, root);
            });
        }).catch(e => console.warn("Markmap load failed", e));
    }

    // 2. Extract Suggestions (DOM-based Fallback)
    // This looks for visible text that looks like a JSON array at the end of the content
    // regardless of markdown formatting (e.g. inside <p> or code blocks)
    extractAndRenderSuggestions(container, contentDiv);
}


function extractAndRenderSuggestions(container, contentDiv) {
    // Strategy: Look at the full text content of the div.
    // If it ends with a JSON array pattern, extract it, remove the corresponding DOM nodes, and render buttons.

    // We only process if we haven't already rendered suggestions (or if we want to update them)
    // But since this is destructive to the DOM (removing text), we must be careful.
    // We'll search the text content.

    const fullText = contentDiv.textContent;
    if (!fullText) return;

    // Pattern: Implicit JSON array at end, OR explicit <suggestions> tag content
    // We look for the LAST occurrence of a valid JSON array pattern.
    const jsonArrayRegex = /(\[\s*(?:"[^"]*"(?:\s*,\s*"[^"]*")*|'[^']*'(?:\s*,\s*'[^']*')*)\s*\])\s*$/;
    const tagRegex = /<?\s*suggestions\s*>?\s*(\[\s*[\s\S]*?\s*\])\s*<?\s*\/\s*suggestions\s*>?/i;

    let suggestions = [];
    let match = null;

    // Try Explicit Tag first (regex against textContent handles case where HTML tags were stripped or rendered)
    match = fullText.match(tagRegex);

    // If not found, try implicit array at end
    if (!match) {
        match = fullText.match(jsonArrayRegex);
    }

    if (match) {
        try {
            const potentialJson = match[1];
            // Normalize quotes if necessary (simple fix for single quotes)
            const jsonStr = potentialJson.replace(/'/g, '"');
            const parsed = JSON.parse(jsonStr);

            if (Array.isArray(parsed) && parsed.length > 0 && parsed.every(i => typeof i === 'string')) {
                suggestions = parsed;

                // Now, the tricky part: REMOVING it from the DOM.
                // Since Markmap/Markdown might have split this across multiple nodes (p, code, pre),
                // the safest way is to "hide" the elements containing this specific string.
                // Or, strictly for the visual cleanup, we can walk backwards from the end.

                hideTextInDOM(contentDiv, match[0]);
            }
        } catch (e) {
            // Invalid JSON, ignore
        }
    }

    if (suggestions.length > 0) {
        renderSuggestions(container, suggestions);
    }
}

// Helper to hide specific text string from DOM nodes
function hideTextInDOM(root, textToRemove) {
    if (!textToRemove || !textToRemove.trim()) return;

    // TreeWalker to find text nodes
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
    let node;
    const nodes = [];
    while (node = walker.nextNode()) nodes.push(node);

    // We only care about the end of the content usually
    // But let's try to remove the text content where it appears.
    // Since Markdown might split it, this is imperfect, but usually the suggestions block 
    // is a single block at the end.

    for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        if (n.textContent.includes(textToRemove)) {
            n.textContent = n.textContent.replace(textToRemove, '');
            // If parent is now empty, hide it (e.g. empty <p>)
            if (!n.textContent.trim() && n.parentNode && n.parentNode !== root) {
                // Type assertion: parentNode is HTMLElement when it has style property
                /** @type {HTMLElement} */ (n.parentNode).style.display = 'none';
            }
            return; // Found and removed
        }
        // Handle partial splits if needed? 
        // For now, assume the JSON array doesn't span multiple block elements in a way that breaks this simple check
        // (Marked usually puts the whole block in one <p> or <pre>)
    }

    // Fallback: If exact text match failed (formatting differences), try to hide elements containing "suggestions" tag
    if (textToRemove.includes('suggestions')) {
        const elements = root.querySelectorAll('*');
        elements.forEach(el => {
            if (el.textContent.includes('<suggestions>') || el.textContent.includes('[') && el.textContent.includes(']')) {
                // Heuristic: if it looks like the suggestion block
                if (el.textContent.length < textToRemove.length + 20) {
                    // Type assertion: el is HTMLElement when it has style property
                    /** @type {HTMLElement} */ (el).style.display = 'none';
                }
            }
        });
    }
}


// Helper to render suggestion buttons
function renderSuggestions(container, suggestions) {
    let suggestionsDiv = container.querySelector('.suggestions-container');
    if (!suggestionsDiv) {
        suggestionsDiv = document.createElement('div');
        suggestionsDiv.className = 'suggestions-container';
        container.appendChild(suggestionsDiv);
    } else {
        suggestionsDiv.innerHTML = '';
    }

    suggestions.forEach(text => {
        const btn = document.createElement('button');
        btn.className = 'suggestion-pill-btn';
        btn.textContent = text;

        btn.onclick = () => {
            document.dispatchEvent(new CustomEvent('gemini-suggestion-click', { detail: text }));
        };
        suggestionsDiv.appendChild(btn);
    });
}

// Helper function to escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
