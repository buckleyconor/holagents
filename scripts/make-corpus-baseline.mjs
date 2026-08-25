#!/usr/bin/env node
/**
 * make-corpus-baseline.mjs — (re)writes test/corpus/expected/<sample>.json
 * from the current linter output over skills/style-corpus/samples/.
 *
 * Run: npm run corpus:baseline
 * ONLY after author triage: review the diff of the new baselines against the
 * old ones and confirm every changed finding is a deliberate rule change,
 * not a silent behavior regression (spec §05 T-42…T-44).
 *
 * Baselines record {rule, line, severity} per finding — messages are
 * deliberately excluded so wording tweaks don't churn baselines.
 */
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { runLint } = await import('../extensions/linter/index.ts');
const samplesDir = join(root, 'skills', 'style-corpus', 'samples');
const outDir = join(root, 'test', 'corpus', 'expected');
mkdirSync(outDir, { recursive: true });

for (const f of readdirSync(samplesDir)
  .filter((f) => f.endsWith('.md'))
  .sort()) {
  const dir = mkdtempSync(join(tmpdir(), 'holagent-baseline-'));
  try {
    writeFileSync(join(dir, 'guide.md'), readFileSync(join(samplesDir, f), 'utf8'));
    mkdirSync(join(dir, '.holagent'), { recursive: true });
    const report = await runLint(dir, { shellcheckBin: null });
    const baseline = report.findings.map((finding) => ({
      rule: finding.rule,
      line: finding.line,
      severity: finding.severity,
    }));
    writeFileSync(join(outDir, f), JSON.stringify(baseline, null, 2) + '\n');
    console.log(`${f} → ${baseline.length} finding(s)`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
console.log(
  `wrote ${readdirSync(outDir).filter((f) => f.endsWith('.md')).length} baseline file(s) to test/corpus/expected/`,
);
