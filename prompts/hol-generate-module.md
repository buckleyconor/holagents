---
description: Generate one module section of guide.md — dry-run material, dispatch guide-implementer, linter self-check loop (0 errors in the section), image placeholders per the checklist, then the module-scoring pass (4-rubric scorer fanout, capped fix loop, --fresh).
argument-hint: '<module> [--fresh]'
---

Generate one module section of an existing guide. Module selector argument:
$@ (same resolution as /hol-plan-module). Optional `--fresh` flag: it does
not change generation — it makes the scoring pass (Step 6) a **fresh pass**
(scope history cleared first, rounds restart at 1), and on an already
generated/validated/scored module it scores the existing section instead of
re-generating it.

Follow the steps in order. Stop and report at the first hard failure.

## 1. Prerequisites

- **pi-subagents**: the `subagent` tool must be available. If it is not, stop:
  "pi-subagents is not loaded — install/enable it and retry."
- **Locate the package skills**: `write-guides`, `lab-anti-patterns`,
  `guide-format`. Read `write-guides/SKILL.md` and
  `lab-anti-patterns/SKILL.md` now (they shape the dispatch reminders).

## 2. State check (resume / overwrite)

- Run `hol_status`: require `plan.exists && plan.valid` — otherwise stop:
  "run /hol-plan first".
- Resolve the module from the argument. Require
  `modules[NN].plan.exists && plan.valid` — otherwise stop: "run
  /hol-plan-module <NN-slug> first".
- **Resume/overwrite**: if the module state is `generated`, `validated`, or
  `scored-*` (the section already holds real content):
  - **without `--fresh`** — this is a **re-generate**: show the current
    section (or its first lines), warn that it will be replaced and its
    scores (if any) will be stale, and ask the user to confirm before
    continuing.
  - **with `--fresh`** — this is a **re-score**: skip Steps 3–5 (no
    re-generation; the section is kept byte-identical), run `hol_validate`
    for a fresh lint record, and if the section has any errors run the
    Step-5 error-fix procedure (one implementer dispatch) before scoring;
    then go straight to Step 6 (fresh pass).
- **`unplanned`/`planned` states**: `--fresh` has no effect (there is no
  generated section to score); proceed with generation as usual.

## 3. Dry-run material (parent captures verbatim outputs)

If the module's commands can be exercised locally (cross-check
`lab-prep.md`'s preloaded list against what is present on this machine):

- Establish the `depends_on` end states first, then run this module's
  `Commands used` in order and capture the verbatim outputs and signals.
- Use throwaway containers/resources only (named, stopped afterward); when
  done, leave the environment as found (containers stopped, ports free).
- If the lab environment is not available locally, **skip this step**: the
  implementer names the signal instead of verbatim output (the module-plan
  template's "not known yet — capture during the dry run" path).

Never run commands that mutate shared state outside a throwaway resource.

## 4. Dispatch the guide-implementer (blocking)

`subagent` tool — `agent: "holagent.guide-implementer"`, `async: false`.
Task payload (self-contained):

- Guide dir (absolute) + the module (N, slug, title).
- **The full module plan** (`.holagent/<NN-slug>/plan.md`) — verbatim.
- **The current `## Module <N>:` section of `guide.md`** — verbatim (this is
  what gets replaced; keep its heading and trailing back-to-top line).
- The guide's H1 + `### Lab Credentials:` block (terminology context).
- **Dry-run material**: the verbatim captured outputs from Step 3 (if any),
  flagged "captured on the authoring machine — keep stable fields; note
  version-dependent values".
- **Boundaries**: replace only the section body between the
  `## Module <N>:` heading and the next `##` heading; no `<< FILL: ... >>`
  may remain; never touch other sections.
- **Contract reminders** (write-guides / lab-anti-patterns): real bash only
  (tab-indented single-backtick spans — the linter runs shellcheck on them,
  L014); every step ends in a verifiable outcome; expected output verbatim
  when the material covers the command, else name the signal;
  `> ✅ **Checkpoint:**` after the first observable artifact and at the end
  (stating a module-plan success criterion) when the section has 3+ command
  steps (W004); one `<< INSERT SCREENSHOT: … >>` per `image_checklist`
  item — nothing more, nothing less (W005) — placed after the step that
  produces that state; standard callouts only (W001); no
  `TODO`/`TBD`/`FIXME` (W008); second person, present tense; explain the why
  on non-obvious steps.
- **Self-check (mandatory)**: run `node --experimental-strip-types
extensions/linter/cli.ts <guide-dir>` (cwd = project root) and fix every
  error whose line falls inside the section; never "fix" findings outside the
  section.

## 5. Deterministic validation (parent)

- Run the `hol_validate` tool (writes `.holagent/last-validation.json`), then
  `hol_status`: require the module state to be **`validated`** (real content
  - 0 errors in the section; warnings OK).
  * State `generated` (errors in the section) → read
    `.holagent/last-validation.json`, collect the error findings whose lines
    fall inside the section, re-dispatch the implementer **once** with the
    list appended ("fix these linter errors in your section: …"), and
    re-validate. Still failing → stop; show the errors.
- Verify the image contract from the report: the section contains exactly
  `image_checklist.length` images (W005).

## 6. Module scoring pass (scorer fanout, scope `module-<NN>-<slug>`)

- **Fresh pass** (`--fresh` flag): first clear the scope's history —
  `hol_scores` tool `action: "remove"`, `scope: "module-<NN>-<slug>"` (drops
  every entry of the scope; no-op if none). All entries of this pass start
  at `rounds: 1`.
- Module-scope rubrics (frontmatter `scope: module` in
  `skills/evaluation/rubrics/`): `checklist/module-completeness` (threshold
  1.0), `analytic/step-clarity` (threshold 4), `analytic/technical-accuracy`
  (threshold 4), `holistic/module-quality` (threshold 4). One scorer per
  rubric (four scorers), dispatched sequentially — the fanout is owned by
  the parent session.
- Build each task from the **`module-<NN-slug>` scope template** in
  `evaluation/scorer-prompts.md`: `scoring-guide.md` verbatim + the rubric
  file verbatim + scope label `module-<NN>-<slug>` + content = the full
  `## Module <N>:` section **including its `[Back to top]` line**, plus the
  guide's `### Lab Credentials:` block and the module plan's step outline /
  image checklist / success criteria under a `### context` sub-heading.
- Dispatch `subagent` — `agent: "holagent.scorer"`, `async: false`,
  **`acceptance: false`** (mandatory — without it the harness injects an
  acceptance-report instruction and its output-strip regex deletes the
  scorer's trailing JSON block; see `evaluation/scorer-prompts.md` dispatch
  requirement).
- **Extract the last fenced JSON block** of each result. Parse/shape failure
  (missing fields, `findings` not covering the rubric's criteria) → re-run
  that single scorer **once** (append the parse error to the same task);
  still failing → record `status: "escalated"`, `score: 0`, `findings:
[{criterion: "<rubric-name>", finding: "scorer output unparseable"}]`.
- Compute each entry: checklist → score = pass rate (mean of the 0/1
  criterion scores), passed when ≥ threshold; analytic → score = mean of
  the criterion scores (1–5), passed when ≥ threshold; holistic → score =
  the single overall score, passed when ≥ threshold. `rounds: 1`.
- Merge **all four entries in one** `hol_scores` `action: "merge"` call (the
  merge is atomic — the scope's entry set lands all-or-nothing, so
  `hol_status` never sees a partial rubric set).

## 7. Fix loop (capped) — while any scope entry is `failed`

Repeat, per round:

- **Cap check first** (per rubric, before fixing or rescoring):
  - `analytic` / `holistic`: max **3 scoring rounds**. A rubric that failed
    round 3 is not fixed or re-scored again: record its entry
    `status: "escalated"` (keep the round-3 findings), merge, stop
    working on it.
  - `checklist`: max **5 rounds**; additionally, if the pass rate did not
    improve across the last two consecutive rounds (score[r-1] ==
    score[r-2]) the loop is unproductive → escalate that rubric now (record
    `status: "escalated"`, merge, stop working on it).
- **Fix dispatch** (one `guide-implementer` dispatch per round, carrying the
  findings of ALL still-failing rubrics): `subagent` —
  `agent: "holagent.guide-implementer"`, `async: false` (writer role,
  default acceptance). Task payload:
  - Guide dir + module; **the current section verbatim**.
  - **The failing findings verbatim**, grouped by rubric — "fix exactly
    what these findings name; do not rewrite steps without a finding;
    keep the section's house format and its checkpoint/image contracts
    (W004/W005) intact."
  - The module plan verbatim (source of truth for expected outputs and
    success criteria) + the Step-4 boundaries + the linter self-check
    requirement.
- **Re-validate**: `hol_validate` + `hol_status` — the section must be back
  to 0 errors (state `validated`). If the fix introduced linter errors,
  run the Step-5 error-fix procedure once before rescoring.
- **Rescore** only the still-`failed` rubrics (same contract as Step 6),
  each with `rounds: <previous rounds + 1>`; merge in one call.
- The loop stops when every scope entry is `passed` or every remaining
  failing rubric has escalated (cap / unproductive / unparseable).

A module with any `escalated` entry ends in state **scored-escalated**
(`hol_status`). Report the escalated findings and ask the user how to
proceed — typical resolutions: fix the module plan and re-generate
(`/hol-generate-module <module>`), hand-edit the section, or re-score with
`/hol-generate-module <module> --fresh`. A scored-escalated module blocks
`/hol-generate-all` until the user resolves it.

## 8. Report

- What was written: step count, checkpoints, images (per checklist item).
- Validation: final section error/warning counts; lint state before
  scoring.
- Scorecard: per rubric — status, score, rounds, failing findings (or
  "none").
- Final module state from `hol_status`: **`scored-passed`** (all four
  entries passed, 0 section errors) or **`scored-escalated`** (any
  escalated).
- Next: `scored-passed` → `/hol-generate-module <next-module>` (or the
  guide review after the last module); `scored-escalated` → resolve the
  escalated findings first.
