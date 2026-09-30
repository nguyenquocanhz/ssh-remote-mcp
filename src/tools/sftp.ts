import crypto from 'crypto';
import * as diff from 'diff';
import { HostTarget, FileDiffResult } from '../types.js';
import { MatlockSessionPool } from '../core/session-pool.js';
import { MatlockForensics } from '../core/forensics.js';

export interface ReadFileArgs {
  target?: HostTarget;
  filePath: string;
  startLine?: number;
  endLine?: number;
  maxBytes?: number;
}

export interface WriteSafeArgs {
  target?: HostTarget;
  filePath: string;
  content: string;
  createBackup?: boolean;
}

export interface RollbackArgs {
  target?: HostTarget;
  filePath: string;
  backupPath?: string;
}

export interface ListDirArgs {
  target?: HostTarget;
  dirPath: string;
}

export async function handleSftpReadFile(args: ReadFileArgs): Promise<{
  filePath: string;
  totalLines: number;
  totalBytes: number;
  startLine: number;
  endLine: number;
  sha256: string;
  content: string;
}> {
  const target = args.target || {};
  const client = await MatlockSessionPool.getClient(target);

  // We can use sftp or stream via cat + sha256sum for guaranteed accuracy
  const statCmd = `test -f "${args.filePath}" && wc -l < "${args.filePath}" && wc -c < "${args.filePath}" && sha256sum "${args.filePath}" | awk '{print $1}'`;
  const statRes = await MatlockForensics.executeRaw(client, statCmd, { timeoutMs: 10000 });

  if (statRes.exitCode !== 0) {
    throw new Error(`File does not exist or cannot be read: ${args.filePath}`);
  }

  const lines = statRes.stdout.split('\n');
  const totalLines = parseInt(lines[0] || '0', 10);
  const totalBytes = parseInt(lines[1] || '0', 10);
  const sha256 = (lines[2] || '').trim();

  const startLine = Math.max(1, args.startLine || 1);
  const endLine = args.endLine ? Math.min(totalLines, args.endLine) : totalLines;

  let readCmd = `sed -n '${startLine},${endLine}p' "${args.filePath}"`;
  if (args.maxBytes && args.maxBytes > 0) {
    readCmd += ` | head -c ${args.maxBytes}`;
  }

  const readRes = await MatlockForensics.executeRaw(client, readCmd, { timeoutMs: 15000 });

  return {
    filePath: args.filePath,
    totalLines,
    totalBytes,
    startLine,
    endLine,
    sha256,
    content: readRes.stdout,
  };
}

export async function handleSftpWriteSafe(args: WriteSafeArgs): Promise<FileDiffResult> {
  const target = args.target || {};
  const client = await MatlockSessionPool.getClient(target);
  const filePath = args.filePath;
  const newContent = args.content;
  const createBackup = args.createBackup !== false;

  // 1. Check if original file exists and read old content
  const checkCmd = `test -f "${filePath}" && echo "EXISTS" || echo "MISSING"`;
  const checkRes = await MatlockForensics.executeRaw(client, checkCmd, { timeoutMs: 5000 });
  const exists = checkRes.stdout.includes('EXISTS');

  let oldContent = '';
  let oldSha256: string | undefined = undefined;
  let backupPath: string | undefined = undefined;

  if (exists) {
    const oldReadCmd = `cat "${filePath}"`;
    const oldRes = await MatlockForensics.executeRaw(client, oldReadCmd, { timeoutMs: 10000 });
    oldContent = oldRes.stdout;
    oldSha256 = crypto.createHash('sha256').update(oldContent).digest('hex');

    // Check if content is unchanged
    const newContentHash = crypto.createHash('sha256').update(newContent).digest('hex');
    if (oldSha256 === newContentHash) {
      return {
        targetPath: filePath,
        bytesWritten: 0,
        oldSha256,
        newSha256: newContentHash,
        unifiedDiff: '(No changes detected: content is identical)',
        action: 'UNCHANGED',
      };
    }

    // 2. Perform atomic backup
    if (createBackup) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      backupPath = `${filePath}.matlock.bak.${timestamp}`;
      const latestBackupPath = `${filePath}.matlock.bak.latest`;
      const backupCmd = `cp -p "${filePath}" "${backupPath}" && cp -pf "${backupPath}" "${latestBackupPath}"`;
      await MatlockForensics.executeRaw(client, backupCmd, { timeoutMs: 10000 });
    }
  }

  // 3. Write new content safely using SFTP or temp file write + atomic mv
  const tmpPath = `${filePath}.tmp.${Date.now()}.${crypto.randomBytes(4).toString('hex')}`;
  
  // Use base64 encoding to prevent any escaping or character corruption issues over shell/stream
  const b64 = Buffer.from(newContent, 'utf8').toString('base64');
  const writeCmd = `mkdir -p "$(dirname "${filePath}")" && echo "${b64}" | base64 -d > "${tmpPath}" && chmod --reference="${filePath}" "${tmpPath}" 2>/dev/null || true; mv -f "${tmpPath}" "${filePath}"`;

  const writeRes = await MatlockForensics.executeRaw(client, writeCmd, { timeoutMs: 15000 });
  if (writeRes.exitCode !== 0) {
    throw new Error(`Failed to write file ${filePath}: ${writeRes.stderr}`);
  }

  const newSha256 = crypto.createHash('sha256').update(newContent).digest('hex');
  const unifiedPatch = diff.createTwoFilesPatch(
    exists ? filePath : '/dev/null',
    filePath,
    oldContent,
    newContent,
    exists ? 'previous' : 'empty',
    'modified'
  );

  return {
    targetPath: filePath,
    backupPath,
    bytesWritten: Buffer.byteLength(newContent, 'utf8'),
    oldSha256,
    newSha256,
    unifiedDiff: unifiedPatch,
    action: exists ? 'UPDATED' : 'CREATED',
  };
}

export async function handleSftpRollbackFile(args: RollbackArgs): Promise<{
  filePath: string;
  restoredFrom: string;
  success: boolean;
  message: string;
}> {
  const target = args.target || {};
  const client = await MatlockSessionPool.getClient(target);
  const filePath = args.filePath;
  const backupToUse = args.backupPath || `${filePath}.matlock.bak.latest`;

  const rollbackCmd = `test -f "${backupToUse}" && cp -pf "${backupToUse}" "${filePath}" && echo "RESTORED" || echo "BACKUP_NOT_FOUND"`;
  const res = await MatlockForensics.executeRaw(client, rollbackCmd, { timeoutMs: 10000 });

  if (res.stdout.includes('RESTORED')) {
    return {
      filePath,
      restoredFrom: backupToUse,
      success: true,
      message: `Successfully rolled back ${filePath} from backup snapshot ${backupToUse}.`,
    };
  }

  return {
    filePath,
    restoredFrom: backupToUse,
    success: false,
    message: `Rollback failed: Backup file ${backupToUse} not found.`,
  };
}

export async function handleSftpListDir(args: ListDirArgs): Promise<{
  dirPath: string;
  entries: Array<{
    name: string;
    type: 'file' | 'dir' | 'symlink' | 'other';
    size: string;
    permissions: string;
    owner: string;
    modified: string;
  }>;
}> {
  const target = args.target || {};
  const client = await MatlockSessionPool.getClient(target);

  // Structured ls output
  const listCmd = `ls -la --time-style=+"%Y-%m-%d %H:%M:%S" "${args.dirPath}" 2>/dev/null || ls -la "${args.dirPath}"`;
  const res = await MatlockForensics.executeRaw(client, listCmd, { timeoutMs: 10000 });

  const rawLines = res.stdout.split('\n').filter(l => l.trim().length > 0);
  const entries: any[] = [];

  for (const line of rawLines) {
    if (line.startsWith('total')) continue;
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 7) {
      const perms = parts[0];
      let type: 'file' | 'dir' | 'symlink' | 'other' = 'file';
      if (perms.startsWith('d')) type = 'dir';
      else if (perms.startsWith('l')) type = 'symlink';

      const owner = `${parts[2]}:${parts[3]}`;
      const size = parts[4];
      const modified = `${parts[5]} ${parts[6]}`;
      const name = parts.slice(7).join(' ');

      if (name !== '.' && name !== '..') {
        entries.push({
          name,
          type,
          size,
          permissions: perms,
          owner,
          modified,
        });
      }
    }
  }

  return {
    dirPath: args.dirPath,
    entries,
  };
}
