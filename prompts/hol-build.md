---
description: Build one milestone of the spec's build sequence — lab-builder implements it in the lab repo, hol_build_test runs the milestone's own declared test, then build-scope scoring and the fix loop.
argument-hint: '<milestone> [--fresh]'
---

Build one milestone of the lab at/above the current directory (stage 3).
Arguments: $@

Stage 3 is independent of the guide track: `/hol-build` and `/hol-plan` are
both unblocked by an approved spec, and neither waits for the other. Follow the
steps in order. Stop and report at the first hard failure.

Flag: optional `--fresh` — clear this milestone's score scope and re-score at
`rounds: 1` without rebuilding. Used after a hand-edit, after a rubric change,
or to restart a stuck scope.

## 1. Prerequisites

- **pi-subagents**: the `subagent` tool must be available. If it is not, stop:
  "pi-subagents is not loaded — install/enable it and retry."
- **Locate the package skills**: `spec-authoring`, `evaluation`,
  `load-context`. Read `evaluation/scorer-prompts.md` (build-scope task
  template) now.

## 2. State check

- Run `hol_status`. Require `lifecycle.spec` to be `approved` (or `adopted`
  with a spec dir that actually has a build sequence).
  - `missing` → stop: "no spec yet — run `/hol-spec`."
  - `drafted` → warn that the spec has not passed its scoring gate, show what
    is outstanding, and ask whether to build anyway. Everything you build
    inherits its weaknesses.
- Run `hol_build_test` with no `milestone` to list the sequence and each
  milestone's state. If `build.errors` is non-empty — most often "no
  machine-readable `milestones` frontmatter" — stop and report it: `/hol-build`
  reads §7's frontmatter, and an older or hand-written spec needs `/hol-spec`
  (request changes) to add it (ADR-015).
- Resolve the `<milestone>` argument. If it is missing, show the sequence with
  states and ask which one. Default suggestion: the first milestone that is not
  `scored-passed`.
- **Check its dependencies.** If a `depends_on` milestone is not at least
  `tested`, say so and ask before continuing — building on an untested
  milestone is how a failure gets attributed to the wrong place.
- If the milestone is already `scored-passed` and `--fresh` was not given,
  say so and ask whether to rebuild. Rebuilding replaces work that passed.

## 3. `--fresh` short-circuit

With `--fresh` on a milestone whose last test passed: skip steps 4–5 entirely,
clear the scope (`hol_scores` `action: "remove"`, `scope: "build-<slug>"`), and
go to step 6 at `rounds: 1`. On a `pending` or `test-failed` milestone the flag
is ignored — there is nothing to re-score yet.

## 4. Dispatch the lab-builder (blocking)

`subagent` tool — `agent: "holagent.lab-builder"`, `async: false`. Task payload
(self-contained):

- **Paths**: absolute lab repo (the only place it writes); absolute spec dir.
- The **milestone entry verbatim** — `n`, `slug`, `title`, `deliverable`,
  `exit`, `test`, `depends_on`.
- The **relevant spec sections in full**: §2 architecture, §3 build decisions,
  §4 security, §5 test strategy, §9 environment & footprint. Do not summarise
  them; the builder is implementing against them.
- What earlier milestones delivered (their entries + the builder reports you
  have), so it matches the existing layout and idiom.
- `lab-prep.md` frontmatter — the versions and endpoints it must match.
- Reminders: one milestone only; writes in the lab repo and nowhere else; the
  spec is the contract — implement it, report where it is silent, stop where it
  is wrong; pin exactly what §9 pinned; no environment work; no secrets; do not
  commit; the milestone's `test` command must pass before it returns.

## 5. Deterministic gate

- Run the `hol_build_test` tool (`milestone: <NN-slug>`). Require `ok: true`.
  It runs the milestone's own declared `test` command in the lab repo and
  records `.holagent/build/<slug>.json`; a killed or timed-out test is a
  failure.
- On failure, re-dispatch the builder **once** with the failing output verbatim
  (stdout/stderr tails). Still failing → stop and report: the milestone stays
  `test-failed`, and the run does not proceed to scoring. **Never score a
  milestone that does not pass its own test** — the scorecard would be an
  opinion about code that does not work.
- If the builder reported that the spec was wrong or contradictory, surface
  that now, before scoring: it is a `/hol-spec` problem, not a build problem,
  and scoring will not fix it.

## 6. Score (scorer fanout, build scope)

- Build-scope rubrics — full fanout, one scorer each:
  `checklist/milestone-completeness` (threshold 1.0), `analytic/spec-fidelity`
  (4).
- Build one task per rubric from the **build-scope template** in
  `evaluation/scorer-prompts.md`: `scoring-guide.md` verbatim + the rubric file
  verbatim + scope label `build-<slug>` + content = the milestone entry, the
  diff or file list the builder produced, the test output, and the spec
  sections it was built against.
- Dispatch `subagent` — `agent: "holagent.scorer"`, `async: false`, one call
  per turn (sequential blocking), **`acceptance: false`** (mandatory — without
  it the harness strips the scorer's trailing JSON block).
- **Extract the last fenced JSON block** of each result. Parse/shape failure →
  re-run that single scorer **once**; still failing → record
  `status: "escalated"`, finding "scorer output unparseable".
- Entry gate per rubric: checklist pass rate ≥ 1.0, analytic mean ≥ threshold →
  `passed`, else `failed`. The parent recomputes `score`/`status` from the
  criterion scores before merging (defense in depth).

## 7. Fix loop (capped, per `evaluation/scorer-prompts.md`)

- Failing rubrics → one `lab-builder` dispatch carrying the failing findings
  verbatim (grouped by rubric) + the milestone entry + what it built, then
  **re-run step 5** (the test must still pass), then re-score only the
  still-failing rubrics at `rounds: previous + 1`.
- Caps: analytic max 3 scoring rounds; checklist max 5, plus the unproductive
  rule (no improvement across two consecutive rounds → escalate now). An
  escalated rubric keeps its findings and is not re-scored.

## 8. Merge and report

- Merge with the `hol_scores` tool (`action: "merge"`), one entry per rubric,
  `scope: "build-<slug>"`.
- Report: what was built (files), the test command and its result, the
  scorecard, decisions the builder made that the spec did not, and anywhere the
  spec was wrong.
- Next: the following milestone (`/hol-build <NN-slug>`), or — when every
  milestone is `scored-passed` — `/hol-qa --env <dev-environment>` to prove the
  running lab matches `lab-prep.md`.

## Note on the test gate

The gate is the milestone's own declared test, not a test written to pass. If
the builder had to weaken a test to get green, that is a finding, not a fix —
say it in the report and let `analytic/spec-fidelity` see it. A build sequence
whose tests are `true` produces a lab that has never been tested and a
scorecard that says otherwise.
