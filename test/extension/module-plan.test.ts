import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseFrontmatter } from '../../extensions/frontmatter.ts';
import {
  validateModulePlanFrontmatter,
  readModulePlan,
  readGuideStatus,
  type PlanModule,
  type ModulePlanValidation,
} from '../../extensions/hol-core.ts';

const M1: PlanModule = { n: 1, slug: 'launch-qdrant', title: 'Launch the vector database' };
const M2: PlanModule = { n: 2, slug: 'ingest-corpus', title: 'Ingest the corpus' };

/** Parse a frontmatter string and validate it against an expected module. */
const validate = (fm: string, expected: PlanModule = M1): ModulePlanValidation =>
  validateModulePlanFrontmatter(parseFrontmatter(fm), expected);

const VALID_FM = `---
module_n: 1
slug: launch-qdrant
title: "Launch the vector database"
depends_on: []
est_minutes: 10
image_checklist:
  - "Qdrant container running (docker ps)"
  - "REST endpoint returns 200 with version info"
success_criteria:
  - "curl to http://localhost:6333 returns 200"
---
## Step outline (numbered; each step: action, expected result, screenshot?)

1. Confirm the baseline — expected: docker info succeeds.
2. Start the container — expected: it is up. — screenshot: item 1
3. Poll the endpoint — expected: 200. — screenshot: item 2

## Environment delta

Assumes: image preloaded, port 6333 free. Leaves behind: running container.

## Commands used (full command text, in backtick form)

    \`docker run -d --name qdrant -p 6333:6333 qdrant/qdrant:1.15.4\`
    \`curl -s http://localhost:6333\`

## Expected outputs (verbatim sample output where known)

\`{"title":"qdrant - vector database","version":"1.15.4"}\`
`;

const VALID_FM_M2 = VALID_FM.replace('module_n: 1', 'module_n: 2')
  .replace('slug: launch-qdrant', 'slug: ingest-corpus')
  .replace('title: "Launch the vector database"', 'title: "Ingest the corpus"')
  .replace('depends_on: []', 'depends_on: [1]');

// ---- T-60: a fully valid module plan validates clean ------------------------

test('T-60: module plan validation — valid (no errors, no warnings)', () => {
  const v = validate(VALID_FM);
  assert.deepEqual(v.errors, []);
  assert.deepEqual(v.warnings, []);
  assert.equal(v.valid, true);
  const v2 = validate(VALID_FM_M2, M2);
  assert.deepEqual(v2.errors, []);
  assert.equal(v2.valid, true, 'module 2 with depends_on [1] is valid');
});

// ---- T-61: machine-contract violations --------------------------------------

test('T-61: module plan validation — each contract violation is a specific error', () => {
  const cases: Array<[string, string, RegExp]> = [
    ['module_n mismatch', VALID_FM.replace('module_n: 1', 'module_n: 2'), /module_n must equal 1/],
    [
      'slug mismatch',
      VALID_FM.replace('slug: launch-qdrant', 'slug: wrong-slug'),
      /slug must be "launch-qdrant"/,
    ],
    [
      'title missing',
      VALID_FM.replace('title: "Launch the vector database"\n', ''),
      /title is required/,
    ],
    [
      'est_minutes missing',
      VALID_FM.replace('est_minutes: 10\n', ''),
      /est_minutes must be a positive integer/,
    ],
    [
      'est_minutes zero',
      VALID_FM.replace('est_minutes: 10', 'est_minutes: 0'),
      /est_minutes must be a positive integer/,
    ],
    [
      'depends_on non-list',
      VALID_FM.replace('depends_on: []', 'depends_on: none'),
      /depends_on must be a list/,
    ],
    [
      'depends_on self-reference',
      VALID_FM.replace('depends_on: []', 'depends_on: [1]'),
      /must not reference module 1 itself/,
    ],
    [
      'depends_on later module (m2 deps [3])',
      VALID_FM_M2.replace('depends_on: [1]', 'depends_on: [3]'),
      /may only reference earlier modules/,
    ],
    [
      'depends_on duplicates',
      VALID_FM_M2.replace('depends_on: [1]', 'depends_on: [1, 1]'),
      /contains duplicates/,
    ],
    [
      'depends_on non-number',
      VALID_FM.replace('depends_on: []', 'depends_on: [one]'),
      /depends_on\[1\] must be a positive module number/,
    ],
    [
      'image_checklist non-list',
      VALID_FM.replace(
        /image_checklist:\n  - "Qdrant container running \(docker ps\)"\n  - "REST endpoint returns 200 with version info"\n/,
        'image_checklist: "one string"\n',
      ),
      /image_checklist must be a list of non-empty screenshot descriptions/,
    ],
    ['no frontmatter at all', '# just a heading\nbody', /no parseable frontmatter/],
  ];
  for (const [label, fm, pattern] of cases) {
    const expected = fm.includes('module_n: 2') && fm.includes('slug: ingest-corpus') ? M2 : M1;
    const v = validate(fm, expected);
    assert.equal(v.valid, false, `${label} → valid:false`);
    assert.ok(
      v.errors.some((e) => pattern.test(e)),
      `${label} → error matches ${pattern} (got: ${v.errors.join(' | ')})`,
    );
  }
});

// ---- T-62: quality warnings never block -------------------------------------

test('T-62: module plan validation — warnings leave valid:true', () => {
  const estHigh = validate(VALID_FM.replace('est_minutes: 10', 'est_minutes: 40'));
  assert.equal(estHigh.valid, true);
  assert.ok(
    estHigh.warnings.some((w) => w.includes('5–30')),
    'est_minutes 40 → band warning',
  );

  const estLow = validate(VALID_FM.replace('est_minutes: 10', 'est_minutes: 3'));
  assert.equal(estLow.valid, true);
  assert.ok(
    estLow.warnings.some((w) => w.includes('5–30')),
    'est_minutes 3 → band warning',
  );

  const noSuccess = validate(
    VALID_FM.replace(/success_criteria:\n  - "curl to http:\/\/localhost:6333 returns 200"\n/, ''),
  );
  assert.equal(noSuccess.valid, true);
  assert.ok(noSuccess.warnings.some((w) => w.includes('success_criteria')));

  const noImages = validate(
    VALID_FM.replace(
      /image_checklist:\n  - "Qdrant container running \(docker ps\)"\n  - "REST endpoint returns 200 with version info"\n/,
      '',
    ),
  );
  assert.equal(noImages.valid, true);
  assert.ok(noImages.warnings.some((w) => w.includes('image_checklist')));

  const noCommandsSection = validate(
    VALID_FM.split('## Commands used')[0] + '## Expected outputs\nx\n',
  );
  assert.equal(noCommandsSection.valid, true);
  assert.ok(noCommandsSection.warnings.some((w) => w.includes('## Commands used')));
});

// ---- T-63: readModulePlan ----------------------------------------------------

function buildGuide(base: string, guideText: string, planText: string): string {
  const guideDir = join(base, 'g');
  mkdirSync(join(guideDir, '.holagent'), { recursive: true });
  writeFileSync(join(guideDir, 'guide.md'), guideText);
  writeFileSync(join(guideDir, '.holagent', 'plan.md'), planText);
  return guideDir;
}

function writeModulePlan(guideDir: string, nnSlug: string, content: string): void {
  mkdirSync(join(guideDir, '.holagent', nnSlug), { recursive: true });
  writeFileSync(join(guideDir, '.holagent', nnSlug, 'plan.md'), content);
}

const PLAN_MD = `---
id: HOL-9999-02
title: "Module Plan Fixture"
slug: module-plan-fixture
audience:
  - "Engineers"
objectives:
  - "Launch the database"
  - "Ingest the corpus"
duration_minutes: 30
environment:
  baseline: "Dev sandbox container, Ubuntu 24.04"
  credentials:
    - "demouser / Password123! — http://localhost:6333"
modules:
  - { n: 1, slug: launch-qdrant, title: "Launch the vector database", goal: "service healthy", est_minutes: 10 }
  - { n: 2, slug: ingest-corpus, title: "Ingest the corpus", goal: "points stored", est_minutes: 20 }
---
body
`;

test('T-63: readModulePlan — missing / valid / malformed', () => {
  const base = mkdtempSync(join(tmpdir(), 'holagent-modplan-'));
  try {
    // missing
    const g0 = buildGuide(join(base, 'a'), '# H\n\n## Module 1: X\ntext\n', PLAN_MD);
    const missing = readModulePlan(g0, M1);
    assert.equal(missing.exists, false);
    assert.equal(missing.valid, true);
    assert.equal(missing.path, null);

    // valid
    const g1 = buildGuide(join(base, 'b'), '# H\n\n## Module 1: X\ntext\n', PLAN_MD);
    writeModulePlan(g1, '01-launch-qdrant', VALID_FM);
    const ok = readModulePlan(g1, M1);
    assert.equal(ok.exists, true);
    assert.equal(ok.valid, true);
    assert.deepEqual(ok.errors, []);
    assert.equal(ok.title, 'Launch the vector database');
    assert.equal(ok.estMinutes, 10);
    assert.equal(ok.imageChecklist.length, 2);
    assert.equal(ok.successCriteria.length, 1);
    assert.deepEqual(ok.dependsOn, []);

    // m2 with depends_on [1]
    const g2 = buildGuide(join(base, 'c'), '# H\n\n## Module 1: X\ntext\n', PLAN_MD);
    writeModulePlan(g2, '02-ingest-corpus', VALID_FM_M2);
    const m2 = readModulePlan(g2, M2);
    assert.equal(m2.valid, true);
    assert.deepEqual(m2.dependsOn, [1]);

    // malformed (no frontmatter)
    const g3 = buildGuide(join(base, 'd'), '# H\n\n## Module 1: X\ntext\n', PLAN_MD);
    writeModulePlan(g3, '01-launch-qdrant', '# no frontmatter here\n');
    const bad = readModulePlan(g3, M1);
    assert.equal(bad.exists, true);
    assert.equal(bad.valid, false);
    assert.ok(bad.errors.some((e) => e.includes('no parseable frontmatter')));
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

// ---- T-64: hol_status — scaffold placeholders + module plan sub-object ------

const NOW = '2026-01-01T00:00:00.000Z';
const CLEAN_VAL = { ok: true, at: NOW, summary: { errors: 0, warnings: 0 }, findings: [] };
/** Error on line 4 = inside module 1's section (heading line 3). */
const DIRTY_VAL_M1 = {
  ok: false,
  at: NOW,
  summary: { errors: 1, warnings: 0 },
  findings: [{ rule: 'L013', severity: 'error', line: 4, message: 'bad image' }],
};

const GUIDE_SCAFFOLD = [
  '# Fixture',
  '',
  '## Module 1: Launch the vector database',
  '1. << FILL: do it. >>',
  '',
].join('\n');
const GUIDE_REAL = [
  '# Fixture',
  '',
  '## Module 1: Launch the vector database',
  'Run the command.',
  '',
].join('\n');

function buildScenario(
  base: string,
  opts: { guide: string; modulePlan?: 'valid' | 'invalid'; lastValidation?: unknown },
): string {
  const guideDir = join(base, 'g');
  mkdirSync(join(guideDir, '.holagent'), { recursive: true });
  writeFileSync(join(guideDir, 'guide.md'), opts.guide);
  writeFileSync(join(guideDir, '.holagent', 'plan.md'), PLAN_MD);
  if (opts.modulePlan) {
    mkdirSync(join(guideDir, '.holagent', '01-launch-qdrant'), { recursive: true });
    writeFileSync(
      join(guideDir, '.holagent', '01-launch-qdrant', 'plan.md'),
      opts.modulePlan === 'valid' ? VALID_FM : VALID_FM.replace('module_n: 1', 'module_n: 2'),
    );
  }
  if (opts.lastValidation !== undefined) {
    writeFileSync(
      join(guideDir, '.holagent', 'last-validation.json'),
      JSON.stringify(opts.lastValidation),
    );
  }
  return guideDir;
}

test('T-64: hol_status — scaffold stays planned; real content + validation advances', () => {
  const base = mkdtempSync(join(tmpdir(), 'holagent-modstate-'));
  try {
    // scaffold section (<< FILL: >>) + valid module plan + clean validation
    // → planned (NOT validated: the section is still scaffold placeholder).
    let st = readGuideStatus(
      buildScenario(join(base, 'a'), {
        guide: GUIDE_SCAFFOLD,
        modulePlan: 'valid',
        lastValidation: CLEAN_VAL,
      }),
    );
    assert.equal(st.modules[0]!.state, 'planned');
    assert.equal(st.modules[0]!.plan.exists, true);
    assert.equal(st.modules[0]!.plan.valid, true);
    assert.equal(st.modules[1]!.state, 'unplanned', 'module 2 has no plan');
    assert.equal(st.modules[1]!.plan.exists, false);

    // real content + valid plan + clean validation → validated
    st = readGuideStatus(
      buildScenario(join(base, 'b'), {
        guide: GUIDE_REAL,
        modulePlan: 'valid',
        lastValidation: CLEAN_VAL,
      }),
    );
    assert.equal(st.modules[0]!.state, 'validated');

    // real content + errors inside the section → generated
    st = readGuideStatus(
      buildScenario(join(base, 'c'), {
        guide: GUIDE_REAL,
        modulePlan: 'valid',
        lastValidation: DIRTY_VAL_M1,
      }),
    );
    assert.equal(st.modules[0]!.state, 'generated');

    // real content + plan file with machine-contract error → state still
    // content-driven, plan.valid false with the specific error
    st = readGuideStatus(
      buildScenario(join(base, 'd'), {
        guide: GUIDE_REAL,
        modulePlan: 'invalid',
        lastValidation: CLEAN_VAL,
      }),
    );
    assert.equal(st.modules[0]!.state, 'validated');
    assert.equal(st.modules[0]!.plan.valid, false);
    assert.ok(st.modules[0]!.plan.errors.some((e) => e.includes('module_n')));
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

// ---- T-73a: malformed frontmatter degrades to invalid, never a crash --------

test('T-73a: readModulePlan — unparseable frontmatter degrades to valid:false (no throw)', () => {
  const base = mkdtempSync(join(tmpdir(), 'holagent-modparse-'));
  try {
    const guideDir = join(base, 'g');
    mkdirSync(join(guideDir, '.holagent', '01-launch-qdrant'), { recursive: true });
    // An unescaped apostrophe flips the parser's quote state so a bracket in
    // the "unquoted" gap is counted — the M10 module-3 plan failure shape.
    const bad = VALID_FM.replace(
      '  - "curl to http://localhost:6333 returns 200"',
      "  - 'the request's score is in (−1, 1] per the model's docs'",
    );
    writeFileSync(join(guideDir, '.holagent', '01-launch-qdrant', 'plan.md'), bad);
    const info = readModulePlan(guideDir, M1);
    assert.equal(info.exists, true);
    assert.equal(info.valid, false, 'unparseable frontmatter is invalid');
    assert.ok(
      info.errors.some((e) => e.startsWith('frontmatter parse error:')),
      `specific parse error surfaced, got: ${info.errors.join(' | ')}`,
    );
    assert.ok(info.errors.some((e) => e.includes('no parseable frontmatter')));
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
