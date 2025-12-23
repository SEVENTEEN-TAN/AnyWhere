
// ui_sidebar.js -> sandbox/ui/sidebar.js
import { t } from '../core/i18n.js';

export class SidebarController {
    constructor(elements, callbacks) {
        this.sidebar = elements.sidebar;
        this.overlay = elements.sidebarOverlay;
        this.listEl = elements.historyListEl;
        this.toggleBtn = elements.historyToggleBtn;
        this.closeBtn = elements.closeSidebarBtn;

        // Search Elements
        this.searchInput = document.getElementById('history-search');

        this.callbacks = callbacks || {};

        // State for search
        this.allSessions = [];
        this.currentSessionId = null;
        this.itemCallbacks = null;
        this.fuse = null;

        this.initListeners();
    }

    initListeners() {
        if (this.toggleBtn) {
            this.toggleBtn.addEventListener('click', () => this.toggle());
        }
        if (this.closeBtn) {
            this.closeBtn.addEventListener('click', () => this.close());
        }
        if (this.overlay) {
            this.overlay.addEventListener('click', () => {
                this.close();
                if (this.callbacks.onOverlayClick) {
                    this.callbacks.onOverlayClick();
                }
            });
        }
        if (this.searchInput) {
            this.searchInput.addEventListener('input', (e) => this.handleSearch(e.target.value));
        }
    }

    toggle() {
        if (this.sidebar) this.sidebar.classList.toggle('open');
        if (this.overlay) this.overlay.classList.toggle('visible');

        // Auto-focus search if opening
        if (this.sidebar && this.sidebar.classList.contains('open') && this.searchInput) {
            setTimeout(() => this.searchInput.focus(), 100);
        }
    }

    close() {
        if (this.sidebar) this.sidebar.classList.remove('open');
        if (this.overlay) this.overlay.classList.remove('visible');
    }

    _initSearch() {
        if (this.fuse) return;

        if (window.Fuse && this.allSessions && this.allSessions.length > 0) {
            this.fuse = new window.Fuse(this.allSessions, {
                keys: [
                    { name: 'title', weight: 0.7 },
                    { name: 'messages.text', weight: 0.3 }
                ],
                threshold: 0.4,
                ignoreLocation: true
            });
        }
    }

    handleSearch(query) {
        if (!this.allSessions) return;

        let displayList = this.allSessions;

        // Lazy Init Fuse
        this._initSearch();

        if (query.trim() && this.fuse) {
            const results = this.fuse.search(query);
            displayList = results.map(r => r.item);
        }

        this._renderDOM(displayList);
    }

    renderList(sessions, currentId, itemCallbacks) {
        if (!this.listEl) return;

        // Cache data for searching
        this.allSessions = sessions;
        this.currentSessionId = currentId;
        this.itemCallbacks = itemCallbacks;

        // Reset Fuse index as data changed
        this.fuse = null;

        // Check if there is an active search query
        const currentQuery = this.searchInput ? this.searchInput.value : '';
        if (currentQuery.trim()) {
            this.handleSearch(currentQuery);
        } else {
            this._renderDOM(this.allSessions);
        }
    }

    _renderDOM(sessions) {
        this.listEl.innerHTML = '';

        if (sessions.length === 0) {
            const emptyEl = document.createElement('div');
            emptyEl.style.padding = '16px';
            emptyEl.style.textAlign = 'center';
            emptyEl.style.color = 'var(--text-tertiary)';
            emptyEl.style.fontSize = '13px';
            emptyEl.textContent = t('noConversations');
            this.listEl.appendChild(emptyEl);
            return;
        }

        sessions.forEach(s => {
            const item = document.createElement('div');
            item.className = `history-item ${s.id === this.currentSessionId ? 'active' : ''}`;
            item.onclick = (e) => {
                // Ignore if clicking input or buttons
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'SPAN' || e.target.tagName === 'svg' || e.target.tagName === 'path') return;

                this.itemCallbacks.onSwitch(s.id);
                // On mobile or small screens, maybe auto-close sidebar?
                // Keeping current behavior: explicit close required or select closes
                if (window.innerWidth < 600) {
                    this.close();
                }
            };

            // Title Container
            const titleContainer = document.createElement('div');
            titleContainer.className = 'history-title-container';
            titleContainer.style.display = 'flex';
            titleContainer.style.alignItems = 'center';
            titleContainer.style.flex = '1';
            titleContainer.style.overflow = 'hidden';

            const titleSpan = document.createElement('span');
            titleSpan.className = 'history-title';
            titleSpan.textContent = s.title;
            titleSpan.onclick = () => this.itemCallbacks.onSwitch(s.id); // Also switch on title click

            titleContainer.appendChild(titleSpan);

            // Actions Container
            const actionsContainer = document.createElement('div');
            actionsContainer.className = 'history-actions';
            actionsContainer.style.display = 'flex';
            actionsContainer.style.gap = '4px';

            // Rename Button
            const renameBtn = document.createElement('span');
            renameBtn.className = 'history-action-btn';
            renameBtn.innerHTML = '✎'; // Minimal pencil icon
            renameBtn.title = t('rename');
            renameBtn.style.cursor = 'pointer';
            renameBtn.style.opacity = '0.6';
            renameBtn.style.fontSize = '14px';

            renameBtn.onclick = (e) => {
                e.stopPropagation();

                // Switch to Edit Mode
                titleSpan.style.display = 'none';

                const input = document.createElement('input');
                input.type = 'text';
                input.value = s.title;
                input.className = 'history-rename-input';
                input.style.flex = '1';
                input.style.minWidth = '0';
                input.style.border = '1px solid var(--border-color)';
                input.style.borderRadius = '4px';
                input.style.padding = '2px 4px';
                input.style.fontSize = '13px';
                input.style.background = 'var(--bg-secondary)';
                input.style.color = 'var(--text-primary)';

                // Check Function to Save
                const save = () => {
                    const newTitle = input.value.trim();
                    if (newTitle && newTitle !== s.title) {
                        this.itemCallbacks.onRename(s.id, newTitle);
                    } else {
                        // Revert
                        input.remove();
                        titleSpan.style.display = '';
                    }
                };

                input.onkeydown = (ev) => {
                    if (ev.key === 'Enter') {
                        save();
                    } else if (ev.key === 'Escape') {
                        input.remove();
                        titleSpan.style.display = '';
                    }
                };

                input.onblur = () => {
                    save(); // Save on blur
                };

                titleContainer.appendChild(input);
                input.focus();
            };

            // Delete Button
            const delBtn = document.createElement('span');
            delBtn.className = 'history-action-btn';
            delBtn.innerHTML = '✕';
            delBtn.title = t('delete');
            delBtn.style.cursor = 'pointer';
            delBtn.style.opacity = '0.6';
            delBtn.style.fontSize = '14px';

            delBtn.onclick = (e) => {
                e.stopPropagation();
                if (confirm(t('deleteChatConfirm'))) {
                    this.itemCallbacks.onDelete(s.id);
                }
            };

            // Hover effects handled by CSS usually, but setting inline styles for now as requested to avoid CSS files if possible, 
            // but cleaner to just have class names. I will assume existing CSS handles basic hover opacity or just leave simple.
            // Using inline styles for quick iteration as I cannot see all CSS.

            actionsContainer.appendChild(renameBtn);
            actionsContainer.appendChild(delBtn);

            item.appendChild(titleContainer);
            item.appendChild(actionsContainer);
            this.listEl.appendChild(item);
        });
    }
}
