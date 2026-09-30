import { Client, SFTPWrapper } from 'ssh2';
import { HostTarget } from '../types.js';
import { MatlockProfileStore } from './profile-store.js';

interface PooledSession {
  client: Client;
  sftp?: SFTPWrapper;
  key: string;
  lastUsed: number;
}

export class MatlockSessionPool {
  private static pool: Map<string, PooledSession> = new Map();
  private static idleTimeoutMs = 5 * 60 * 1000; // 5 minutes idle TTL

  public static getSessionKey(target: HostTarget): string {
    if (target.profile) {
      return `profile:${target.profile}`;
    }
    return `${target.username || 'root'}@${target.host}:${target.port || 22}`;
  }

  public static async getClient(target: HostTarget): Promise<Client> {
    const key = this.getSessionKey(target);
    const existing = this.pool.get(key);

    if (existing) {
      existing.lastUsed = Date.now();
      return existing.client;
    }

    const resolved = MatlockProfileStore.resolveTarget(target);

    return new Promise<Client>((resolve, reject) => {
      const client = new Client();

      client.on('ready', () => {
        const session: PooledSession = {
          client,
          key,
          lastUsed: Date.now(),
        };
        this.pool.set(key, session);
        resolve(client);
      });

      client.on('error', (err) => {
        this.pool.delete(key);
        reject(err);
      });

      client.on('end', () => {
        this.pool.delete(key);
      });

      client.on('close', () => {
        this.pool.delete(key);
      });

      const connectConfig: any = {
        host: resolved.host,
        port: resolved.port,
        username: resolved.username,
        keepaliveInterval: 15000,
        keepaliveCountMax: 3,
        readyTimeout: 20000,
      };

      if (resolved.privateKey) {
        connectConfig.privateKey = resolved.privateKey;
        if (resolved.passphrase) {
          connectConfig.passphrase = resolved.passphrase;
        }
      } else if (resolved.password) {
        connectConfig.password = resolved.password;
      }

      client.connect(connectConfig);
    });
  }

  public static async getSFTP(target: HostTarget): Promise<SFTPWrapper> {
    const key = this.getSessionKey(target);
    const existing = this.pool.get(key);

    if (existing && existing.sftp) {
      existing.lastUsed = Date.now();
      return existing.sftp;
    }

    const client = await this.getClient(target);

    return new Promise<SFTPWrapper>((resolve, reject) => {
      client.sftp((err, sftp) => {
        if (err) return reject(err);
        const session = this.pool.get(key);
        if (session) {
          session.sftp = sftp;
        }
        resolve(sftp);
      });
    });
  }

  public static closeAll(): void {
    for (const [key, session] of this.pool.entries()) {
      try {
        if (session.sftp) session.sftp.end();
        session.client.end();
      } catch {}
      this.pool.delete(key);
    }
  }
}
