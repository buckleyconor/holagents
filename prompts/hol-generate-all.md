---
description: Run (or resume) the whole per-module pipeline — detect every module's state via hol_status, resume in module order, checkpoint report after each module.
argument-hint: '[--fresh]'
---

Run — or resume — the per-module pipeline for every module of the plan, in
plan order. State lives in files (`.holagent/` + `scores.json`), not in the
conversation: re-running this command after any interruption picks up where
the state says to pick up.

Flag: $@ — optional `--fresh`: every scoring pass this run executes
re-scores the scope at `rounds: 1` (the scope is cleared first with
`hol_scores` `action: "remove"`) instead of continuing rounds. Used to
re-score after a hand-edit, after a rubric wording change, or to restart a
stuck/escalated scope.

Follow the steps in order. Stop and report at the first hard failure.

## 1. Prerequisites

- **pi-subagents**: the `subagent` tool must be available. If it is not, stop:
  "pi-subagents is not loaded — install/enable it and retry."
- **Locate the package skills** in your skill inventory: `evaluation`,
  `guide-scaffolds`, `guide-format`, `design-modules`. Read
  `evaluation/scorer-prompts.md` (fanout table + stage-gate line) now.
- **Guide root convention**: `guides/<slug>/`; per-module state in
  `guides/<slug>/.holagent/<NN-slug>/`.

## 2. State detection (build the resume table)

- Run the `hol_status` tool (dev sessions without the extension: the
  equivalent `readGuideStatus` via `node --experimental-strip-types` on
  `extensions/hol-core.ts`): require `plan.exists && plan.valid` — otherwise
  stop: "run /hol-plan first".
- For each module in plan order, note its state and build the resume table
  (module | state | action):

| State                                                                       | Action without `--fresh`                                             | Action with `--fresh`                                                 |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `unplanned`                                                                 | `/hol-plan-module <NN-slug>` (full flow)                             | same                                                                  |
| `planned`                                                                   | `/hol-generate-module <NN-slug>` (implement → lint → scoring)        | same                                                                  |
| `generated` / `validated` (section exists, 0 errors, not all scores passed) | `/hol-generate-module <NN-slug> --fresh` (re-score; no regeneration) | same (clear + re-score)                                               |
| `scored-passed`                                                             | skip (already done)                                                  | clear the module scope, re-score at rounds 1                          |
| `scored-escalated`                                                          | **block** — report and stop (the human resolves first)               | clear the scope, re-score at rounds 1 (fresh start for a stuck scope) |

- Show the resume table before doing anything ("resuming: modules 1–2
  scored-passed (skip), module 3 planned (→ generate)").

## 3. Sequential module loop

For each module in plan order, execute the resume-table action:

- Run the target template's flow **inline** (the same steps, state checks,
  dispatch requirements, and merge semantics as `/hol-plan-module` /
  `/hol-generate-module`, including the `--fresh` flag where indicated) —
  re-run each target's Step 2 state check even though the table says it
  should pass (state may have moved since detection).
- User gates stay in place: the module-plan approval ask in the plan-module
  flow pauses the run for the user's answer; regeneration confirms likewise.
- **Checkpoint report after each module**: the module, state before → after,
  the scorecard (per-rubric status/score + failing findings verbatim), and
  the next action. Keep it short — one block per module.
- On any hard failure (validation errors that won't clear, unparseable
  scorer output after the retry, escalation that is not being re-scored
  under `--fresh`): stop, re-print the resume table with the failed module
  marked, and report exactly what to run to continue.

## 4. Block on escalation

Without `--fresh`, a module that lands `scored-escalated` **stops the run**
(checkpoint report lists the escalated rubric's findings + the loop's round
history). The user resolves it (apply the findings via
`/hol-generate-module <NN-slug>` fix rounds, or clear the scope and re-score
with `--fresh`), then re-run `/hol-generate-all` to continue.

## 5. Completion

When every module is `scored-passed`:

- **Summary authorship**: the scaffold leaves `## Summary` as a
  `<< FILL: ... >>` placeholder and no module step owns it — author it now.
  Dispatch `guide-implementer` (blocking) with the boundary "replace only
  the `## Summary` section body", the plan's module titles/goals as the
  source of truth for what the learner accomplished, and the house style
  (2–4 sentences, second person, present tense, no fluff; state the
  accomplishment arc and what to do next). Skip if the section no longer
  holds a `<< FILL: ... >>`. Re-validate (`hol_validate`, 0 errors) before
  the final report.
- Final report — all modules done, the per-module scorecard summary,
  `hol_status` next field, and next command = `/hol-review-guide` (the final
  guide-scope review + rename step).
