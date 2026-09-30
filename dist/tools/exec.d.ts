import { HostTarget, AssertionConfig, ForensicResult } from '../types.js';
export interface ExecArgs {
    target?: HostTarget;
    command: string;
    workingDir?: string;
    timeoutMs?: number;
    confirmDangerToken?: boolean;
    assertions?: AssertionConfig;
    env?: Record<string, string>;
}
export declare function handleSshExec(args: ExecArgs): Promise<ForensicResult>;
