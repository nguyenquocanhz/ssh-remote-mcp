import { HostProfile, HostTarget } from '../types.js';
export declare class MatlockProfileStore {
    private static storePath;
    static ensureDir(): void;
    static loadProfiles(): Record<string, HostProfile>;
    static getProfile(name: string): HostProfile | null;
    static saveProfile(profile: HostProfile): void;
    static deleteProfile(name: string): boolean;
    static resolveTarget(target: HostTarget): {
        host: string;
        port: number;
        username: string;
        privateKey?: Buffer;
        privateKeyPath?: string;
        password?: string;
        passphrase?: string;
        defaultWorkingDir?: string;
    };
}
