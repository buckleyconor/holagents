/**
 * Repository application acceptance contract (spec-k8s/07 UAT-003). Each
 * lab repository contains a non-interactive acceptance entry point,
 * initially `tests/acceptance/run.sh`, which tests the deployed revision
 * and must not deploy or mutate another environment.
 *
 * Classification (UAT-003): missing, non-executable or timed-out mandatory
 * scripts return `BLOCKED` or `ERROR`; executed failed assertions return
 * `FAIL`.
 */
import { execFile } from 'node:child_process';
import { redactText } from './redact.ts';
import type { GateClassification } from './results.ts';

export interface AcceptanceContract {
  /** Repository-relative script path, e.g. `tests/acceptance/run.sh`. */
  path: string;
  /** Environment variables the script requires. */
  requiredEnv: string[];
  timeoutMs: number;
  /** Where the script writes its JSON or JUnit results. */
  resultsPath?: string;
  /** Test and tool versions the script reports. */
  versions?: Record<string, string>;
}

export interface AcceptanceExecution {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

/**
 * Injectable execution boundary. The local executable runs the script in
 * the lab repository (local code, like `hol_build_test`); contract tests
 * inject a fake.
 */
export interface AcceptanceExecutable {
  run(
    script: string,
    cwd: string,
    env: Record<string, string>,
    timeoutMs: number,
  ): Promise<AcceptanceExecution>;
}

/** Real executable for dev-environment runs. */
export const localAcceptanceExecutable: AcceptanceExecutable = {
  run(script, cwd, env, timeoutMs) {
    return new Promise((resolve) => {
      const child = execFile(
        'bash',
        [script],
        { cwd, env: { ...process.env, ...env } },
        (error, stdout, stderr) => {
          if (error && 'killed' in error && error.killed) {
            resolve({
              exitCode: 124,
              stdout: stdout ?? '',
              stderr: stderr ?? 'timeout',
              timedOut: true,
            });
            return;
          }
          const code =
            typeof (error as { code?: unknown })?.code === 'number'
              ? (error as { code: number }).code
              : error
                ? 1
                : 0;
          resolve({ exitCode: code, stdout: stdout ?? '', stderr: stderr ?? '', timedOut: false });
        },
      );
      const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
      child.on('close', () => clearTimeout(timer));
    });
  },
};

export interface AcceptanceResult {
  classification: GateClassification;
  subcode?: string;
  exitCode: number;
  durationMs: number;
  timedOut: boolean;
  stdout: string;
  stderr: string;
}

export interface AcceptanceRunOptions {
  /** Lab repository root. */
  cwd: string;
  env: Record<string, string>;
  executable: AcceptanceExecutable;
  /** Whether the script exists at contract.path. */
  scriptExists: boolean;
  /** Whether the script is executable. */
  scriptExecutable?: boolean;
  /** Start timestamp for duration accounting. */
  startedAt: string;
  completedAt: string;
}

/**
 * Run the acceptance entry point for the deployed revision (UAT-003).
 * Deterministic, non-interactive, redacted output.
 */
export async function runAcceptance(
  contract: AcceptanceContract,
  opts: AcceptanceRunOptions,
): Promise<AcceptanceResult> {
  const base: Omit<AcceptanceResult, 'classification' | 'exitCode' | 'timedOut' | 'durationMs'> = {
    stdout: '',
    stderr: '',
  };

  const missingEnv = contract.requiredEnv.filter((name) => opts.env[name] === undefined);
  if (missingEnv.length > 0) {
    return {
      classification: 'BLOCKED',
      subcode: 'BLOCKED_INPUT',
      exitCode: 3,
      timedOut: false,
      durationMs: 0,
      stdout: '',
      stderr: `missing required environment variables: ${missingEnv.join(', ')}`,
    };
  }
  if (!opts.scriptExists) {
    return {
      classification: 'BLOCKED',
      subcode: 'BLOCKED_SCRIPT',
      exitCode: 3,
      timedOut: false,
      durationMs: 0,
      stdout: '',
      stderr: `acceptance script ${contract.path} is missing`,
    };
  }
  if (opts.scriptExecutable === false) {
    return {
      classification: 'BLOCKED',
      subcode: 'BLOCKED_SCRIPT',
      exitCode: 3,
      timedOut: false,
      durationMs: 0,
      stdout: '',
      stderr: `acceptance script ${contract.path} is not executable`,
    };
  }

  const exec = await opts.executable.run(contract.path, opts.cwd, opts.env, contract.timeoutMs);
  const durationMs = Math.max(0, Date.parse(opts.completedAt) - Date.parse(opts.startedAt));
  if (exec.timedOut) {
    return {
      classification: 'ERROR',
      exitCode: 5,
      timedOut: true,
      durationMs,
      stdout: redactText(exec.stdout),
      stderr: redactText(exec.stderr || 'acceptance script timed out'),
    };
  }
  // Executed failed assertions are FAIL (UAT-003); 0 is PASS.
  return {
    classification: exec.exitCode === 0 ? 'PASS' : 'FAIL',
    exitCode: exec.exitCode,
    timedOut: false,
    durationMs,
    stdout: redactText(exec.stdout),
    stderr: redactText(exec.stderr),
  };
}

/** Structural check on a contract (path shape, timeout, env names). */
export function validateAcceptanceContract(contract: AcceptanceContract): string[] {
  const problems: string[] = [];
  if (!/^[A-Za-z0-9._/-]+\.sh$/.test(contract.path))
    problems.push(`contract.path "${contract.path}" must be a repository-relative .sh path`);
  if (contract.timeoutMs <= 0) problems.push('contract.timeoutMs must be positive');
  for (const name of contract.requiredEnv) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))
      problems.push(`contract.requiredEnv "${name}" is not a valid environment variable name`);
  }
  return problems;
}
