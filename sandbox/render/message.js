
// sandbox/render/message.js
import { renderContent } from './content.js';
import { copyToClipboard } from './clipboard.js';
import { createGeneratedImage } from './generated_image.js';
import { loadMarkmap } from '../libs/markmap-loader.js'; // Changed from mermaid


// Appends a message to the chat history and returns an update controller
// attachment can be:
// - string: single user image (URL/Base64)
// - array of strings: multiple user images
// - array of objects {url, alt}: AI generated images
// mcpIds: array of MCP server IDs used for this message (for AI messages)
export function appendMessage(container, text, role, attachment = null, thoughts = null, mcpIds = null) {
    const div = document.createElement('div');
    div.className = `msg ${role}`;

    // Store current text state
    let currentText = text || "";
    let currentThoughts = thoughts || "";
    let currentMcpIds = mcpIds || [];

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
            badge.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                    <line x1="8" y1="21" x2="16" y2="21"></line>
                    <line x1="12" y1="17" x2="12" y2="21"></line>
                </svg>
                <span>${escapeHtml(mcpId)}</span>
            `;
            userMcpContainer.appendChild(badge);
        });

        div.appendChild(userMcpContainer);
    }

    let contentDiv = null;
    let thoughtsDiv = null;
    let thoughtsContent = null;
    let mcpBadgeContainer = null;

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
            div.appendChild(thoughtsDiv);
        }

        contentDiv = document.createElement('div');
        renderContent(contentDiv, currentText, role);
        div.appendChild(contentDiv);

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

                div.appendChild(grid);
            }
        }

        // --- MCP Badge (for AI messages) ---
        if (role === 'ai') {
            mcpBadgeContainer = document.createElement('div');
            mcpBadgeContainer.className = 'mcp-badge-container';
            if (currentMcpIds.length === 0) {
                mcpBadgeContainer.style.display = 'none';
            }

            currentMcpIds.forEach(mcpId => {
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

            div.appendChild(mcpBadgeContainer);
        }

        // --- Add Copy Button ---
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
                currentText = newText;
                if (contentDiv) {
                    renderContent(contentDiv, currentText, role);
                    // Check for markmap blocks
                    const markmapNodes = contentDiv.querySelectorAll('.markmap-source');
                    if (markmapNodes.length > 0) {
                        loadMarkmap().then(({ Transformer, Markmap }) => {
                            const transformer = new Transformer();

                            markmapNodes.forEach(node => {
                                const markdown = node.textContent;
                                if (!markdown.trim()) return;

                                // Transform markdown to mindmap data
                                const { root } = transformer.transform(markdown);

                                // Create container
                                const container = document.createElement('div');
                                container.className = 'markmap-container';
                                container.style.width = '100%';
                                container.style.height = '350px';
                                container.style.border = '1px solid #ddd';
                                container.style.borderRadius = '8px';
                                container.style.overflow = 'hidden';
                                container.style.background = '#fafafa';
                                container.style.position = 'relative'; // For absolute positioning of button

                                const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                                svg.style.width = '100%';
                                svg.style.height = '100%';

                                container.appendChild(svg);

                                // --- Add Copy Button ---
                                const copyBtn = document.createElement('button');
                                copyBtn.className = 'copy-btn markmap-copy-btn';
                                copyBtn.title = 'Copy as Text';
                                copyBtn.style.position = 'absolute';
                                copyBtn.style.top = '10px';
                                copyBtn.style.right = '10px';
                                copyBtn.style.zIndex = '10';
                                copyBtn.style.background = 'white';
                                copyBtn.style.border = '1px solid #ccc';
                                copyBtn.style.borderRadius = '4px';
                                copyBtn.style.padding = '4px';
                                copyBtn.style.cursor = 'pointer';
                                copyBtn.style.display = 'flex';
                                copyBtn.style.alignItems = 'center';
                                copyBtn.style.justifyContent = 'center';
                                copyBtn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';

                                const copyIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
                                const checkIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4caf50" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';

                                copyBtn.innerHTML = copyIcon;

                                copyBtn.onclick = async () => {
                                    try {
                                        // Helper to decode HTML entities
                                        const decodeHtml = (html) => {
                                            const txt = document.createElement('textarea');
                                            txt.innerHTML = html;
                                            return txt.value;
                                        };

                                        // Generate hierarchical text from root node
                                        const generateText = (node, depth = 0) => {
                                            const indent = '  '.repeat(depth);
                                            // Strip HTML tags (keep content)
                                            let content = node.content.replace(/<[^>]*>/g, '');
                                            // Decode entities (basic & numeric)
                                            content = decodeHtml(content);

                                            let text = `${indent}${content}\n`;
                                            if (node.children && node.children.length > 0) {
                                                node.children.forEach(child => {
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

                                container.appendChild(copyBtn);

                                // Replace the hidden source div with the chart container
                                node.replaceWith(container);

                                // Render interactive mindmap
                                Markmap.create(svg, null, root);
                            });
                        }).catch(e => console.warn("Markmap load failed", e));
                    }
                }
            }

            if (newThoughts !== undefined && thoughtsContent) {
                currentThoughts = newThoughts;
                renderContent(thoughtsContent, currentThoughts || "", 'ai');
                if (currentThoughts) {
                    thoughtsDiv.style.display = 'block';
                }
            }

            // Note: We removed the auto-scroll-to-bottom logic here.
            // If the user is at the start of the message, we want them to stay there
            // as the content expands downwards.
        },
        // Function to update images if they arrive late (though mostly synchronous in final reply)
        addImages: (images) => {
            if (Array.isArray(images) && images.length > 0 && !div.querySelector('.generated-images-grid')) {
                const grid = document.createElement('div');
                grid.className = 'generated-images-grid';

                // Only show the first generated image
                const firstImage = images[0];
                grid.appendChild(createGeneratedImage(firstImage));

                // Insert before copy button
                div.insertBefore(grid, div.querySelector('.copy-btn'));
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

// Helper function to escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
