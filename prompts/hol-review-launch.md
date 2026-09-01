---
description: Re-score the launch collateral — deterministic completeness and guide-agreement check plus the full launch-scope rubric fanout (2 rubrics) → merge → scorecard. Report-only stage; no rewriting.
argument-hint: ''
---

Re-score the launch collateral of the lab at/above the current directory.
Scoring only — this command never rewrites anything in `launch/`.

## 1. Prerequisites

- **pi-subagents**: the `subagent` tool must be available. If it is not, stop:
  "pi-subagents is not loaded — install/enable it and retry."
- Read `evaluation/scorer-prompts.md` (launch-scope template and the dispatch
  requirement), `evaluation/scoring-guide.md`, and
  `launch-collateral/SKILL.md` (the tracing table) now.

## 2. State check

- Run the `hol_status` tool. If `lifecycle.ship.launch` is `missing`, stop:
  "no launch collateral yet — run `/hol-launch`."
- Run the `hol_launch_check` tool and record the result. Report it up front:
  collateral that disagrees with `plan.md` on ID, title or duration is worth
  fixing before spending scorers on it, so offer to stop there.
- This command is worth running after any hand-edit of the collateral, and
  after the guide changes — a guide whose duration or title moved leaves the
  collateral describing something that no longer exists.

## 3. Score (full fanout)

- Launch scope: `checklist/launch-completeness` (1.0),
  `analytic/claim-traceability` (4).
- Build each task from the launch-scope template in
  `evaluation/scorer-prompts.md` — scoring guide verbatim, rubric file
  verbatim, scope label `launch`, content = the collateral plus `guide.md`,
  `plan.md`, `sizing.md` and `concept.md` under their own sub-headings.
  Traceability is unscoreable without the sources.
- Dispatch `subagent` — `agent: "holagent.scorer"`, `async: false`, one call
  per turn, **`acceptance: false`** (mandatory).
- Extract the last fenced JSON block per result; one retry on parse/shape
  failure, then record `status: "escalated"` with finding "scorer output
  unparseable".
- Recompute `score`/`status` from the criterion scores before merging.

## 4. Merge and report

- Merge with the `hol_scores` tool (`action: "merge"`), one entry per rubric,
  `scope: "launch"`, `rounds` = the round number this scoring pass represents.
- Present the deterministic check result and the scorecard, and **quote every
  untraceable claim the scorers found, verbatim**. That list is the point of
  this command; a summary of it is not.
- Recommend the next step: all passing → nothing, the lab is shipped; anything
  failing → `/hol-launch` (request changes) with the specific claims to remove
  or source.
