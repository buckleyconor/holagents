import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  HolError,
  ensureHolagentDataDir,
  mergeScores,
  readGuideStatus,
  readScores,
  resolveGuidePath,
  resolveModuleSelector,
  validateGuide,
  type PlanModule,
} from '../../extensions/hol-core.ts';

/**
 * T-33…T-39, T-41: extension core (path validation, module selector,
 * scores merge atomicity, status derivation). T-40 (concurrency) lives in
 * concurrency.test.ts.
 */

const GUIDE_MD = [
  '# HOL-9000-01 Extension Fixture',
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
  '- Engineers',
  '',
  '## Introduction',
  '**Duration:** 10 minutes.',
  '**Objective:** The objective is to:',
  '- Test the extension core.',
  '',
  '[Back to top](#table-of-contents)',
  '',
  '## Module 1: Setup',
  '1. Do a thing.',
  '',
  '[Back to top](#table-of-contents)',
  '',
  '## Summary',
  'Done.',
  '',
  '[Back to top](#table-of-contents)',
].join('\n');

/** Fresh temp project root with a guide dir at <root>/guides/foo. */
function makeProject(guideName = 'guides/foo'): { root: string; guideDir: string } {
  const root = mkdtempSync(join(tmpdir(), 'holagent-core-'));
  const guideDir = join(root, guideName);
  mkdirSync(join(guideDir, '.holagent'), { recursive: true });
  writeFileSync(join(guideDir, 'guide.md'), GUIDE_MD);
  return { root, guideDir };
}

function assertHolError(fn: () => unknown, code: string, needle?: string | RegExp): void {
  try {
    fn();
    assert.fail(`expected HolError ${code}`);
  } catch (e) {
    assert.ok(e instanceof HolError, `expected HolError, got ${String(e)}`);
    assert.equal(e.code, code, `expected code ${code}, got ${e.code}: ${e.message}`);
    if (needle) assert.match(e.message, typeof needle === 'string' ? new RegExp(needle) : needle);
  }
}

// ------------------------------------------------------- path validation

test('T-33: path validation (happy) — relative guideDir inside project root', () => {
  const { root, guideDir } = makeProject();
  const resolved = resolveGuidePath(root, 'guides/foo');
  assert.equal(resolved, guideDir, 'absolute path in result');
  assert.equal(resolved.startsWith(root), true);
  // and the tool-level flow: validate produces a report for the abs path
  void resolved;
});

test('T-33b: validateGuide records report at the resolved abs path', async () => {
  const { root, guideDir } = makeProject();
  const out = await validateGuide(resolveGuidePath(root, 'guides/foo'), { shellcheckBin: null });
  assert.equal(out.report.guideDir, guideDir);
  assert.equal(out.report.ok, true, 'fixture guide is clean');
  const recorded = JSON.parse(
    readFileSync(join(guideDir, '.holagent', 'last-validation.json'), 'utf8'),
  );
  assert.equal(recorded.ok, true);
  assert.ok(recorded.at, 'recorded file carries an at timestamp');
  rmSync(root, { recursive: true, force: true });
});

test('T-34: path validation (traversal) — ".." segments rejected, nothing read', () => {
  const { root } = makeProject();
  assertHolError(() => resolveGuidePath(root, '../../../etc'), 'E-PATH', /\.\./);
  assertHolError(() => resolveGuidePath(root, '..'), 'E-PATH');
});

test('T-35: path validation (escape via symlink) — realpath containment', () => {
  const outside = mkdtempSync(join(tmpdir(), 'holagent-outside-'));
  const outsideGuide = join(outside, 'real-guide');
  mkdirSync(join(outsideGuide, '.holagent'), { recursive: true });
  writeFileSync(join(outsideGuide, 'guide.md'), GUIDE_MD);

  const { root } = makeProject();
  const link = join(root, 'link');
  symlinkSync(outsideGuide, link);
  assertHolError(() => resolveGuidePath(root, 'link'), 'E-PATH', /escapes the project root/);

  // negative control: a symlink that stays inside the root resolves fine
  const innerLink = join(root, 'inner-link');
  symlinkSync(join(root, 'guides', 'foo'), innerLink);
  assert.equal(resolveGuidePath(root, 'inner-link'), join(root, 'guides', 'foo'));

  // absolute paths outside the root are rejected too
  assertHolError(() => resolveGuidePath(root, outsideGuide), 'E-PATH', /escapes the project root/);
  rmSync(outside, { recursive: true, force: true });
  rmSync(root, { recursive: true, force: true });
});

test('T-36: resolveGuideRoot — nested cwd resolves; no-guide cwd → E-PATH', () => {
  const { root, guideDir } = makeProject();
  const nested = join(guideDir, 'sub', 'deep');
  mkdirSync(nested, { recursive: true });
  assert.equal(resolveGuidePath(nested), guideDir, '2 levels inside the guide dir');
  assert.equal(resolveGuidePath(guideDir), guideDir, 'guide dir itself');

  const empty = mkdtempSync(join(tmpdir(), 'holagent-empty-'));
  assertHolError(() => resolveGuidePath(empty), 'E-PATH', /no guide root/);
  // a dir with guide.md but no .holagent/ is not a guide dir
  const half = mkdtempSync(join(tmpdir(), 'holagent-half-'));
  writeFileSync(join(half, 'guide.md'), 'x');
  assertHolError(() => resolveGuidePath(half, half), 'E-PATH', /not a guide dir/);
});

// ------------------------------------------------------- module selector

const MODULES: PlanModule[] = [
  { n: 1, slug: 'setup', title: 'Setup the Cluster' },
  { n: 2, slug: 'upload-documents', title: 'Upload Documents & Input Metadata' },
];

test('T-37: module selector — NN / NN-slug / title fragment; E-ARG otherwise', () => {
  assert.equal(resolveModuleSelector(MODULES, '2').n, 2);
  assert.equal(resolveModuleSelector(MODULES, '02-upload-documents').n, 2);
  assert.equal(resolveModuleSelector(MODULES, '01-setup').n, 1);
  assert.equal(resolveModuleSelector(MODULES, 'Upload').n, 2, 'case-insensitive title fragment');
  assert.equal(resolveModuleSelector(MODULES, ' 2 ').n, 2, 'whitespace-tolerant');

  const e99 = assertHolError(
    () => resolveModuleSelector(MODULES, '99'),
    'E-ARG',
    /available modules/,
  );
  void e99;
  assertHolError(() => resolveModuleSelector(MODULES, 'bogus!'), 'E-ARG', /available modules/);
  assertHolError(() => resolveModuleSelector(MODULES, 'u'), 'E-ARG', /ambiguous/); // fragment matching both titles
  assertHolError(() => resolveModuleSelector(null, '1'), 'E-ARG', /no plan modules/);
});

// ------------------------------------------------------------- scores

const NOW = '2025-06-01T00:00:00.000Z';

function entry(over: Record<string, unknown> = {}) {
  return {
    scope: 'module-02-upload-documents',
    rubric: 'analytic/step-clarity',
    kind: 'analytic',
    status: 'passed',
    score: 4,
    rounds: 1,
    findings: [{ criterion: 'actionable-steps', score: 4, finding: null }],
    updated_at: NOW,
    ...over,
  };
}

test('T-38: hol_scores merge (happy) — upsert over existing file', () => {
  const { guideDir } = makeProject();
  const scoresFile = join(guideDir, '.holagent', 'scores.json');
  writeFileSync(
    scoresFile,
    JSON.stringify({
      version: 1,
      entries: [
        entry({ scope: 'guide', rubric: 'holistic/guide-quality', score: 4.5, kind: 'holistic' }),
      ],
    }),
  );

  const result = mergeScores(guideDir, [
    entry({ scope: 'plan', rubric: 'checklist/plan-completeness', kind: 'checklist', score: 0.9 }),
    entry({ rubric: 'analytic/step-clarity', rounds: 2 }),
    entry({
      scope: 'module-01-setup',
      rubric: 'checklist/module-completeness',
      kind: 'checklist',
      score: 1,
    }),
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.merged.length, 3);

  const file = JSON.parse(readFileSync(scoresFile, 'utf8'));
  assert.equal(file.version, 1);
  assert.equal(file.entries.length, 4, 'existing entry kept + 3 upserted');
  const keys = file.entries.map((e: { scope: string; rubric: string }) => `${e.scope}/${e.rubric}`);
  assert.ok(keys.includes('guide/holistic/guide-quality'), 'pre-existing entry preserved');
  assert.ok(keys.includes('plan/checklist/plan-completeness'));
  // re-merge of the same scope/rubric upserts (rounds 2 wins over 1)
  const merged = readScores(guideDir).find(
    (e) => e.scope === 'module-02-upload-documents' && e.rubric === 'analytic/step-clarity',
  );
  assert.equal(merged?.rounds, 2);
});

test('T-39: hol_scores merge (atomicity) — invalid entry leaves file byte-identical', () => {
  const { guideDir } = makeProject();
  const scoresFile = join(guideDir, '.holagent', 'scores.json');
  writeFileSync(scoresFile, JSON.stringify({ version: 1, entries: [entry()] }));
  const before = readFileSync(scoresFile);

  assertHolError(
    () => mergeScores(guideDir, [entry(), entry({ status: 'great' })]),
    'E-ARG',
    /status: must be one of/,
  );
  const after = readFileSync(scoresFile);
  assert.deepEqual(
    Buffer.from(before).toString('binary'),
    Buffer.from(after).toString('binary'),
    'byte-identical',
  );

  // merge with no entries at all is also E-ARG
  assertHolError(() => mergeScores(guideDir, []), 'E-ARG', /non-empty/);
  assert.deepEqual(readFileSync(scoresFile), after, 'still untouched');

  // no temp litter left behind (atomic writes use .scores.json.tmp-*)
  const stateFiles = readdirSync(join(guideDir, '.holagent'));
  assert.ok(
    !stateFiles.some((f) => f.includes('.tmp-')),
    `no temp litter: ${stateFiles.join(', ')}`,
  );
});

test('scores entry validation — scope/kind/score-range rules', () => {
  const { guideDir } = makeProject();
  assertHolError(
    () => mergeScores(guideDir, [entry({ scope: 'module-2-upload' })]),
    'E-ARG',
    /scope/,
  );
  assertHolError(
    () => mergeScores(guideDir, [entry({ kind: 'checklist', score: 1.5 })]),
    'E-ARG',
    /checklist must be 0\.\.1/,
  );
  assertHolError(() => mergeScores(guideDir, [entry({ score: 7 })]), 'E-ARG', /1\.\.5/);
  assertHolError(() => mergeScores(guideDir, [entry({ rounds: 1.5 })]), 'E-ARG', /rounds/);
  assertHolError(
    () => mergeScores(guideDir, [entry({ updated_at: 'yesterday' })]),
    'E-ARG',
    /updated_at/,
  );
});

// ------------------------------------------------------- status (T-41)

const PLAN_MD = [
  '---',
  'id: HOL-9999-01',
  'title: "State Machine Fixture"',
  'slug: state-machine',
  'audience:',
  '  - "Field engineers"',
  'objectives:',
  '  - "Set up the cluster"',
  '  - "Upload documents"',
  'duration_minutes: 30',
  'environment:',
  '  baseline: "Dev sandbox container, Ubuntu 24.04"',
  '  credentials:',
  '    - "demouser / Password123! — http://localhost:8090"',
  'modules:',
  '  - { n: 1, slug: setup, title: "Setup", goal: "stand up the service", est_minutes: 10 }',
  '  - { n: 2, slug: upload, title: "Upload Documents", goal: "ingest the corpus", est_minutes: 15 }',
  '---',
  'body',
].join('\n');

/** GUIDE_M1: only module 1 exists; GUIDE_BOTH: both modules (1-based lines below). */
const GUIDE_M1 = ['# HOL-9999-01 State Machine Fixture', '', '## Module 1: Setup', 'text', ''].join(
  '\n',
);
const GUIDE_BOTH = [
  '# HOL-9999-01 State Machine Fixture', // 1
  '', // 2
  '## Module 1: Setup', // 3
  'text', // 4
  '', // 5
  '## Module 2: Upload Documents', // 6
  'text', // 7
].join('\n');

interface Scenario {
  guide: string;
  modulePlans: number[]; // which modules have .holagent/NN-slug/plan.md
  lastValidation?: unknown; // written to .holagent/last-validation.json when present
  scores?: Record<string, unknown>[];
}

function buildScenario(base: string, s: Scenario): string {
  const guideDir = join(base, 'g');
  mkdirSync(join(guideDir, '.holagent'), { recursive: true });
  writeFileSync(join(guideDir, 'guide.md'), s.guide);
  writeFileSync(join(guideDir, '.holagent', 'plan.md'), PLAN_MD);
  for (const n of s.modulePlans) {
    const nn = String(n).padStart(2, '0');
    const slug = n === 1 ? 'setup' : 'upload';
    const dir = join(guideDir, '.holagent', `${nn}-${slug}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'plan.md'), '---\nmodule_n: 1\nslug: x\ntitle: X\n---\nbody\n');
  }
  if (s.lastValidation !== undefined) {
    writeFileSync(
      join(guideDir, '.holagent', 'last-validation.json'),
      JSON.stringify(s.lastValidation),
    );
  }
  if (s.scores)
    writeFileSync(
      join(guideDir, '.holagent', 'scores.json'),
      JSON.stringify({ version: 1, entries: s.scores }),
    );
  return guideDir;
}

const CLEAN_VAL = {
  ok: true,
  at: NOW,
  summary: { errors: 0, warnings: 0 },
  findings: [],
};
/** One error on line 7 = inside module 2's section (lines 6–7 of GUIDE_BOTH). */
const DIRTY_VAL_M2 = {
  ok: false,
  at: NOW,
  summary: { errors: 1, warnings: 0 },
  findings: [{ rule: 'L013', severity: 'error', line: 7, message: 'bad image' }],
};
const PASS1 = [
  entry({
    scope: 'module-01-setup',
    rubric: 'checklist/module-completeness',
    kind: 'checklist',
    score: 1,
  }),
];

test('T-41: hol_status derivation — each state per the state machine', () => {
  const base = mkdtempSync(join(tmpdir(), 'holagent-status-'));
  const prevDataDir = process.env.HOLAGENT_DATA_DIR;
  process.env.HOLAGENT_DATA_DIR = join(base, 'data');
  try {
    const run = (s: Scenario) => readGuideStatus(buildScenario(base, s));

    // unplanned / planned / generated / validated / scored-passed /
    // scored-escalated for module 2 (module 1 is scored-passed where noted)
    let st = run({ guide: GUIDE_M1, modulePlans: [1] });
    assert.equal(st.modules[1]!.state, 'unplanned');
    assert.equal(st.modules[0]!.state, 'generated');
    assert.equal(st.next, '/hol-generate-module 01-setup');
    assert.equal(st.plan.moduleCount, 2);
    assert.equal(st.plan.objectives, 2);
    assert.equal(st.guide.id, 'HOL-9999-01');
    assert.equal(st.lastValidation, null);

    st = run({ guide: GUIDE_M1, modulePlans: [1, 2] });
    assert.equal(st.modules[1]!.state, 'planned');

    st = run({ guide: GUIDE_BOTH, modulePlans: [1, 2], lastValidation: DIRTY_VAL_M2 });
    assert.equal(st.modules[1]!.state, 'generated', 'errors in the section block validated');
    assert.equal(st.modules[0]!.state, 'validated', 'module 1 section is clean');
    assert.equal(
      st.next,
      '/hol-generate-module 01-setup',
      'first incomplete module (m1 not yet scored)',
    );
    assert.equal(st.lastValidation?.ok, false);

    st = run({ guide: GUIDE_BOTH, modulePlans: [1, 2], lastValidation: CLEAN_VAL });
    assert.equal(st.modules[1]!.state, 'validated');

    st = run({
      guide: GUIDE_BOTH,
      modulePlans: [1, 2],
      lastValidation: CLEAN_VAL,
      scores: [
        ...PASS1,
        entry({
          scope: 'module-02-upload',
          rubric: 'checklist/module-completeness',
          kind: 'checklist',
          score: 1,
        }),
        entry({ scope: 'module-02-upload', rubric: 'analytic/step-clarity', score: 4.5 }),
      ],
    });
    assert.equal(st.modules[1]!.state, 'scored-passed');
    assert.equal(st.modules[0]!.state, 'scored-passed');
    assert.equal(st.next, '/hol-review-guide');
    assert.equal(st.modules[1]!.scores?.checklist, 1);
    assert.equal(st.modules[1]!.scores?.analyticMean, 4.5);

    st = run({
      guide: GUIDE_BOTH,
      modulePlans: [1, 2],
      lastValidation: CLEAN_VAL,
      scores: [
        ...PASS1,
        entry({ scope: 'module-02-upload', status: 'escalated', rounds: 5, findings: [] }),
      ],
    });
    assert.equal(st.modules[1]!.state, 'scored-escalated');
    assert.equal(st.next, '/hol-generate-module 02-upload');

    // stale scores: passed scores + fresh failing validation → back to generated
    st = run({
      guide: GUIDE_BOTH,
      modulePlans: [1, 2],
      lastValidation: DIRTY_VAL_M2,
      scores: [
        ...PASS1,
        entry({
          scope: 'module-02-upload',
          rubric: 'checklist/module-completeness',
          kind: 'checklist',
          score: 1,
        }),
      ],
    });
    assert.equal(st.modules[1]!.state, 'generated', 'fresh failing validation invalidates scores');

    // no plan at all → next is /hol-plan
    const noPlan = join(base, 'no-plan');
    mkdirSync(join(noPlan, '.holagent'), { recursive: true });
    writeFileSync(join(noPlan, 'guide.md'), GUIDE_M1);
    const stNoPlan = readGuideStatus(noPlan);
    assert.equal(stNoPlan.next, '/hol-plan');
    assert.equal(stNoPlan.guide.id, 'HOL-9999-01', 'id falls back to the guide H1 without a plan');
  } finally {
    if (prevDataDir === undefined) delete process.env.HOLAGENT_DATA_DIR;
    else process.env.HOLAGENT_DATA_DIR = prevDataDir;
    rmSync(base, { recursive: true, force: true });
  }
});

// ------------------------------------------------------------- data dir

test('data dir: HOLAGENT_DATA_DIR override + 0700 mode (idempotent)', () => {
  const base = mkdtempSync(join(tmpdir(), 'holagent-datadir-'));
  const prev = process.env.HOLAGENT_DATA_DIR;
  process.env.HOLAGENT_DATA_DIR = join(base, '.holagent');
  try {
    const dir1 = ensureHolagentDataDir();
    assert.equal(dir1, join(base, '.holagent'));
    assert.equal(statSync(dir1).mode & 0o777, 0o700, 'mode 0700');
    assert.equal(existsSync(dir1), true);
    const dir2 = ensureHolagentDataDir();
    assert.equal(dir2, dir1, 'idempotent');
  } finally {
    if (prev === undefined) delete process.env.HOLAGENT_DATA_DIR;
    else process.env.HOLAGENT_DATA_DIR = prev;
    rmSync(base, { recursive: true, force: true });
  }
});
