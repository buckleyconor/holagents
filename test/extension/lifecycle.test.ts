import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  HolError,
  readGuideStatus,
  listPlatformFindings,
  readBuildSequence,
  readLabRef,
  recordQaResult,
  renderQaScript,
  resolveMilestoneSelector,
  runBuildTest,
  runParity,
  resolveDevEnvironment,
  resolveGuidePath,
  checkLabPrep,
  checkPlatformFindings,
  checkSpec,
  resolveLabPath,
  validateScoreEntry,
} from '../../extensions/hol-core.ts';
import { isGuideDir, isLabDir } from '../../extensions/state.ts';
import { parseFrontmatter } from '../../extensions/frontmatter.ts';

/**
 * T-80…T-86: the lifecycle extension of the state machine (ADR-009), the
 * external lab-repo reference (ADR-008), and the dev-only execution
 * boundary (ADR-012).
 */

const PLAN_MD = [
  '---',
  'id: HOL-9999-01',
  'title: "Lifecycle Fixture"',
  'slug: lifecycle',
  'audience:',
  '  - "Field engineers"',
  'objectives:',
  '  - "Set up the cluster"',
  'duration_minutes: 30',
  'environment:',
  '  baseline: "Dev sandbox container, Ubuntu 24.04"',
  'modules:',
  '  - { n: 1, slug: setup, title: "Setup", goal: "stand up the service", est_minutes: 10 }',
  '---',
  'body',
].join('\n');

const GUIDE_MD = ['# HOL-9999-01 Lifecycle Fixture', '', '## Module 1: Setup', 'text', ''].join(
  '\n',
);

function assertHolError(fn: () => unknown, code: string, match?: RegExp): void {
  assert.throws(fn, (e: unknown) => {
    assert.ok(e instanceof HolError, `expected HolError, got ${String(e)}`);
    assert.equal(e.code, code);
    if (match) assert.match(e.message, match);
    return true;
  });
}

/** A lab dir with `.holagent/` and whatever extra files the case needs. */
function makeLab(base: string, files: Record<string, string> = {}, name = 'lab'): string {
  const dir = join(base, name);
  mkdirSync(join(dir, '.holagent'), { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, content);
  }
  return dir;
}

function withTmp(fn: (base: string) => void): void {
  const base = mkdtempSync(join(tmpdir(), 'holagent-lifecycle-'));
  const prev = process.env.HOLAGENT_DATA_DIR;
  process.env.HOLAGENT_DATA_DIR = join(base, 'data');
  try {
    fn(base);
  } finally {
    if (prev === undefined) delete process.env.HOLAGENT_DATA_DIR;
    else process.env.HOLAGENT_DATA_DIR = prev;
    rmSync(base, { recursive: true, force: true });
  }
}

test('T-80: lab dir vs guide dir — stages 1-3 run before guide.md exists', () => {
  withTmp((base) => {
    const lab = makeLab(base);
    assert.equal(isLabDir(lab), true, '.holagent/ alone is a lab dir');
    assert.equal(isGuideDir(lab), false, 'no guide.md yet — not a guide dir');

    // the lab resolver accepts it; the guide resolver (linter) still does not
    assert.equal(resolveLabPath(base, 'lab'), lab);
    assertHolError(() => resolveGuidePath(base, 'lab'), 'E-PATH', /not a guide dir/);

    writeFileSync(join(lab, 'guide.md'), GUIDE_MD);
    assert.equal(isGuideDir(lab), true);
    assert.equal(resolveGuidePath(base, 'lab'), lab);

    // confinement is unchanged for both resolvers
    assertHolError(() => resolveLabPath(base, '../../etc'), 'E-PATH', /\.\./);
  });
});

test('T-81: a guide that predates the lifecycle keeps its old `next`', () => {
  withTmp((base) => {
    const lab = makeLab(base, { 'guide.md': GUIDE_MD, '.holagent/plan.md': PLAN_MD });
    const st = readGuideStatus(lab);
    assert.equal(st.lifecycle.engaged, false, 'no concept/sizing/lab-ref → not engaged');
    assert.equal(st.lifecycle.concept, 'n/a');
    assert.equal(st.lifecycle.spec, 'n/a');
    assert.equal(st.next, '/hol-generate-module 01-setup', 'unchanged from the guide-only package');

    // and with no plan at all, still the original answer
    const bare = makeLab(base, { 'guide.md': GUIDE_MD }, 'bare');
    assert.equal(readGuideStatus(bare).next, '/hol-plan');
  });
});

test('T-82: an engaged lab walks concept → spec → plan', () => {
  withTmp((base) => {
    // concept only: sizing still missing, so /hol-concept owns `next`
    let lab = makeLab(base, { '.holagent/concept.md': 'story' }, 'a');
    let st = readGuideStatus(lab);
    assert.equal(st.lifecycle.engaged, true);
    assert.equal(st.lifecycle.concept, 'drafted');
    assert.equal(st.lifecycle.sizing, 'missing');
    assert.equal(st.guide.file, null, 'no guide.md yet — and that is not an error');
    assert.equal(st.next, '/hol-concept');

    // concept + sizing drafted, no spec → /hol-spec
    lab = makeLab(
      base,
      { '.holagent/concept.md': 'story', '.holagent/sizing.md': 'footprint' },
      'b',
    );
    st = readGuideStatus(lab);
    assert.equal(st.lifecycle.sizing, 'drafted');
    assert.equal(st.lifecycle.spec, 'missing');
    assert.equal(st.next, '/hol-spec');

    // scored stages read as approved
    const passed = (scope: string) => ({
      scope,
      rubric: 'checklist/x',
      kind: 'checklist',
      status: 'passed',
      score: 1,
      rounds: 0,
      findings: [],
      updated_at: '2026-01-01T00:00:00Z',
    });
    lab = makeLab(
      base,
      {
        '.holagent/concept.md': 'story',
        '.holagent/sizing.md': 'footprint',
        '.holagent/scores.json': JSON.stringify({
          version: 1,
          entries: [passed('concept'), passed('sizing')],
        }),
      },
      'c',
    );
    st = readGuideStatus(lab);
    assert.equal(st.lifecycle.concept, 'approved');
    assert.equal(st.lifecycle.sizing, 'approved');

    // once a plan exists, the guide pipeline owns `next` — never backwards
    lab = makeLab(
      base,
      { '.holagent/concept.md': 'story', 'guide.md': GUIDE_MD, '.holagent/plan.md': PLAN_MD },
      'd',
    );
    assert.equal(readGuideStatus(lab).next, '/hol-generate-module 01-setup');
  });
});

test('T-83: lab-ref.json — adopted stages, defaults, and corrupt-file tolerance', () => {
  withTmp((base) => {
    const ref = {
      repo: '/nonexistent/lab-repo',
      origin: 'adopted',
      adopted_stages: ['concept', 'sizing', 'spec', 'bogus'],
      platforms: ['k8s'],
      environments: [
        { name: 'dev-gb10', kind: 'dev', endpoint: 'https://dev' },
        { name: 'prod-k8s', kind: 'prod' },
      ],
    };
    const lab = makeLab(base, { '.holagent/lab-ref.json': JSON.stringify(ref) }, 'adopted');
    const parsed = readLabRef(lab);
    assert.ok(parsed);
    assert.equal(parsed.origin, 'adopted');
    assert.deepEqual(parsed.adoptedStages, ['concept', 'sizing', 'spec'], 'unknown stage dropped');
    assert.equal(parsed.specDir, 'spec', 'defaulted');
    assert.equal(parsed.environments.length, 2);

    const st = readGuideStatus(lab);
    assert.equal(st.lifecycle.engaged, true, 'a registered lab repo engages the lifecycle');
    assert.equal(st.lifecycle.concept, 'adopted');
    assert.equal(st.lifecycle.spec, 'adopted');
    assert.equal(st.next, '/hol-plan', 'adopted labs go straight to the guide stage');

    // corrupt / repo-less files degrade to null rather than throwing
    const bad = makeLab(base, { '.holagent/lab-ref.json': '{not json' }, 'bad');
    assert.equal(readLabRef(bad), null);
    const noRepo = makeLab(base, { '.holagent/lab-ref.json': '{"origin":"adopted"}' }, 'norepo');
    assert.equal(readLabRef(noRepo), null);
    assert.equal(readLabRef(makeLab(base, {}, 'none')), null);
  });
});

test('T-84: a released guide keeps an accurate status (ADR-005)', () => {
  withTmp((base) => {
    const scored = {
      scope: 'module-01-setup',
      rubric: 'checklist/module-completeness',
      kind: 'checklist',
      status: 'passed',
      score: 1,
      rounds: 0,
      findings: [],
      updated_at: '2026-01-01T00:00:00Z',
    };
    const lab = makeLab(
      base,
      {
        'HOL-9999-01-Lifecycle Fixture.md': GUIDE_MD,
        '.holagent/plan.md': PLAN_MD,
        '.holagent/01-setup/plan.md': '---\nmodule_n: 1\nslug: setup\ntitle: Setup\n---\nbody\n',
        '.holagent/scores.json': JSON.stringify({ version: 1, entries: [scored] }),
        '.holagent/last-validation.json': JSON.stringify({
          ok: true,
          at: '2026-01-01T00:00:00Z',
          summary: { errors: 0, warnings: 0 },
          findings: [],
        }),
      },
      'released',
    );
    const st = readGuideStatus(lab);
    assert.equal(st.guide.released, true);
    assert.equal(st.guide.file, 'HOL-9999-01-Lifecycle Fixture.md');
    assert.equal(
      st.modules[0]!.state,
      'scored-passed',
      'module state read from the released file, not collapsed to planned',
    );
    assert.equal(st.lifecycle.guide, 'complete');
    assert.match(st.next, /^none — guide released/);
  });
});

test('T-85: only dev environments may be executed against (ADR-012)', () => {
  const labRef = {
    repo: '/lab',
    origin: 'generated' as const,
    adoptedStages: [],
    specDir: 'spec',
    platforms: [],
    environments: [
      { name: 'dev-gb10', kind: 'dev' as const },
      { name: 'prod-k8s', kind: 'prod' as const },
    ],
  };
  assert.equal(resolveDevEnvironment(labRef, 'dev-gb10').name, 'dev-gb10');
  assertHolError(() => resolveDevEnvironment(labRef, 'prod-k8s'), 'E-ARG', /only dev environments/);
  assertHolError(() => resolveDevEnvironment(labRef, 'nope'), 'E-ARG', /unknown environment/);
  assertHolError(() => resolveDevEnvironment(null, 'dev-gb10'), 'E-ARG', /no lab-ref\.json/);
});

test('T-86: score scopes cover the lifecycle stages', () => {
  const base = {
    rubric: 'checklist/x',
    kind: 'checklist',
    status: 'passed',
    score: 1,
    rounds: 0,
    findings: [],
    updated_at: '2026-01-01T00:00:00Z',
  };
  for (const scope of [
    'plan',
    'guide',
    'concept',
    'sizing',
    'spec',
    'launch',
    'module-plan-01',
    'module-01-setup',
    'build-01-core',
    'platform-k8s',
  ]) {
    assert.deepEqual(validateScoreEntry({ ...base, scope }), [], `${scope} must be valid`);
  }
  for (const scope of ['Concept', 'build', 'platform-', 'nonsense']) {
    assert.ok(validateScoreEntry({ ...base, scope }).length > 0, `${scope} must be rejected`);
  }
});

test('T-87: every rubric is well-formed and names a known scope family', () => {
  const root = new URL('../../skills/evaluation/rubrics/', import.meta.url).pathname;
  const kinds = new Set(['checklist', 'analytic', 'holistic']);
  // Scope *families*, as used in rubric frontmatter. The per-entry score
  // scopes they produce (module-plan-01, module-01-slug, …) are covered by T-86.
  const families = new Set([
    'concept',
    'sizing',
    'spec',
    'plan',
    'module-plan',
    'module',
    'guide',
    'build',
    'platform',
    'launch',
  ]);
  let seen = 0;
  for (const kind of readdirSync(root)) {
    for (const file of readdirSync(join(root, kind))) {
      if (!file.endsWith('.md')) continue;
      seen += 1;
      const where = `${kind}/${file}`;
      const parsed = parseFrontmatter(readFileSync(join(root, kind, file), 'utf8'));
      assert.ok(parsed, `${where}: frontmatter must parse`);
      const fm = parsed.data as Record<string, unknown>;
      assert.equal(fm.name, file.replace(/\.md$/, ''), `${where}: name must match filename`);
      assert.equal(fm.kind, kind, `${where}: kind must match its directory`);
      assert.ok(kinds.has(String(fm.kind)), `${where}: unknown kind ${String(fm.kind)}`);
      assert.ok(families.has(String(fm.scope)), `${where}: unknown scope ${String(fm.scope)}`);
      const threshold = Number(fm.threshold);
      assert.ok(Number.isFinite(threshold), `${where}: threshold must be numeric`);
      if (fm.kind === 'checklist') assert.equal(threshold, 1, `${where}: checklist threshold is 1`);
      else assert.ok(threshold >= 1 && threshold <= 5, `${where}: threshold out of range`);
    }
  }
  assert.ok(seen >= 21, `expected the full rubric set, saw ${seen}`);
});

test('T-88: the spec gate fails an empty open-questions section (ADR-007)', () => {
  withTmp((base) => {
    const repo = join(base, 'lab-repo');
    const specDir = join(repo, 'spec');
    mkdirSync(specDir, { recursive: true });
    const nn = ['01', '02', '03', '04', '05', '06', '07', '08'];
    const write = (n: string, body: string) =>
      writeFileSync(join(specDir, `${n}-section.md`), body);
    for (const n of nn)
      write(n, `# Section ${n}\n\nReal content here.\nMore content.\nAnd a third line.\n`);

    const lab = makeLab(
      base,
      {
        '.holagent/lab-ref.json': JSON.stringify({ repo, spec_dir: 'spec', origin: 'generated' }),
      },
      'spec-lab',
    );

    let c = checkSpec(lab);
    assert.equal(c.ok, true, 'a complete spec set passes');
    assert.equal(c.files.length, 8);
    assert.deepEqual(c.missing, []);
    assert.equal(c.openQuestions.substantive, true);

    // a one-line "None." section clears a naive non-empty test but not this gate
    write('08', '# Open Questions & Assumptions\n\nNone.\n');
    assert.equal(checkSpec(lab).ok, false, 'a one-line section 8 must fail the gate');

    // an open-questions section containing only a heading is empty
    write('08', '# Open Questions & Assumptions\n\n');
    c = checkSpec(lab);
    assert.equal(c.ok, false, 'a heading-only section 8 must fail the gate');
    assert.equal(c.openQuestions.substantive, false);
    assert.equal(c.openQuestions.contentLines, 0);

    // unfilled markers fail, and do not count as open-questions content
    write('08', '# Open Questions\n\n<< FILL: assumptions >>\n');
    c = checkSpec(lab);
    assert.equal(c.ok, false, 'leftover << FILL: >> must fail the gate');
    assert.deepEqual(c.unfilled, ['08-section.md']);
    assert.equal(c.openQuestions.substantive, false);

    // a missing numbered section fails
    write('08', '# Open Questions\n\nA. assumed X.\nB. confirm Y.\nC. confirm Z.\n');
    rmSync(join(specDir, '05-section.md'));
    c = checkSpec(lab);
    assert.equal(c.ok, false);
    assert.deepEqual(c.missing, ['05']);

    // no lab-ref at all → nothing registered, nothing to check
    const bare = makeLab(base, {}, 'no-ref');
    const none = checkSpec(bare);
    assert.equal(none.specDir, null);
    assert.equal(none.ok, false);
  });
});

test('T-89: the lab-prep gate — the environment contract must parse and be runnable', () => {
  withTmp((base) => {
    const prep = (fm: string) => `---\n${fm}---\n\n# Lab prep\n\nbody\n`;
    const GOOD = [
      "baseline: 'Ubuntu 24.04 container, Docker 29.0'\n",
      'software:\n',
      "  - { name: Qdrant, version: '1.12.4', where: /opt/qdrant }\n",
      'credentials:\n',
      "  - { user: demouser, secret: 'Password123!', applies_to: 'sandbox shell' }\n",
      'endpoints:\n',
      "  - { url: 'http://localhost:6333', purpose: 'Qdrant REST' }\n",
      'artifacts:\n',
      "  - { path: /lab/corpus.json, purpose: 'document corpus' }\n",
      "network: 'fully pre-wired — no learner network config'\n",
      'verify:\n',
      "  - { check: 'curl -sf http://localhost:6333/healthz', expect: 'HTTP 200' }\n",
    ].join('');

    const lab = makeLab(base, { 'lab-prep.md': prep(GOOD) }, 'prep');
    let c = checkLabPrep(lab);
    assert.equal(c.ok, true, 'a complete contract passes');
    assert.deepEqual(c.missing, []);
    assert.deepEqual(c.incomplete, []);
    assert.equal(c.counts.verify, 1);

    const write = (fm: string) => writeFileSync(join(lab, 'lab-prep.md'), prep(fm));

    // a missing key fails, and is named
    write(GOOD.replace(/network: .*\n/, ''));
    c = checkLabPrep(lab);
    assert.equal(c.ok, false);
    assert.deepEqual(c.missing, ['network']);

    // a row missing a field fails, located by index
    write(GOOD.replace(", version: '1.12.4'", ''));
    c = checkLabPrep(lab);
    assert.equal(c.ok, false);
    assert.deepEqual(c.incomplete, ['software[0]: missing version']);

    // an empty credentials list is a real lab; an empty verify list is not
    write(GOOD.replace(/credentials:\n.*\n/, 'credentials: []\n'));
    assert.equal(checkLabPrep(lab).ok, true, 'a lab with no credentials is legitimate');
    write(GOOD.replace(/verify:\n.*\n/, 'verify: []\n'));
    c = checkLabPrep(lab);
    assert.equal(c.ok, false, 'nothing to verify is an unfinished contract');
    assert.deepEqual(c.empty, ['verify']);

    // checks hol_parity could not run unattended fail (ADR-012 runs them headless)
    for (const check of [
      'sudo systemctl status qdrant',
      'ssh node1 uptime',
      'watch docker ps',
      'tail -f /var/log/lab.log',
      'docker exec -it lab true',
      'Is the Qdrant service up?',
    ]) {
      write(GOOD.replace('curl -sf http://localhost:6333/healthz', check));
      const r = checkLabPrep(lab);
      assert.equal(r.ok, false, `must reject: ${check}`);
      assert.equal(r.unrunnable.length, 1, `must flag once: ${check}`);
    }
    // …and the non-interactive spellings of the same commands pass
    for (const check of ['sudo -n systemctl is-active qdrant', 'docker exec lab true']) {
      write(GOOD.replace('curl -sf http://localhost:6333/healthz', check));
      assert.equal(checkLabPrep(lab).ok, true, `must accept: ${check}`);
    }

    // leftover markers fail — a reverse-engineered contract must not ship gaps
    write(GOOD.replace('/lab/corpus.json', '<< FILL: corpus path >>'));
    c = checkLabPrep(lab);
    assert.equal(c.ok, false);
    assert.equal(c.unfilled.length, 1);

    // frontmatter outside the mini-YAML subset is reported, not thrown
    writeFileSync(join(lab, 'lab-prep.md'), '---\nsoftware:\n  - name: Qdrant\n    x: 1\n---\n');
    c = checkLabPrep(lab);
    assert.equal(c.parsed, false);
    assert.match(String(c.parseError), /mini-YAML subset/);

    // no file at all is a clean "nothing to check", not a crash
    const bare = makeLab(base, {}, 'no-prep');
    c = checkLabPrep(bare);
    assert.equal(c.exists, false);
    assert.equal(c.ok, false);
  });
});

test('T-90: the platform-review gate — findings must be traced, owned and actionable', () => {
  withTmp((base) => {
    const lab = makeLab(base, {}, 'platform-lab');
    const dir = join(lab, '.holagent', 'platform');
    mkdirSync(dir, { recursive: true });
    const finding = (over: Record<string, unknown> = {}) => ({
      id: 'k8s-registry-01',
      severity: 'blocker',
      category: 'registry',
      requirement: 'Images must be mirrored to the internal registry.',
      observation: 'docker-compose.yml:14 pulls qdrant/qdrant:v1.12.4 from Docker Hub.',
      impact: 'The deploy is refused at admission.',
      action: 'Mirror the image and repin it.',
      owner: 'us',
      ...over,
    });
    const write = (doc: unknown) =>
      writeFileSync(join(dir, 'k8s.json'), JSON.stringify(doc, null, 2));
    const doc = (over: Record<string, unknown> = {}) => ({
      version: 1,
      platform: 'k8s',
      reviewed_at: '2026-09-01T00:00:00Z',
      requirements_source: '~/.holagent/platforms/k8s/requirements.md',
      findings: [finding()],
      asks: ['A namespace with a GPU quota of 2.'],
      unknowns: ['No stated policy on floating image tags.'],
      ...over,
    });

    write(doc());
    let c = checkPlatformFindings(lab, 'k8s');
    assert.equal(c.ok, true, 'a well-formed review passes');
    assert.equal(c.counts.blocker, 1);
    assert.equal(c.blockers.length, 1);
    assert.deepEqual(c.unknowns, ['No stated policy on floating image tags.']);
    assert.deepEqual(listPlatformFindings(lab), ['k8s']);

    // full compliance is a real result, not a malformed review
    write(doc({ findings: [] }));
    c = checkPlatformFindings(lab, 'k8s');
    assert.equal(c.ok, true, 'an empty findings list is a legitimate pass');
    assert.equal(c.counts.blocker, 0);

    // a finding with no action is a complaint; with no requirement, an opinion
    for (const field of ['action', 'requirement', 'observation', 'impact', 'id', 'category']) {
      write(doc({ findings: [finding({ [field]: '' })] }));
      c = checkPlatformFindings(lab, 'k8s');
      assert.equal(c.ok, false, `empty ${field} must fail`);
      assert.ok(
        c.problems.some((p) => p.includes(`missing ${field}`)),
        `must name the missing ${field}: ${c.problems.join('; ')}`,
      );
    }

    // severity and owner are closed sets — "critical" and "platform" are not
    write(doc({ findings: [finding({ severity: 'critical' })] }));
    assert.equal(checkPlatformFindings(lab, 'k8s').ok, false, 'unknown severity must fail');
    write(doc({ findings: [finding({ owner: 'platform' })] }));
    assert.equal(checkPlatformFindings(lab, 'k8s').ok, false, 'unknown owner must fail');

    // duplicate ids make the meeting unreadable
    write(doc({ findings: [finding(), finding({ severity: 'note' })] }));
    c = checkPlatformFindings(lab, 'k8s');
    assert.equal(c.ok, false);
    assert.ok(c.problems.some((p) => p.includes('duplicate id')));

    // a review must name what it reviewed against
    write(doc({ requirements_source: '' }));
    c = checkPlatformFindings(lab, 'k8s');
    assert.equal(c.ok, false);
    assert.ok(c.problems.some((p) => p.includes('requirements_source')));

    // the file name and the declared platform must agree
    write(doc({ platform: 'vcd' }));
    assert.equal(checkPlatformFindings(lab, 'k8s').ok, false, 'a mislabelled review must fail');

    // corrupt and absent files degrade, never throw
    writeFileSync(join(dir, 'k8s.json'), '{not json');
    c = checkPlatformFindings(lab, 'k8s');
    assert.equal(c.exists, true);
    assert.equal(c.ok, false);
    assert.match(String(c.parseError), /unreadable JSON/);

    c = checkPlatformFindings(lab, 'vcd');
    assert.equal(c.exists, false);
    assert.equal(c.ok, false);
    assert.equal(checkPlatformFindings(lab, '../etc').parseError !== null, true);
    assert.deepEqual(listPlatformFindings(makeLab(base, {}, 'no-platform')), []);

    // a recorded review shows up on the lifecycle ship stage
    write(doc());
    assert.deepEqual(readGuideStatus(lab).lifecycle.ship.platforms, ['k8s']);
  });
});

/** A lab whose registered repo has a spec dir with a build sequence. */
function makeBuildLab(
  base: string,
  frontmatter: string,
  name = 'build-lab',
): { lab: string; repo: string } {
  const repo = join(base, `${name}-repo`);
  mkdirSync(join(repo, 'spec'), { recursive: true });
  writeFileSync(
    join(repo, 'spec', '07-build-sequence.md'),
    `---\n${frontmatter}---\n\n# Build sequence\n\nprose\n`,
  );
  const lab = makeLab(
    base,
    { '.holagent/lab-ref.json': JSON.stringify({ repo, spec_dir: 'spec', origin: 'generated' }) },
    name,
  );
  return { lab, repo };
}

const MILESTONES = [
  'milestones:\n',
  "  - { n: 1, slug: core-services, title: 'Core services up', deliverable: 'containers start', exit: 'health 200', test: 'true', depends_on: [] }\n",
  "  - { n: 2, slug: ingest, title: 'Corpus ingestion', deliverable: 'CLI ingests', exit: 'count matches', test: 'false', depends_on: [1] }\n",
].join('');

test('T-91: the build sequence is a machine-readable contract (ADR-015)', () => {
  withTmp((base) => {
    const { lab } = makeBuildLab(base, MILESTONES);
    const seq = readBuildSequence(lab);
    assert.equal(seq.valid, true, `expected a valid sequence: ${seq.errors.join('; ')}`);
    assert.equal(seq.milestones.length, 2);
    assert.equal(seq.milestones[0]!.slug, 'core-services');
    assert.equal(seq.milestones[0]!.test, 'true');
    assert.deepEqual(seq.milestones[1]!.dependsOn, [1]);

    // the selector accepts the same shapes as the module selector
    assert.equal(resolveMilestoneSelector(seq.milestones, '2').slug, 'ingest');
    assert.equal(resolveMilestoneSelector(seq.milestones, '01-core-services').n, 1);
    assert.equal(resolveMilestoneSelector(seq.milestones, 'ingestion').slug, 'ingest');
    assertHolError(() => resolveMilestoneSelector(seq.milestones, '9'), 'E-ARG', /no milestone 9/);
    assertHolError(() => resolveMilestoneSelector([], '1'), 'E-ARG', /run \/hol-spec/);

    // every required field is required — a milestone with no test is a phase
    const missingTest = MILESTONES.replace(", test: 'true'", '');
    let bad = readBuildSequence(makeBuildLab(base, missingTest, 'no-test').lab);
    assert.equal(bad.valid, false);
    assert.ok(
      bad.errors.some((e) => e.includes('test is required')),
      bad.errors.join('; '),
    );

    // duplicate slugs would collide in the score scope and the build record
    const dupe = MILESTONES.replace('slug: ingest,', 'slug: core-services,');
    bad = readBuildSequence(makeBuildLab(base, dupe, 'dupe').lab);
    assert.equal(bad.valid, false);
    assert.ok(bad.errors.some((e) => e.includes('duplicate slug')));

    // depends_on must name a real milestone
    const badDep = MILESTONES.replace('depends_on: [1] }', 'depends_on: [7] }');
    bad = readBuildSequence(makeBuildLab(base, badDep, 'bad-dep').lab);
    assert.equal(bad.valid, false);
    assert.ok(bad.errors.some((e) => e.includes('not a milestone')));

    // a spec that predates ADR-015 is reported, not crashed on
    bad = readBuildSequence(makeBuildLab(base, 'title: Build sequence\n', 'legacy').lab);
    assert.equal(bad.exists, true);
    assert.equal(bad.valid, false);
    assert.ok(bad.errors.some((e) => e.includes('machine-readable')));

    // no lab-ref, and no 07 file, each degrade with a reason
    assert.match(readBuildSequence(makeLab(base, {}, 'no-ref-b')).errors[0]!, /lab-ref/);
    const noFile = makeLab(
      base,
      {
        '.holagent/lab-ref.json': JSON.stringify({
          repo: join(base, 'empty-repo'),
          spec_dir: 'spec',
        }),
      },
      'no-07',
    );
    assert.match(readBuildSequence(noFile).errors[0]!, /no 07-\*\.md/);
  });
});

test("T-92: the build gate runs the milestone's own test and records the result", () => {
  withTmp((base) => {
    const { lab, repo } = makeBuildLab(base, MILESTONES, 'gate');
    const seq = readBuildSequence(lab);
    const [first, second] = seq.milestones;

    // milestone 1 declares `true` — it passes, and the run is recorded
    const pass = runBuildTest(lab, first!);
    assert.equal(pass.ok, true);
    assert.equal(pass.exitCode, 0);
    assert.equal(pass.repo, repo);
    const recorded = JSON.parse(
      readFileSync(join(lab, '.holagent', 'build', 'core-services.json'), 'utf8'),
    ) as Record<string, unknown>;
    assert.equal(recorded.ok, true);
    assert.equal(recorded.test, 'true');

    let st = readGuideStatus(lab);
    assert.equal(st.milestones.length, 2);
    assert.equal(st.milestones[0]!.state, 'tested');
    assert.equal(st.milestones[1]!.state, 'pending');
    assert.equal(st.lifecycle.build, 'in-progress', 'a tested milestone means building started');

    // milestone 2 declares `false` — it fails, and that is recorded too
    const fail = runBuildTest(lab, second!);
    assert.equal(fail.ok, false);
    assert.notEqual(fail.exitCode, 0);
    assert.equal(readGuideStatus(lab).milestones[1]!.state, 'test-failed');

    // a passing test plus passing scores is the only route to scored-passed
    const entry = (scope: string, status: string) => ({
      scope,
      rubric: 'checklist/milestone-completeness',
      kind: 'checklist',
      status,
      score: status === 'passed' ? 1 : 0,
      rounds: 1,
      findings: [],
      updated_at: '2026-09-01T00:00:00Z',
    });
    writeFileSync(
      join(lab, '.holagent', 'scores.json'),
      JSON.stringify({
        version: 1,
        entries: [entry('build-core-services', 'passed'), entry('build-ingest', 'passed')],
      }),
    );
    st = readGuideStatus(lab);
    assert.equal(st.milestones[0]!.state, 'scored-passed');
    assert.equal(
      st.milestones[1]!.state,
      'test-failed',
      'passing scores never outrank a failing test',
    );

    // output is captured, and a command that never returns is a failed test
    const noisy = { ...first!, test: 'echo hello; echo oops >&2; exit 3' };
    const out = runBuildTest(lab, noisy);
    assert.equal(out.exitCode, 3);
    assert.match(out.stdout, /hello/);
    assert.match(out.stderr, /oops/);

    const hangs = { ...first!, test: 'sleep 5' };
    const killed = runBuildTest(lab, hangs, 1000);
    assert.equal(killed.ok, false);
    assert.equal(killed.timedOut, true);

    // a milestone with no test command cannot be gated, and says so
    assertHolError(
      () => runBuildTest(lab, { ...first!, test: '' }),
      'E-ARG',
      /declares no test command/,
    );
    assertHolError(
      () => runBuildTest(makeLab(base, {}, 'unregistered'), first!),
      'E-ARG',
      /no lab-ref\.json/,
    );
  });
});

/** A lab with a registered dev+prod pair and a runnable environment contract. */
function makeQaLab(base: string, verify: string, name = 'qa-lab'): string {
  const prep = [
    '---',
    "baseline: 'Ubuntu 24.04 container'",
    'software:',
    "  - { name: Qdrant, version: '1.12.4', where: /opt/qdrant }",
    'credentials: []',
    'endpoints:',
    "  - { url: 'http://localhost:6333', purpose: 'Qdrant REST' }",
    'artifacts:',
    "  - { path: /lab/corpus.json, purpose: 'document corpus' }",
    "network: 'fully pre-wired'",
    'verify:',
    verify,
    '---',
    '',
    '# Lab prep',
    '',
  ].join('\n');
  return makeLab(
    base,
    {
      'lab-prep.md': prep,
      '.holagent/lab-ref.json': JSON.stringify({
        repo: join(base, `${name}-repo`),
        spec_dir: 'spec',
        origin: 'generated',
        environments: [
          { name: 'dev-gb10', kind: 'dev', endpoint: 'https://dev.example' },
          { name: 'prod-k8s', kind: 'prod', endpoint: 'https://prod.example' },
        ],
      }),
    },
    name,
  );
}

test('T-93: parity executes the contract against dev, and refuses everything else (ADR-012)', () => {
  withTmp((base) => {
    const lab = makeQaLab(
      base,
      [
        "  - { check: 'true', expect: 'exit 0' }",
        "  - { check: 'grep -q 6333 lab-prep.md', expect: 'port declared' }",
      ].join('\n'),
    );

    const rec = runParity(lab, 'dev-gb10');
    assert.equal(rec.ok, true, 'both declared checks pass');
    assert.equal(rec.summary.total, 2);
    assert.equal(rec.summary.passed, 2);
    assert.equal(rec.env, 'dev-gb10');
    assert.equal(rec.endpoint, 'https://dev.example');
    assert.equal(rec.checks[0]!.expect, 'exit 0', 'expect is recorded verbatim, never judged');
    const onDisk = JSON.parse(
      readFileSync(join(lab, '.holagent', 'qa', 'parity.json'), 'utf8'),
    ) as Record<string, unknown>;
    assert.equal(onDisk.ok, true);

    // the second check mentions 6333, so the endpoint is covered; nothing
    // mentions the artifact path or the software, so those are warnings
    assert.deepEqual(rec.coverage.endpoints, [], 'port 6333 is exercised by a check');
    assert.deepEqual(rec.coverage.artifacts, ['/lab/corpus.json']);
    assert.deepEqual(rec.coverage.software, ['Qdrant']);

    // a coverage gap warns; it never fails parity, and never becomes a check
    // this package invented
    assert.equal(rec.ok, true);

    let st = readGuideStatus(lab);
    assert.equal(st.qa.parity?.ok, true);
    assert.equal(st.qa.parity?.env, 'dev-gb10');

    // a broken contract entry is what parity is for
    const broken = makeQaLab(
      base,
      "  - { check: 'test -e /definitely/not/here', expect: 'artifact present' }",
      'broken',
    );
    const bad = runParity(broken, 'dev-gb10');
    assert.equal(bad.ok, false);
    assert.equal(bad.summary.failed, 1);
    assert.notEqual(bad.checks[0]!.exitCode, 0);

    // ADR-012: prod is refused, and there is no parameter that changes that
    assertHolError(() => runParity(lab, 'prod-k8s'), 'E-ARG', /only dev environments/);
    assertHolError(() => runParity(lab, 'nope'), 'E-ARG', /unknown environment/);
    assert.equal(
      Object.keys(runParity).length + runParity.length,
      3,
      'runParity takes (labDir, env, timeoutMs) — no override argument exists',
    );

    // a contract with nothing to verify, or with a check that would hang,
    // is refused before anything runs
    const empty = makeQaLab(base, "  - { check: '', expect: 'x' }", 'empty');
    assertHolError(() => runParity(empty, 'dev-gb10'), 'E-ARG', /verify/);
    const hangs = makeQaLab(base, "  - { check: 'watch docker ps', expect: 'running' }", 'hangs');
    assertHolError(() => runParity(hangs, 'dev-gb10'), 'E-ARG', /cannot run unattended/);

    // a timed-out check is a failed check
    const slow = makeQaLab(base, "  - { check: 'sleep 5', expect: 'quick' }", 'slow');
    const killed = runParity(slow, 'dev-gb10', 1000);
    assert.equal(killed.ok, false);
    assert.equal(killed.checks[0]!.timedOut, true);
  });
});

test('T-94: the prod path renders a script and never executes (ADR-012/ADR-016)', () => {
  withTmp((base) => {
    const lab = makeQaLab(
      base,
      [
        "  - { check: 'curl -sf http://localhost:6333/healthz', expect: 'HTTP 200' }",
        "  - { check: 'test -e /lab/corpus.json', expect: 'corpus present' }",
      ].join('\n'),
      'prod-lab',
    );

    // the prod environment, which parity refuses, is exactly what renders
    const out = renderQaScript(lab, 'prod-k8s');
    assert.equal(out.kind, 'prod');
    assert.match(out.script, /^#!\/usr\/bin\/env bash/);
    assert.match(out.script, /curl -sf http:\/\/localhost:6333\/healthz/);
    assert.match(out.script, /test -e \/lab\/corpus\.json/);
    assert.match(out.script, /HTTP 200/);
    assert.ok(existsSync(out.path), 'the script is written for the human to run');
    assert.match(String(out.path), /verify-prod-k8s\.sh$/);

    // the checklist carries what no check covers — here, the software row
    assert.ok(
      out.checklist.some((c) => c.includes('Qdrant')),
      out.checklist.join('; '),
    );
    assert.ok(!out.checklist.some((c) => c.includes('corpus.json')), 'covered by a check');

    // dev renders too: the same reader, so the script and parity cannot drift
    assert.equal(renderQaScript(lab, 'dev-gb10').kind, 'dev');
    assertHolError(() => renderQaScript(lab, 'nope'), 'E-ARG', /unknown environment/);

    // recording: kind and environment kind must agree
    const rec = recordQaResult(lab, 'e2e-prod', {
      env: 'prod-k8s',
      ok: true,
      checks: [{ name: 'healthz', ok: true }],
      notes: 'run by hand',
    });
    assert.equal(rec.ok, true);
    assert.equal(rec.env, 'prod-k8s');
    assert.equal(readGuideStatus(lab).qa.prod?.ok, true);

    assertHolError(
      () => recordQaResult(lab, 'e2e-prod', { env: 'dev-gb10', ok: true }),
      'E-ARG',
      /belongs to a prod environment/,
    );
    assertHolError(
      () => recordQaResult(lab, 'smoke', { env: 'prod-k8s', ok: true }),
      'E-ARG',
      /belongs to a dev environment/,
    );
    assertHolError(
      () =>
        recordQaResult(lab, 'smoke', {
          env: 'dev-gb10',
          ok: true,
          checks: [{ name: 'ingest', ok: false }],
        }),
      'E-ARG',
      /ok is true but a listed check failed/,
    );

    // a passing smoke record is what moves the build stage
    assert.notEqual(readGuideStatus(lab).lifecycle.build, 'smoke-passed');
    recordQaResult(lab, 'smoke', { env: 'dev-gb10', ok: true, checks: [{ name: 'up', ok: true }] });
    const st = readGuideStatus(lab);
    assert.equal(st.qa.smoke?.ok, true);
    assert.equal(st.lifecycle.build, 'smoke-passed');
  });
});
