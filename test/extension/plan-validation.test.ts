import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseFrontmatter } from '../../extensions/frontmatter.ts';
import {
  validatePlanFrontmatter,
  readGuideStatus,
  type PlanValidation,
} from '../../extensions/hol-core.ts';

/** Parse a frontmatter string and validate it (shared helper). */
const validate = (fm: string): PlanValidation => validatePlanFrontmatter(parseFrontmatter(fm));

const VALID_PLAN = `---
id: HOL-2000-01
title: "Store and Search an Embedded Document Corpus"
slug: vector-corpus-search
audience:
  - AI infrastructure engineers
prerequisites:
  - Docker basics
duration_minutes: 45
objectives:
  - Launch a Qdrant vector database and verify its health endpoint
  - Ingest a small document corpus with embeddings
  - Run a similarity search and inspect the ranked results
environment:
  baseline: "Dev sandbox container, Ubuntu 24.04"
  credentials:
    - "demouser / Password123! — http://localhost:6333"
  urls: ['http://localhost:6333']
  preloaded: ['docker image qdrant/qdrant']
modules:
  - { n: 1, slug: launch-db, title: "Launch the Vector Database", goal: "service healthy", est_minutes: 10 }
  - { n: 2, slug: ingest-corpus, title: "Ingest the Corpus", goal: "points stored", est_minutes: 20 }
  - { n: 3, slug: search, title: "Run a Similarity Search", goal: "ranked results", est_minutes: 15 }
---
# Guide Plan: vector corpus
body
`;

// ---- T-56: a fully valid plan validates clean -------------------------------

test('T-56: valid plan frontmatter -> valid, no errors', () => {
  const v = validate(VALID_PLAN);
  assert.deepEqual(v.errors, [], `unexpected errors: ${v.errors.join('; ')}`);
  assert.equal(v.valid, true);
});

// ---- T-57: each machine-contract violation is an error ---------------------

test('T-57: machine-contract violations are errors (valid=false)', () => {
  const badId = VALID_PLAN.replace('HOL-2000-01', 'HOL-2000-1');
  assert.equal(validate(badId).valid, false);
  assert.match(validate(badId).errors.join(' '), /id must match/);

  const noTitle = VALID_PLAN.replace(/^title: .*$\n/m, '');
  assert.equal(validate(noTitle).valid, false);
  assert.match(validate(noTitle).errors.join(' '), /title is required/);

  const badSlug = VALID_PLAN.replace('slug: vector-corpus-search', 'slug: Vector_Corpus');
  assert.equal(validate(badSlug).valid, false);
  assert.match(validate(badSlug).errors.join(' '), /slug must be kebab-case/);

  const noDuration = VALID_PLAN.replace(/^duration_minutes: 45$\n/m, '');
  assert.equal(validate(noDuration).valid, false);
  assert.match(validate(noDuration).errors.join(' '), /duration_minutes/);

  const nonSequential = VALID_PLAN.replace('n: 3, slug: search', 'n: 9, slug: search');
  assert.equal(validate(nonSequential).valid, false);
  assert.match(validate(nonSequential).errors.join(' '), /sequential from 1/);

  const badModuleSlug = VALID_PLAN.replace('slug: ingest-corpus', 'slug: Ingest_Corpus');
  assert.equal(validate(badModuleSlug).valid, false);
  assert.match(validate(badModuleSlug).errors.join(' '), /modules\[2\]\.slug/);

  const noModules = VALID_PLAN.replace(/^modules:[\s\S]*?^---$/m, '---');
  assert.equal(validate(noModules).valid, false);
  assert.match(validate(noModules).errors.join(' '), /modules must be a non-empty list/);

  // unparseable frontmatter
  assert.equal(validatePlanFrontmatter(null).valid, false);
  assert.match(validatePlanFrontmatter(null).errors.join(' '), /no parseable frontmatter/);
});

// ---- T-58: quality concerns are warnings, never errors ----------------------

test('T-58: quality concerns are warnings (valid stays true)', () => {
  // objectives out of the 3-5 band, empty audience, missing credentials
  const p = VALID_PLAN.replace(/audience:\n  - AI infrastructure engineers\n/, 'audience: []\n');
  const v1 = validate(p.replace(/^  - Launch a Qdrant[\s\S]*?ranked results\n/m, ''));
  assert.equal(v1.valid, true, `errors should be empty: ${v1.errors.join('; ')}`);
  assert.match(v1.warnings.join(' '), /audience/);
  assert.match(v1.warnings.join(' '), /objectives/);

  const noCreds = VALID_PLAN.replace(/^  credentials:[\s\S]*?http:\/\/localhost:6333"\n/m, '');
  const v2 = validate(noCreds);
  assert.equal(v2.valid, true, `errors should be empty: ${v2.errors.join('; ')}`);
  assert.match(v2.warnings.join(' '), /credentials/);

  const noGoal = VALID_PLAN.replace('goal: "service healthy", ', '');
  const v3 = validate(noGoal);
  assert.equal(v3.valid, true, `errors should be empty: ${v3.errors.join('; ')}`);
  assert.match(v3.warnings.join(' '), /modules\[1\]\.goal/);
});

// ---- T-59: hol_status surfaces plan validation + next -----------------------

const GUIDE_MD = ['# HOL-2000-01 Vector Corpus Search', 'body', ''].join('\n');

function writeGuide(base: string, plan: string): string {
  const guideDir = join(base, 'g');
  mkdirSync(join(guideDir, '.holagent'), { recursive: true });
  writeFileSync(join(guideDir, 'guide.md'), GUIDE_MD);
  writeFileSync(join(guideDir, '.holagent', 'plan.md'), plan);
  return guideDir;
}

test('T-59: hol_status — valid plan -> next=generate; invalid plan -> next=/hol-plan', () => {
  const base = mkdtempSync(join(tmpdir(), 'holagent-planval-'));
  const prev = process.env.HOLAGENT_DATA_DIR;
  process.env.HOLAGENT_DATA_DIR = join(base, 'data');
  try {
    // valid plan
    const goodDir = writeGuide(join(base, 'a'), VALID_PLAN);
    const good = readGuideStatus(goodDir);
    assert.equal(good.plan.exists, true);
    assert.equal(good.plan.valid, true);
    assert.deepEqual(good.plan.errors, []);
    assert.equal(good.plan.moduleCount, 3);
    assert.equal(good.next, '/hol-generate-module 01-launch-db');

    // invalid plan (bad id)
    const badDir = writeGuide(join(base, 'b'), VALID_PLAN.replace('HOL-2000-01', 'HOL-XX-01'));
    const bad = readGuideStatus(badDir);
    assert.equal(bad.plan.exists, true);
    assert.equal(bad.plan.valid, false);
    assert.ok(bad.plan.errors.some((e) => e.includes('id must match')));
    assert.equal(bad.next, '/hol-plan', 'invalid plan must send next back to /hol-plan');

    // missing plan
    const emptyDir = join(base, 'c');
    mkdirSync(join(emptyDir, '.holagent'), { recursive: true });
    writeFileSync(join(emptyDir, 'guide.md'), GUIDE_MD);
    const none = readGuideStatus(emptyDir);
    assert.equal(none.plan.exists, false);
    assert.equal(none.next, '/hol-plan');
  } finally {
    process.env.HOLAGENT_DATA_DIR = prev;
    rmSync(base, { recursive: true, force: true });
  }
});

// ---- T-73b: malformed plan frontmatter degrades, never a crash --------------

test('T-73b: readGuideStatus — unparseable plan frontmatter -> invalid + /hol-plan (no throw)', () => {
  const base = mkdtempSync(join(tmpdir(), 'holagent-planparse-'));
  const prev = process.env.HOLAGENT_DATA_DIR;
  process.env.HOLAGENT_DATA_DIR = join(base, 'data');
  try {
    const dir = writeGuide(
      join(base, 'a'),
      VALID_PLAN.replace(
        '  - Run a similarity search and inspect the ranked results',
        "  - 'the request's score is in (−1, 1] per the model's docs'",
      ),
    );
    const st = readGuideStatus(dir); // must not throw
    assert.equal(st.plan.exists, true);
    assert.equal(st.plan.valid, false);
    assert.ok(st.plan.errors.some((e) => e.startsWith('frontmatter parse error:')));
    assert.equal(st.next, '/hol-plan', 'unparseable plan sends next back to /hol-plan');
  } finally {
    process.env.HOLAGENT_DATA_DIR = prev;
    rmSync(base, { recursive: true, force: true });
  }
});
