import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { Client } from 'ssh2';
import { MatlockProfileStore } from '../core/profile-store.js';
export async function handleSshKeyBootstrap(args) {
    const host = args.host;
    const port = args.port || 22;
    const username = args.username || 'root';
    const password = args.password;
    const keyName = args.keyName || 'matlock_ed25519';
    const profileName = args.profileName || host.replace(/[^a-zA-Z0-9_-]/g, '_');
    const sshDir = path.join(os.homedir(), '.ssh');
    if (!fs.existsSync(sshDir)) {
        fs.mkdirSync(sshDir, { recursive: true, mode: 0o700 });
    }
    const privKeyPath = path.join(sshDir, keyName);
    const pubKeyPath = `${privKeyPath}.pub`;
    // 1. Ensure local SSH key pair exists or generate modern ED25519 key
    if (!fs.existsSync(privKeyPath)) {
        try {
            execSync(`ssh-keygen -t ed25519 -N "" -f "${privKeyPath}" -C "matlock@${os.hostname()}"`, {
                stdio: 'pipe',
            });
        }
        catch (e) {
            // Fallback to RSA 4096 if ED25519 is unsupported on older systems
            execSync(`ssh-keygen -t rsa -b 4096 -N "" -f "${privKeyPath}" -C "matlock@${os.hostname()}"`, {
                stdio: 'pipe',
            });
        }
    }
    if (!fs.existsSync(pubKeyPath)) {
        throw new Error(`Public key file not found at ${pubKeyPath}`);
    }
    const pubKeyContent = fs.readFileSync(pubKeyPath, 'utf8').trim();
    // 2. Connect to remote host using temporary password
    await new Promise((resolve, reject) => {
        const client = new Client();
        client.on('ready', () => {
            // Injects public key into ~/.ssh/authorized_keys safely with correct file permissions
            const installCmd = `mkdir -p ~/.ssh && chmod 700 ~/.ssh && touch ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys && (grep -qF "${pubKeyContent}" ~/.ssh/authorized_keys || echo "${pubKeyContent}" >> ~/.ssh/authorized_keys) && echo "KEY_INJECTED"`;
            client.exec(installCmd, (err, stream) => {
                if (err) {
                    client.end();
                    return reject(err);
                }
                let stdout = '';
                let stderr = '';
                stream.on('data', (d) => (stdout += d.toString('utf8')));
                stream.stderr.on('data', (d) => (stderr += d.toString('utf8')));
                stream.on('close', (code) => {
                    client.end();
                    if (code === 0 && stdout.includes('KEY_INJECTED')) {
                        resolve();
                    }
                    else {
                        reject(new Error(`Failed to inject SSH key: ${stderr || stdout}`));
                    }
                });
            });
        });
        client.on('error', (err) => reject(err));
        client.connect({
            host,
            port,
            username,
            password,
            readyTimeout: 20000,
        });
    });
    // 3. Test verification connection using the newly installed SSH Key ALONE (no password)
    const privateKeyBytes = fs.readFileSync(privKeyPath);
    const verified = await new Promise((resolve) => {
        const testClient = new Client();
        testClient.on('ready', () => {
            testClient.end();
            resolve(true);
        });
        testClient.on('error', () => {
            resolve(false);
        });
        testClient.connect({
            host,
            port,
            username,
            privateKey: privateKeyBytes,
            readyTimeout: 15000,
        });
    });
    if (!verified) {
        throw new Error('Key was injected, but verification login using private key failed. Check sshd configuration on remote host.');
    }
    // 4. Save host into profile store without storing the password
    MatlockProfileStore.saveProfile({
        name: profileName,
        host,
        port,
        username,
        privateKeyPath: privKeyPath,
        description: `Auto-bootstrapped VPS (${username}@${host})`,
        tags: ['vps', 'bootstrapped', 'key-auth'],
    });
    return {
        success: true,
        profileName,
        host,
        username,
        publicKey: pubKeyContent,
        privateKeyPath: privKeyPath,
        verifiedKeyAuth: true,
        message: `SSH Key Bootstrap successful! Profile '${profileName}' has been created with key authentication. You can now connect without password.`,
        recommendations: [
            `From now on, use target: { profile: "${profileName}" } in all tool calls.`,
            `Your private key is safely stored locally at: ${privKeyPath}`,
            `Plaintext password has been discarded and is NOT stored in profiles.json.`,
            `Security Best Practice: You can now safely disable password authentication on the VPS by setting 'PasswordAuthentication no' in /etc/ssh/sshd_config.`,
        ],
    };
}
//# sourceMappingURL=bootstrap.js.map