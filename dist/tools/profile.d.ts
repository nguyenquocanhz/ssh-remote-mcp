import { HostProfile } from '../types.js';
export declare function handleProfileList(): Record<string, HostProfile>;
export declare function handleProfileSave(profile: HostProfile): {
    success: boolean;
    message: string;
    profile: HostProfile;
};
export declare function handleProfileDelete(name: string): {
    success: boolean;
    message: string;
};
