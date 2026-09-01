---
description: Run (or resume) the whole build sequence — detect every milestone's state via hol_build_test, resume in build order, checkpoint report after each milestone.
argument-hint: '[--fresh]'
---

Run — or resume — the build pipeline for every milestone of the spec's build
sequence, in build order. State lives in files (`.holagent/build/`,
`scores.json`), not in the conversation: re-running this after any interruption
picks up where the state says to pick up.

Flag: $@ — optional `--fresh`: every scoring pass this run executes re-scores
the scope at `rounds: 1` (cleared first with `hol_scores` `action: "remove"`)
instead of continuing rounds.

Follow the steps in order. Stop and report at the first hard failure.

## 1. Prerequisites

- **pi-subagents**: the `subagent` tool must be available. If it is not, stop:
  "pi-subagents is not loaded — install/enable it and retry."
- **Locate the package skills**: `spec-authoring`, `evaluation`,
  `load-context`. Read `evaluation/scorer-prompts.md` (fanout table +
  stage-gate line) now.

## 2. State detection (build the resume table)

- Run `hol_status`, then `hol_build_test` with no `milestone`. Require
  `build.valid` — otherwise stop and report `build.errors` ("no
  machine-readable `milestones` frontmatter" means the spec predates ADR-015;
  fix it with `/hol-spec`, not here).
- For each milestone in build order, note its state and build the resume table
  (milestone | state | action):

| State                                     | Action without `--fresh`                                      | Action with `--fresh`                 |
| ----------------------------------------- | ------------------------------------------------------------- | ------------------------------------- |
| `pending`                                 | `/hol-build <NN-slug>` (full flow)                            | same                                  |
| `test-failed`                             | `/hol-build <NN-slug>` (rebuild — the last test did not pass) | same                                  |
| `tested` (test passes, scores incomplete) | `/hol-build <NN-slug> --fresh` (re-score; no rebuild)         | same (clear + re-score)               |
| `scored-passed`                           | skip (already done)                                           | clear the scope, re-score at rounds 1 |
| `scored-escalated`                        | **block** — report and stop (the human resolves first)        | clear the scope, re-score at rounds 1 |

- Show the resume table before doing anything ("resuming: milestones 1–2
  scored-passed (skip), milestone 3 test-failed (→ rebuild)").

## 3. Sequential milestone loop

For each milestone in build order, execute the resume-table action:

- Run `/hol-build`'s flow **inline** — the same state checks, dispatch payload,
  test gate, scoring and fix-loop caps — re-running its step 2 check even
  though the table says it should pass (state may have moved).
- **Dependencies are honoured**: never start a milestone whose `depends_on` is
  not at least `tested`. If the table would have you skip ahead, stop and say
  why instead.
- **Checkpoint report after each milestone**: the milestone, state before →
  after, the test result, the scorecard (per-rubric status/score + failing
  findings verbatim), and the next action. One short block per milestone.
- On any hard failure — a test that will not pass after the one re-dispatch,
  unparseable scorer output after its retry, an escalation not being re-scored
  under `--fresh` — stop, re-print the resume table with the failed milestone
  marked, and report exactly what to run to continue.

## 4. Block on a failing test, and on escalation

- A milestone that will not pass its own test **stops the run**, always. The
  sequence is ordered because later milestones build on earlier ones;
  continuing past a red test means every failure after it is unattributable.
- Without `--fresh`, a milestone that lands `scored-escalated` stops the run.
  The user resolves it (fix rounds via `/hol-build <NN-slug>`, or clear and
  re-score with `--fresh`), then re-runs this command.
- Report the spec problems the builders raised along the way, together, at the
  point of stopping. Several milestones hitting the same ambiguity is a
  `/hol-spec` finding, not four build problems.

## 5. Completion

When every milestone is `scored-passed`:

- Re-run each milestone's test once more, in order, and report the set. Passing
  individually at different times is not the same as passing together, and this
  is the cheapest moment to learn otherwise.
- Final report: the milestone list with test results and scorecards, anything
  the builders flagged about the spec, and `hol_status`.
- Next: `/hol-qa --env <dev-environment>` — the lab is built; parity proves the
  running environment matches `lab-prep.md`, which is what the guide is written
  against.
