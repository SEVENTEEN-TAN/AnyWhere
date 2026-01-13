// background/control/file_operations.js
/**
 * File Operations - AI Workspace file management
 * Allows AI to save collected data and files to user's specified location
 */

export class FileOperations {
    constructor() {
        this.workspaceRoot = 'gemini-workspace';
        this.useCustomPath = false; // Whether to prompt user for save location
        this.defaultPath = '';
        this.initialized = false;
    }

    /**
     * Initialize file operations - load user preferences
     */
    async initialize() {
        if (this.initialized) return;

        try {
            const result = await chrome.storage.local.get(['geminiWorkspacePath', 'geminiWorkspacePrompt']);

            // Check if user has set a custom workspace path
            if (typeof result.geminiWorkspacePath === 'string') {
                this.defaultPath = result.geminiWorkspacePath;
                console.log('[FileOps] Using custom workspace path:', this.defaultPath);
            }

            // Check if user wants to be prompted for save location
            this.useCustomPath = result.geminiWorkspacePrompt !== false; // Default true

            this.initialized = true;
        } catch (error) {
            console.error('[FileOps] Failed to initialize:', error);
            this.initialized = true; // Continue with defaults
        }
    }

    /**
     * Write text content to a file
     * @param {Object} args - { filename, content, directory, format, saveAs }
     * @returns {Promise<Object>} Download result
     */
    async writeFile(args) {
        await this.initialize();
        
        const {
            filename,
            content,
            directory = '',
            format = 'txt',
            encoding = 'utf-8',
            saveAs = this.useCustomPath // Allow user to choose location
        } = args;

        if (!filename) {
            throw new Error('Filename is required');
        }

        if (content === undefined || content === null) {
            throw new Error('Content is required');
        }

        // Ensure directory exists if not using saveAs prompt
        if (!saveAs && directory) {
            await this._ensureDirectoryExists(directory);
        }

        // Construct full path
        const fullPath = this._constructPath(directory, filename, format);

        // Convert content to appropriate format
        const blob = this._createBlob(content, format, encoding);
        const dataUrl = await this._blobToDataUrl(blob);

        // Trigger download
        try {
            const downloadId = await chrome.downloads.download({
                url: dataUrl,
                filename: fullPath,
                saveAs: saveAs, // Let user choose location if true
                conflictAction: 'uniquify' // Auto-rename if file exists
            });

            console.log(`[FileOps] File saved: ${fullPath} (Download ID: ${downloadId})`);

            return {
                success: true,
                path: fullPath,
                downloadId: downloadId,
                size: blob.size,
                message: saveAs 
                    ? `File will be saved to your chosen location: ${filename}.${format}`
                    : `File saved to Downloads/${fullPath}`
            };
        } catch (error) {
            console.error('[FileOps] Download failed:', error);
            throw new Error(`Failed to save file: ${error.message}`);
        }
    }

    /**
     * Write JSON data to a file
     * @param {Object} args - { filename, data, directory, pretty }
     */
    async writeJSON(args) {
        const { filename, data, directory = '', pretty = true } = args;

        if (!data) {
            throw new Error('Data is required for JSON file');
        }

        const content = pretty 
            ? JSON.stringify(data, null, 2)
            : JSON.stringify(data);

        return await this.writeFile({
            filename,
            content,
            directory,
            format: 'json'
        });
    }

    /**
     * Write CSV data to a file
     * @param {Object} args - { filename, data, directory, headers }
     */
    async writeCSV(args) {
        const { filename, data, directory = '', headers = null } = args;

        if (!Array.isArray(data)) {
            throw new Error('Data must be an array for CSV file');
        }

        let csvContent = '';

        // Add headers if provided
        if (headers) {
            csvContent += headers.join(',') + '\n';
        }

        // Add data rows
        for (const row of data) {
            if (Array.isArray(row)) {
                csvContent += row.map(cell => this._escapeCsvCell(cell)).join(',') + '\n';
            } else if (typeof row === 'object') {
                const values = headers 
                    ? headers.map(h => row[h] || '')
                    : Object.values(row);
                csvContent += values.map(cell => this._escapeCsvCell(cell)).join(',') + '\n';
            }
        }

        return await this.writeFile({
            filename,
            content: csvContent,
            directory,
            format: 'csv'
        });
    }

    /**
     * Write Markdown content to a file
     * @param {Object} args - { filename, content, directory }
     */
    async writeMarkdown(args) {
        const { filename, content, directory = '' } = args;

        return await this.writeFile({
            filename,
            content,
            directory,
            format: 'md'
        });
    }

    /**
     * Append content to an existing file
     * Note: Due to Chrome extension limitations, this creates a new file with appended content
     */
    async appendFile(args) {
        const { filename, content, directory = '', format = 'txt' } = args;

        // In Chrome extensions, we can't truly append to files
        // Instead, we create a timestamped version
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const appendedFilename = `${filename}_${timestamp}`;

        return await this.writeFile({
            filename: appendedFilename,
            content,
            directory,
            format
        });
    }

    /**
     * Create a directory structure in the download path
     * Note: Chrome downloads API doesn't support directory creation directly,
     * but we can simulate it with path prefixes
     */
    async createDirectory(args) {
        await this.initialize();
        const { path } = args;

        // Validate path
        if (!path || path.includes('..')) {
            throw new Error('Invalid directory path');
        }

        return await this._ensureDirectoryExists(path);
    }

    /**
     * Internal method to ensure directory exists by creating a placeholder
     * @private
     */
    async _ensureDirectoryExists(directory) {
        // Check if we've already created this directory in this session
        if (!this._createdDirs) {
            this._createdDirs = new Set();
        }

        const normalizedPath = directory.replace(/\\/g, '/').trim();
        if (this._createdDirs.has(normalizedPath)) {
            return { success: true, path: normalizedPath, cached: true };
        }

        // Create a placeholder file to establish the directory
        const placeholderPath = this._constructPath(directory, '.gitkeep', 'txt');
        const blob = new Blob(['# Gemini Workspace Directory\nThis folder was created by Gemini Nexus AI.'], 
                             { type: 'text/plain' });
        const dataUrl = await this._blobToDataUrl(blob);

        try {
            await chrome.downloads.download({
                url: dataUrl,
                filename: placeholderPath,
                saveAs: false,
                conflictAction: 'overwrite'
            });

            // Cache this directory as created
            this._createdDirs.add(normalizedPath);
            console.log(`[FileOps] Directory ensured: ${normalizedPath}`);

            return {
                success: true,
                path: normalizedPath
            };
        } catch (error) {
            console.error('[FileOps] Directory creation failed:', error);
            // Don't throw - allow file save to attempt anyway
            return {
                success: false,
                path: normalizedPath,
                error: error.message
            };
        }
    }

    /**
     * List downloaded files (from Chrome downloads history)
     */
    async listFiles(args = {}) {
        const { directory = '', limit = 100 } = args;

        try {
            const downloads = await chrome.downloads.search({
                filenameRegex: directory ? `^${this.workspaceRoot}/${directory}/.*` : `^${this.workspaceRoot}/.*`,
                limit: limit,
                orderBy: ['-startTime']
            });

            return {
                success: true,
                files: downloads.map(d => ({
                    filename: d.filename,
                    path: d.filename.replace(`${this.workspaceRoot}/`, ''),
                    size: d.fileSize,
                    downloaded: d.endTime,
                    state: d.state
                }))
            };
        } catch (error) {
            console.error('[FileOps] List files failed:', error);
            return { success: false, files: [], error: error.message };
        }
    }

    // --- Helper Methods ---

    _constructPath(directory, filename, format) {
        // Sanitize filename
        const sanitized = filename.replace(/[^a-zA-Z0-9_\-\u4e00-\u9fa5]/g, '_');
        
        // Add extension if not present
        const hasExtension = sanitized.includes('.');
        const finalFilename = hasExtension ? sanitized : `${sanitized}.${format}`;

        // Construct full path based on user preferences
        let fullPath = '';
        
        if (this.defaultPath) {
            // User has set a custom workspace path
            fullPath = this.defaultPath;
        } else {
            // Use default Downloads/gemini-workspace
            fullPath = this.workspaceRoot;
        }
        
        if (directory) {
            // Sanitize directory path
            const sanitizedDir = directory.replace(/\\/g, '/').replace(/[^a-zA-Z0-9_\-\/\u4e00-\u9fa5]/g, '_');
            fullPath += '/' + sanitizedDir;
        }
        
        fullPath += '/' + finalFilename;
        
        return fullPath;
    }

    _createBlob(content, format, encoding) {
        let mimeType = 'text/plain';
        
        switch (format) {
            case 'json':
                mimeType = 'application/json';
                break;
            case 'csv':
                mimeType = 'text/csv';
                break;
            case 'md':
            case 'markdown':
                mimeType = 'text/markdown';
                break;
            case 'html':
                mimeType = 'text/html';
                break;
            case 'xml':
                mimeType = 'application/xml';
                break;
        }

        return new Blob([content], { type: `${mimeType};charset=${encoding}` });
    }

    async _blobToDataUrl(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    _escapeCsvCell(cell) {
        if (cell === null || cell === undefined) return '';
        
        const str = String(cell);
        
        // Escape quotes and wrap in quotes if contains comma, quote, or newline
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return '"' + str.replace(/"/g, '""') + '"';
        }
        
        return str;
    }

    /**
     * Batch write multiple files
     */
    async batchWrite(args) {
        const { files } = args;

        if (!Array.isArray(files)) {
            throw new Error('Files must be an array');
        }

        const results = [];

        for (const file of files) {
            try {
                let result;
                
                switch (file.type || 'text') {
                    case 'json':
                        result = await this.writeJSON(file);
                        break;
                    case 'csv':
                        result = await this.writeCSV(file);
                        break;
                    case 'markdown':
                        result = await this.writeMarkdown(file);
                        break;
                    default:
                        result = await this.writeFile(file);
                }
                
                results.push({ ...result, filename: file.filename });
            } catch (error) {
                results.push({
                    success: false,
                    filename: file.filename,
                    error: error.message
                });
            }
        }

        return {
            success: true,
            results: results,
            total: files.length,
            succeeded: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length
        };
    }
}
