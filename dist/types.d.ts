export type CommandTier = 'TIER_1_SAFE' | 'TIER_2_MUTATING' | 'TIER_3_DESTRUCTIVE';
export interface HostTarget {
    profile?: string;
    host?: string;
    port?: number;
    username?: string;
    privateKeyPath?: string;
    passphrase?: string;
    password?: string;
}
export interface HostProfile {
    name: string;
    host: string;
    port: number;
    username: string;
    privateKeyPath?: string;
    description?: string;
    defaultWorkingDir?: string;
    tags?: string[];
}
export interface AssertionConfig {
    assertPortListening?: number | number[];
    assertProcessRunning?: string;
    assertFileExists?: string;
    assertHttpEndpoint?: {
        url: string;
        expectedStatus?: number;
        timeoutSeconds?: number;
    };
}
export interface AssertionCheckResult {
    check: string;
    passed: boolean;
    detail: string;
}
export interface ForensicResult {
    command: string;
    tier: CommandTier;
    tierReason: string;
    exitCode: number;
    stdout: string;
    stderr: string;
    durationMs: number;
    assertions: AssertionCheckResult[];
    verdict: 'PASS' | 'WARN' | 'FAIL';
    forensicNote?: string;
}
export interface BackgroundTaskRecord {
    taskId: string;
    host: string;
    command: string;
    pid?: number;
    status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'TERMINATED';
    startTime: string;
    endTime?: string;
    exitCode?: number;
    logFilePath: string;
}
export interface FileDiffResult {
    targetPath: string;
    backupPath?: string;
    bytesWritten: number;
    oldSha256?: string;
    newSha256: string;
    unifiedDiff: string;
    action: 'CREATED' | 'UPDATED' | 'UNCHANGED';
}
