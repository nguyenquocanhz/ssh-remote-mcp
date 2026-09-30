import { HostTarget, BackgroundTaskRecord } from '../types.js';
export interface BackgroundTaskArgs {
    target?: HostTarget;
    command: string;
    workingDir?: string;
    taskTag?: string;
}
export interface TaskPollArgs {
    target?: HostTarget;
    taskId: string;
    tailLines?: number;
}
export interface TaskKillArgs {
    target?: HostTarget;
    taskId: string;
    signal?: 'SIGTERM' | 'SIGKILL';
}
export declare function handleSshExecBackground(args: BackgroundTaskArgs): Promise<BackgroundTaskRecord>;
export declare function handleSshTaskPoll(args: TaskPollArgs): Promise<{
    task: BackgroundTaskRecord;
    logTail: string;
}>;
export declare function handleSshTaskKill(args: TaskKillArgs): Promise<{
    taskId: string;
    killed: boolean;
    message: string;
}>;
