import { Client, SFTPWrapper } from 'ssh2';
import { HostTarget } from '../types.js';
export declare class MatlockSessionPool {
    private static pool;
    private static idleTimeoutMs;
    static getSessionKey(target: HostTarget): string;
    static getClient(target: HostTarget): Promise<Client>;
    static getSFTP(target: HostTarget): Promise<SFTPWrapper>;
    static closeAll(): void;
}
