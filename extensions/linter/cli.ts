#!/usr/bin/env node
/**
 * Linter CLI. Spec: §02 §4.5 (exit codes refined in §08: 0 = no findings,
 * 2 = warnings only; the tool-level `ok` = no errors).
 *
 * Usage: node --experimental-strip-types extensions/linter/cli.ts [guideDir]
 * Output: JSON LintReport on stdout (deterministic — no timestamps).
 */
import { isGuideDir, resolveGuideRoot } from '../state.ts';
import { runLint } from './index.ts';
import { resolve } from 'node:path';

async function main(): Promise<void> {
  const arg = process.argv[2];
  let guideDir: string | null;
  if (arg) {
    const abs = resolve(arg);
    guideDir = isGuideDir(abs) ? abs : null;
    if (!guideDir) {
      console.error(`error: not a guide dir (needs guide.md + .holagent/): ${arg}`);
      process.exit(3);
    }
  } else {
    guideDir = resolveGuideRoot(process.cwd());
    if (!guideDir) {
      console.error(
        'error: no guide root found from cwd — run inside a guide dir or pass <guideDir>',
      );
      process.exit(3);
    }
  }

  try {
    const report = await runLint(guideDir);
    console.log(JSON.stringify(report, null, 2));
    if (report.summary.errors > 0) process.exit(1);
    if (report.summary.warnings > 0) process.exit(2);
    process.exit(0);
  } catch (e) {
    console.error(`error: ${(e as Error).message}`);
    process.exit(3);
  }
}

main();
