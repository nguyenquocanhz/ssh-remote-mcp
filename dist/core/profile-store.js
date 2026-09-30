import fs from 'fs';
import path from 'path';
import os from 'os';
export class MatlockProfileStore {
    static storePath = path.join(os.homedir(), '.matlock', 'profiles.json');
    static ensureDir() {
        const dir = path.dirname(this.storePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
        }
    }
    static loadProfiles() {
        this.ensureDir();
        if (!fs.existsSync(this.storePath)) {
            // Seed default homelab profile if user already has the acer-nitro key
            const defaultProfiles = {
                homelab: {
                    name: 'homelab',
                    host: '192.168.100.169',
                    port: 22,
                    username: 'nqatech',
                    privateKeyPath: path.join(os.homedir(), '.ssh', 'acer-nitro'),
                    description: 'Homelab Server (Ubuntu Linux / Docker / Cloudflare Tunnel)',
                    defaultWorkingDir: '/home/nqatech',
                    tags: ['homelab', 'docker', 'production-edge']
                }
            };
            fs.writeFileSync(this.storePath, JSON.stringify(defaultProfiles, null, 2), { mode: 0o600 });
            return defaultProfiles;
        }
        try {
            const data = fs.readFileSync(this.storePath, 'utf8');
            return JSON.parse(data);
        }
        catch {
            return {};
        }
    }
    static getProfile(name) {
        const profiles = this.loadProfiles();
        return profiles[name] || null;
    }
    static saveProfile(profile) {
        this.ensureDir();
        const profiles = this.loadProfiles();
        profiles[profile.name] = profile;
        fs.writeFileSync(this.storePath, JSON.stringify(profiles, null, 2), { mode: 0o600 });
    }
    static deleteProfile(name) {
        this.ensureDir();
        const profiles = this.loadProfiles();
        if (profiles[name]) {
            delete profiles[name];
            fs.writeFileSync(this.storePath, JSON.stringify(profiles, null, 2), { mode: 0o600 });
            return true;
        }
        return false;
    }
    static resolveTarget(target) {
        let host = target.host;
        let port = target.port || 22;
        let username = target.username || 'root';
        let privateKeyPath = target.privateKeyPath;
        let password = target.password;
        let passphrase = target.passphrase;
        let defaultWorkingDir = undefined;
        if (target.profile) {
            const prof = this.getProfile(target.profile);
            if (!prof) {
                throw new Error(`Matlock Profile '${target.profile}' not found in ${this.storePath}`);
            }
            host = prof.host;
            port = prof.port;
            username = prof.username;
            privateKeyPath = prof.privateKeyPath;
            password = prof.password || password;
            defaultWorkingDir = prof.defaultWorkingDir;
        }
        else if (!host) {
            // Default fallback to 'homelab' if available
            const homelab = this.getProfile('homelab');
            if (homelab) {
                host = homelab.host;
                port = homelab.port;
                username = homelab.username;
                privateKeyPath = homelab.privateKeyPath;
                password = homelab.password || password;
                defaultWorkingDir = homelab.defaultWorkingDir;
            }
        }
        if (!host) {
            throw new Error('Host must be provided or a valid profile specified.');
        }
        let privateKey = undefined;
        if (privateKeyPath) {
            // Resolve ~ or relative paths
            const resolvedPath = privateKeyPath.startsWith('~')
                ? path.join(os.homedir(), privateKeyPath.slice(1))
                : path.resolve(privateKeyPath);
            if (fs.existsSync(resolvedPath)) {
                privateKey = fs.readFileSync(resolvedPath);
            }
            else {
                throw new Error(`SSH private key not found at path: ${resolvedPath}`);
            }
        }
        return {
            host,
            port,
            username,
            privateKey,
            privateKeyPath,
            password,
            passphrase,
            defaultWorkingDir,
        };
    }
}
//# sourceMappingURL=profile-store.js.map