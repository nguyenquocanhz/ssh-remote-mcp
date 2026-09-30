import { HostProfile } from '../types.js';
import { MatlockProfileStore } from '../core/profile-store.js';

export function handleProfileList(): Record<string, HostProfile> {
  return MatlockProfileStore.loadProfiles();
}

export function handleProfileSave(profile: HostProfile): {
  success: boolean;
  message: string;
  profile: HostProfile;
} {
  MatlockProfileStore.saveProfile(profile);
  return {
    success: true,
    message: `Host profile '${profile.name}' saved successfully.`,
    profile,
  };
}

export function handleProfileDelete(name: string): {
  success: boolean;
  message: string;
} {
  const deleted = MatlockProfileStore.deleteProfile(name);
  return {
    success: deleted,
    message: deleted ? `Host profile '${name}' deleted.` : `Profile '${name}' not found.`,
  };
}
