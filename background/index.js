
// background/index.js
// background/index.js
import { GeminiSessionManager } from './managers/session_manager.js';
import { ImageManager } from './managers/image_manager.js';
import { BrowserControlManager } from './managers/control_manager.js';
import { LogManager } from './managers/log_manager.js';
import { MCPManager } from './managers/mcp_manager.js';
import { VideoManager } from './managers/video_manager.js';
import { setupContextMenus } from './menus.js';
import { setupMessageListener } from './messages.js';
import { keepAliveManager } from './managers/keep_alive.js';

// Setup Sidepanel
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Initialize Managers
const logManager = new LogManager();
const sessionManager = new GeminiSessionManager();
const imageManager = new ImageManager();
const controlManager = new BrowserControlManager();
const mcpManager = new MCPManager();
const videoManager = new VideoManager();

// Initialize modules
mcpManager.init(); // Start MCP connections
setupContextMenus(imageManager);
setupMessageListener(sessionManager, imageManager, controlManager, logManager, mcpManager, videoManager);

// Initialize Advanced Keep-Alive (Cookie Rotation)
keepAliveManager.init();
