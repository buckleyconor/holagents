/**
 * Shared test harness for linter rule/CLI tests:
 * BASE (a fully conformant minimal guide) + a runLint-on-tmpdir helper.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runLint, type LintReport } from '../../extensions/linter/index.ts';

/** A fully conformant minimal guide (passes with zero findings, shellcheck skipped). */
export const BASE = [
  '# HOL-1000-01 Clean Fixture',
  'ℹ️ You can resize or hide the lab guide anytime by sliding it left or right.',
  '',
  '## Table of Contents',
  '- [1. Introduction](#introduction)',
  '- [2. Module 1: Setup](#module-1-setup)',
  '- [3. Summary](#summary)',
  '',
  '### Lab Credentials:',
  '- Username/Password: demo / Password123!',
  '',
  '### Target Audience',
  '- Platform engineers',
  '',
  '## Introduction',
  '**Duration:** This lab takes about 10 minutes.',
  '**Objective:** The objective of this lab is to:',
  '- Set up the thing correctly.',
  '',
  '[Back to top](#table-of-contents)',
  '',
  '## Module 1: Setup',
  '1. Launch the terminal and look at the files.',
  '',
  '\t`ls -la`',
  '',
  '> ✅ **Checkpoint:** The workspace is ready.',
  '',
  '[Back to top](#table-of-contents)',
  '',
  '## Summary',
  'You set up the thing.',
  '',
  '[Back to top](#table-of-contents)',
].join('\n');

/** 1-based line of the `\t\`ls -la\`` command in BASE. */
export const BASE_COMMAND_LINE = 25;

export interface LintOpts {
  plan?: string;
  modulePlan?: string;
  moduleSlug?: string;
  shellcheckBin?: string | null;
}

/** Write `content` as guide.md in a temp guide dir and lint it (shellcheck off by default). */
export async function lint(content: string, opts: LintOpts = {}): Promise<LintReport> {
  const dir = mkdtempSync(join(tmpdir(), 'holagent-lint-'));
  writeFileSync(join(dir, 'guide.md'), content);
  mkdirSync(join(dir, '.holagent'), { recursive: true });
  if (opts.plan) writeFileSync(join(dir, '.holagent', 'plan.md'), opts.plan);
  if (opts.modulePlan && opts.moduleSlug) {
    const slugDir = join(dir, '.holagent', `01-${opts.moduleSlug}`);
    mkdirSync(slugDir, { recursive: true });
    writeFileSync(join(slugDir, 'plan.md'), opts.modulePlan);
  }
  try {
    return await runLint(dir, { shellcheckBin: opts.shellcheckBin ?? null });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Findings of one rule, in report order. */
export function findings(r: LintReport, rule: string) {
  return r.findings.filter((f) => f.rule === rule);
}
