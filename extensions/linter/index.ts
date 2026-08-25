/**
 * runLint — linter entry point. Spec: §02 §4.1.
 *
 * Deterministic contract:
 *   - `findings` sorted by (rule, line); no timestamps → byte-identical reports
 *     for identical input (T-46).
 *   - `ok` = zero error-severity findings (warnings never block).
 * Errors: the caller maps thrown E-READ/E-PATH conditions (readFileSync of a
 * missing guide.md) — this function assumes a readable guide.md.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defaultFormatPath, loadFormatConfig } from './config.ts';
import { runAllRules } from './registry.ts';
import { scanMarkdown } from './scan.ts';
import { runShellcheck } from './shellcheck.ts';
import './rules/index.ts';
import type { Finding, LintReport } from './types.ts';

export interface RunLintOptions {
  /** Override format.json path (tests). */
  formatPath?: string;
  /** Shellcheck binary; undefined → auto-detect, null → force skip. */
  shellcheckBin?: string | null;
}

export async function runLint(guideDir: string, opts: RunLintOptions = {}): Promise<LintReport> {
  const config = loadFormatConfig(opts.formatPath);
  const guideFile = join(guideDir, 'guide.md');
  const text = readFileSync(guideFile, 'utf8');
  const scan = scanMarkdown(text.split(/\r?\n/), config);

  const findings = await runAllRules({ scan, config, guideDir });
  const shellcheck =
    opts.shellcheckBin === null
      ? 'skipped (shellcheck not installed)'
      : await runShellcheck(scan, opts.shellcheckBin);

  const all: Finding[] = [...findings];
  if (Array.isArray(shellcheck)) all.push(...shellcheck);
  all.sort((a, b) => a.rule.localeCompare(b.rule) || (a.line ?? 0) - (b.line ?? 0));
  const errors = all.filter((f) => f.severity === 'error').length;
  const warnings = all.length - errors;
  return { ok: errors === 0, guideDir, findings: all, summary: { errors, warnings }, shellcheck };
}

export { loadFormatConfig, defaultFormatPath } from './config.ts';
export { scanMarkdown } from './scan.ts';
export { registeredRuleIds, registerRule } from './registry.ts';
export type { GuideFormatConfig } from './config.ts';
export type { Finding, LintReport, ScanResult } from './types.ts';
