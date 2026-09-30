import { MatlockProfileStore } from '../core/profile-store.js';
export function handleProfileList() {
    return MatlockProfileStore.loadProfiles();
}
export function handleProfileSave(profile) {
    MatlockProfileStore.saveProfile(profile);
    return {
        success: true,
        message: `Host profile '${profile.name}' saved successfully.`,
        profile,
    };
}
export function handleProfileDelete(name) {
    const deleted = MatlockProfileStore.deleteProfile(name);
    return {
        success: deleted,
        message: deleted ? `Host profile '${name}' deleted.` : `Profile '${name}' not found.`,
    };
}
//# sourceMappingURL=profile.js.map