import crypto from 'crypto';
import { MatlockSessionPool } from '../core/session-pool.js';
import { MatlockForensics } from '../core/forensics.js';
// In-memory registry of active background tasks
const taskRegistry = new Map();
export async function handleSshExecBackground(args) {
    const target = args.target || {};
    const client = await MatlockSessionPool.getClient(target);
    const taskId = args.taskTag ? `${args.taskTag}-${crypto.randomBytes(3).toString('hex')}` : `task-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const logFilePath = `/tmp/matlock_${taskId}.log`;
    const exitFilePath = `/tmp/matlock_${taskId}.exit`;
    const runnerScriptPath = `/tmp/matlock_run_${taskId}.sh`;
    let cdCmd = '';
    if (args.workingDir) {
        cdCmd = `cd "${args.workingDir}" || exit 1\n`;
    }
    const scriptContent = `#!/bin/sh\n${cdCmd}(\n${args.command}\n) > "${logFilePath}" 2>&1\necho $? > "${exitFilePath}"\n`;
    const b64 = Buffer.from(scriptContent, 'utf8').toString('base64');
    // Safely write runner script via base64 decode and execute in background
    const launchScript = `echo "${b64}" | base64 -d > "${runnerScriptPath}" && chmod +x "${runnerScriptPath}" && nohup "${runnerScriptPath}" >/dev/null 2>&1 & echo $!`;
    const res = await MatlockForensics.executeRaw(client, launchScript, { timeoutMs: 10000 });
    const pid = parseInt(res.stdout.trim(), 10);
    if (isNaN(pid) || pid <= 0) {
        throw new Error(`Failed to launch background task. Raw output: ${res.stdout} ${res.stderr}`);
    }
    const record = {
        taskId,
        host: MatlockSessionPool.getSessionKey(target),
        command: args.command,
        pid,
        status: 'RUNNING',
        startTime: new Date().toISOString(),
        logFilePath,
    };
    taskRegistry.set(taskId, record);
    return record;
}
export async function handleSshTaskPoll(args) {
    const target = args.target || {};
    const client = await MatlockSessionPool.getClient(target);
    const tailLines = args.tailLines || 50;
    const taskId = args.taskId;
    const record = taskRegistry.get(taskId) || {
        taskId,
        host: MatlockSessionPool.getSessionKey(target),
        command: 'unknown',
        status: 'RUNNING',
        startTime: 'unknown',
        logFilePath: `/tmp/matlock_${taskId}.log`,
    };
    const logFilePath = record.logFilePath || `/tmp/matlock_${taskId}.log`;
    const exitFilePath = `/tmp/matlock_${taskId}.exit`;
    // 1. Check if PID is still alive (if pid is known)
    let isRunning = true;
    if (record.pid) {
        const checkPidCmd = `kill -0 ${record.pid} 2>/dev/null && echo "ALIVE" || echo "DEAD"`;
        const checkRes = await MatlockForensics.executeRaw(client, checkPidCmd, { timeoutMs: 5000 });
        isRunning = checkRes.stdout.includes('ALIVE');
    }
    // 2. Read exit code if process ended
    let exitCode = undefined;
    if (!isRunning) {
        const exitCodeCmd = `test -f "${exitFilePath}" && cat "${exitFilePath}" || echo ""`;
        const exitRes = await MatlockForensics.executeRaw(client, exitCodeCmd, { timeoutMs: 5000 });
        const codeStr = exitRes.stdout.trim();
        if (codeStr !== '') {
            exitCode = parseInt(codeStr, 10);
            record.status = exitCode === 0 ? 'COMPLETED' : 'FAILED';
        }
        else {
            record.status = 'COMPLETED';
        }
        if (!record.endTime) {
            record.endTime = new Date().toISOString();
        }
    }
    else {
        record.status = 'RUNNING';
    }
    record.exitCode = exitCode;
    // 3. Tail log file
    const tailCmd = `test -f "${logFilePath}" && tail -n ${tailLines} "${logFilePath}" || echo "[Log file not yet populated]"`;
    const logRes = await MatlockForensics.executeRaw(client, tailCmd, { timeoutMs: 5000 });
    taskRegistry.set(taskId, record);
    return {
        task: record,
        logTail: logRes.stdout,
    };
}
export async function handleSshTaskKill(args) {
    const target = args.target || {};
    const client = await MatlockSessionPool.getClient(target);
    const taskId = args.taskId;
    const record = taskRegistry.get(taskId);
    const signal = args.signal || 'SIGTERM';
    if (!record || !record.pid) {
        return {
            taskId,
            killed: false,
            message: `No active PID found for task ${taskId}.`,
        };
    }
    const killCmd = `kill -s ${signal} ${record.pid} 2>/dev/null && echo "KILLED" || echo "NOT_FOUND"`;
    const res = await MatlockForensics.executeRaw(client, killCmd, { timeoutMs: 5000 });
    record.status = 'TERMINATED';
    record.endTime = new Date().toISOString();
    taskRegistry.set(taskId, record);
    return {
        taskId,
        killed: res.stdout.includes('KILLED'),
        message: `Sent ${signal} to process PID ${record.pid}.`,
    };
}
//# sourceMappingURL=background-task.js.map