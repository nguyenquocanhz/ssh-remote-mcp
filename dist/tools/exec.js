import { MatlockGuardrails } from '../core/guardrails.js';
import { MatlockSessionPool } from '../core/session-pool.js';
import { MatlockForensics } from '../core/forensics.js';
export async function handleSshExec(args) {
    const target = args.target || {};
    const command = args.command;
    // 1. Guardrail Inspection
    const guard = MatlockGuardrails.evaluate(command, args.confirmDangerToken);
    if (guard.blocked) {
        return {
            command,
            tier: guard.tier,
            tierReason: guard.reason,
            exitCode: 126, // Command invoked cannot execute
            stdout: '',
            stderr: guard.reason,
            durationMs: 0,
            assertions: [],
            verdict: 'FAIL',
            forensicNote: 'Blocked prior to transmission by Matlock Blast-Radius Containment.',
        };
    }
    // 2. Acquire Multiplexed SSH Client
    const client = await MatlockSessionPool.getClient(target);
    // 3. Execution Environment
    const defaultEnv = MatlockGuardrails.sanitizeEnvironment();
    const mergedEnv = { ...defaultEnv, ...(args.env || {}) };
    // 4. Run Command
    const execResult = await MatlockForensics.executeRaw(client, command, {
        workingDir: args.workingDir,
        timeoutMs: args.timeoutMs,
        env: mergedEnv,
    });
    // 5. Post-Flight Assertions
    const assertionResults = await MatlockForensics.evaluateAssertions(client, args.assertions);
    // 6. Formulate Verdict
    const verdict = MatlockForensics.compileVerdict(execResult.exitCode, assertionResults);
    let forensicNote;
    if (verdict === 'PASS') {
        forensicNote = 'Command executed cleanly with all assertions verified.';
    }
    else if (verdict === 'WARN') {
        forensicNote = 'Command returned exit code 0, but one or more post-flight assertions failed to confirm expected state.';
    }
    else {
        forensicNote = `Command failed with exit code ${execResult.exitCode}.`;
    }
    return {
        command,
        tier: guard.tier,
        tierReason: guard.reason,
        exitCode: execResult.exitCode,
        stdout: execResult.stdout,
        stderr: execResult.stderr,
        durationMs: execResult.durationMs,
        assertions: assertionResults,
        verdict,
        forensicNote,
    };
}
//# sourceMappingURL=exec.js.map