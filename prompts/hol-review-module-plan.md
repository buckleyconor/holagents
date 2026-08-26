---
description: Re-score one module plan — full module-plan-scope rubric fanout (checklist + analytic) → merge → scorecard.
argument-hint: '<module>'
---

Re-score one module plan of an existing guide. Module selector argument: $@
(`N`, `NN-slug`, or a unique title fragment). This is the standalone module-
plan review; `/hol-plan-module` Step 6 runs the same fanout at planning time.

Follow the steps in order. Stop and report at the first hard failure.

## 1. Prerequisites

- **pi-subagents**: the `subagent` tool must be available. If it is not, stop:
  "pi-subagents is not loaded — install/enable it and retry."
- **Locate the package skills** in your skill inventory: `evaluation`. Read
  `evaluation/scorer-prompts.md` (module-plan-scope task template, dispatch
  requirement, fanout table, normalization note) now.
- **Guide root convention**: `guides/<slug>/`; per-module state in
  `guides/<slug>/.holagent/<NN-slug>/`.

## 2. State check

- Run the `hol_status` tool (dev sessions without the extension: the
  equivalent `readGuideStatus` via `node --experimental-strip-types` on
  `extensions/hol-core.ts`): require `plan.exists && plan.valid` — otherwise
  stop: "run /hol-plan first".
- Resolve the module from the argument the way `resolveModuleSelector` does
  (`N`, `NN-slug`, or unique title fragment). On ambiguity, stop and list the
  candidates.
- Require `modules[NN].plan.exists` — otherwise stop: "run
  /hol-plan-module <NN-slug> first".
- Read the existing `module-plan-<NN>` scope entries (if any): note `rounds`
  (this review is `existing + 1`; a scope with no entries starts at round 1;
  to restart at 1, clear the scope first with `hol_scores` `action: "remove"`).

## 3. Load context

- Read the full `.holagent/<NN-slug>/plan.md`, the guide plan's `modules`
  entry for this module (goal/est_minutes), and, if present, the prior
  module's plan `## Environment delta` section.

## 4. Score the module plan (scorer fanout, module-plan-<NN> scope)

- Module-plan rubrics — full fanout, one scorer each:
  `checklist/module-plan-completeness` (threshold 1.0),
  `analytic/module-design` (threshold 4).
- Build each task from the **module-plan-<NN> scope template** in
  `evaluation/scorer-prompts.md`: scoring guide verbatim + rubric verbatim +
  scope label `module-plan-<NN>` + content = the full
  `.holagent/<NN-slug>/plan.md`, plus the context items from Step 3 under a
  `### context` sub-heading.
- Dispatch `subagent` — `agent: "holagent.scorer"`, `async: false`, one call
  per turn (sequential blocking), **`acceptance: false`** (mandatory — see
  `evaluation/scorer-prompts.md` dispatch requirement).
- **Extract the last fenced JSON block** of each result. Parse/shape failure
  (missing fields, `findings` not covering the rubric's criteria) → re-run
  that single scorer **once**; still failing → record
  `status: "escalated"`, finding "scorer output unparseable".
- **Recompute** `score`/`status` from the criterion scores against the
  rubric threshold before merging (defense in depth).

## 5. Merge + scorecard

- Merge both entries in a **single** `hol_scores` call (`action: "merge"`,
  one entry per rubric, `scope: "module-plan-<NN>"`).
- Render the scorecard: one row per rubric — status, score, rounds, failing
  findings verbatim.
- Report: the module plan path + scorecard + the module's `hol_status` line.
  Next command = `/hol-generate-module <NN-slug>` (or
  `/hol-plan-module <NN-slug>` to re-plan after applying the findings).
