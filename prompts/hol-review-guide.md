---
description: Final review of the whole guide — guide-scope rubric fanout (3 rubrics) → merge → scorecard; on pass, offers the final rename guide.md → <ID>-<Title>.md (user confirms, ADR-005).
argument-hint: ''
---

The final pass before a guide is finished. Scores the **whole** `guide.md`
against the guide-scope rubrics and — only on a passing scorecard and a
clean linter run — offers the final rename.

Follow the steps in order. Stop and report at the first hard failure.

## 1. Prerequisites

- **pi-subagents**: the `subagent` tool must be available. If it is not, stop:
  "pi-subagents is not loaded — install/enable it and retry."
- **Locate the package skills** in your skill inventory: `evaluation`. Read
  `evaluation/scorer-prompts.md` (guide-scope task template, dispatch
  requirement, fanout table, normalization note) now.
- **Guide root convention**: `guides/<slug>/`; state in
  `guides/<slug>/.holagent/`.

## 2. State check + pre-flight lint

- Run the `hol_status` tool (dev sessions without the extension: the
  equivalent `readGuideStatus` via `node --experimental-strip-types` on
  `extensions/hol-core.ts`): require `plan.exists && plan.valid`.
- List any module whose state is not `scored-passed` — if any, **warn**
  (name them) that the guide review is normally the final stage, and ask the
  user to confirm proceeding anyway. Do not hard-block: the review scores
  what is there.
- Run the `hol_validate` tool on the guide: require **0 errors**. On errors,
  stop: "fix the linter errors first (regenerate the failing modules), then
  re-run /hol-review-guide". Warnings are listed in the report (never
  block).
- If `## Summary` still holds a `<< FILL: ... >>` placeholder, stop:
  "Summary not authored — run the /hol-generate-all completion step first"
  (the guide-scope `summary-honest` criterion cannot pass on a placeholder).
- Read the existing `guide` scope entries (if any): note `rounds` (this
  review is `existing + 1`; a scope with no entries starts at round 1; to
  restart at 1, clear the scope first with `hol_scores` `action: "remove"`,
  `scope: "guide"`).

## 3. Load context

- Read the full `guide.md` and the `plan.md` frontmatter (objectives +
  modules list).
- **Product/company profiles**: if the plan, research notes, or the user
  names the product/company this guide was researched from, point the scorer
  at the matching profile(s) under `~/.holagent`
  (`~/.holagent/companies/<slug>/`, `~/.holagent/products/<company>/<product>/`)
  — the scorer may read them for the `product-names` criterion. If no
  profile applies, say so in the context ("no product profile — score
  product-names against the guide's internal consistency").

## 4. Score the guide (scorer fanout, guide scope)

- Guide-scope rubrics — full fanout, one scorer each:
  `checklist/guide-completeness` (threshold 1.0),
  `analytic/terminology-consistency` (4), `holistic/guide-quality` (4).
- Build each task from the **guide-scope template** in
  `evaluation/scorer-prompts.md`: scoring guide verbatim + rubric verbatim +
  scope label `guide` + content = the full `guide.md`, plus the plan
  frontmatter and the profile pointer (or its absence) under a
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

- Merge all fanout entries in a **single** `hol_scores` call
  (`action: "merge"`, one entry per rubric, `scope: "guide"`).
- Render the scorecard: one row per rubric — status, score, rounds, failing
  findings verbatim.

## 6. Outcome

- **Any failed or escalated entry** → no rename. Report the scorecard + the
  failing findings; next command = `/hol-generate-module <NN-slug> --fresh`
  (or the module's fix loop) for each finding's module, then re-run
  `/hol-review-guide`.
- **All passed (and Step 2's lint was 0 errors)** → **offer the final
  rename** (ADR-005): derive the target name from the plan frontmatter —
  `<ID>-<Title>.md` (e.g. `HOL-2000-01-Store and Search an Embedded Document
Corpus.md`) — and show the exact command:
  `mv guides/<slug>/guide.md guides/<slug>/<ID>-<Title>.md`.
  **Ask the user to confirm.** On confirm: run the `mv`, verify with `ls`,
  and report: "Guide finished. `guide.md` no longer exists — this guide has
  left the pipeline (ADR-005: `guide.md` is canonical only during the
  pipeline; `hol_validate`/`hol_status` expect `guide.md`). Re-entering the
  pipeline for this guide requires restoring `guide.md`."
  On decline: keep `guide.md` as-is; report the scorecard as the final
  review record.

- **Either way, name what is left.** The guide is finished; stage 5 is not.
  Point at `/hol-platform-check <platform>` (does this lab meet the platform
  team's requirements?) and `/hol-launch` (the exec summary, catalogue
  description and internal posts). `hol_status` reports both under `ship`.
