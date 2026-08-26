---
description: Re-score the guide plan — full plan-scope rubric fanout (4 rubrics) → merge → scorecard. Report-only stage; no rename.
argument-hint: ''
---

Re-score the plan of an existing guide. This is the standalone plan review;
`/hol-plan` Step 8 runs the same fanout at the approval gate.

Follow the steps in order. Stop and report at the first hard failure.

## 1. Prerequisites

- **pi-subagents**: the `subagent` tool must be available. If it is not, stop:
  "pi-subagents is not loaded — install/enable it and retry."
- **Locate the package skills** in your skill inventory: `evaluation`. Read
  `evaluation/scorer-prompts.md` (plan-scope task template, dispatch
  requirement, fanout table, normalization note) now.
- **Guide root convention**: `guides/<slug>/`; plan state in
  `guides/<slug>/.holagent/`.

## 2. State check

- Run the `hol_status` tool (dev sessions without the extension: the
  equivalent `readGuideStatus` via `node --experimental-strip-types` on
  `extensions/hol-core.ts`): require `plan.exists && plan.valid` — otherwise
  stop: "run /hol-plan first".
- Read the existing plan-scope entries in `.holagent/scores.json` (if any):
  note the `rounds` of each, and report which scoring round this review is
  (`rounds = existing + 1`; a scope with no entries starts at round 1).
  To restart a scope at round 1 instead, clear it first (`hol_scores`
  `action: "remove"`, `scope: "plan"`) — the `--fresh` equivalent.

## 3. Load context

- Read the full `.holagent/plan.md` (frontmatter + body) and the full
  `lab-prep.md`.

## 4. Score the plan (scorer fanout, plan scope)

- Plan-scope rubrics — full fanout, one scorer each:
  `checklist/plan-completeness` (threshold 1.0), `analytic/learning-arc` (4),
  `analytic/environment-alignment` (4), `holistic/plan-coherence` (4).
- Build each task from the **plan-scope template** in
  `evaluation/scorer-prompts.md`: `scoring-guide.md` verbatim + the rubric
  file verbatim + scope label `plan` + content = the full `plan.md` **and**
  `lab-prep.md` (under a `### lab-prep.md` sub-heading).
- Dispatch `subagent` — `agent: "holagent.scorer"`, `async: false`, one call
  per turn (sequential blocking), **`acceptance: false`** (mandatory —
  without it the harness injects an acceptance-report instruction and its
  output-strip regex deletes the scorer's trailing JSON block; see
  `evaluation/scorer-prompts.md` dispatch requirement).
- **Extract the last fenced JSON block** of each result. Parse/shape failure
  (missing fields, `findings` not covering the rubric's criteria) → re-run
  that single scorer **once**; still failing → record
  `status: "escalated"`, finding "scorer output unparseable".
- **Recompute** `score`/`status` from the criterion scores against the
  rubric threshold before merging (defense in depth; the scorer reports both,
  the parent verifies): checklist pass rate ≥ 1.0, analytic/holistic mean ≥
  threshold → `passed`, else `failed`.

## 5. Merge + scorecard

- Merge all fanout entries in a **single** `hol_scores` call
  (`action: "merge"`, one entry per rubric: `{ scope: "plan", rubric:
<rubric key>, kind, status, score, rounds: <scoring round n>, findings:
[{criterion, score, finding}, …] }`) so the scope's entry set lands
  all-or-nothing.
- Render the scorecard: one row per rubric — status, score, rounds, failing
  findings verbatim (criterion + finding text).
- Report: `hol_status` plan line + scorecard. This stage is report-only — no
  file changes beyond `scores.json`. To apply plan changes: `/hol-plan`
  (update mode) with the change requests.
