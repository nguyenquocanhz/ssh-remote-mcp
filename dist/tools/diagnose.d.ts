import { HostTarget } from '../types.js';
export interface HostDiagnoseArgs {
    target?: HostTarget;
}
export interface HostDiagnosticReport {
    target: string;
    os: string;
    kernel: string;
    uptime: string;
    loadAverage: string;
    memoryMb: {
        total: number;
        used: number;
        free: number;
        available: number;
    };
    diskUsage: string[];
    listeningPorts: string[];
    dockerContainers?: Array<{
        id: string;
        image: string;
        status: string;
        names: string;
        ports: string;
    }>;
    topProcesses: string[];
    collectedAt: string;
}
export declare function handleSshHostDiagnose(args: HostDiagnoseArgs): Promise<HostDiagnosticReport>;
