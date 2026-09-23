import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * T-96: prose-contract drift. The scorer fanout's dispatch mode (parallel
 * `runs.all` waves since ADR-019, which supersedes ADR-001's sequential
 * consequence) and the ADR count quoted in the docs live only in markdown —
 * nothing in `extensions/` enforces them, so a template that quietly reverts
 * to "one call per turn" is invisible to every other test in the suite.
 */

const root = join(import.meta.dirname ?? '', '..');
const promptsDir = join(root, 'prompts');
const adrDir = join(root, 'docs', 'adr');

function promptFiles(): string[] {
  return readdirSync(promptsDir)
    .filter((f) => f.endsWith('.md'))
    .sort();
}

function readPrompt(name: string): string {
  return readFileSync(join(promptsDir, name), 'utf8');
}

/** Retired ADR-001 dispatch wording. ADR-019 made it wrong; these must not come back. */
const SEQUENTIAL_MARKERS = [
  'one call per turn',
  'one subagent call per turn',
  'one scorer at a time',
  'sequential blocking',
];

test('T-96a: no prompt template still dispatches scorers sequentially', () => {
  for (const name of promptFiles()) {
    const body = readPrompt(name);
    for (const marker of SEQUENTIAL_MARKERS) {
      assert.ok(
        !body.toLowerCase().includes(marker),
        `${name}: still says "${marker}" — fanout is parallel (ADR-019)`,
      );
    }
  }
});

test('T-96b: every template that owns a fanout dispatches it in one parallel wave', () => {
  let owners = 0;
  for (const name of promptFiles()) {
    const body = readPrompt(name);
    if (!/Dispatch the whole fanout/i.test(body)) continue;
    owners += 1;
    assert.match(body, /runs\.all\(/, `${name}: owns a fanout but never calls runs.all`);
    assert.match(body, /workflowScript/, `${name}: fanout must be one workflowScript call`);
    assert.match(
      body,
      /acceptance:\s*false/,
      `${name}: per-item acceptance:false is mandatory (ADR-006)`,
    );
    assert.match(
      body,
      /async:\s*false/,
      `${name}: the wave must block so the parent can merge (ADR-019)`,
    );
  }
  // 15 scoring templates own a fanout; the batch templates (/hol-generate-all,
  // /hol-build-all) run those flows inline and are counted out by the regex.
  assert.equal(owners, 15, 'expected 15 fanout-owning prompt templates');
});

test('T-96c: the wave contract is spelled in one place and includes the identity assertion', () => {
  const p = readFileSync(join(root, 'skills', 'evaluation', 'scorer-prompts.md'), 'utf8');
  assert.match(p, /runs\.all\(\[\.\.\.\]\)/, 'scorer-prompts.md must document the runs.all wave');
  assert.match(p, /\*\*Identity assertion/, 'scorer-prompts.md must carry the identity assertion');
  // The hazard the assertion closes: hol_scores keys by the payload's own strings.
  assert.match(p, /Rekey from the dispatch table/, 'identity assertion must mandate rekeying');
  assert.match(p, /N distinct rubric names/, 'identity assertion must mandate the count check');
});

test('T-96e: every documented scorer envelope example is mergeable (scores are numbers)', () => {
  // The live 2026-09-23 wave caught a checklist scorer copying its example
  // verbatim and emitting "score": "1.0". validateScoreEntry requires a number
  // and mergeScores validates every entry before writing any, so one quoted
  // value in a documented example reproduces the bug in the field.
  const contractDocs = [
    'agents/scorer.md',
    'skills/evaluation/scoring-guide.md',
    'skills/evaluation/SKILL.md',
    'skills/evaluation/scorer-prompts.md',
  ];
  let examples = 0;
  for (const rel of contractDocs) {
    const body = readFileSync(join(root, rel), 'utf8');
    for (const block of body.matchAll(/```json\s*\n([\s\S]*?)\n```/g)) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(block[1] ?? '');
      } catch (e) {
        assert.fail(`${rel}: example envelope is not valid JSON — ${(e as Error).message}`);
      }
      if (!parsed || typeof parsed !== 'object' || !('score' in parsed)) continue;
      const e = parsed as Record<string, unknown>;
      examples += 1;
      assert.equal(
        typeof e.score,
        'number',
        `${rel}: example entry score is ${JSON.stringify(e.score)} — must be a number`,
      );
      for (const f of (e.findings ?? []) as Record<string, unknown>[]) {
        assert.equal(
          typeof f.score,
          'number',
          `${rel}: example criterion score ${JSON.stringify(f.score)} — must be a number`,
        );
      }
    }
  }
  assert.ok(examples >= 3, `expected the contract examples to be found, got ${examples}`);
});

test('T-96f: ADR-020 — fix rounds rescore the scope, and the analytic floor is agreed on both sides', () => {
  const p = readFileSync(join(root, 'skills', 'evaluation', 'scorer-prompts.md'), 'utf8');

  // 1. The round rescope: the pre-ADR-020 wording must not come back.
  assert.doesNotMatch(
    p,
    /rescore only the/i,
    'scorer-prompts.md must not revert to rescoring only the failed subset (ADR-020)',
  );
  assert.match(p, /rescore every rubric of\n?\s*the scope/i, 'round rescope must be spelled out');

  // 2. The floor, in the parent procedure.
  assert.match(p, /no criterion scores below 3/, 'parent procedure must apply the criterion floor');
  // 3. …and the round-over-round delta (report, not gate).
  assert.match(p, /drop of ≥1/, 'parent procedure must report criterion drops');

  // The scorer and the parent must agree on what `passed` means, or the parent's
  // recomputation silently overrides a correct-looking self-report.
  const bothSides: Record<string, RegExp> = {
    'skills/evaluation/scoring-guide.md': /criterion scored 1 or 2 fails the entry/i,
    'agents/scorer.md': /criterion at 1 or 2 fails the entry/i,
    'skills/evaluation/SKILL.md': /every criterion ≥ 3|no criterion below 3/i,
  };
  for (const [rel, re] of Object.entries(bothSides)) {
    const body = readFileSync(join(root, rel), 'utf8');
    assert.match(body, re, `${rel}: must state the analytic criterion floor (ADR-020)`);
  }
});

test('T-96d: ADR count claims in the current-state docs match the ADR files', () => {
  const accepted = readdirSync(adrDir).filter((f) => /^0\d{3}-.*\.md$/.test(f));
  assert.ok(accepted.length >= 19, 'ADR files discovered');

  const WORDS: Record<string, number> = {
    sixteen: 16,
    seventeen: 17,
    eighteen: 18,
    nineteen: 19,
    twenty: 20,
  };

  const docs = ['docs/quickstart.md', 'docs/user-guide.md', 'holagent_description.md'];
  const claims: string[] = [];
  for (const rel of docs) {
    const body = readFileSync(join(root, rel), 'utf8');
    for (const m of body.matchAll(
      /(?:the\s+)?(\b(?:sixteen|seventeen|eighteen|nineteen|twenty)\b|\d{2})\s+(?:architecture\s+)?decisions?|(\d{2})\s+ADRs/gi,
    )) {
      const token = (m[1] ?? m[2] ?? '').toLowerCase();
      if (!token) continue;
      const n = WORDS[token] ?? Number.parseInt(token, 10);
      claims.push(`${rel}: claims ${n}`);
      assert.equal(
        n,
        accepted.length,
        `${rel}: ADR count drift — ${n} claimed, ${accepted.length} files`,
      );
    }
  }
  assert.equal(claims.length, 3, 'each of the three docs states an ADR count');
});
