import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export class McpAutoInstaller {
    static getKnownIdes() {
        const homedir = os.homedir();
        const platform = process.platform;
        const appdata = process.env.APPDATA || path.join(homedir, 'AppData', 'Roaming');
        return [
            {
                id: 'claude',
                name: 'Claude Desktop',
                getConfigPath: () => {
                    if (platform === 'win32')
                        return path.join(appdata, 'Claude', 'claude_desktop_config.json');
                    if (platform === 'darwin')
                        return path.join(homedir, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
                    return path.join(homedir, '.config', 'Claude', 'claude_desktop_config.json');
                },
                serverKey: 'mcpServers',
                format: 'mcpServers',
            },
            {
                id: 'gemini',
                name: 'Antigravity / Gemini CLI',
                getConfigPath: () => path.join(homedir, '.gemini', 'config', 'mcp_config.json'),
                serverKey: 'mcpServers',
                format: 'mcpServers',
            },
            {
                id: 'vscode',
                name: 'VS Code (Native MCP)',
                getConfigPath: () => {
                    if (platform === 'win32')
                        return path.join(appdata, 'Code', 'User', 'mcp.json');
                    if (platform === 'darwin')
                        return path.join(homedir, 'Library', 'Application Support', 'Code', 'User', 'mcp.json');
                    return path.join(homedir, '.config', 'Code', 'User', 'mcp.json');
                },
                serverKey: 'servers',
                format: 'vscode',
            },
            {
                id: 'cursor',
                name: 'Cursor IDE',
                getConfigPath: () => path.join(homedir, '.cursor', 'mcp.json'),
                serverKey: 'mcpServers',
                format: 'mcpServers',
            },
            {
                id: 'windsurf',
                name: 'Windsurf (Codeium)',
                getConfigPath: () => path.join(homedir, '.codeium', 'windsurf', 'mcp_config.json'),
                serverKey: 'mcpServers',
                format: 'mcpServers',
            },
            {
                id: 'cline',
                name: 'Cline (VS Code Extension)',
                getConfigPath: () => {
                    const sub = path.join('Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json');
                    if (platform === 'win32')
                        return path.join(appdata, sub);
                    if (platform === 'darwin')
                        return path.join(homedir, 'Library', 'Application Support', sub);
                    return path.join(homedir, '.config', sub);
                },
                serverKey: 'mcpServers',
                format: 'mcpServers',
            },
            {
                id: 'roo',
                name: 'Roo Code / Roo Cline',
                getConfigPath: () => {
                    const sub = path.join('Code', 'User', 'globalStorage', 'rooveterinaryinc.roo-cline', 'settings', 'cline_mcp_settings.json');
                    if (platform === 'win32')
                        return path.join(appdata, sub);
                    if (platform === 'darwin')
                        return path.join(homedir, 'Library', 'Application Support', sub);
                    return path.join(homedir, '.config', sub);
                },
                serverKey: 'mcpServers',
                format: 'mcpServers',
            },
            {
                id: 'continue',
                name: 'Continue.dev',
                getConfigPath: () => path.join(homedir, '.continue', 'config.json'),
                serverKey: 'mcpServers',
                format: 'mcpServers',
            },
            {
                id: 'zed',
                name: 'Zed Editor',
                getConfigPath: () => path.join(homedir, '.config', 'zed', 'settings.json'),
                serverKey: 'context_servers',
                format: 'zed',
            },
        ];
    }
    /**
     * Scan system and return list of detected IDE configurations
     */
    static scan() {
        const ides = this.getKnownIdes();
        return ides.map((ide) => {
            const configPath = ide.getConfigPath();
            return {
                ...ide,
                path: configPath,
                exists: fs.existsSync(configPath),
            };
        });
    }
    /**
     * Install/Configure MCP server into target IDEs
     */
    static install(options = {}) {
        const serverName = options.serverName || 'ssh-remote-mcp';
        const mode = options.mode || 'local';
        const results = [];
        // Default configuration for ssh-remote-mcp
        let defaultMcpConfig;
        if (options.serverConfig) {
            defaultMcpConfig = options.serverConfig;
        }
        else if (mode === 'npx') {
            defaultMcpConfig = {
                command: 'npx',
                args: ['-y', 'github:nguyenquocanhz/ssh-remote-mcp'],
            };
        }
        else {
            // Local installation mode
            const nodeExe = process.execPath;
            const scriptPath = path.resolve(__dirname, '..', 'index.js');
            defaultMcpConfig = {
                command: nodeExe,
                args: [scriptPath],
            };
        }
        const scanned = this.scan();
        for (const item of scanned) {
            if (options.targetIdeIds && !options.targetIdeIds.includes(item.id)) {
                continue;
            }
            // If not forceAll, only configure IDEs whose config file or parent directory already exists
            const configPath = item.path;
            const dirExists = fs.existsSync(path.dirname(configPath));
            const fileExists = fs.existsSync(configPath);
            if (!fileExists && !dirExists && !options.forceAll) {
                results.push({
                    ideId: item.id,
                    ideName: item.name,
                    configPath,
                    status: 'SKIPPED',
                    message: 'IDE not detected on this system (directory does not exist).',
                });
                continue;
            }
            try {
                let configData = {};
                let backupPath = undefined;
                if (fileExists) {
                    const raw = fs.readFileSync(configPath, 'utf8');
                    try {
                        configData = JSON.parse(raw);
                    }
                    catch (e) {
                        results.push({
                            ideId: item.id,
                            ideName: item.name,
                            configPath,
                            status: 'FAILED',
                            message: `Invalid JSON syntax in existing file: ${e.message}`,
                        });
                        continue;
                    }
                    // Backup existing config
                    if (!options.dryRun) {
                        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                        backupPath = `${configPath}.matlock.bak.${timestamp}`;
                        fs.copyFileSync(configPath, backupPath);
                    }
                }
                // Determine server key
                const serverKey = item.serverKey;
                if (!configData[serverKey] || typeof configData[serverKey] !== 'object') {
                    configData[serverKey] = {};
                }
                // Format specific adjustments
                let finalServerEntry = { ...defaultMcpConfig };
                if (item.format === 'zed') {
                    finalServerEntry = {
                        command: defaultMcpConfig.command,
                        args: defaultMcpConfig.args,
                    };
                }
                const isAlreadyConfigured = JSON.stringify(configData[serverKey][serverName]) === JSON.stringify(finalServerEntry);
                if (isAlreadyConfigured) {
                    results.push({
                        ideId: item.id,
                        ideName: item.name,
                        configPath,
                        status: 'ALREADY_CONFIGURED',
                        message: `${serverName} is already configured identically in ${item.name}.`,
                    });
                    continue;
                }
                configData[serverKey][serverName] = finalServerEntry;
                if (!options.dryRun) {
                    fs.mkdirSync(path.dirname(configPath), { recursive: true });
                    fs.writeFileSync(configPath, JSON.stringify(configData, null, 2), 'utf8');
                }
                results.push({
                    ideId: item.id,
                    ideName: item.name,
                    configPath,
                    status: fileExists ? 'UPDATED' : 'INSTALLED',
                    backupPath,
                    message: `Successfully configured ${serverName} into ${item.name}!`,
                });
            }
            catch (err) {
                results.push({
                    ideId: item.id,
                    ideName: item.name,
                    configPath,
                    status: 'FAILED',
                    message: `Error during installation: ${err.message}`,
                });
            }
        }
        return results;
    }
}
//# sourceMappingURL=auto-installer.js.map