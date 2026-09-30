export interface KeyBootstrapArgs {
    host: string;
    port?: number;
    username?: string;
    password: string;
    keyName?: string;
    profileName?: string;
}
export interface BootstrapResult {
    success: boolean;
    profileName: string;
    host: string;
    username: string;
    publicKey: string;
    privateKeyPath: string;
    verifiedKeyAuth: boolean;
    message: string;
    recommendations: string[];
}
export declare function handleSshKeyBootstrap(args: KeyBootstrapArgs): Promise<BootstrapResult>;
