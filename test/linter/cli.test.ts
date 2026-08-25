import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { BASE } from './harness.ts';

/**
 * T-45/T-46: CLI exit codes + deterministic output.
 * SHELLCHECK_BIN=/bin/true keeps command checks clean & environment-independent.
 */

const repoRoot = resolve(new URL('../../', import.meta.url).pathname);

function cli(guideDir: string): Promise<{ code: number; out: string }> {
  return new Promise((res) => {
    execFile(
      process.execPath,
      ['--experimental-strip-types', join(repoRoot, 'extensions/linter/cli.ts'), guideDir],
      { cwd: repoRoot, env: { ...process.env, SHELLCHECK_BIN: '/bin/true' } },
      (err, stdout) => {
        const code = err
          ? Number((err as NodeJS.ErrnoException & { code?: unknown }).code ?? 1)
          : 0;
        res({ code, out: stdout ?? '' });
      },
    );
  });
}

function makeGuide(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'holagent-cli-'));
  writeFileSync(join(dir, 'guide.md'), content);
  mkdirSync(join(dir, '.holagent'), { recursive: true });
  return dir;
}

test('T-45: exit codes — clean=0, warnings-only=2, errors=1, usage=3', async () => {
  const clean = makeGuide(BASE);
  const warned = makeGuide(BASE.replace('You set up the thing.', 'TODO: recap'));
  const errored = makeGuide(BASE.replace('# HOL-1000-01 Clean Fixture', '# no id here'));
  try {
    const r0 = await cli(clean);
    assert.equal(r0.code, 0);
    const report0 = JSON.parse(r0.out);
    assert.equal(report0.ok, true);
    assert.equal(report0.summary.errors, 0);
    assert.equal(report0.summary.warnings, 0);

    const r2 = await cli(warned);
    assert.equal(r2.code, 2);
    assert.equal(JSON.parse(r2.out).ok, true); // warnings do not block

    const r1 = await cli(errored);
    assert.equal(r1.code, 1);
    assert.equal(JSON.parse(r1.out).ok, false);

    const r3 = await cli('/definitely/not/a/guide');
    assert.equal(r3.code, 3);
  } finally {
    for (const d of [clean, warned, errored]) rmSync(d, { recursive: true, force: true });
  }
});

test('T-46: byte-identical reports across runs', async () => {
  const dir = makeGuide(BASE);
  try {
    const a = await cli(dir);
    const b = await cli(dir);
    assert.equal(a.out, b.out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
