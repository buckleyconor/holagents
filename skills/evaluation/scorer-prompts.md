# Scorer Task Templates

The parent session builds one task per rubric using these templates. Placeholders
in `« … »` are filled from the guide state. **Inlining rule:** the scoring guide
and the rubric file are pasted in **verbatim** (file contents, no summarizing) —
scorers must see identical wording in every task. The content slice is the exact
file or section text (a module = its full `## Module <N>:` section including the
back-to-top line; the plan = the full `plan.md` frontmatter + body; the guide =
the full `guide.md`).

Every task ends with the contract reminder so the last thing the scorer sees is
the output format.

**Read-only marker (required in every task):** scorer tasks embed content that
contains implementation verbs ("create a collection", "write the helper"),
which trips the subagent runtime's mutation-intent guard for read-only agents.
Every task therefore starts with the literal line:

```
READ-ONLY scoring task — return findings only; do not edit or modify any file.
```

**Dispatch requirement (mandatory):** dispatch scorers with `acceptance: false`.
The subagent runtime auto-infers an acceptance level for read-only agents and
injects an "end with a structured acceptance report" instruction; the model
then emits an `acceptance-report` fence **before** the scoring JSON fence, and
the runtime's output-strip regex (from the acceptance fence to the last
end-of-message fence) deletes **both** fences — the parent receives prose only
and the score is lost. With `acceptance: false` no acceptance prompt is
injected and the trailing scoring JSON block is delivered intact (verified
against the runtime source + controlled runs; M7 gate finding, see
`docs/manual-e2e.md`).

---

## Template: `concept` scope

```
READ-ONLY scoring task — return findings only; do not edit or modify any file.
Score the lab CONCEPT below against the rubric «rubric-name».

### Scoring guide
«contents of scoring-guide.md, verbatim»

### Rubric: «rubric-name» (kind: «kind», threshold: «threshold»)
«rubric file content, verbatim»

### Scope label
scope: concept

### Content — concept.md
«full .holagent/concept.md: frontmatter + body, verbatim»

### Output contract
End with exactly one fenced JSON block; no prose after it. criterion_text
copied verbatim; finding null on pass, concrete location otherwise.
```

## Template: `sizing` scope

```
READ-ONLY scoring task — return findings only; do not edit or modify any file.
Score the lab SIZING below against the rubric «rubric-name».

### Scoring guide
«contents of scoring-guide.md, verbatim»

### Rubric: «rubric-name» (kind: «kind», threshold: «threshold»)
«rubric file content, verbatim»

### Scope label
scope: sizing

### Content — sizing.md
«full .holagent/sizing.md: frontmatter + body, verbatim»
«plus: the full .holagent/concept.md under a "### concept.md" sub-heading — the
beats are what the footprint has to support, so the scorer needs both»

### Output contract
End with exactly one fenced JSON block; no prose after it. criterion_text
copied verbatim; finding null on pass, concrete location otherwise.
```

## Template: `spec` scope

```
READ-ONLY scoring task — return findings only; do not edit or modify any file.
Score the lab SPEC below against the rubric «rubric-name».

### Scoring guide
«contents of scoring-guide.md, verbatim»

### Rubric: «rubric-name» (kind: «kind», threshold: «threshold»)
«rubric file content, verbatim»

### Scope label
scope: spec

### Content — spec set
«every <lab-repo>/<spec-dir>/NN-*.md in order, each under a "### NN-<name>.md" sub-heading, verbatim»

### Content — lab-prep.md
«full <lab-dir>/lab-prep.md: frontmatter + body, verbatim»

### Content — sizing.md
«full <lab-dir>/.holagent/sizing.md, verbatim — the footprint the spec must not exceed»

### Output contract
End with exactly one fenced JSON block; no prose after it. criterion_text
copied verbatim; finding null on pass, concrete location otherwise.
```

## Template: `platform-<name>` scope

```
READ-ONLY scoring task — return findings only; do not edit or modify any file.
Score the PLATFORM REVIEW below against the rubric «rubric-name».

### Scoring guide
«contents of scoring-guide.md, verbatim»

### Rubric: «rubric-name» (kind: «kind», threshold: «threshold»)
«rubric file content, verbatim»

### Scope label
scope: platform-«name»

### Content — findings
«full .holagent/platform/<name>.json, verbatim»

### Content — requirements
«full ~/.holagent/platforms/<name>/requirements.md, verbatim — the standard the review is scored against; a finding that traces to nothing here is untraced»

### Content — lab-prep.md
«full <lab-dir>/lab-prep.md, verbatim, when it exists — the environment contract the observations should agree with»

### Output contract
End with exactly one fenced JSON block; no prose after it. criterion_text
copied verbatim; finding null on pass, concrete location otherwise.
```

## Template: `build-<slug>` scope

```
READ-ONLY scoring task — return findings only; do not edit or modify any file.
Score the BUILD MILESTONE below against the rubric «rubric-name».

### Scoring guide
«contents of scoring-guide.md, verbatim»

### Rubric: «rubric-name» (kind: «kind», threshold: «threshold»)
«rubric file content, verbatim»

### Scope label
scope: build-«slug»

### Content — milestone
«the milestone's frontmatter entry from 07-build-sequence.md, verbatim: n, slug, title, deliverable, exit, test, depends_on»

### Content — what was built
«the files the builder created or changed, with their content — or, for a large milestone, the diff; plus the builder's final report verbatim»

### Content — test result
«the hol_build_test record: the command, exit code, and the stdout/stderr tails»

### Content — spec sections
«§2 architecture, §3 build decisions, §4 security, §5 test strategy and §9 environment & footprint, verbatim — the contract this milestone is scored against»

### Output contract
End with exactly one fenced JSON block; no prose after it. criterion_text
copied verbatim; finding null on pass, concrete location otherwise.
```

## Template: `plan` scope

```
READ-ONLY scoring task — return findings only; do not edit or modify any file.
Score the lab-guide PLAN below against the rubric «rubric-name».

### Scoring guide
«contents of scoring-guide.md, verbatim»

### Rubric: «rubric-name» (kind: «kind», threshold: «threshold»)
«rubric file content, verbatim»

### Scope label
scope: plan

### Content — plan.md
«full .holagent/plan.md: frontmatter + body, verbatim»
«plus: full .holagent/lab-prep.md under a "### lab-prep.md" sub-heading, if the rubric checks it»

### Output contract
End with exactly one fenced JSON block; no prose after it. criterion_text
copied verbatim; finding null on pass, concrete location otherwise.
```

## Template: `module-plan-<NN>` scope

```
READ-ONLY scoring task — return findings only; do not edit or modify any file.
Score the MODULE PLAN below against the rubric «rubric-name».

### Scoring guide
«contents of scoring-guide.md, verbatim»

### Rubric: «rubric-name» (kind: «kind», threshold: «threshold»)
«rubric file content, verbatim»

### Scope label
scope: module-plan-«NN»

### Content — module plan
«full .holagent/<NN-slug>/plan.md: frontmatter + body, verbatim»
«plus: the guide-level plan.md "modules" frontmatter line for this module (goal/est_minutes) and, if present, the prior module's plan.md Environment delta section, under a "### context" sub-heading»

### Output contract
End with exactly one fenced JSON block; no prose after it. criterion_text
copied verbatim; finding null on pass, concrete location otherwise.
```

## Template: `module-<NN-slug>` scope

```
READ-ONLY scoring task — return findings only; do not edit or modify any file.
Score the MODULE below against the rubric «rubric-name».

### Scoring guide
«contents of scoring-guide.md, verbatim»

### Rubric: «rubric-name» (kind: «kind», threshold: «threshold»)
«rubric file content, verbatim»

### Scope label
scope: module-«NN»-«slug»

### Content — module section
«the full "## Module <N>: …" section of guide.md, verbatim, including its [Back to top] line»
«plus: the guide's "### Lab Credentials:" block and the module plan's title, step outline, environment delta, image checklist, and success criteria under a "### context" sub-heading (the title is mandatory — `title-alignment` is unverifiable without it; include each of the others when present)»

### Output contract
End with exactly one fenced JSON block; no prose after it. criterion_text
copied verbatim; finding null on pass, concrete location otherwise.
```

## Template: `guide` scope

```
READ-ONLY scoring task — return findings only; do not edit or modify any file.
Score the WHOLE LAB GUIDE below against the rubric «rubric-name».

### Scoring guide
«contents of scoring-guide.md, verbatim»

### Rubric: «rubric-name» (kind: «kind», threshold: «threshold»)
«rubric file content, verbatim»

### Scope label
scope: guide

### Content — full guide
«full guide.md, verbatim»
«plus: the plan.md frontmatter (objectives + modules list) and a pointer to the product/company profile under ~/.holagent (the scorer may read it) under a "### context" sub-heading»

### Output contract
End with exactly one fenced JSON block; no prose after it. criterion_text
copied verbatim; finding null on pass, concrete location otherwise.
```

---

## Fanout pattern (parent)

One `runs.all` per scoring phase; stable keys = rubric names:

```js
const results = await runs.all([
  {
    key: 'score-plan-completeness',
    agent: 'holagent.scorer',
    task: '«plan task, checklist rubric»',
  },
  {
    key: 'score-plan-learning-arc',
    agent: 'holagent.scorer',
    task: '«plan task, analytic rubric»',
  },
  // …one item per rubric in the scope
]);
// then per child: extract the LAST fenced JSON block from result.output,
// parse (1 retry on failure, then record escalated "scorer output unparseable"),
// compute score/status per the SKILL.md table, hol_scores action=merge.
```

In an interactive session (review/generate prompts) the same fanout runs as
sequential blocking dispatches (`subagent`, one scorer at a time,
`async: false`); the parent merges **all** entries of a pass in a single
`hol_scores` `action: "merge"` call so the scope's entry set lands
all-or-nothing.

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
re-scoring stale findings answers nothing; re-run the check instead.

## Fix loop and caps (parent procedure)

Scoring is round-based per rubric; `rounds` on a merged entry counts that
rubric's scoring rounds.

- **Round 1** is the initial pass (all rubrics of the scope).
- **Fix round** (per failing set): one `guide-implementer` dispatch carrying
  the failing findings verbatim (grouped by rubric) + the module plan + the
  section, then re-validate (0 section errors), then **rescore only the
  still-failed rubrics** with `rounds: <previous + 1>`.
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
