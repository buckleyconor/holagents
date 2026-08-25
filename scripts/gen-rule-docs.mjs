#!/usr/bin/env node
/**
 * gen-rule-docs.mjs — regenerates docs/linter-rules.md from
 * skills/guide-format/format.json. Run: npm run docs:rules
 * CI fails if the committed doc drifts from the source config.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const format = JSON.parse(
  readFileSync(join(root, 'skills/guide-format/format.json'), 'utf8'),
);

const lines = [
  '# Linter rules',
  '',
  'Generated from `skills/guide-format/format.json` — do not edit by hand',
  '(run `npm run docs:rules`). Rule config is the source of truth; rule logic',
  'lives in `extensions/linter/rules/`.',
  '',
  '| ID | Severity | Check | Fix hint |',
  '|---|---|---|---|',
];
for (const rule of format.rules) {
  lines.push(
    `| **${rule.id}** | ${rule.severity} | ${rule.title} — ${rule.description} | ${rule.fixHint} |`,
  );
}
lines.push(
  '',
  '## Exit codes (CLI)',
  '',
  '| Code | Meaning |',
  '|---|---|',
  '| 0 | Clean (warnings allowed) |',
  '| 1 | One or more errors |',
  '| 2 | Warnings only |',
  '| 3 | Usage/config error |',
  '',
);

mkdirSync(join(root, 'docs'), { recursive: true });
writeFileSync(join(root, 'docs/linter-rules.md'), lines.join('\n'));
console.log(`wrote docs/linter-rules.md (${format.rules.length} rules)`);
