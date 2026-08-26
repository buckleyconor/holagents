---
description: Re-score one generated module section — full module-scope rubric fanout (4 rubrics) → merge → scorecard. Scoring only; no regeneration.
argument-hint: '<module>'
---

Re-score one generated module section. Module selector argument: $@ (`N`,
`NN-slug`, or a unique title fragment). Scoring only — the section is not
regenerated; this is the standalone module review (post-generation scoring
happens in `/hol-generate-module` Step 6).

Follow the steps in order. Stop and report at the first hard failure.

## 1. Prerequisites

- **pi-subagents**: the `subagent` tool must be available. If it is not, stop:
  "pi-subagents is not loaded — install/enable it and retry."
- **Locate the package skills** in your skill inventory: `evaluation`. Read
  `evaluation/scorer-prompts.md` (module-scope task template, dispatch
  requirement, fanout table, normalization note) now.
- **Guide root convention**: `guides/<slug>/`; the module section is the
  `## Module <N>:` section of `guide.md`.

## 2. State check

- Run the `hol_status` tool (dev sessions without the extension: the
  equivalent `readGuideStatus` via `node --experimental-strip-types` on
  `extensions/hol-core.ts`): require `plan.exists && plan.valid` — otherwise
  stop: "run /hol-plan first".
- Resolve the module from the argument the way `resolveModuleSelector` does
  (`N`, `NN-slug`, or unique title fragment). On ambiguity, stop and list the
  candidates.
- Require the module state ≥ `generated` (the section exists with real
  content and the last validation had 0 errors) — otherwise stop: "the
  module is not generated yet — run /hol-generate-module <NN-slug> first"
  (or `/hol-plan-module <NN-slug>` if it is `unplanned`).
- Read the existing `module-<NN>-<slug>` scope entries (if any): note
  `rounds` (this review is `existing + 1`; a scope with no entries starts at
  round 1; to restart at 1, clear the scope first with `hol_scores`
  `action: "remove"`).

## 3. Load context

- Read the full `## Module <N>: …` section (through its `[Back to top]`
  line), the guide's `### Lab Credentials:` block, and the module plan: its
  frontmatter `title`, the step outline, `## Environment delta`,
  `image_checklist`, and `success_criteria`.

## 4. Score the module (scorer fanout, module-<NN>-<slug> scope)

- Module rubrics — full fanout, one scorer each:
  `checklist/module-completeness` (threshold 1.0), `analytic/step-clarity`
  (4), `analytic/technical-accuracy` (4), `holistic/module-quality` (4).
- Build each task from the **module-<NN-slug> scope template** in
  `evaluation/scorer-prompts.md`: scoring guide verbatim + rubric verbatim +
  scope label `module-<NN>-<slug>` + content = the full module section, plus
  the context items from Step 3 under a `### context` sub-heading (the
  module plan `title` is mandatory — `title-alignment` is unverifiable
  without it).
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

- Merge all fanout entries in a **single** `hol_scores` call
  (`action: "merge"`, one entry per rubric, `scope: "module-<NN>-<slug>"`).
- Render the scorecard: one row per rubric — status, score, rounds, failing
  findings verbatim (below-threshold criteria inside a passed entry are
  listed as recorded findings; only `failed` entries drive fix loops).
- Report: the module's `hol_status` line + scorecard. Next command =
  `/hol-generate-module <NN-slug> --fresh` to act on findings and re-score,
  or the next module's stage command.
