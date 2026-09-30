import { HostTarget, FileDiffResult } from '../types.js';
export interface ReadFileArgs {
    target?: HostTarget;
    filePath: string;
    startLine?: number;
    endLine?: number;
    maxBytes?: number;
}
export interface WriteSafeArgs {
    target?: HostTarget;
    filePath: string;
    content: string;
    createBackup?: boolean;
}
export interface RollbackArgs {
    target?: HostTarget;
    filePath: string;
    backupPath?: string;
}
export interface ListDirArgs {
    target?: HostTarget;
    dirPath: string;
}
export declare function handleSftpReadFile(args: ReadFileArgs): Promise<{
    filePath: string;
    totalLines: number;
    totalBytes: number;
    startLine: number;
    endLine: number;
    sha256: string;
    content: string;
}>;
export declare function handleSftpWriteSafe(args: WriteSafeArgs): Promise<FileDiffResult>;
export declare function handleSftpRollbackFile(args: RollbackArgs): Promise<{
    filePath: string;
    restoredFrom: string;
    success: boolean;
    message: string;
}>;
export declare function handleSftpListDir(args: ListDirArgs): Promise<{
    dirPath: string;
    entries: Array<{
        name: string;
        type: 'file' | 'dir' | 'symlink' | 'other';
        size: string;
        permissions: string;
        owner: string;
        modified: string;
    }>;
}>;
