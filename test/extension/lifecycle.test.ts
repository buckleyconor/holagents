import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  HolError,
  readGuideStatus,
  listPlatformFindings,
  readLabRef,
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
  assert.ok(seen >= 19, `expected the full rubric set, saw ${seen}`);
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
