import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * T-40: concurrency — two processes merge 50 score entries each into the
 * same scores.json. The atomic temp+rename contract means the file is
 * always a complete, valid snapshot (no torn writes); lost updates are
 * possible by design (the single-writer principle makes the parent the
 * only writer in practice — spec §04 §7.4).
 */
test('T-40: concurrent merges never produce torn writes', async () => {
  const base = mkdtempSync(join(tmpdir(), 'holagent-conc-'));
  const guideDir = join(base, 'g');
  mkdirSync(join(guideDir, '.holagent'), { recursive: true });

  const coreUrl = pathToFileURL(
    join(import.meta.dirname ?? '.', '../../extensions/hol-core.ts'),
  ).href;
  const worker = join(base, 'worker.ts');
  writeFileSync(
    worker,
    `import { mergeScores } from '${coreUrl}';
const [guideDir, tag, n] = process.argv.slice(2);
for (let i = 1; i <= Number(n); i += 1) {
  mergeScores(guideDir, [{
    scope: 'module-01-' + tag,
    rubric: 'analytic/r' + i,
    kind: 'analytic',
    status: 'passed',
    score: 4,
    rounds: 1,
    findings: [],
    updated_at: new Date().toISOString(),
  }]);
}
`,
  );

  await Promise.all(
    ['a', 'b'].map(
      (tag) =>
        new Promise<void>((res, rej) => {
          execFile(
            process.execPath,
            ['--experimental-strip-types', worker, guideDir, tag, '50'],
            (err) => (err ? rej(err) : res()),
          );
        }),
    ),
  );

  const text = readFileSync(join(guideDir, '.holagent', 'scores.json'), 'utf8');
  const file = JSON.parse(text); // throws on torn/corrupt writes
  assert.equal(file.version, 1);
  assert.ok(Array.isArray(file.entries), 'entries array present');
  // each worker's own 50 upserts are a complete snapshot; lost updates may
  // drop some of the other's — so 50 <= count <= 100.
  assert.ok(
    file.entries.length >= 50 && file.entries.length <= 100,
    `count ${file.entries.length}`,
  );
  for (const e of file.entries) {
    assert.equal(typeof e.scope, 'string');
    assert.equal(typeof e.rubric, 'string');
    assert.equal(typeof e.score, 'number');
    assert.match(e.scope, /^module-01-[ab]$/);
  }
  rmSync(base, { recursive: true, force: true });
});
