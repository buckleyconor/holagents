# 07 — Build sequence

Sequencing principle: **deterministic core first, knowledge next, LLM-in-loop
last.** Every milestone is independently testable; LLM-dependent milestones end in a
manual gate (runbook per §05). Sizes are rough (S ≤ half-day, M 1–2 days, L 3–4 days).

| M | Milestone | Size | Deliverable | Test / exit criteria |
|---|---|---|---|---|
| **M0** | Scaffold | S | Repo: `package.json` (pi manifest, peer/dev deps), folder tree, `.prettierrc`, `tsconfig` (strict), `ci.yml` skeleton, placeholder `npm test` | CI green with no logic; `pi install <local-path>` loads the empty package without error (manual check) |
| **M1** | Format spec | M | `skills/guide-format/SKILL.md` + `format.json` (all L0xx/W0xx config: headings, regexes, platform-notice string, callout standards); `scripts/gen-rule-docs.mjs` → `docs/linter-rules.md` | Human review of the spec against the 4 samples; `docs:rules` generates; T-50 registry test stub passes vacuously |
| **M2** | Linter core | M | `scan.ts` (headings/TOC/links/images/callouts/command candidates with line numbers), rule registry, `runLint()` → `LintReport`, anchor algorithm | T-01…T-32 (rule fixtures) + T-32 anchor unit tests green; T-53 (10 MB) and T-54 (hostile input) green |
| **M3** | Linter complete + CLI | M | `rules/*.ts` for the full v1 rule set, `shellcheck.ts` (execFile), `cli.ts` (JSON + exit codes) | T-45/T-46 exit codes + determinism; corpus expectations written for the 4 samples (**manual baseline**: run CLI, triage findings with the author, commit as `test/corpus/expected/*.json`); T-42…T-44 green |
| **M4** | Extension | M | `extensions/hol.ts`: `hol_validate`, `hol_status`, `hol_scores` tools; `/hol-validate`, `/hol-status` commands; path validation; 0700 data-dir creation; graceful "pi-subagents missing" degradation | T-33…T-41; manual: `pi -e <pkg>` loads, tools callable, `/hol-validate` on a scratch guide renders the report; smoke test passes |
| **M5** | Knowledge skills | L | 13 skills: ported (load-context, scrape-website+cli, research-*, analyze/match-writing-style) + new (guide-scaffolds templates, evaluation rubrics rewritten for guide scopes, style-corpus with 4 samples, lab-anti-patterns, design-modules, write-guides); `scripts/sync-corpus.mjs` + run it | Human review pass (rubrics wording approved by the author); T-47 frontmatter validity; T-48 branding grep; `npm run corpus:sync` idempotent |
| **M6** | Research pipeline | M | Scraper bootstrap (pinned version + SHA-256 manifest, verify-or-refuse), `scrape-website` flow, `company-researcher`/`product-researcher` agents, `/hol-research-company` + `/hol-research-product` templates | Unit: bootstrap verify/refuse against local fixture (T-52); manual gate: scrape a small real vendor site → profiles created; re-run → idempotent summary; researcher output fact-checked once by the author |
| **M7** | Planning pipeline | M | `guide-planner` agent, `guide-scaffolds/guide-plan.md` + `lab-prep.md` templates, `/hol-plan` template (ID prompt up front, interview, approval loop), plan frontmatter validation in `hol_status` | Manual gate: plan a scratch guide (3 modules) → `plan.md` parses, `lab-prep.md` complete, checklist rubric run (scorer fanout works end-to-end with real scorers), plan approved & persisted |
| **M8** | Module pipeline | L | `module-planner` + `guide-implementer` agents, `/hol-plan-module`, `/hol-generate-module` (linter self-check loop, image checklist → placeholders), module-plan scoring | Manual gate: plan + generate 2 modules of the scratch guide → linter 0 errors on those sections; module states correct in `/hol-status`; resume behavior (re-run generate-module → overwrite prompt works) |
| **M9** | Scoring machinery | M | `holagent.scorer` agent, evaluation task templates finalized, `hol_scores` merge flows wired into generate/review prompts, fix-loop caps implemented (analytic 3; checklist escalate@5), trailing-JSON extraction + 1-retry | Manual gate: full module scoring pass on scratch guide; scores.json entries valid (T-38 shape); a deliberately weak module (planted gaps) produces findings ≥ 3 and a capped escalation; `--fresh` path tested |
| **M10** | Review + batch | M | 4 review templates (plan/module-plan/module/guide) with their rubric fanout tables, `/hol-generate-all` (state detection, sequential resume, `--fresh`), final rename step after passing guide review | Manual gate: generate-all resumes correctly after manual interruption (kill mid-module, re-run → picks up at right module); `/hol-review-guide` scorecard rendered; rename to `<ID>-<Title>.md` on user confirm |
| **M11** | Hardening & release | M | README per §06, ADRs written, `.gitignore` recommendations, troubleshooting table, `npm pack` + tag `v0.1.0`, final golden-path runbook pass | T-47/T-48 on the packed tarball; full manual E2E from §05 green; author sign-off on one real guide draft |

## Dependency notes

- M1 is the keystone for M2–M3 and for the M5/M7/M8 writers (everyone reads
  `guide-format`).
- M4 is independent of M5–M10 and can land early (CI value: the linter is usable
  from the CLI before any prompt exists).
- M9's rubric *content* is authored in M5; M9 wires the machinery. If scorer
  calibration is poor at the M9 gate, iterate rubric wording (M5 artifacts) before
  touching machinery.
- **Parallelization (if using subagents for the build):** M2/M3 (linter) and
  M5 (skills) are independent after M1 and can run in parallel lanes with separate
  worktrees; M6–M10 are sequential on the main lane. One writer per file at a time.

## Milestone gate format (manual LLM gates)

Each manual gate records in `docs/manual-e2e.md`: date, guide dir, commands run,
artifacts produced (paths), pass/fail per checklist item, anomalies. This is the
audit trail in place of automated E2E.
