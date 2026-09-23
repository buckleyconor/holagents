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

/**
 * T-47c: the release version is a fact written once.
 * package.json is the source; the docs and CI must read from it or agree with
 * it. A hardcoded version in ci.yml is what broke `npm pack` smoke at the
 * 0.1.0 -> 0.2.0 bump (6b84250), so both the docs and the workflow are checked
 * against the manifest here.
 */
test('T-47c: docs and CI agree with the package.json version', () => {
  const v: string = pkg().version;
  const read = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

  assert.match(v, /^\d+\.\d+\.\d+$/, 'package.json version is semver');

  const installLines = [...read('README.md').matchAll(/pi install git:\S+@v(\d+\.\d+\.\d+)/g)];
  assert.ok(installLines.length >= 2, 'README states the install ref');
  for (const m of installLines) {
    assert.equal(m[1], v, 'README install line must quote the package.json version');
  }

  const desc = read('holagent_description.md').match(/holagent-lab-guides`? v(\d+\.\d+\.\d+)/);
  assert.ok(desc, 'holagent_description.md states the package version');
  assert.equal(desc[1], v, 'holagent_description.md must quote the package.json version');

  const ci = read('.github/workflows/ci.yml');
  assert.doesNotMatch(
    ci,
    /holagent-lab-guides-\d+\.\d+\.\d+\.tgz/,
    'ci.yml must not hardcode the tarball name (the 0.1.0 -> 0.2.0 breakage)',
  );
  assert.match(ci, /package\.json.*\.version/, 'ci.yml must derive the version from package.json');
});
