---
description: Re-score the lab spec — deterministic spec check plus full spec-scope rubric fanout (3 rubrics) → merge → scorecard. Report-only stage; no rewriting.
argument-hint: ''
---

Re-score the spec of the lab at/above the current directory. Scoring only —
this command never rewrites spec files or `lab-prep.md`.

## 1. Prerequisites

- **pi-subagents**: the `subagent` tool must be available. If it is not, stop:
  "pi-subagents is not loaded — install/enable it and retry."
- Read `evaluation/scorer-prompts.md` (spec-scope template and the dispatch
  requirement) and `evaluation/scoring-guide.md` now.

## 2. State check

- Run the `hol_status` tool. If `lifecycle.spec` is `missing`, stop: "no spec
  yet — run `/hol-spec`." If it is `adopted`, stop: "this lab's spec stage was
  adopted, not authored — nothing to score."
- Run the `hol_spec_check` tool and record the result. Report it up front: a
  spec that fails the deterministic gate is worth fixing before spending
  scorers on it, so offer to stop there.

## 3. Score (full fanout)

- Spec scope: `checklist/spec-completeness` (1.0), `analytic/spec-buildability`
  (4), `holistic/spec-coherence` (4).
- Build each task from the spec-scope template in
  `evaluation/scorer-prompts.md` — scoring guide verbatim, rubric file
  verbatim, scope label `spec`, content = the full spec set plus `lab-prep.md`
  and `sizing.md` under their own sub-headings.
- Dispatch `subagent` — `agent: "holagent.scorer"`, `async: false`, one call
  per turn, **`acceptance: false`** (mandatory).
- Extract the last fenced JSON block per result; one retry on parse/shape
  failure, then record `status: "escalated"` with finding "scorer output
  unparseable".
- Recompute `score`/`status` from the criterion scores before merging.

## 4. Merge and report

- Merge with the `hol_scores` tool (`action: "merge"`), one entry per rubric,
  `scope: "spec"`, `rounds` = the round number this scoring pass represents.
- Present the deterministic check result and the scorecard: per-rubric status,
  score, and findings.
- Recommend the next step: all passing → `/hol-plan` or `/hol-build`; anything
  failing → `/hol-spec` (request changes) with the specific findings.
