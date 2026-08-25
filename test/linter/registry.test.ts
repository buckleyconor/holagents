import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadFormatConfig, registeredRuleIds } from '../../extensions/linter/index.ts';
import { SHELLCHECK_RULE_IDS } from '../../extensions/linter/shellcheck.ts';

/**
 * T-50: rule registry integrity.
 *  - every rule ID declared in format.json is implemented — either as a
 *    registry rule or via the shellcheck pass (L014/W014/W-SH) — and no
 *    registered rule is an orphan,
 *  - the generated docs/linter-rules.md documents every declared ID.
 */
test('T-50: format.json ↔ registry ↔ docs parity', () => {
  const declared = loadFormatConfig()
    .rules.map((r) => r.id)
    .sort();
  const implemented = [...registeredRuleIds(), ...SHELLCHECK_RULE_IDS].sort();
  assert.deepEqual(implemented, declared, 'every declared rule is implemented, no orphans');

  const docs = readFileSync(new URL('../../docs/linter-rules.md', import.meta.url), 'utf8');
  for (const id of declared) {
    assert.ok(docs.includes(`**${id}**`), `docs/linter-rules.md documents ${id}`);
  }
});
