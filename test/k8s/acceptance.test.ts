/**
 * test/k8s/acceptance.test.ts
 *
 * Milestone 4 (spec-k8s/08): the repository-defined acceptance contract —
 * UAT-003 (defined by the repository, not holagents), exit-code semantics
 * (0 = pass, non-zero = fail, timeout = ERROR), and the fail-closed
 * handling of missing or non-executable scripts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  runAcceptance,
  validateAcceptanceContract,
  type AcceptanceContract,
  type AcceptanceExecutable,
} from '../../extensions/k8s/acceptance.ts';

const contract: AcceptanceContract = {
  path: 'tests/acceptance/run.sh',
  requiredEnv: ['HOL_ENV'],
  timeoutMs: 300000,
};

function executable(
  exitCode: number,
  extra: Partial<{ stdout: string; stderr: string; timedOut: boolean }> = {},
) {
  return {
    run: async () => ({
      exitCode,
      stdout: extra.stdout ?? '',
      stderr: extra.stderr ?? '',
      timedOut: extra.timedOut ?? false,
    }),
  } as unknown as AcceptanceExecutable;
}

async function run(
  over: Partial<{
    exitCode: number;
    stdout: string;
    stderr: string;
    timedOut: boolean;
    scriptExists: boolean;
    scriptExecutable: boolean;
    env: Record<string, string>;
  }>,
) {
  const { exitCode, stdout, stderr, timedOut, scriptExists, scriptExecutable, env } = over;
  return runAcceptance(contract, {
    cwd: '/repo',
    env: env ?? { HOL_ENV: 'uat' },
    executable: executable(exitCode ?? 0, { stdout, stderr, timedOut }),
    scriptExists: scriptExists ?? true,
    scriptExecutable,
    startedAt: '2026-09-25T00:00:00.000Z',
    completedAt: '2026-09-25T00:00:01.000Z',
  });
}

test('exit 0 passes, non-zero fails (UAT-003)', async () => {
  const ok = await run({ exitCode: 0, stdout: 'pass' });
  assert.equal(ok.classification, 'PASS');
  assert.equal(ok.exitCode, 0);
  assert.equal(ok.stdout, 'pass');

  const failed = await run({ exitCode: 2, stderr: 'boom' });
  assert.equal(failed.classification, 'FAIL');
  assert.equal(failed.exitCode, 2);
  assert.equal(failed.stderr, 'boom');
});

test('a timeout is an ERROR, not a FAIL', async () => {
  const timedOut = await run({ exitCode: 124, stderr: 'timed out', timedOut: true });
  assert.equal(timedOut.classification, 'ERROR');
  assert.equal(timedOut.timedOut, true);
});

test('missing or non-executable scripts block (fail closed)', async () => {
  const missing = await run({ scriptExists: false });
  assert.equal(missing.classification, 'BLOCKED');
  assert.equal(missing.subcode, 'BLOCKED_SCRIPT');

  const notExec = await run({ scriptExecutable: false });
  assert.equal(notExec.classification, 'BLOCKED');
  assert.equal(notExec.subcode, 'BLOCKED_SCRIPT');
});

test('missing required environment blocks', async () => {
  const noEnv = await run({ env: {} });
  assert.equal(noEnv.classification, 'BLOCKED');
  assert.equal(noEnv.subcode, 'BLOCKED_INPUT');
});

test('the acceptance contract itself is validated', () => {
  assert.deepEqual(validateAcceptanceContract(contract), []);

  const problems: string[] = [];
  problems.push(...validateAcceptanceContract({ ...contract, path: 'tests/acceptance/run' }));
  problems.push(...validateAcceptanceContract({ ...contract, timeoutMs: 0 }));
  problems.push(...validateAcceptanceContract({ ...contract, requiredEnv: ['NOT AN ENV VAR'] }));
  assert.equal(problems.length, 3);
  assert.ok(problems[0]!.includes('contract.path'));
  assert.ok(problems[1]!.includes('timeoutMs'));
  assert.ok(problems[2]!.includes('requiredEnv'));
});
