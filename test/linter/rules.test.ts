import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BASE, BASE_COMMAND_LINE, findings, lint } from './harness.ts';

/**
 * T-01…T-31: rule-level fixtures. Each test mutates the BASE (clean) guide
 * and asserts the specific rule fires (counts where specced).
 * shellcheck is forced off by default; L014/W014 use a stub binary.
 */

test('BASE: clean guide → zero findings, ok', async () => {
  const r = await lint(BASE);
  assert.equal(r.ok, true);
  assert.deepEqual(r.findings, []);
  assert.equal(r.shellcheck, 'skipped (shellcheck not installed)');
});

test('T-01/T-02: H1 with ID ok; drifted H1 → L001', async () => {
  assert.equal(findings(await lint(BASE), 'L001').length, 0);
  const r = await lint(
    BASE.replace('# HOL-1000-01 Clean Fixture', '# Lab Guide: Sign Language Tutor'),
  );
  assert.equal(findings(r, 'L001').length, 1);
});

test('T-03: H1 not first non-empty line → L001', async () => {
  const r = await lint(`note line before heading\n\n${BASE}`);
  assert.equal(findings(r, 'L001').length, 1);
});

test('T-04/T-05: platform notice ok; missing → L002', async () => {
  assert.equal(findings(await lint(BASE), 'L002').length, 0);
  const r = await lint(
    BASE.split('\n')
      .filter((l) => !l.startsWith('ℹ️'))
      .join('\n'),
  );
  assert.equal(findings(r, 'L002').length, 1);
});

test('T-06/T-07: TOC sequential ok; duplicate number → L003', async () => {
  assert.equal(findings(await lint(BASE), 'L003').length, 0);
  const r = await lint(BASE.replace('- [3. Summary](#summary)', '- [2. Summary](#summary)'));
  assert.equal(findings(r, 'L003').length, 1);
});

test('T-08/T-09: anchors resolve ok; stale anchor → L004', async () => {
  assert.equal(findings(await lint(BASE), 'L004').length, 0);
  const r = await lint(BASE.replace(/#module-1-setup/g, '#phase-1-setup'));
  assert.equal(findings(r, 'L004').length, 1);
});

test('T-10: TOC external URL → L004', async () => {
  const r = await lint(
    BASE.replace('- [3. Summary](#summary)', '- [3. Summary](https://example.com#summary)'),
  );
  assert.equal(findings(r, 'L004').length, 1);
});

test('T-11: section missing from TOC → L005', async () => {
  const r = await lint(BASE.replace('- [3. Summary](#summary)\n', ''));
  assert.equal(findings(r, 'L005').length, 1);
});

test('T-12: duplicate ## headings → L005', async () => {
  const content = `${BASE}\n\n## Introduction\n\nDuplicate.\n\n[Back to top](#table-of-contents)\n`;
  const r = await lint(content);
  assert.ok(findings(r, 'L005').some((f) => f.message.includes('Duplicate')));
});

test('T-13: credentials — h2 drift and missing credential line → L006', async () => {
  const h2 = await lint(BASE.replace('### Lab Credentials:', '## Lab Credentials:'));
  assert.equal(findings(h2, 'L006').length, 1);
  const nocred = await lint(
    BASE.replace('- Username/Password: demo / Password123!', '- nothing to see'),
  );
  assert.equal(findings(nocred, 'L006').length, 1);
  assert.equal(findings(await lint(BASE), 'L006').length, 0);
});

test('T-14: L007 / L008 / L009', async () => {
  const noAud = await lint(BASE.replace('### Target Audience', '### Who is this for'));
  assert.equal(findings(noAud, 'L007').length, 1);

  const variant = await lint(BASE.replace('## Introduction', '## Introduction Overview'));
  assert.equal(findings(variant, 'L008').length, 1);
  assert.match(findings(variant, 'L008')[0]?.message ?? '', /rename/);

  const noObj = await lint(
    BASE.replace('**Objective:** The objective of this lab is to:', 'Goals:'),
  );
  assert.equal(findings(noObj, 'L009').length, 1);
});

test('T-15: L010 missing summary; W003 summary before module', async () => {
  const noSummary = await lint(
    BASE.replace(
      '## Summary\nYou set up the thing.\n\n[Back to top](#table-of-contents)',
      '',
    ).replace('- [3. Summary](#summary)\n', ''),
  );
  assert.equal(findings(noSummary, 'L010').length, 1);

  const lines = BASE.split('\n');
  const summaryIdx = lines.findIndex((l) => l === '## Summary');
  const moduleIdx = lines.findIndex((l) => l === '## Module 1: Setup');
  const summaryBlock = lines.splice(summaryIdx, 4); // "## Summary", body, "", back-to-top
  lines.splice(moduleIdx, 0, ...summaryBlock);
  const r = await lint(lines.join('\n'));
  assert.equal(findings(r, 'W003').length, 1);
});

test('T-16: "## Phase 1 - …" drift → L011', async () => {
  const lines = BASE.split('\n');
  lines[lines.findIndex((l) => l === '## Module 1: Setup')] = '## Phase 1 - Create Collections';
  lines[lines.findIndex((l) => l.includes('#module-1-setup'))] =
    '- [2. Phase 1 - Create Collections](#phase-1-create-collections)';
  const r = await lint(lines.join('\n'));
  assert.equal(findings(r, 'L011').length, 1);
});

test('T-17: module numbering gap → L011', async () => {
  const r = await lint(BASE.replace('## Module 1: Setup', '## Module 3: Setup'));
  assert.equal(findings(r, 'L011').length, 1);
});

test('T-18: missing back-to-top → L012', async () => {
  const lines = BASE.split('\n');
  lines[lines.lastIndexOf('[Back to top](#table-of-contents)')] = 'done';
  const r = await lint(lines.join('\n'));
  assert.equal(findings(r, 'L012').length, 1);
});

test('T-19/T-20: valid image forms → no L013', async () => {
  const proxy = await lint(
    BASE.replace(
      '> ✅ **Checkpoint:** The workspace is ready.',
      '> ✅ **Checkpoint:** The workspace is ready.\n\n![Image](/ImageProxy?filename=34433ee9-ab2e-4913-a39d-eb3c00ef29d4/a.png "Click to enlarge"){data-modal=true}\n\n<< INSERT SCREENSHOT: terminal with file list >>',
    ),
  );
  assert.equal(findings(proxy, 'L013').length, 0);
});

test('T-21: invalid image forms → L013', async () => {
  const r = await lint(
    BASE.replace(
      '> ✅ **Checkpoint:** The workspace is ready.',
      '> ✅ **Checkpoint:** The workspace is ready.\n\n![](img.png)\n\n![Image](http://cdn.example.com/other.png "Click to enlarge")',
    ),
  );
  assert.equal(findings(r, 'L013').length, 2);
});

function stubShellcheck(stdout: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'holagent-shstub-'));
  const bin = join(dir, 'shellcheck-stub');
  writeFileSync(bin, `#!/bin/sh\nprintf '%s' "${stdout.replace(/"/g, '\\"')}"\nexit 0\n`);
  chmodSync(bin, 0o755);
  return bin;
}

test('T-22/T-23/T-25: shellcheck clean → none; parse error → L014; null → skip note', async () => {
  const clean = await lint(BASE, { shellcheckBin: stubShellcheck('') });
  assert.deepEqual(findings(clean, 'L014'), []);
  assert.deepEqual(findings(clean, 'W014'), []);

  const err = await lint(BASE, {
    shellcheckBin: stubShellcheck(
      "cmd-0.sh:2:1: error: syntax error near unexpected token 'then' [SC1073]",
    ),
  });
  const l014 = findings(err, 'L014');
  assert.equal(l014.length, 1);
  assert.equal(l014[0]?.line, BASE_COMMAND_LINE);
  assert.match(l014[0]?.message ?? '', /SC1073/);
});

test('T-26: non-standard callout → W001', async () => {
  const r = await lint(
    BASE.replace(
      '1. Launch the terminal',
      '1. Launch the terminal.\n\n**Tip!** Watch out for typos.',
    ),
  );
  assert.equal(findings(r, 'W001').length, 1);
});

test('T-27: 3+ command steps without checkpoint → W004', async () => {
  const content = BASE.replace(
    '\t`ls -la`\n\n> ✅ **Checkpoint:** The workspace is ready.',
    ['\t`ls -la`', '', '\t`pwd`', '', '\t`echo done`'].join('\n'),
  );
  const r = await lint(content);
  assert.equal(findings(r, 'W004').length, 1);
});

test('T-28: image checklist mismatch → W005', async () => {
  const withImages = BASE.replace(
    '> ✅ **Checkpoint:** The workspace is ready.',
    [
      '![Image](/ImageProxy?filename=34433ee9-ab2e-4913-a39d-eb3c00ef29d4/a.png "Click to enlarge"){data-modal=true}',
      '',
      '![Image](/ImageProxy?filename=34433ee9-ab2e-4913-a39d-eb3c00ef29d4/b.png "Click to enlarge"){data-modal=true}',
      '',
      '> ✅ **Checkpoint:** The workspace is ready.',
    ].join('\n'),
  );
  const plan = [
    '---',
    'id: HOL-1000-01',
    'title: "Clean Fixture"',
    'modules:',
    '  - { n: 1, slug: setup, title: "Setup" }',
    '---',
    'body',
  ].join('\n');
  const modulePlan = [
    '---',
    'module_n: 1',
    'slug: setup',
    'title: Setup',
    'image_checklist:',
    '  - "terminal with file list"',
    '  - "files pane"',
    '  - "success state"',
    '---',
    'body',
  ].join('\n');
  const r = await lint(withImages, { plan, modulePlan, moduleSlug: 'setup' });
  assert.equal(findings(r, 'W005').length, 1);
  assert.match(findings(r, 'W005')[0]?.message ?? '', /missing/);
});

test('T-29: host drift → W006', async () => {
  const noKnownHosts = await lint(
    BASE.replace(
      '1. Launch the terminal and look at the files.',
      '1. Open https://10.110.73.211:9000 in the browser.',
    ),
  );
  assert.equal(findings(noKnownHosts, 'W006').length, 0); // no known hosts → no drift check

  const r2 = await lint(
    BASE.replace(
      '- Username/Password: demo / Password123!',
      '- Username/Password: demo / Password123! — https://localhost:8090',
    ).replace(
      '1. Launch the terminal and look at the files.',
      '1. Open https://10.110.73.211:9000 in the browser.',
    ),
  );
  assert.equal(findings(r2, 'W006').length, 1);
});

test('T-30: raw HTML → W007', async () => {
  const r = await lint(
    BASE.replace('You set up the thing.', '<script>alert(1)</script> You set up the thing.'),
  );
  assert.equal(findings(r, 'W007').length, 1);
});

test('T-31: TODO token → W008 (image placeholders excluded)', async () => {
  const r = await lint(BASE.replace('You set up the thing.', 'TODO: write the recap'));
  assert.equal(findings(r, 'W008').length, 1);
  const r2 = await lint(
    BASE.replace('You set up the thing.', '<< INSERT SCREENSHOT: TBD state >>'),
  );
  assert.equal(findings(r2, 'W008').length, 0);
});

// T-70: standalone `<< INSERT SCREENSHOT: … >>` placeholders are images.
// M8 gate finding: the scanner only detected lines starting with `![`, so
// authoring-phase placeholders were invisible to L013 and W005 (false
// "missing" W005 warnings on every planned-but-unshot module).
test('T-70a: placeholder line is a valid image; malformed placeholder → L013', async () => {
  const good = await lint(
    BASE.replace(
      '> ✅ **Checkpoint:** The workspace is ready.',
      '<< INSERT SCREENSHOT: terminal with file list >>\n\n> ✅ **Checkpoint:** The workspace is ready.',
    ),
  );
  assert.equal(findings(good, 'L013').length, 0);

  const bad = await lint(
    BASE.replace(
      '> ✅ **Checkpoint:** The workspace is ready.',
      '<< INSERT SCREENSHOT: broken placeholder\n\n> ✅ **Checkpoint:** The workspace is ready.',
    ),
  );
  assert.equal(findings(bad, 'L013').length, 1);
  assert.match(findings(bad, 'L013')[0]?.message ?? '', /INSERT SCREENSHOT/);
});

test('T-70b: W005 cross-checks placeholders against the image_checklist', async () => {
  const plan = [
    '---',
    'id: HOL-1000-01',
    'title: "Clean Fixture"',
    'modules:',
    '  - { n: 1, slug: setup, title: "Setup" }',
    '---',
    'body',
  ].join('\n');
  const modulePlan = [
    '---',
    'module_n: 1',
    'slug: setup',
    'title: Setup',
    'image_checklist:',
    '  - "state one"',
    '  - "state two"',
    '---',
    'body',
  ].join('\n');
  const opts = { plan, modulePlan, moduleSlug: 'setup' };

  const exact = await lint(
    BASE.replace(
      '> ✅ **Checkpoint:** The workspace is ready.',
      [
        '<< INSERT SCREENSHOT: state one >>',
        '',
        '<< INSERT SCREENSHOT: state two >>',
        '',
        '> ✅ **Checkpoint:** The workspace is ready.',
      ].join('\n'),
    ),
    opts,
  );
  assert.equal(findings(exact, 'W005').length, 0);

  const oneShort = await lint(
    BASE.replace(
      '> ✅ **Checkpoint:** The workspace is ready.',
      '<< INSERT SCREENSHOT: state one >>\n\n> ✅ **Checkpoint:** The workspace is ready.',
    ),
    opts,
  );
  assert.equal(findings(oneShort, 'W005').length, 1);
  assert.match(findings(oneShort, 'W005')[0]?.message ?? '', /missing/);

  const oneExtra = await lint(
    BASE.replace(
      '> ✅ **Checkpoint:** The workspace is ready.',
      [
        '<< INSERT SCREENSHOT: state one >>',
        '',
        '<< INSERT SCREENSHOT: state two >>',
        '',
        '<< INSERT SCREENSHOT: state three >>',
        '',
        '> ✅ **Checkpoint:** The workspace is ready.',
      ].join('\n'),
    ),
    opts,
  );
  assert.equal(findings(oneExtra, 'W005').length, 1);
  assert.match(findings(oneExtra, 'W005')[0]?.message ?? '', /reconcile/);
});

// T-71c (M8 gate): L015 — command-shaped line with 1–3 space indent is an
// error; the house form (tab / 4 spaces) stays clean.
test('T-71c: 3-space indented command line → L015 error; tab form clean', async () => {
  const r = await lint(BASE.replace('\t`ls -la`', '   `ls -la`'));
  const l015 = findings(r, 'L015');
  assert.equal(l015.length, 1);
  assert.equal(l015[0]?.severity, 'error');
  assert.match(l015[0]?.message ?? '', /tab-indented/);
  assert.equal(findings(await lint(BASE), 'L015').length, 0);
  // prose backticks are not command-shaped → no L015
  assert.equal(
    findings(await lint(BASE.replace('You set up the thing.', '   `You set up the thing`')), 'L015')
      .length,
    0,
  );
});
