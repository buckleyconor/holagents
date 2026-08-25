import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runLint } from '../../extensions/linter/index.ts';

/**
 * T-42…T-44: style-corpus regression (spec §05).
 * The 4 team sample guides are the executable spec: their linter output must
 * match the triaged baselines in test/corpus/expected/ exactly
 * ({rule, line, severity} per finding).
 *
 * Shellcheck is forced off (shellcheckBin: null) so baselines are identical
 * across dev machines and CI runners.
 *
 * Updating baselines: fix the rule (or the sample), review the diff with
 * `npm run corpus:baseline`, and commit.
 */

const samplesDir = new URL('../../skills/style-corpus/samples/', import.meta.url).pathname;
const expectedDir = new URL('./expected/', import.meta.url).pathname;

async function lintSample(name: string) {
  const content = readFileSync(join(samplesDir, name), 'utf8');
  const dir = mkdtempSync(join(tmpdir(), 'holagent-corpus-'));
  try {
    writeFileSync(join(dir, 'guide.md'), content);
    mkdirSync(join(dir, '.holagent'), { recursive: true });
    const report = await runLint(dir, { shellcheckBin: null });
    return report.findings.map((f) => ({ rule: f.rule, line: f.line, severity: f.severity }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const samples = readdirSync(samplesDir)
  .filter((f) => f.endsWith('.md'))
  .sort();

test('T-42: corpus present (4 sample guides synced)', () => {
  assert.equal(samples.length, 4, 'skills/style-corpus/samples must hold the 4 team samples');
});

for (const name of samples) {
  test(`T-42: linter output matches triaged baseline — ${name.slice(0, 12)}…`, async () => {
    const expected = JSON.parse(readFileSync(join(expectedDir, name), 'utf8'));
    const actual = await lintSample(name);
    assert.deepEqual(
      actual,
      expected,
      `run \`npm run corpus:baseline\` and review the diff after triage`,
    );
  });
}

test('T-43: HOL-1354 baseline captures the known drift (L001 no H1, L003 duplicate "2.")', async () => {
  const name = samples.find((s) => s.startsWith('HOL-1354-01'));
  assert.ok(name, '1354 sample present');
  const actual = await lintSample(name!);
  const rules = actual.map((f) => f.rule);
  assert.ok(rules.includes('L001'), 'missing H1/ID detected');
  assert.ok(rules.includes('L003'), 'duplicate TOC number detected');
  assert.ok(!rules.includes('L004'), '1354 anchors all resolve (short TOC titles are legal)');
  assert.ok(!rules.includes('L013'), '1354 images are valid ImageProxy/placeholder lines');
});

test('T-44: HOL-1345 baseline captures the known drift (L011 Phase×3, L006 h2 credentials, L004 stale×2)', async () => {
  const name = samples.find((s) => s.startsWith('HOL-1345-01'));
  assert.ok(name, '1345 sample present');
  const actual = await lintSample(name!);
  const count = (rule: string) => actual.filter((f) => f.rule === rule).length;
  assert.equal(count('L011'), 3, 'three "## Phase N - …" sections');
  assert.equal(count('L006'), 1, '"## Lab Credentials:" at h2');
  assert.equal(count('L004'), 2, 'two stale TOC anchors');
  assert.equal(count('L008'), 1, '"## Introduction Overview" drift');
  assert.equal(count('L010'), 1, 'no standalone "## Summary"');
});
