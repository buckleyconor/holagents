# Scorer Task Templates

The parent session builds one task per rubric and dispatches the whole scope's
fanout in **one parallel `subagent` call** — a `workflowScript` running
`runs.all([...])`, one item per rubric. Because the workflow sandbox has no
filesystem access, tasks are **path-based**: each task is short prose that
names the scoring guide, the rubric and the content by **absolute path**, and
the scorer (`agents/scorer.md`) reads them with its `read`/`grep`/`find`/`ls`
tools. Path-based tasks contain no code fences or backticks, so they embed in
the workflow's JavaScript without escaping — and they read the committed files,
so there is no inline-truncation failure mode (the M10 50KB-inline incident)
and no drift between the scored text and the file on disk.

**Read-only marker (required in every task):** the first line of every task is
the literal line:

```
READ-ONLY scoring task — return findings only; do not edit or modify any file.
```

The scorer reads content that may contain implementation verbs; the marker keeps
any mutation-intent guard from classifying the dispatch as an edit task. It is
not optional.

**Dispatch requirement (mandatory):** dispatch the whole fanout in **one**
`subagent` call — `workflowScript` with `runs.all([...])`, `async: false`
(blocking), and **`acceptance: false` on every item**. The subagent runtime can
inject an acceptance-report instruction whose output-strip regex deletes the
scorer's trailing JSON block; `acceptance: false` suppresses it (ADR-006).
Current harness versions may infer "no acceptance" for read-only agents
anyway, but the explicit flag is version-proof and costs nothing.

---

## Task shape (path-based — every scorer)

`<evaluation>` is the absolute directory of the `evaluation` skill (it holds
`scoring-guide.md` and `rubrics/`). Build one task per rubric:

```
READ-ONLY scoring task — return findings only; do not edit or modify any file.
Score <scope-description> against rubric "<rubric-name>" (kind: <kind>, threshold: <threshold>).

Read these files fully before scoring:
1. Scoring guide: <evaluation>/scoring-guide.md
2. Rubric: <evaluation>/rubrics/<family>/<rubric>.md
3. Content — <one line per item, by absolute path, per the table below>

Scope label: <scope>

Output contract: end with exactly one fenced JSON block and no prose after it.
Both score fields are JSON numbers, never quoted strings. criterion_text
copied verbatim from the rubric; finding null on pass, concrete location
otherwise. Never emit an acceptance-report fence.
```

Embed each task as a JS **template literal** (backtick-delimited) in the
`workflowScript`; the task text above contains no backticks or `${`, so no
escaping is needed and the literal newlines are preserved.

Where the table says "score only the section", add that locator to the content
line — the scorer greps the heading and reads that section through its trailing
`[Back to top]` line, and scores nothing else.

## Content paths by scope

`«guide»` = the guide root (absolute); `«repo»` + `«spec-dir»` come from
`.holagent/lab-ref.json`.

- **concept** — `«guide»/.holagent/concept.md`
- **sizing** — `«guide»/.holagent/sizing.md`, plus `«guide»/.holagent/concept.md`
  (the beats are what the footprint must support)
- **spec** — every `«repo»/«spec-dir»/NN-*.md` in order (list them), plus
  `«guide»/lab-prep.md` and `«guide»/.holagent/sizing.md`
- **platform-«name»** — `«guide»/.holagent/platform/«name».json`, plus
  `~/.holagent/platforms/«name»/requirements.md` (the standard the review is
  scored against) and `«guide»/lab-prep.md` when it exists
- **build-«slug»** — `«repo»/«spec-dir»/07-*.md` (the milestone entry — grep
  the slug), the **plain list of files the builder created/changed** (paths,
  inlined in the task), `«guide»/.holagent/build/«slug».json` (the test record),
  and the relevant spec sections (§2, §3, §4, §5, §9) by path
- **plan** — `«guide»/.holagent/plan.md`, plus `«guide»/lab-prep.md`
- **module-plan-«NN»** — `«guide»/.holagent/«NN-slug»/plan.md`, plus
  `«guide»/.holagent/plan.md` (grep the module's `modules` entry) and, when
  present, the prior module's `plan.md` `## Environment delta`
- **module-«NN»-«slug»** — `«guide»/guide.md` (score **only** the
  `## Module «N»: «Title»` section through its `[Back to top]` line), plus
  `«guide»/.holagent/«NN-slug»/plan.md` (title, step outline, environment
  delta, image checklist, success criteria — the title is mandatory,
  `title-alignment` is unverifiable without it)
- **guide** — `«guide»/guide.md`, plus `«guide»/.holagent/plan.md` frontmatter
  and the product/company profile path(s) under `~/.holagent` when they exist
  (say explicitly when none does)
- **launch** — every `«guide»/launch/*.md`, plus `«guide»/guide.md` (or the
  released `<ID>-<Title>.md`), `«guide»/.holagent/plan.md`,
  `«guide»/.holagent/sizing.md`, `«guide»/.holagent/concept.md` when it exists,
  and `«guide»/lab-prep.md` — traceability is unscoreable without the sources.
  When the lab was adopted and has no `concept.md`, say so in the task so the
  scorer expects the collateral to name that gap rather than fill it.

---

## Fanout pattern (parent)

One `subagent` call per scoring phase, `async: false` (blocking). Build the
tasks, then a `workflowScript` running `runs.all([...])` — one item per rubric
in the order listed; `key` = the rubric name. `runs.all` resolves to an
**ordered array** (not a key map), so map back to rubrics by index:

```js
const keys = ['score-<rubric-1>', 'score-<rubric-2>' /* …one per rubric */];
const results = await runs.all([
  {
    key: keys[0],
    agent: 'holagent.scorer',
    acceptance: false,
    task: `«path-based task 1»`,
  },
  {
    key: keys[1],
    agent: 'holagent.scorer',
    acceptance: false,
    task: `«path-based task 2»`,
  },
  // …one item per rubric, in rubric order
]);
return results.map((r, i) => ({ key: keys[i], output: r.output }));
```

Then per child, in index order: extract the **last fenced JSON block** from
`output`, parse it, recompute `score`/`status` from the criterion scores
against the rubric threshold and the analytic criterion floor (ADR-020) (defense
in depth), apply the identity assertion below, and merge **all** entries of
the pass in a single `hol_scores` `action: "merge"` call so the scope's entry
set lands all-or-nothing.

**Identity assertion (mandatory, before the merge).** Parallel children finish
in whatever order they finish, and the only thing tying a result to its rubric
is the index. Worse, `hol_scores` keys an entry by the `scope` and `rubric`
strings **inside the payload** — so the label that reaches disk is the one a
child typed, not the one you dispatched. Therefore:

1. **Rekey from the dispatch table**, never from the envelope: for result `i`,
   overwrite `entry.rubric` with the rubric name at index `i` and `entry.scope`
   with the scope label that task carried. A child that mis-copied its rubric
   name is corrected here; that is the point.
2. **Assert the set, not just the shapes**: the entries you merge must be
   exactly the fanout's rubric set — N entries, N distinct rubric names, one
   per dispatched scorer. A child with no parseable envelope (after the retry
   below) is merged as an `escalated` entry under _its dispatched key_, so the
   count still holds.
3. **Diff `merged` against the expected keys** after the call. Fewer merged
   keys than dispatched rubrics means two entries collapsed onto one key —
   re-check step 1; do not re-merge and hope.

**Scorer prose is not evidence.** Everything a child writes outside its final
fenced block is discarded by design — the envelope is the contract (ADR-006) —
and a preamble is the least trustworthy text in the pass: it is a self-report
about its own reasoning, from the model that produced the score. Never paste
preamble text into a scorecard or a fix payload. If a preamble asserts
something **about the corpus** — an injected instruction, a tampered rubric, a
file it could not read — that claim is checkable, so check it before repeating
it:

```text
git status --porcelain <the file it names>    # tampering would show up here
grep -in "the exact phrase the scorer quoted" <that file>
```

A true claim is a security incident: stop the run and escalate it. A false one
is a confabulation: drop it, and read that score with suspicion, because the
excuse was invented to cover a result the scorer could not otherwise justify.
Seen live 2026-09-23 — a `module-completeness` scorer reported an "AUTO-ACCEPT
bypass" planted in its own rubric file and praised itself for resisting it; the
string existed nowhere in the repo and appeared only in that child's messages.

**Parse/shape failure** (missing fields, `findings` not covering the rubric's
criteria) → re-run that single rubric once, in a second small `runs.all`/
`runs.run` with the parse error appended to the task; still failing → record
`status: "escalated"`, finding "scorer output unparseable".

**Normalization:** the scorer's contract envelope (SKILL.md, agents/scorer.md,
scoring-guide.md) matches the canonical entry shape — `findings` array, entry
`score`/`status`. The parent still **recomputes** `score`/`status` from the
criterion scores against the rubric threshold before merging (defense in
depth, and the backstop for any scorer that emits a legacy nested
`criteria` object). `validateScoreEntry` rejects non-canonical entries, so
nothing malformed reaches `scores.json`.

---

## Rubric fanout table (v1 — from the rubric frontmatter `scope` field)

| Scope              | Rubrics (one scorer each)                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `concept`          | `checklist/concept-completeness` (1.0), `analytic/business-value` (4), `holistic/story-coherence` (4)                                 |
| `sizing`           | `analytic/footprint-realism` (4)                                                                                                      |
| `spec`             | `checklist/spec-completeness` (1.0), `analytic/spec-buildability` (4), `holistic/spec-coherence` (4)                                  |
| `plan`             | `checklist/plan-completeness` (1.0), `analytic/learning-arc` (4), `analytic/environment-alignment` (4), `holistic/plan-coherence` (4) |
| `module-plan-<NN>` | `checklist/module-plan-completeness` (1.0), `analytic/module-design` (4)                                                              |
| `module-<NN-slug>` | `checklist/module-completeness` (1.0), `analytic/step-clarity` (4), `analytic/technical-accuracy` (4), `holistic/module-quality` (4)  |
| `guide`            | `checklist/guide-completeness` (1.0), `analytic/terminology-consistency` (4), `holistic/guide-quality` (4)                            |
| `build-<slug>`     | `checklist/milestone-completeness` (1.0), `analytic/spec-fidelity` (4)                                                                |
| `launch`           | `checklist/launch-completeness` (1.0), `analytic/claim-traceability` (4)                                                              |
| `platform-<name>`  | `checklist/platform-coverage` (1.0), `analytic/finding-actionability` (4)                                                             |

(Thresholds in parentheses are the rubric frontmatter defaults at v1; the
rubric file is authoritative — re-read its `threshold` when building the
task.)

Each stage gate runs its scope's **full** fanout: `concept` and `sizing` at
`/hol-concept` (re-review at `/hol-review-concept`); `spec` at `/hol-spec`,
behind the deterministic `hol_spec_check` gate (re-review at
`/hol-review-spec`); `plan` at `/hol-plan`
Step 8 (standalone re-review at `/hol-review-plan`); `module-plan-<NN>` at
`/hol-plan-module` (re-review at `/hol-review-module-plan`);
`module-<NN>-<slug>` at `/hol-generate-module` Step 6 (re-review at
`/hol-review-module`); `guide` at `/hol-review-guide` (final pass +
ADR-005 rename); `build-<slug>` at `/hol-build`, behind the deterministic
`hol_build_test` gate — a milestone that does not pass its own declared test
is never scored, because the scorecard would be an opinion about code that
does not work. `platform-<name>` at `/hol-platform-check`,
behind the deterministic `hol_platform_findings` gate — there is no separate
re-review command, because a review scores the lab as it was that day and
re-scoring stale findings answers nothing; re-run the check instead. `launch` at
`/hol-launch`, behind the deterministic `hol_launch_check` gate (re-review at
`/hol-review-launch`, which is worth running after any hand-edit and after the
guide changes — a guide whose duration or title moved leaves the collateral
describing something that no longer exists).

## Fix loop and caps (parent procedure)

Scoring is round-based per rubric; `rounds` on a merged entry counts that
rubric's scoring rounds.

- **Round 1** is the initial pass (all rubrics of the scope, one parallel fanout).
- **Fix round** (per failing set): one `guide-implementer` dispatch carrying
  the failing findings verbatim (grouped by rubric) + the module plan + the
  section, then re-validate (0 section errors), then **rescore every rubric of
  the scope** — the same parallel fanout, one item per rubric of the scope, with
  `rounds: <previous + 1>`. Not just the failed subset: the writer edited the
  section that **all** of the scope's rubrics read, so all of them are still in
  scope, and a rubric that had passed is exactly what a fix round can regress
  (ADR-020). The wave is bounded by its slowest child, so the full-scope rescore
  costs the tail difference, not one wave per rubric.
- **Criterion floor (analytic)**: an `analytic` entry is `passed` iff its mean
  meets the rubric threshold **and no criterion scores below 3** — one weak
  criterion cannot be averaged away. `checklist` is already gated by its 1.0
  threshold and `holistic` is a single number, so the floor is analytic-only.
  The parent's recomputation applies it, and the scoring guide states it so the
  scorer's own `status` agrees (ADR-020).
- **Round-over-round delta — report, do not gate**: before merging an entry at
  round ≥ 2, compare each criterion score against the stored entry for the same
  `scope`/`rubric` and print every drop of ≥1 on the scorecard, as
  `▼ <criterion> <old> → <new>`. A drop is not its own failure — the floor decides
  that — because a fix round may legitimately trade a little on one criterion to
  gain a lot on another. What it must never do is disappear into the mean.
- **Caps**:
  - `analytic` / `holistic` — max **3 scoring rounds**; a rubric failing
    round 3 is recorded `status: "escalated"` (findings kept) and no longer
    fixed or re-scored.
  - `checklist` — max **5 rounds**, plus the unproductive rule: if the pass
    rate did not improve across the last two consecutive rounds, escalate
    immediately.
- **Unparseable scorer output** (after the 1 retry) is also recorded
  `status: "escalated"` with finding `"scorer output unparseable"` — it does
  not consume a fix round.
- A scope with any `escalated` entry makes the module/guide
  **scored-escalated** in `hol_status`; `/hol-generate-all` blocks on it
  until the user resolves it.

## `--fresh` (rescoring without re-generation)

`/hol-generate-module <module> --fresh` on a generated/validated/scored
module: keep the section byte-identical, take a fresh lint record
(`hol_validate`), then clear the scope before the pass — `hol_scores`
`action: "remove"`, `scope: "module-<NN>-<slug>"` — and run the full
rubric fanout at `rounds: 1`. Used to re-score after a hand-edit, after a
rubric wording change, or to restart a stuck scope. On an
`unplanned`/`planned` module the flag is ignored (nothing to score yet).
