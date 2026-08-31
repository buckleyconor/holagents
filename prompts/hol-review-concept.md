---
description: Re-score the lab concept and sizing — full concept-scope (3 rubrics) and sizing-scope (1 rubric) fanout → merge → scorecard. Report-only stage; no rewriting.
argument-hint: ''
---

Re-score the concept and sizing of the lab at/above the current directory.
Scoring only — this command never rewrites `concept.md` or `sizing.md`.

## 1. Prerequisites

- **pi-subagents**: the `subagent` tool must be available. If it is not, stop:
  "pi-subagents is not loaded — install/enable it and retry."
- Read `evaluation/scorer-prompts.md` (concept- and sizing-scope templates and
  the dispatch requirement) and `evaluation/scoring-guide.md` now.

## 2. State check

- Run the `hol_status` tool. Require `lifecycle.concept` to be `drafted` or
  `approved`. If it is `missing`, stop: "no concept yet — run `/hol-concept`."
  If it is `adopted`, stop: "this lab's concept stage was adopted, not
  authored — nothing to score."
- Note whether `.holagent/sizing.md` exists; if it does not, score the concept
  scope only and say so in the report.

## 3. Score (full fanout)

- Concept scope: `checklist/concept-completeness` (1.0),
  `analytic/business-value` (4), `holistic/story-coherence` (4).
- Sizing scope: `analytic/footprint-realism` (4).
- Build each task from the matching template in `evaluation/scorer-prompts.md`
  — scoring guide verbatim, rubric file verbatim, scope label, content slice
  (sizing tasks also carry `concept.md` under a `### concept.md` sub-heading).
- Dispatch `subagent` — `agent: "holagent.scorer"`, `async: false`, one call
  per turn, **`acceptance: false`** (mandatory).
- Extract the last fenced JSON block per result; one retry on parse/shape
  failure, then record `status: "escalated"` with finding "scorer output
  unparseable".
- Recompute `score`/`status` from the criterion scores before merging.

## 4. Merge and report

- Merge with the `hol_scores` tool (`action: "merge"`), one entry per rubric,
  `scope: "concept"` or `scope: "sizing"`, `rounds` = the round number this
  scoring pass represents.
- Present the scorecard: per-rubric status, score, and findings, grouped by
  scope.
- Recommend the next step: all passing → `/hol-spec`; anything failing →
  `/hol-concept` (request changes) with the specific findings to address.
