import { Client } from 'ssh2';
import { AssertionConfig, AssertionCheckResult, ForensicResult, CommandTier } from '../types.js';

export interface ExecOutput {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export class MatlockForensics {
  /**
   * Execute a single command on the SSH client with full stream capture and timeout
   */
  public static async executeRaw(
    client: Client,
    command: string,
    options: {
      workingDir?: string;
      timeoutMs?: number;
      env?: Record<string, string>;
    } = {}
  ): Promise<ExecOutput> {
    const startTime = Date.now();
    const timeoutMs = options.timeoutMs || 60000; // default 60s

    let finalCommand = command;
    if (options.workingDir) {
      finalCommand = `cd ${options.workingDir} && ${command}`;
    }

    return new Promise<ExecOutput>((resolve, reject) => {
      let isTimedOut = false;
      let timer: NodeJS.Timeout | null = null;

      timer = setTimeout(() => {
        isTimedOut = true;
        reject(new Error(`Command timed out after ${timeoutMs}ms: ${command.slice(0, 100)}`));
      }, timeoutMs);

      client.exec(finalCommand, { env: options.env }, (err, stream) => {
        if (err) {
          if (timer) clearTimeout(timer);
          return reject(err);
        }

        let stdout = '';
        let stderr = '';

        stream.on('close', (code: number) => {
          if (timer) clearTimeout(timer);
          if (isTimedOut) return;

          resolve({
            exitCode: typeof code === 'number' ? code : 0,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            durationMs: Date.now() - startTime,
          });
        });

        stream.on('data', (data: Buffer) => {
          stdout += data.toString('utf8');
        });

        stream.stderr.on('data', (data: Buffer) => {
          stderr += data.toString('utf8');
        });
      });
    });
  }

  /**
   * Cross-examine state post-execution with forensic assertions
   */
  public static async evaluateAssertions(
    client: Client,
    assertions?: AssertionConfig
  ): Promise<AssertionCheckResult[]> {
    if (!assertions) return [];
    const results: AssertionCheckResult[] = [];

    // 1. Port Listening Assertion
    if (assertions.assertPortListening) {
      const ports = Array.isArray(assertions.assertPortListening)
        ? assertions.assertPortListening
        : [assertions.assertPortListening];

      for (const port of ports) {
        try {
          const checkCmd = `(ss -tulpn 2>/dev/null || netstat -tuln 2>/dev/null || lsof -i :${port} 2>/dev/null) | grep -E "(:|\\.)${port}\\b"`;
          const res = await this.executeRaw(client, checkCmd, { timeoutMs: 5000 });
          const passed = res.exitCode === 0 && res.stdout.length > 0;
          results.push({
            check: `Port ${port} listening`,
            passed,
            detail: passed ? `Port ${port} is active and listening.` : `Port ${port} is NOT listening on target host.`,
          });
        } catch (e: any) {
          results.push({
            check: `Port ${port} listening`,
            passed: false,
            detail: `Failed to check port: ${e.message}`,
          });
        }
      }
    }

    // 2. Process Running Assertion
    if (assertions.assertProcessRunning) {
      try {
        const checkCmd = `pgrep -fa "${assertions.assertProcessRunning}" || pgrep -f "${assertions.assertProcessRunning}"`;
        const res = await this.executeRaw(client, checkCmd, { timeoutMs: 5000 });
        const passed = res.exitCode === 0 && res.stdout.length > 0;
        results.push({
          check: `Process matching '${assertions.assertProcessRunning}'`,
          passed,
          detail: passed
            ? `Process confirmed running (PIDs: ${res.stdout.split('\n').map(l => l.split(' ')[0]).join(', ')}).`
            : `No matching process found running for pattern '${assertions.assertProcessRunning}'.`,
        });
      } catch (e: any) {
        results.push({
          check: `Process '${assertions.assertProcessRunning}'`,
          passed: false,
          detail: `Failed to check process: ${e.message}`,
        });
      }
    }

    // 3. File Exists Assertion
    if (assertions.assertFileExists) {
      try {
        const checkCmd = `test -e "${assertions.assertFileExists}" && echo "EXISTS" || echo "MISSING"`;
        const res = await this.executeRaw(client, checkCmd, { timeoutMs: 5000 });
        const passed = res.stdout.includes('EXISTS');
        results.push({
          check: `File exists: ${assertions.assertFileExists}`,
          passed,
          detail: passed
            ? `File/Directory confirmed present at ${assertions.assertFileExists}.`
            : `Target path does NOT exist: ${assertions.assertFileExists}.`,
        });
      } catch (e: any) {
        results.push({
          check: `File exists: ${assertions.assertFileExists}`,
          passed: false,
          detail: `Failed to check file existence: ${e.message}`,
        });
      }
    }

    // 4. HTTP Endpoint Assertion
    if (assertions.assertHttpEndpoint) {
      const { url, expectedStatus = 200, timeoutSeconds = 5 } = assertions.assertHttpEndpoint;
      try {
        const checkCmd = `curl -s -o /dev/null -w "%{http_code}" --connect-timeout ${timeoutSeconds} -m ${timeoutSeconds + 2} "${url}" || echo "CURL_ERROR"`;
        const res = await this.executeRaw(client, checkCmd, { timeoutMs: (timeoutSeconds + 5) * 1000 });
        const statusCode = parseInt(res.stdout.trim(), 10);
        const passed = statusCode === expectedStatus;
        results.push({
          check: `HTTP endpoint ${url} returns ${expectedStatus}`,
          passed,
          detail: passed
            ? `HTTP probe returned expected status ${statusCode}.`
            : `HTTP probe returned unexpected status ${res.stdout} (expected ${expectedStatus}).`,
        });
      } catch (e: any) {
        results.push({
          check: `HTTP probe ${url}`,
          passed: false,
          detail: `Probe failed: ${e.message}`,
        });
      }
    }

    return results;
  }

  /**
   * Formulate the final verdict
   */
  public static compileVerdict(
    exitCode: number,
    assertions: AssertionCheckResult[]
  ): 'PASS' | 'WARN' | 'FAIL' {
    if (exitCode !== 0) return 'FAIL';
    if (assertions.some((a) => !a.passed)) return 'WARN';
    return 'PASS';
  }
}
