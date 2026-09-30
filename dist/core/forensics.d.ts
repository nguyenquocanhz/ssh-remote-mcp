import { Client } from 'ssh2';
import { AssertionConfig, AssertionCheckResult } from '../types.js';
export interface ExecOutput {
    exitCode: number;
    stdout: string;
    stderr: string;
    durationMs: number;
}
export declare class MatlockForensics {
    /**
     * Execute a single command on the SSH client with full stream capture and timeout
     */
    static executeRaw(client: Client, command: string, options?: {
        workingDir?: string;
        timeoutMs?: number;
        env?: Record<string, string>;
    }): Promise<ExecOutput>;
    /**
     * Cross-examine state post-execution with forensic assertions
     */
    static evaluateAssertions(client: Client, assertions?: AssertionConfig): Promise<AssertionCheckResult[]>;
    /**
     * Formulate the final verdict
     */
    static compileVerdict(exitCode: number, assertions: AssertionCheckResult[]): 'PASS' | 'WARN' | 'FAIL';
}
