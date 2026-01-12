
// sandbox/boot/app.js
import { renderLayout } from '../ui/layout.js';
import { applyTranslations } from '../core/i18n.js';
import { configureMarkdown } from '../render/config.js';
import { sendToBackground } from '../../lib/messaging.js';
import { loadLibs } from './loader.js';
import { AppMessageBridge } from './messaging.js';
import { bindAppEvents } from './events.js';

export function initAppMode() {
    // 0. Render App Layout (Before DOM query)
    renderLayout();

    // 1. Apply Initial Translations
    applyTranslations();

    // 2. Signal Ready Immediately
    window.parent.postMessage({ action: 'UI_READY' }, '*');

    // 3. Initialize Message Bridge
    const bridge = new AppMessageBridge();

    // 4. Listen for Language Changes (DOM level)
    document.addEventListener('gemini-language-changed', () => {
        applyTranslations();
    });

    // 5. Async Bootstrapping
    (async () => {
        try {
            // --- CRITICAL: Load dependencies FIRST before any rendering ---
            await loadLibs();
            console.log("[App] Libraries loaded successfully");
            console.log("[App] Available globals:", {
                'd3': typeof window.d3,
                'markmap': typeof window.markmap,
                'katex': typeof window.katex,
                'hljs': typeof window.hljs
            });
            configureMarkdown(); // Ensure marked is configured

            // Dynamic Import of Application Logic
            const [
                { ImageManager },
                { SessionManager },
                { UIController },
                { AppController }
            ] = await Promise.all([
                import('../core/image_manager.js'),
                import('../core/session_manager.js'),
                import('../ui/ui_controller.js'),
                import('../controllers/app_controller.js')
            ]);

            // Init Managers
            const sessionManager = new SessionManager();

            const ui = new UIController({
                historyListEl: document.getElementById('history-list'),
                sidebar: document.getElementById('history-sidebar'),
                sidebarOverlay: document.getElementById('sidebar-overlay'),
                statusDiv: document.getElementById('status'),
                historyDiv: document.getElementById('chat-history'),
                inputFn: document.getElementById('prompt'),
                sendBtn: document.getElementById('send'),
                historyToggleBtn: document.getElementById('history-toggle'),
                closeSidebarBtn: document.getElementById('close-sidebar'),
                modelSelect: document.getElementById('model-select')
            });

            const imageManager = new ImageManager({
                imageInput: document.getElementById('image-input'),
                imagePreview: document.getElementById('image-preview'),
                previewThumb: document.getElementById('preview-thumb'),
                removeImgBtn: document.getElementById('remove-img'),
                inputWrapper: document.querySelector('.input-wrapper'),
                inputFn: document.getElementById('prompt')
            }, {
                onUrlDrop: (url) => {
                    ui.updateStatus("Loading image...");
                    sendToBackground({ action: "FETCH_IMAGE", url: url });
                }
            });

            // Initialize Controller
            const app = new AppController(sessionManager, ui, imageManager);

            // Initialize Gems after app is ready
            app.initializeGems();

            // Connect Bridge to App Instances
            bridge.setUI(ui);
            bridge.setApp(app);

            // Bind DOM Events
            bindAppEvents(app, ui, (fn) => bridge.setResizeFn(fn));
        } catch (error) {
            console.error("[App] Failed to initialize application:", error);
            // Display error to user
            document.body.innerHTML = `
                <div style="padding: 20px; color: #d32f2f; font-family: sans-serif;">
                    <h2>⚠️ Initialization Failed</h2>
                    <p>Failed to load required libraries. Please:</p>
                    <ul>
                        <li>Check browser console for detailed errors</li>
                        <li>Ensure all vendor files are present</li>
                        <li>Try reloading the extension</li>
                    </ul>
                    <pre style="background: #f5f5f5; padding: 10px; border-radius: 4px; overflow: auto;">${error.stack || error.message}</pre>
                </div>
            `;
        }
    })();
}
