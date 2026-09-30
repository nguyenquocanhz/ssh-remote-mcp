export interface IdeDefinition {
    id: string;
    name: string;
    getConfigPath: () => string;
    serverKey: string;
    format: 'mcpServers' | 'vscode' | 'zed';
}
export interface InstallResult {
    ideId: string;
    ideName: string;
    configPath: string;
    status: 'INSTALLED' | 'UPDATED' | 'ALREADY_CONFIGURED' | 'SKIPPED' | 'FAILED';
    backupPath?: string;
    message: string;
}
export declare class McpAutoInstaller {
    private static getKnownIdes;
    /**
     * Scan system and return list of detected IDE configurations
     */
    static scan(): Array<IdeDefinition & {
        exists: boolean;
        path: string;
    }>;
    /**
     * Install/Configure MCP server into target IDEs
     */
    static install(options?: {
        mode?: 'local' | 'npx';
        serverName?: string;
        serverConfig?: any;
        targetIdeIds?: string[];
        forceAll?: boolean;
        dryRun?: boolean;
    }): InstallResult[];
}
