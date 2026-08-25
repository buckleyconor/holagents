#!/usr/bin/env node
/**
 * lint-corpus.mjs — triage aid: runs the linter over every style-corpus
 * sample and prints a per-sample rule-count summary. Shellcheck is skipped;
 * the asserted corpus tests do the same for determinism.
 * Run: npm run lint:corpus  (uses --experimental-strip-types to import the TS linter)
 */
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { runLint } = await import('../extensions/linter/index.ts');
const samplesDir = join(root, 'skills', 'style-corpus', 'samples');

for (const f of readdirSync(samplesDir)
  .filter((f) => f.endsWith('.md'))
  .sort()) {
  const dir = mkdtempSync(join(tmpdir(), 'holagent-corpus-'));
  try {
    writeFileSync(join(dir, 'guide.md'), readFileSync(join(samplesDir, f), 'utf8'));
    mkdirSync(join(dir, '.holagent'), { recursive: true });
    const report = await runLint(dir, { shellcheckBin: null });
    const counts = {};
    for (const finding of report.findings) counts[finding.rule] = (counts[finding.rule] ?? 0) + 1;
    console.log(`${f}\n  ${JSON.stringify(counts)}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
