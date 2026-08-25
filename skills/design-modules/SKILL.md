---
name: design-modules
description: Module design for a single holagent lab guide — sequencing, pacing, per-module planning fields, and environment-delta planning. Use when drafting or revising the module list in plan.md (guide-planner) or writing .holagent/<NN-slug>/plan.md (module-planner).
---

# Design Modules

Design the modules of one guide: what each module teaches, in what order, and
what environment state it assumes and leaves behind. Environments are
**pre-provisioned** — there are no setup/cleanup scripts; every state
transition is captured in the module's **environment delta** instead.

## Sequencing principles

1. **Observation → guided → independent** arc across the guide: the first
   module orients the learner in the running environment (verify the
   baseline, inspect what is running); middle modules are guided hands-on
   work; the final module lets the learner apply the workflow
   independently.
2. **One core concept per module**, reinforced through action. A module that
   teaches two concepts is two modules.
3. **No concept islands**: each module builds on the previous one; early
   modules introduce vocabulary that later modules reuse. If module N needs
   state that module N-1 does not produce, the sequence is wrong.
4. **Time estimates are reading + doing + likely mistakes**, not the
   optimistic minimum. A "5-minute" command that compiles a model is not a
   5-minute step.
5. Modules are numbered sequentially from 1; titles are short noun phrases
   (`Create Collections`, `Deploy to Triton`), not full sentences.

## Per-module planning fields

Every module in `plan.md` (and every `.holagent/<NN-slug>/plan.md`) carries:

| Field              | Requirement                                                                                                          |
| ------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `goal`             | One sentence: what the learner can do when the module is done                                                        |
| `depends_on`       | Module numbers whose state this module consumes (`[]` for the first)                                                 |
| `est_minutes`      | Reading + doing + likely mistakes (see budget table below)                                                           |
| Environment delta  | What is already true on entry; what the module leaves behind                                                         |
| `success_criteria` | Verifiable end states (what the checkpoints assert)                                                                  |
| `image_checklist`  | Every screenshot the module needs, one line each — the finished guide must contain exactly these (W005 cross-checks) |

## Environment delta planning

The environment is built by an external team from `lab-prep.md`; the guide
never installs, configures, or tears down. For each module, record:

- **Assumes (already true):** services running, files present, credentials
  valid, ports open. Cite the `### Lab Credentials:` block and
  `lab-prep.md`; do not restate them inline.
- **Leaves behind:** artifacts created (model files, collections, deployed
  versions) that later modules consume — name the path or resource.
- **No double production:** if two modules both need artifact X, exactly one
  module produces it and the other lists it in `depends_on`.

If a module would need new infrastructure (a service that is not running, a
port that is closed), that is a gap in `lab-prep.md`, not a step in the guide
— raise it as an open question in the plan's "Open questions / assumptions"
section.

## Time budgeting

| Size   | Minutes | Steps | Use                                         |
| ------ | ------- | ----- | ------------------------------------------- |
| Short  | 5–10    | 2–4   | Single concept, one verifiable outcome      |
| Medium | 10–20   | 5–8   | Connected steps around one concept          |
| Long   | 20–30   | 8–12  | Avoid when possible; split into two modules |

Guide totals: ~30–120 minutes. `duration_minutes` in `plan.md` must equal
the sum of module `est_minutes` (plus ~5 for the Introduction).

## Checkpoint placement

A module with **3+ command steps** needs at least one
`> ✅ **Checkpoint:** <verifiable end state>` line (the linter warns
otherwise, W004). Place checkpoints:

- After the first command that produces an observable artifact (files, HTTP
  responses, loaded models) — verifies the environment works before the
  learner invests more time.
- After long-running steps (training, ingestion, builds) where failure is
  likely and diagnosable from the output.
- At the end of the module, stating the success criterion verbatim.

Checkpoint text must be a state the learner can verify without re-reading the
module ("`checkpoints/isl/best.pt` exists and the training log shows
validation accuracy ≥ 85%"), not a sentiment ("training works well").

## Sizing

- Keep module bodies under ~300 lines (the linter warns on `##` sections
  over 400 lines with no `###` subheading, W002). Beyond the soft limit,
  split at a concept boundary and renumber downstream modules.
- Use `### N.N <topic>` subsections inside a module only when it has 3+
  distinct subtasks (see the style corpus samples).
- The final `## Summary` is standalone, after the last module — never folded
  into a module heading.
