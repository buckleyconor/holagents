import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * T-47 (partial) / T-49: package manifest integrity and dependency hygiene.
 * Full manifest-in-tarball verification lands with M11 (package-smoke.mjs).
 */

function pkg() {
  return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
}

test('T-47a: pi manifest declares extensions/skills/prompts paths', () => {
  const p = pkg();
  assert.ok(p.pi, 'pi manifest present');
  assert.ok(Array.isArray(p.pi.extensions) && p.pi.extensions.length > 0);
  assert.ok(Array.isArray(p.pi.skills) && p.pi.skills.length > 0);
  assert.ok(Array.isArray(p.pi.prompts) && p.pi.prompts.length > 0);
  assert.ok(p['pi-subagents'], 'pi-subagents manifest present');
  assert.ok(Array.isArray(p['pi-subagents'].agents) && p['pi-subagents'].agents.length > 0);
  assert.ok(
    p.keywords.includes('pi-package'),
    'pi-package keyword present for gallery discoverability',
  );
});

test('T-49: zero non-peer runtime dependencies', () => {
  const p = pkg();
  assert.deepStrictEqual(p.dependencies ?? {}, {}, 'no runtime dependencies allowed');
  for (const name of ['typebox', '@earendil-works/pi-ai', '@earendil-works/pi-coding-agent']) {
    assert.equal(p.peerDependencies[name], '*', `${name} is a pi-bundled peer dep`);
  }
});
