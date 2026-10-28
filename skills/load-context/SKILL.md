---
name: load-context
description: Path conventions, two-phase discovery, and per-command context matrix for holagent lab guides. Use when a /hol-* command must decide which plan, module, and guide files to load before doing work.
---

# Load Context

Discover available context cheaply, then read only what the current command needs.
All cross-command knowledge lives in files, never in conversation history, so every
command re-discovers state from disk.

## Paths

Per-guide state under the **guide root** — the directory holding `guide.md`
and `.holagent/`. For a lab this is the lab's own repo (the guide lives at its
root, next to the build code); a guide root may also sit elsewhere (e.g.
`guides/<slug>/` under the tooling repo for legacy labs) — discovery walks up
from cwd and treats any directory with `guide.md` + `.holagent/` as a guide root:

- `guide.md` — the guide being built (canonical working file)
- `lab-prep.md` — environment manifest for builders
- `.holagent/plan.md` — guide plan (frontmatter + sections)
- `.holagent/<NN-slug>/plan.md` — per-module plan
- `.holagent/lab-ref.json` — pointer to the lab's own repo, its environments and platforms (the repo and the guide root coincide when the guide lives at the repo root)
- `.holagent/build/<slug>.json` — last recorded test run per build milestone
- `.holagent/qa/parity.json` · `qa/smoke.json` · `qa/e2e-prod.json` — QA records
- `.holagent/qa/verify-<env>.sh` — the rendered production verification script
- `launch/` — stage-5 collateral (exec summary, catalogue description, social,
  optional enablement brief)
- `.holagent/scores.json` — scoring checkpoints
- `.holagent/last-validation.json` — latest linter report

Platform requirements (per platform, not per lab, under `~/.holagent/`,
override with `HOLAGENT_DATA_DIR`):
`~/.holagent/platforms/<name>/requirements.md`. Per-lab review output:
`guides/<slug>/.holagent/platform/<name>.json` (i.e. the guide root's `.holagent/platform/<name>.json`).

## Two-phase: discover, then read

### Phase 1: Discovery (always run, cheap)

`ls` / file-exists checks only — no file contents:

- **Guide**: does the guide root's `.holagent/plan.md` exist?
- **Module plans**: which `.holagent/<NN-slug>/plan.md` exist?
- **Guide state**: do the guide root's `guide.md`, `lab-prep.md`, `scores.json`,
  `last-validation.json` exist?
- **Platform requirements**: which `~/.holagent/platforms/<name>/requirements.md`
  exist, and does the guide root's `.holagent/platform/<name>.json` exist?

Report discovery results to the calling command. Every command runs discovery so it
knows what is available.

### Phase 2: Selective reading (only what the task needs)

**`-` means do not read it even if it exists — it is not useful for this task.**

| Command                   | Concept/Sizing    | Plan              | Module plans | Guide.md          | Scores/State |
| ------------------------- | ----------------- | ----------------- | ------------ | ----------------- | ------------ |
| `/hol-concept`            | existing (extend) | -                 | -            | -                 | -            |
| `/hol-review-concept`     | yes               | -                 | -            | -                 | yes          |
| `/hol-spec`               | yes               | -                 | -            | -                 | -            |
| `/hol-review-spec`        | yes               | -                 | -            | -                 | yes          |
| `/hol-lab-register`       | -                 | -                 | -            | -                 | -            |
| `/hol-adopt`              | -                 | -                 | -            | -                 | -            |
| `/hol-platform-init`      | -                 | -                 | -            | -                 | -            |
| `/hol-platform-check`     | yes (sizing)      | -                 | -            | -                 | yes          |
| `/hol-build`              | yes (sizing)      | -                 | -            | -                 | yes          |
| `/hol-build-all`          | yes (sizing)      | -                 | -            | -                 | yes          |
| `/hol-qa`                 | -                 | yes               | -            | -                 | yes          |
| `/hol-qa-prod`            | -                 | yes               | -            | -                 | yes          |
| `/hol-launch`             | yes               | yes               | -            | yes               | -            |
| `/hol-review-launch`      | yes               | yes               | -            | yes               | yes          |
| `/hol-plan`               | yes               | existing (extend) | -            | existing (extend) | -            |
| `/hol-plan-module`        | -                 | yes               | prior        | -                 | -            |
| `/hol-generate-module`    | -                 | yes               | this + prior | this + prior      | -            |
| `/hol-generate-all`       | -                 | yes               | all          | all               | -            |
| `/hol-review-plan`        | yes               | yes               | -            | -                 | yes          |
| `/hol-review-module-plan` | -                 | yes               | this         | -                 | yes          |
| `/hol-review-module`      | -                 | yes               | this         | this              | yes          |
| `/hol-review-guide`       | -                 | yes               | all          | all               | yes          |

"Scores/State" covers `scores.json` and `last-validation.json`.

## Using context

- Existing content: stay consistent with what is already in the guide.
- Tone and terminology: follow the `match-writing-style` skill — the holagent
  house lab-guide conventions, unless the user supplied a style preference
  during the interview.

## Fallback behavior

Every context type is optional. When context is missing:

- No plan: the calling command handles it (may start planning interactively).
- No existing guide: generate from scratch.
- No platform requirements: the calling command handles it (may run the
  platform-init interview, or note §10 as a first pass).
