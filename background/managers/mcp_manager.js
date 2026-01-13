
export class MCPManager {
    constructor() {
        this.servers = {}; // { id: { config, eventSource, postUrl, tools, status } }
        this.initialized = false;
    }

    async init() {
        if (this.initialized) return;

        await this.loadConfig();

        // Auto-connect to enabled servers
        for (const id of Object.keys(this.servers)) {
            this.connectServer(id);
        }

        this.initialized = true;
    }

    async loadConfig() {
        const data = await chrome.storage.local.get('mcpConfig');
        const rawConfig = data.mcpConfig;
        const config = (rawConfig && typeof rawConfig === 'object' && 'mcpServers' in rawConfig)
            ? rawConfig
            : { mcpServers: {} };

        // Merge with internal state (preserving connections if config hasn't changed?
        // For simplicity, we might just fully reload if called, but usually init is once)
        // Here we just initialize empty state from config.
        const mcpServers = config.mcpServers || {};
        for (const [name, serverConfig] of Object.entries(mcpServers)) {
            // Use name as ID
            this.servers[name] = {
                config: serverConfig,
                eventSource: null,
                postUrl: null,
                tools: [],
                status: 'disconnected'
            };
        }
    }

    async saveConfig(jsonStr) {
        try {
            const parsed = JSON.parse(jsonStr);
            if (!parsed.mcpServers) throw new Error("Missing 'mcpServers' key");

            await chrome.storage.local.set({ mcpConfig: parsed });

            // Re-initialize connections
            this.disconnectAll();
            this.servers = {};
            await this.loadConfig(); // Reload from storage

            // Re-connect
            for (const id of Object.keys(this.servers)) {
                this.connectServer(id);
            }

            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    disconnectAll() {
        for (const server of Object.values(this.servers)) {
            if (server.eventSource) {
                server.eventSource.close();
            }
        }
    }

    connectServer(id) {
        const server = this.servers[id];
        if (!server) return;

        const serverConfig = server.config;
        const url = serverConfig.url || serverConfig.endpoint;
        const type = serverConfig.type || 'sse'; // Default to SSE if not specified

        if (!url) {
            console.error(`[MCP] ${id} No URL/Endpoint found in config`);
            server.status = 'error';
            return;
        }

        console.log(`[MCP] Connecting to ${id} at ${url} (type: ${type})`);

        // For streamable_http / HTTP mode: Use direct POST, no SSE
        if (type === 'streamable_http' || type === 'http') {
            server.postUrl = url;
            server.status = 'connected';
            console.log(`[MCP] ${id} Using HTTP mode (POST to ${url})`);

            // Immediately try to fetch tools
            this.refreshToolsHttp(id);
            return;
        }

        // For SSE mode (standard MCP over HTTP with SSE)
        server.status = 'connecting';

        fetch(url, { method: 'GET', headers: { 'Accept': 'text/event-stream, application/json' } })
            .then(async res => {
                const contentType = res.headers.get('content-type');
                console.log(`[MCP] ${id} Probe Content-Type: ${contentType}`);

                // If server returns JSON instead of SSE, switch to HTTP mode
                if (contentType && contentType.includes('application/json')) {
                    console.log(`[MCP] ${id} Server returned JSON, switching to HTTP mode`);
                    server.postUrl = url;
                    server.status = 'connected';
                    this.refreshToolsHttp(id);
                    return;
                }

                // Proceed with SSE
                const es = new EventSource(url);

                es.onopen = () => {
                    console.log(`[MCP] ${id} SSE Connected`);
                };

                es.onerror = (e) => {
                    console.error(`[MCP] ${id} SSE Error`, e);
                    server.status = 'error';
                };

                es.addEventListener('endpoint', (event) => {
                    const postUrl = new URL(event.data, url).toString();
                    console.log(`[MCP] ${id} received POST URL: ${postUrl}`);
                    server.postUrl = postUrl;
                    server.status = 'connected';
                    this.initializeSession(id);
                });

                es.onmessage = (event) => {
                    try {
                        const message = JSON.parse(event.data);
                        this.handleMessage(id, message);
                    } catch (e) {
                        console.error(`[MCP] ${id} Failed to parse message`, e);
                    }
                };

                server.eventSource = es;
            })
            .catch(err => {
                console.error(`[MCP] ${id} Probe Failed`, err);
                server.status = 'error';
            });
    }

    // HTTP-mode tool refresh (for streamable_http servers)
    async refreshToolsHttp(id) {
        const server = this.servers[id];
        if (!server || !server.postUrl) return;

        try {
            console.log(`[MCP] ${id} Fetching tools via HTTP...`);
            const response = await fetch(server.postUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: "2.0",
                    id: crypto.randomUUID(),
                    method: "tools/list",
                    params: {}
                })
            });

            const result = await response.json();
            console.log(`[MCP] ${id} tools/list raw response:`, JSON.stringify(result, null, 2));

            // Check for server error response
            if (result.error) {
                console.error(`[MCP] ${id} Server returned error:`, result.error.message || JSON.stringify(result.error));
                server.status = 'error';
                server.tools = [];
                return;
            }

            // Try multiple possible response formats
            let tools = null;

            if (result.result && result.result.tools) {
                // Standard JSON-RPC format: { result: { tools: [...] } }
                tools = result.result.tools;
                console.log(`[MCP] ${id} Found tools in result.result.tools`);
            } else if (result.tools) {
                // Direct format: { tools: [...] }
                tools = result.tools;
                console.log(`[MCP] ${id} Found tools in result.tools`);
            } else if (result.result && Array.isArray(result.result)) {
                // Alternative format: { result: [...] }
                tools = result.result;
                console.log(`[MCP] ${id} Found tools in result.result (array)`);
            } else if (Array.isArray(result)) {
                // Direct array format: [...]
                tools = result;
                console.log(`[MCP] ${id} Found tools as direct array`);
            }

            if (tools && Array.isArray(tools)) {
                server.tools = tools;
                console.log(`[MCP] ${id} Loaded ${server.tools.length} tools:`, tools.map(t => t.name));
            } else {
                console.warn(`[MCP] ${id} Could not parse tools from response. Expected 'result.tools', 'tools', or array format.`);
                console.warn(`[MCP] ${id} Response keys:`, Object.keys(result));
                server.tools = [];
            }
        } catch (e) {
            console.error(`[MCP] ${id} Failed to fetch tools via HTTP`, e);
        }
    }

    /**
     * Check if a server is in HTTP mode (streamable_http or http)
     */
    isHttpMode(id) {
        const server = this.servers[id];
        if (!server) return false;
        const type = server.config.type || 'sse';
        return type === 'streamable_http' || type === 'http';
    }

    /**
     * Send a request to an HTTP-mode server and wait for direct response
     * Unlike sendRequest(), this doesn't wait for SSE response
     */
    async sendRequestHttp(id, req) {
        const server = this.servers[id];
        if (!server || !server.postUrl) throw new Error("Server not ready");

        const jsonRpc = {
            jsonrpc: "2.0",
            id: crypto.randomUUID(),
            method: req.method,
            params: req.params || {}
        };

        console.log(`[MCP] ${id} HTTP Request:`, jsonRpc.method);

        const res = await fetch(server.postUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(jsonRpc)
        });

        if (!res.ok) {
            throw new Error(`HTTP Error ${res.status}`);
        }

        const result = await res.json();
        console.log(`[MCP] ${id} HTTP Response:`, result);

        if (result.error) {
            throw new Error(result.error.message || JSON.stringify(result.error));
        }

        return result.result;
    }

    async initializeSession(id) {
        // Send JSON-RPC initialize
        await this.sendRequest(id, {
            method: "initialize",
            params: {
                protocolVersion: "2024-11-05", // Example version
                capabilities: {
                    roots: { listChanged: true } // We are a client
                },
                clientInfo: {
                    name: "Gemini Nexus",
                    version: "4.0.0"
                }
            }
        });

        // Send initialized notification
        await this.sendNotification(id, {
            method: "notifications/initialized"
        });

        // List Tools
        this.refreshTools(id);
    }

    async refreshTools(id) {
        try {
            // Use HTTP mode if configured, otherwise use SSE mode
            if (this.isHttpMode(id)) {
                await this.refreshToolsHttp(id);
                return;
            }

            const response = await this.sendRequest(id, {
                method: "tools/list"
            });

            if (response && response.tools) {
                this.servers[id].tools = response.tools;
                console.log(`[MCP] ${id} Tools loaded:`, response.tools.length);
            }
        } catch (e) {
            console.error(`[MCP] ${id} Failed to list tools`, e);
        }
    }

    async sendRequest(id, req) {
        const server = this.servers[id];
        if (!server || !server.postUrl) throw new Error("Server not ready");

        const jsonRpc = {
            jsonrpc: "2.0",
            id: crypto.randomUUID(),
            method: req.method,
            params: req.params
        };

        // We use a promise map to handle responses coming back via SSE
        // For simplicity in this v1, we might implement a basic request/response correlating mechanism
        // But since fetch is one-way for sending, and response comes via SSE 'message' event...
        // We need a way to wait for the response.

        return new Promise(async (resolve, reject) => {
            // Set timeout
            const timeout = setTimeout(() => {
                delete this.pendingRequests[jsonRpc.id];
                reject(new Error("Timeout"));
            }, 10000);

            this.pendingRequests[jsonRpc.id] = { resolve, reject, timeout };

            try {
                const res = await fetch(server.postUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(jsonRpc)
                });

                if (!res.ok) {
                    throw new Error(`HTTP Error ${res.status}`);
                }
                // Note: The actual JSON-RPC response comes via SSE, not this fetch response usually?
                // Actually, standard MCP HTTP transport: "Responses to requests specific to a connection are sent via the SSE connection."
            } catch (e) {
                clearTimeout(timeout);
                delete this.pendingRequests[jsonRpc.id];
                reject(e);
            }
        });
    }

    async sendNotification(id, notif) {
        const server = this.servers[id];
        if (!server || !server.postUrl) return;

        const jsonRpc = {
            jsonrpc: "2.0",
            method: notif.method,
            params: notif.params
        };

        await fetch(server.postUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(jsonRpc)
        });
    }

    handleMessage(serverId, message) {
        if (message.id && this.pendingRequests[message.id]) {
            const { resolve, reject, timeout } = this.pendingRequests[message.id];
            clearTimeout(timeout);
            delete this.pendingRequests[message.id];

            if (message.error) {
                reject(message.error);
            } else {
                resolve(message.result);
            }
        } else {
            // Notification or request from server (e.g. logging)
            // Handle logging if needed
        }
    }

    // --- Debug API ---

    getDebugInfo() {
        const info = {};
        for (const [serverId, server] of Object.entries(this.servers)) {
            info[serverId] = {
                status: server.status,
                type: server.config?.type || 'sse',
                url: server.config?.url || server.config?.endpoint,
                postUrl: server.postUrl,
                toolCount: server.tools?.length || 0,
                tools: server.tools?.map(t => t.name) || []
            };
        }
        console.log('[MCP] Debug Info:', JSON.stringify(info, null, 2));
        return info;
    }

    // --- Public API for Gemini Integration ---

    getAllTools() {
        const allTools = [];
        for (const [serverId, server] of Object.entries(this.servers)) {
            if (server.tools) {
                for (const tool of server.tools) {
                    allTools.push({
                        ...tool,
                        _serverId: serverId
                    });
                }
            }
        }
        return allTools;
    }

    getSystemPrompt() {
        const tools = this.getAllTools();
        if (tools.length === 0) return null;

        let prompt = "You have access to the following tools via Model Context Protocol (MCP). To use a tool, output a JSON code block with the tool name and arguments.\n\nAvailable Tools:\n";

        for (const tool of tools) {
            prompt += `- ${tool.name}: ${tool.description || 'No description'}\n`;
            // Simplified schema representation for the prompt
            if (tool.inputSchema) {
                try {
                    const schema = JSON.stringify(tool.inputSchema.properties || {});
                    prompt += `  Arguments: ${schema}\n`;
                } catch (e) { }
            }
        }

        prompt += "\nTo invoke a tool, YOU MUST output a code block like this:\n```json\n{\n  \"action\": \"call_tool\",\n  \"tool\": \"tool_name\",\n  \"args\": { ... }\n}\n```\n";
        prompt += "Stop generating after outputting the tool call. I will provide the result in the next message.";

        return prompt;
    }

    // Get system prompt for specific server IDs only
    getSystemPromptForServers(serverIds) {
        if (!serverIds || serverIds.length === 0) return null;

        const tools = [];
        for (const id of serverIds) {
            const server = this.servers[id];
            if (server && server.tools && Array.isArray(server.tools)) {
                for (const tool of server.tools) {
                    tools.push({ ...tool, _serverId: id });
                }
            }
        }

        if (tools.length === 0) return null;

        let prompt = "You have access to the following tools via Model Context Protocol (MCP). To use a tool, output a JSON code block with the tool name and arguments.\n\nAvailable Tools:\n";

        for (const tool of tools) {
            prompt += `- ${tool.name}: ${tool.description || 'No description'}\n`;
            if (tool.inputSchema) {
                try {
                    const schema = JSON.stringify(tool.inputSchema.properties || {});
                    prompt += `  Arguments: ${schema}\n`;
                } catch (e) { }
            }
        }

        prompt += "\nTo invoke a tool, YOU MUST output a code block like this:\n```json\n{\n  \"action\": \"call_tool\",\n  \"tool\": \"tool_name\",\n  \"args\": { ... }\n}\n```\n";
        prompt += "Stop generating after outputting the tool call. I will provide the result in the next message.";

        return prompt;
    }

    async executeTool(name, args) {
        // Find which server has this tool
        let targetServerId = null;
        let originalName = name;

        // Debug: Log all available tools
        console.log(`[MCP] Looking for tool: ${name}`);
        for (const [serverId, server] of Object.entries(this.servers)) {
            console.log(`[MCP] Server ${serverId} has ${server.tools?.length || 0} tools:`,
                server.tools?.map(t => t.name) || []);
        }

        // Naive lookup
        for (const [serverId, server] of Object.entries(this.servers)) {
            if (!server.tools || !Array.isArray(server.tools)) continue;
            const tool = server.tools.find(t => t.name === name);
            if (tool) {
                targetServerId = serverId;
                break;
            }
        }

        if (!targetServerId) {
            // List all available tools in error message
            const allTools = this.getAllTools();
            const availableNames = allTools.map(t => t.name).join(', ') || 'none';
            throw new Error(`Tool ${name} not found. Available tools: ${availableNames}`);
        }

        console.log(`[MCP] Executing ${name} on ${targetServerId} (mode: ${this.isHttpMode(targetServerId) ? 'HTTP' : 'SSE'})`);

        const request = {
            method: "tools/call",
            params: {
                name: name,
                arguments: args
            }
        };

        // Use the appropriate request method based on server mode
        const result = this.isHttpMode(targetServerId)
            ? await this.sendRequestHttp(targetServerId, request)
            : await this.sendRequest(targetServerId, request);

        // Result usually has { content: [ { type: 'text', text: '...' } ], isError: boolean }
        return result;
    }
}

// Initialise pending requests map
MCPManager.prototype.pendingRequests = {};
