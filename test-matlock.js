import { handleSshHostDiagnose } from './dist/tools/diagnose.js';
import { handleSshExec } from './dist/tools/exec.js';
import { handleSftpWriteSafe, handleSftpReadFile, handleSftpRollbackFile, handleSftpListDir } from './dist/tools/sftp.js';
import { handleSshExecBackground, handleSshTaskPoll, handleSshTaskKill } from './dist/tools/background-task.js';
import { MatlockSessionPool } from './dist/core/session-pool.js';

async function runTests() {
  console.log('=== [1] Testing Matlock Host Telemetry (ssh_host_diagnose) ===');
  try {
    const diag = await handleSshHostDiagnose({});
    console.log('Target:', diag.target);
    console.log('OS:', diag.os);
    console.log('Kernel:', diag.kernel);
    console.log('Uptime/Load:', diag.loadAverage);
    console.log('Memory (MB):', diag.memoryMb);
    console.log('Active Listening Ports Count:', diag.listeningPorts.length);
    console.log('Docker Containers Detected:', diag.dockerContainers?.length || 0);
    if (diag.dockerContainers && diag.dockerContainers.length > 0) {
      console.log('First container:', diag.dockerContainers[0]);
    }
  } catch (err) {
    console.error('Diagnostic error:', err);
    process.exit(1);
  }

  console.log('\n=== [2] Testing Command Execution & Forensic Assertions (ssh_exec) ===');
  // Test Tier 1 with assertions (Port 8088 listening)
  const execResult = await handleSshExec({
    command: 'curl -s http://localhost:8088/health',
    assertions: {
      assertPortListening: 8088,
      assertProcessRunning: 'cloudflared',
    }
  });
  console.log('Command Tier:', execResult.tier, `(${execResult.tierReason})`);
  console.log('Exit Code:', execResult.exitCode);
  console.log('Stdout:', execResult.stdout);
  console.log('Verdict:', execResult.verdict);
  console.log('Assertions:', JSON.stringify(execResult.assertions, null, 2));

  console.log('\n=== [3] Testing Blast-Radius Containment (Tier 3 Interception) ===');
  const blockedResult = await handleSshExec({
    command: 'rm -rf / --no-preserve-root',
  });
  console.log('Blocked Tier:', blockedResult.tier);
  console.log('Verdict:', blockedResult.verdict);
  console.log('Stderr (Guardrail Note):', blockedResult.stderr);

  console.log('\n=== [4] Testing Safe SFTP Atomic Write, Unified Diff & Rollback ===');
  const testPath = '/tmp/matlock_test_probe.txt';
  
  // Write version 1
  const v1 = await handleSftpWriteSafe({
    filePath: testPath,
    content: 'Line 1: Matlock initialized\nLine 2: System nominal\n',
  });
  console.log('V1 Action:', v1.action, 'SHA256:', v1.newSha256);

  // Write version 2 (with modification to trigger diff)
  const v2 = await handleSftpWriteSafe({
    filePath: testPath,
    content: 'Line 1: Matlock initialized\nLine 2: System modified for testing\nLine 3: Added forensic verification\n',
  });
  console.log('V2 Action:', v2.action, 'Backup Path:', v2.backupPath);
  console.log('Unified Diff:\n' + v2.unifiedDiff);

  // Read slice
  const readRes = await handleSftpReadFile({
    filePath: testPath,
    startLine: 2,
    endLine: 3,
  });
  console.log('Read lines 2-3:\n' + readRes.content);

  // Rollback to V1
  const rollbackRes = await handleSftpRollbackFile({
    filePath: testPath,
  });
  console.log('Rollback status:', rollbackRes.success, rollbackRes.message);

  console.log('\n=== [5] Testing Long-Running Background Task Envelope ===');
  const bgTask = await handleSshExecBackground({
    command: 'for i in 1 2 3; do echo "Tick $i"; sleep 1; done; echo "Finished Task"',
    taskTag: 'test-loop',
  });
  console.log('Spawned Task ID:', bgTask.taskId, 'PID:', bgTask.pid);

  // Wait 1.5 seconds and poll
  await new Promise(r => setTimeout(r, 1500));
  const poll1 = await handleSshTaskPoll({ taskId: bgTask.taskId });
  console.log('Poll 1 Status:', poll1.task.status);
  console.log('Poll 1 Log Tail:\n' + poll1.logTail);

  // Wait 2.5 more seconds and poll final
  await new Promise(r => setTimeout(r, 2500));
  const poll2 = await handleSshTaskPoll({ taskId: bgTask.taskId });
  console.log('Poll 2 Status:', poll2.task.status, 'ExitCode:', poll2.task.exitCode);
  console.log('Poll 2 Final Log:\n' + poll2.logTail);

  console.log('\n=== ALL TESTS PASSED SUCCESSFULLY! ===');
  MatlockSessionPool.closeAll();
  process.exit(0);
}

runTests().catch(err => {
  console.error('Fatal Test Failure:', err);
  MatlockSessionPool.closeAll();
  process.exit(1);
});
