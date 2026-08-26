# holagent-lab-guides

**What it is.** holagent is a Pi agent package that produces
production-quality hands-on lab guides end-to-end: it researches the
vendor/product context, interviews you into a guide plan, generates the
guide module-by-module against a pre-provisioned lab environment, and
validates (deterministic linter) and scores (rubric fanout) the result
before the final user-confirmed rename. It is one install — prompt
templates, subagents, skills, and a thin deterministic extension — with
zero runtime dependencies.

## Prerequisites

| Requirement                                        | Needed for                         | What degrades without it                                                                                                                                         |
| -------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pi with the **pi-subagents** extension (hard peer) | every plan/generate/review command | those commands stop at their prerequisites step ("pi-subagents is not loaded"); `/hol-validate`, `/hol-status`, and the linter CLI still work                    |
| **Node 22** (bundled with Pi)                      | linter, extension, tests           | nothing runs (`--experimental-strip-types`, erasable TS, no build)                                                                                               |
| `shellcheck` (optional — `apt install shellcheck`) | L014/W014 on guide inline commands | the report shows `shellcheck: "skipped (shellcheck not installed)"`; all other rules unaffected                                                                  |
| Docker / the target lab environment                | dry-run capture during generation  | the parent can't capture verbatim expected outputs; a guide with unseen outputs must not ship (the templates have an explicit "capture during the dry run" path) |

## Install

```
pi install git:<repo>@v0.1.0       # user scope
pi install git:<repo>@v0.1.0 -l    # project scope
```

Verify in any guide dir: `/hol-status` prints the plan validity, per-module
states, last validation, and the next recommended command.

## Quickstart

The six-command happy path. State lives in files, not the conversation —
`/clear` freely between stages; every command re-detects state and resumes.

1. `/hol-research-company [url:<u> slug:<s>]` — scrape the vendor site and
   distill `company.md` + `style-guide.md` into `~/.holagent/companies/<slug>/`.
2. `/hol-research-product <product> [company:<slug>]` — product profile
   into `~/.holagent/products/<company>/<product>/`.
3. `/hol-plan [topic]` — interview (ID, audience, objectives, environment)
   → `guide-planner` → plan-scope scoring → your approval → `plan.md` +
   `lab-prep.md`.
4. `/hol-plan-module <module>` — the module plan (step outline, image
   checklist, environment delta, success criteria).
5. `/hol-generate-module <module>` — dry-run material → section authored by
   `guide-implementer` → linter loop (0 errors) → module scoring (4 rubrics)
   → capped fix loop. (`/hol-generate-all` runs the whole pipeline in plan
   order.)
6. `/hol-review-guide` — guide-scope scoring (3 rubrics); on an all-passing
   scorecard it offers the final rename (you confirm — ADR-005).

## Command reference

`<module>` accepts `NN` (e.g. `2`), `NN-slug` (e.g. `02-upload-documents`),
or an unambiguous title fragment; ambiguous input lists available modules.

| Command                   | Arg                          | What it does                                                                                                       | Prerequisites                             |
| ------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| `/hol-plan`               | `[topic]`                    | Interview → `guide-planner` → plan scoring fanout → approval loop → `plan.md` + `lab-prep.md`                      | pi-subagents                              |
| `/hol-plan-module`        | `<module>`                   | `module-planner` → module plan file → light scoring (2 rubrics)                                                    | pi-subagents                              |
| `/hol-generate-module`    | `<module> [--fresh]`         | `guide-implementer` writes the section → linter loop → module scoring (4 rubrics) → capped fix loop → merge        | pi-subagents                              |
| `/hol-generate-all`       | `[--fresh]`                  | State detection via `hol_status`; runs the per-module pipeline in plan order; checkpoint report after each module  | pi-subagents                              |
| `/hol-research-company`   | `[url:<u> slug:<s>]`         | `scrape-website` skill + pinned scraper binary → `company-researcher` → `~/.holagent/companies/<slug>/`            | network (scraper bootstraps on first run) |
| `/hol-research-product`   | `<product> [company:<slug>]` | `product-researcher` → `~/.holagent/products/<company>/<product>/`                                                 | pi-subagents                              |
| `/hol-review-plan`        | —                            | Plan-scope scoring fanout (4 rubrics) → merge → scorecard                                                          | pi-subagents                              |
| `/hol-review-module-plan` | `<module>`                   | Module-plan-scope re-score (2 rubrics) → scorecard                                                                 | pi-subagents                              |
| `/hol-review-module`      | `<module>`                   | Module-scope re-score (4 rubrics) → scorecard (requires state ≥ generated)                                         | pi-subagents                              |
| `/hol-review-guide`       | —                            | Guide-scope scoring (3 rubrics) → scorecard; on all-pass + 0 lint errors, the ADR-005 rename offer (user confirms) | pi-subagents                              |
| `/hol-validate`           | `[guideDir]`                 | **Extension command (no LLM):** runs the linter, records `.holagent/last-validation.json`                          | Node 22                                   |
| `/hol-status`             | `[guideDir]`                 | **Extension command (no LLM):** plan/module states, last validation, next command                                  | Node 22                                   |

The extension also registers the LLM-callable tools `hol_validate`,
`hol_status`, and `hol_scores` — the same deterministic core that the prompt
templates call (ADR-007).

## Workflow notes

- **Stage separation via `/clear`**: state lives in files
  (`.holagent/`, `scores.json`), not in the conversation. Clear between
  stages; the commands resume from state.
- **Test flow after each module**: the pipeline's own verification is the
  dry-run's verbatim captured outputs + linter 0 errors + the module
  scorecard. On top of that you may (a) **verify-only** — accept that and
  move on; (b) **manual lab run** — execute the module's commands
  end-to-end on the lab environment before starting the next module; or
  (c) **skip** — defer and let `/hol-review-guide` catch what slipped.
- **Screenshots**: generated guides carry `<< INSERT SCREENSHOT: <what the
reader should see> >>` placeholders — one per item in the module plan's
  image checklist. After uploading the screenshots, replace each placeholder
  with
  `![Image](/ImageProxy?filename=<uuid>/<file>.png "Click to enlarge"){data-modal=true}`.

## Configuration

- `HOLAGENT_DATA_DIR` — research cache root (default `~/.holagent`).
- **Models**: agents inherit the parent session's model by default. Pin one
  (e.g. `holagent.scorer` on a cheaper model) via the agent frontmatter
  (`model:`) or pi-subagents `subagents.agentOverrides`.
- `scraper-manifest.json` (package root) — pins the research scraper binary
  (version + SHA-256); the `scrape-website` skill bootstraps it to
  `~/.holagent/bin/scraper` on first use.

## Data layout

```
~/.holagent/                        # research cache ($HOLAGENT_DATA_DIR)
├── companies/<slug>/               # company.md, style-guide.md, manifest.json, website/
├── products/<company>/<product>/   # product.md, manifest.json, website/
└── bin/scraper                     # pinned scraper binary + manifest (version, sha256)

guides/<slug>/                      # one guide
├── guide.md                        # canonical during the pipeline (final: <ID>-<Title>.md)
├── lab-prep.md                     # environment manifest for lab builders
└── .holagent/
    ├── plan.md                     # guide plan (frontmatter + sections)
    ├── <NN-slug>/plan.md           # per-module plan (frontmatter + sections)
    ├── scores.json                 # scoring checkpoints (atomic writes)
    └── last-validation.json        # latest linter report
```

Write confinement: the package writes only under `~/.holagent/` (or
`$HOLAGENT_DATA_DIR`) and the active guide dir.

## Troubleshooting

| Symptom                                                                                 | Cause                                                                | Fix                                                                                                                                                                                                    |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| "pi-subagents is not loaded — install/enable it and retry"                              | pi-subagents extension not installed/enabled                         | install/enable pi-subagents (hard peer of this package)                                                                                                                                                |
| `scrape-website` bootstrap fails or no scraper binary                                   | first run without network, or network blocked                        | re-run with network access; the binary is verified against `scraper-manifest.json` (version + SHA-256) before use                                                                                      |
| `shellcheck: "skipped (shellcheck not installed)"` in a lint report                     | shellcheck binary absent on the box                                  | `apt install shellcheck` — optional; only L014/W014 are affected                                                                                                                                       |
| `E-PATH` from `/hol-status`, `/hol-validate`, or the tools                              | not inside a guide dir (no `guide.md` + `.holagent/`)                | run inside `guides/<slug>/`; a guide already renamed has left the pipeline — restore `guide.md` to re-enter (ADR-005)                                                                                  |
| a scorer entry recorded as `status: "escalated"`, finding `"scorer output unparseable"` | the scorer's trailing JSON block failed to parse twice (max 1 retry) | re-run that review with `--fresh` (or the module's fix loop); the contract is ADR-006                                                                                                                  |
| a checklist scope that never converges                                                  | fix loop unproductive                                                | the loop escalates at round 5 without improvement; resolve per the report (fix the module plan + `--fresh`, hand-edit the section, or re-score)                                                        |
| `grep -ri instruqt` finds hits in the package                                           | provenance record, not branding                                      | intentional: `scraper-manifest.json` records the upstream repo URL of the pinned scraper binary (a supply-chain dependency of record) and `scripts/package-smoke.mjs` checks that word; see Provenance |

## Provenance & license

- The architecture is derived from the Claude Code plugin
  [`github.com/instruqt/ai-plugins`](https://github.com/instruqt/ai-plugins)
  (the "track" plugin: research → plan → generate → validate → score) —
  credit to its authors for the reference design. holagent rebrands and
  re-architects it for Pi: parent-owned scorer fanout (ADR-001), knowledge
  bundled in skills (ADR-002), no lifecycle scripts (ADR-003), line-based
  linter with no build (ADR-004), the `guide.md` → `<ID>-<Title>.md` rename
  gate (ADR-005), the trailing-JSON scorer contract (ADR-006), and
  LLM-bypass extension commands (ADR-007).
- The content/format standard — house style, the linter rule set, and the
  evaluation rubrics — is the team's own, derived from four in-house sample
  guides (`skills/style-corpus/samples/`).
- License: this package is **UNLICENSED** (see `package.json`) — all rights
  reserved; it is an internal team tool.

## Develop

```bash
npm install
npm test           # typecheck + unit/integration (node:test, type-stripped TS)
npm run lint:corpus # run the linter over the style-corpus samples (triage aid)
npm run docs:rules  # regenerate docs/linter-rules.md from format.json
```

Milestone-gate runbook: `docs/manual-e2e.md`. ADRs: `docs/adr/`. Spec:
`spec/`.
