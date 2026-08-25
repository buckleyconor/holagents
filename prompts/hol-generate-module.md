---
description: Generate one module section of guide.md — dry-run material, dispatch guide-implementer, linter self-check loop (0 errors in the section), image placeholders per the checklist.
argument-hint: '<module>'
---

Generate one module section of an existing guide. Module selector argument:
$@ (same resolution as /hol-plan-module).

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
  `scored-*` (the section already holds real content), this is a
  **re-generate**: show the current section (or its first lines), warn that
  it will be replaced and its scores (if any) will be stale, and ask the
  user to confirm before continuing.

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

## 6. Report

- What was written: step count, checkpoints, images (per checklist item).
- Validation: final section error/warning counts; module state from
  `hol_status` (expected `validated`).
- Next: the module scoring pass (rubrics `checklist/module-completeness` +
  analytic + `holistic/module-quality`, scope `module-<NN-slug>`), or
  `/hol-generate-module <next-module>`.
