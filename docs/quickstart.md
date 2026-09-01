# holagent — Quickstart

A first-time user's guide: what the package's parts do, how they fit together,
how to drive the lifecycle, and what you need before you start. (Installation
and the full command reference live in the root `README.md`; this document is
the tour.)

## 1. What holagent is

holagent turns "we should have a lab that demonstrates X" into a lab that
exists, works, and has a guide and a launch write-up — in verifiable stages,
each ending at a deterministic gate, a scorecard, and you.

Six stages:

| Stage         | You run                                                    | You get                                                         |
| ------------- | ---------------------------------------------------------- | --------------------------------------------------------------- |
| 1 **concept** | `/hol-concept`                                             | `concept.md` (story, personas, beats, aha moment) + `sizing.md` |
| 2 **spec**    | `/hol-lab-register` → `/hol-spec`                          | the ten-section spec in the lab's own repo + `lab-prep.md`      |
| 3 **build**   | `/hol-build` · `/hol-qa`                                   | the lab, milestone by milestone, verified against its contract  |
| 4 **guide**   | `/hol-plan` → `/hol-generate-module` → `/hol-review-guide` | the guide file                                                  |
| 5 **ship**    | `/hol-platform-check` · `/hol-launch`                      | platform findings + the launch collateral                       |

**Most existing labs skip stages 1–3.** `/hol-adopt` reverse-engineers the
environment contract from a lab repo and a running dev instance, marks the
stages that were never done as inherited, and drops you at stage 4 (ADR-013).

Four component kinds plus one executable library; the division of labor:
**prompts orchestrate, subagents work, skills carry knowledge, the extension
carries determinism.**

```
                       ┌─────────────────────────────────────────────┐
  you (chat)           │               PI SESSION                    │
 ────────────────────▶ │                                             │
 /hol-concept          │  PROMPT TEMPLATES (24)                      │
 /hol-spec /hol-build  │  the main session orchestrates:             │
 /hol-qa /hol-plan     │  interview → dispatch → gate →              │
 /hol-launch …         │  fix-loop → merge → report → next command   │
                       └──────┬──────────────────────────┬──────────┘
            dispatch          │                          │ call tools
        (pi-subagents,        │                          │ (deterministic
            read-only /       ▼                          ▼  gates, no LLM)
           writer children) ┌─────────────────┐   ┌───────────────────────────┐
                            │  AGENTS (14)    │   │  EXTENSION                │
                            │  holagent.*     │   │  11 tools (hol_*) +       │
                            │                 │   │  /hol-validate            │
                            │  authors,       │   │  /hol-status (commands)   │
                            │  builders,      │   │        │                  │
                            │  reviewers,     │   │        ▼                  │
                            │  scorers        │   │  hol-core.ts + linter     │
                            └────────┬────────┘   └───────────┬───────────────┘
                                     │ read                   │ read/write
                                     ▼                        ▼
                            ┌──────────────────────────────────────────┐
                            │  SKILLS (18) — the knowledge layer       │
                            │  formats, methods, rubrics, templates    │
                            └──────────────────────────────────────────┘
                                     files on disk = the only state
```

**State lives in files, never in the conversation.** `/clear` freely between
stages; every command re-detects where it is from disk and resumes.

## 2. How a lab flows

```
 /hol-research-company ─▶ /hol-research-product          (optional, cached to ~/.holagent/)
                                   │
 STAGE 1  /hol-concept ──▶ .holagent/concept.md + sizing.md
                                   │  ★ YOU: approve / request changes / abort
 STAGE 2  /hol-lab-register <repo-path>        (ADR-008 — you confirm the external path)
          /hol-spec ─────▶ <lab-repo>/spec/01…08.md + lab-prep.md
                                   │  gate: hol_spec_check (section 8 must be substantive)
                                   │  ★ YOU: approve
                ┌──────────────────┴──────────────────┐
                │  the two tracks are independent     │
                ▼                                     ▼
 STAGE 3  /hol-build <milestone>              STAGE 4  /hol-plan
          gate: the milestone's own test                │
          /hol-build-all  (resume the sequence)         ▼
                │                                    /hol-plan-module
                ▼                                       │
          /hol-qa --env <dev>                           ▼
          gate: hol_parity vs lab-prep.md            /hol-generate-module
                │  → dry-run material ───────────────▶  │  gate: linter 0 errors
                │                                       ▼
                │                                    /hol-review-guide
                │                                       │  ★ YOU: confirm the rename
                └───────────────────┬───────────────────┘
                                    ▼
 STAGE 5  /hol-platform-init <platform>   (once per platform — an interview)
          /hol-platform-check <platform> ─▶ findings + pre-meeting brief
          /hol-launch ───────────────────▶ launch/ (exec summary, catalogue, social)
                                            gate: hol_launch_check vs plan.md

 /hol-adopt <slug> --repo <path>  ─────────▶ enters at STAGE 4 (stages 1–3 inherited)
```

**Per-module state machine** (what `hol_status` reports):

```
unplanned ─▶ planned ─▶ generated ─▶ validated ─▶ scored-passed
                                       └────────▶ scored-escalated
```

**Per-milestone state machine** (stage 3):

```
pending ─▶ tested ─▶ scored-passed          (test-failed on a red test;
   └────▶ test-failed                        scored-escalated at the cap)
```

A milestone reaches `tested` only when **its own declared test command**
passes (ADR-015), and passing scores never outrank a failing test.

## 3. The agents — responsibilities and dependencies

Runtime names use the package scope: `holagent.<name>`. All fourteen run with
isolated context (`inheritProjectContext: false`, `inheritSkills: false`,
`systemPromptMode: replace`) and **cannot spawn further subagents**
(`maxSubagentDepth: 0`) — orchestration stays in your session (ADR-001). The
only thing a child gets that is not in its task is the **skills** listed in
its frontmatter, plus its tool allowlist. For how the parent actually moves state
between them — the dispatch shape, the three handoff media, and why there is no
flow configuration — see `docs/user-guide.md` §6.

| Stage | Agent                         | Responsibility                                                                                                                    |
| ----- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `holagent.concept-author`     | Writes `concept.md` from your confirmed interview answers: problem, personas, beats, aha moment, non-goals.                       |
| 1     | `holagent.sizing-architect`   | Writes `sizing.md`: production vs minimal demo footprint, what breaks if shrunk further, density math.                            |
| 2     | `holagent.spec-author`        | Writes the ten-section spec into the lab repo **and derives `lab-prep.md`** from the sizing rather than typing it from memory.    |
| 3     | `holagent.lab-builder`        | Implements **one** build milestone in the lab repo, code plus tests, and leaves it passing its own declared test.                 |
| 3     | `holagent.qa-runner`          | Brings the lab up on dev, exercises the spec's flows past where parity stops, captures verbatim dry-run output.                   |
| 4     | `holagent.guide-planner`      | Drafts `plan.md` + `lab-prep.md` from your confirmed answers. Does not interview — the parent relays.                             |
| 4     | `holagent.module-planner`     | Writes one module plan: step outline, environment delta, commands, image checklist, success criteria.                             |
| 4     | `holagent.guide-implementer`  | Authors exactly one `## Module N:` section. Self-checks with the linter CLI before reporting.                                     |
| 5     | `holagent.platform-reviewer`  | Reviews the lab against one platform team's written requirements; severity-tagged, traced, actionable findings.                   |
| 5     | `holagent.launch-writer`      | Writes the launch collateral. Every claim names its source or the sentence does not go in.                                        |
| —     | `holagent.lab-surveyor`       | Adoption: reverse-engineers `lab-prep.md` + an observed `sizing.md` from a repo and a running dev instance.                       |
| —     | `holagent.company-researcher` | Builds `company.md` + `style-guide.md` from **scraped local files only** — it never fetches.                                      |
| —     | `holagent.product-researcher` | Builds `product.md`, tuned for lab authoring. Never fetches.                                                                      |
| —     | `holagent.scorer`             | Scores **one rubric against one content slice**. Ends with exactly one fenced JSON block (ADR-006). Read-only: no bash, no write. |

Dependency notes:

- **Writers** depend on the skill that carries their method — `solution-story`
  and `lab-sizing` for stage 1, `spec-authoring` for stage 2, `guide-format` +
  `write-guides` + `style-corpus` for stage 4, `platform-requirements` and
  `launch-collateral` for stage 5 — plus `guide-scaffolds` (templates),
  `load-context` (where everything lives) and `lab-anti-patterns`.
- **Scorers** depend on nothing but `evaluation`, and even its rubric text is
  inlined verbatim into the task, so a score is reproducible from the task
  file alone. Dispatched with `acceptance: false` — a harness requirement, not
  a preference (see `evaluation/scorer-prompts.md`).
- **`bash` on writer agents** is for the linter CLI and local file helpers.
  `lab-builder` additionally runs the lab repo's own tests; `lab-surveyor` and
  `qa-runner` additionally run **read-only** commands against a `dev`
  environment, and nothing else — production is unreachable from any agent
  (ADR-012).
- **Nothing outside the project root is written** except through
  `lab-ref.json`, registered once with your explicit confirmation (ADR-008).

## 4. The skills — the knowledge layer

| Skill                   | What it gives the agents                                                                                                               |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `solution-story`        | Problem → personas → beats → aha moment. A beat is an action plus an observation; claims must survive "compared to what?"              |
| `lab-sizing`            | Size production honestly first, cut to the beat rather than to the floor, never shrink what the aha moment runs through; density math. |
| `spec-authoring`        | The ten-section spec contract (`template.md`), a proven filled instance (`worked-example.md`), and §7's machine-readable milestones.   |
| `platform-requirements` | The ten-category taxonomy, the interview question bank, and the five parts every finding needs.                                        |
| `launch-collateral`     | The claim-tracing table, four artifact briefs for four different readers, house tone, and the anti-patterns.                           |
| `guide-format`          | The house format standard: `SKILL.md` plus `format.json` — the executable spec the linter implements (25 rules).                       |
| `guide-scaffolds`       | Every copy-then-fill template, plus the frontmatter subset rule (mini-YAML quoting) the parser enforces.                               |
| `write-guides`          | Module-authoring conventions: step anatomy, expected-output discipline, checkpoints, screenshot placeholders.                          |
| `match-writing-style`   | Applying company tone/voice/terminology from the researched profiles.                                                                  |
| `design-modules`        | Module-design heuristics: pacing, one concept per module, verifiable success criteria, environment deltas.                             |
| `lab-anti-patterns`     | The drift checklist (credential/host drift, jargon, fabricated outputs) plans and sections are checked against.                        |
| `style-corpus`          | The four in-house sample guides — the style ground truth.                                                                              |
| `evaluation`            | `scoring-guide.md`, the **26 rubrics** across ten scopes, and `scorer-prompts.md` (task templates, dispatch contract, fanout table).   |
| `load-context`          | Path conventions, two-phase discovery, and the per-command context matrix.                                                             |
| `scrape-website`        | Scraper CLI usage and the pinned bootstrap (version + SHA-256 from `scraper-manifest.json`).                                           |
| `research-company`      | The company scrape/analysis workflow.                                                                                                  |
| `research-product`      | The product-profile workflow.                                                                                                          |
| `analyze-writing-style` | Extracts tone/voice/term-substitution rules from scraped documentation.                                                                |

## 5. The extension — the deterministic core

`extensions/hol.ts` is thin on purpose (ADR-007): it only **registers**; all
logic lives in the pure, unit-tested `extensions/hol-core.ts`.

**Eleven LLM-callable tools.** Five report state; six are stage gates.

| Tool                    | What it decides                                                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `hol_status`            | The whole state machine: lifecycle stages, milestones, modules, QA records, and the next recommended command.         |
| `hol_scores`            | Read / **atomically merge** / remove scoring entries (`remove` clears one scope — the `--fresh` path).                |
| `hol_validate`          | Run the linter on a guide dir; record `.holagent/last-validation.json`.                                               |
| `hol_spec_check`        | Stage 2: all eight sections, no unfilled markers, and a **substantive** section 8 — an empty one hides guesses.       |
| `hol_prep_check`        | The environment contract: seven keys, filled rows, and every `verify` check runnable unattended.                      |
| `hol_build_test`        | Stage 3: run **one milestone's own declared test** in the lab repo and record the result (ADR-015).                   |
| `hol_parity`            | Execute `lab-prep.md`'s `verify` checks against a **dev** environment. Refuses anything else — no override (ADR-012). |
| `hol_qa_script`         | Render the same checks as a read-only script for a human. Executes nothing; works for any environment.                |
| `hol_qa_record`         | Validated write of a smoke / production-e2e outcome; the environment's kind must match the record.                    |
| `hol_platform_findings` | Platform review findings are severity-tagged, traced, owned and actionable — and the pre-meeting brief, structured.   |
| `hol_launch_check`      | Stage 5: collateral is complete, fits the catalogue field, and **agrees with `plan.md`** on ID, title and duration.   |

- **Two LLM-bypass commands**: `/hol-validate [dir]` and `/hol-status [dir]`.
  Same core, no LLM in the path — the gates you're shown are the actual
  verdicts.
- **`session_start` hook** — creates `~/.holagent` (mode 0700, idempotent) and
  warns if pi-subagents is missing; the deterministic surface works either way.
- **The linter** (`extensions/linter/`) — a line-based scanner (no Markdown
  AST, ADR-004) feeding 25 rules, with shellcheck on extracted inline commands.
  CLI: `node --experimental-strip-types extensions/linter/cli.ts <guideDir>` —
  exit `0` clean, `1` errors, `2` warnings-only, `3` usage/config error.
- **Command execution** is confined to one function (`runShell`): `bash -c`,
  a timeout, a capture cap, and a killed command counts as a failure. It backs
  exactly two things — a milestone's declared test and a contract's declared
  `verify` checks.

## 6. Scoring — how quality is judged

Two independent tiers: **deterministic gates** decide what can be decided
(format, completeness, agreement, exit codes); **scorers** judge what cannot.
Each scope fans out one read-only `holagent.scorer` per rubric (ADR-001).

```
                 parent = your session
   builds one task per rubric (scoring guide + rubric + content, verbatim)
        ┌─────────────────┬─────────────────┬─────────────────┐
        ▼                 ▼                 ▼
  scorer (rubric A)  scorer (rubric B)  scorer (rubric C)     read-only
        └─────────────────┴─────────────────┘
                          ▼
        parent: extract last JSON block → validate shape →
                RECOMPUTE score/status from the criterion scores
                          ▼
        hol_scores merge — one atomic write per scope
                          ▼
                    scorecard + (fix loop if any entry failed)
```

Ten scopes, each gated before it is scored:

| Scope              | Rubrics | Gated by                                      |
| ------------------ | ------- | --------------------------------------------- |
| `concept`          | 3       | files exist, no unfilled markers              |
| `sizing`           | 1       | ″                                             |
| `spec`             | 3       | `hol_spec_check`                              |
| `build-<slug>`     | 2       | `hol_build_test` — a red test is never scored |
| `plan`             | 4       | plan frontmatter validation                   |
| `module-plan-<NN>` | 2       | module-plan validation                        |
| `module-<NN-slug>` | 4       | `hol_validate` — 0 errors in the section      |
| `guide`            | 3       | `hol_validate` — 0 errors                     |
| `platform-<name>`  | 2       | `hol_platform_findings`                       |
| `launch`           | 2       | `hol_launch_check`                            |

- **Thresholds**: checklist rubrics must be 1.0 (every criterion met);
  analytic/holistic rubrics must average ≥ 4. A passing entry can still carry
  sub-5 findings — recorded for the review, but only `failed` entries drive
  the fix loop.
- **Fix loop (capped)**: a failing entry gets one writer dispatch per round
  carrying the findings verbatim; re-gate, then re-score only the failed
  rubrics at `rounds: previous + 1`. Analytic/holistic cap at 3 rounds;
  checklist escalates at 5, or earlier if two consecutive rounds do not
  improve. Anything that hits its cap is recorded `escalated` and surfaced.
- **`--fresh`** clears a scope and re-scores at round 1 — after hand-edits, a
  rubric wording change, or to restart a stuck scope.
- **Unparseable scorer output**: one automatic retry, then `escalated` with
  finding `"scorer output unparseable"`. The system never guesses a score.

## 7. Invoking the lifecycle

Install once (see README), then from your Pi session:

```
# a new lab, from nothing
/hol-concept [topic]                    # story + footprint → YOUR approval
/hol-lab-register <repo-path>           # the external lab repo (you confirm the path)
/hol-spec                               # the spec set + lab-prep.md
/hol-build-all                          # every milestone, gated by its own test
/hol-qa --env <dev-environment>         # parity + a real bring-up → dry-run material
/hol-plan [topic]                       # the guide plan
/hol-generate-all                       # every module: author → lint → score
/hol-review-guide                       # final review → rename offer
/hol-platform-check <platform>          # does it meet the platform team's rules?
/hol-launch                             # exec summary, catalogue entry, posts

# an existing lab
/hol-adopt <slug> --repo <path> --env <name>=<endpoint>
/hol-plan …                             # then the stage-4 flow above, unchanged
```

Working practices:

- **Run inside `guides/<slug>/`** (or pass a `guideDir` to the two extension
  commands). `/hol-concept` and `/hol-adopt` create that directory.
- **`/clear` freely between stages.** Interrupted? Re-run the command; every
  template re-detects state via `hol_status` and resumes. `/hol-generate-all`
  and `/hol-build-all` print a resume table before doing anything.
- **You drive the pace.** Every stage ends with a report and waits. The hard
  human gates: the **concept**, **spec** and **launch** approval loops; the
  **adoption confirmation** (a reverse-engineered contract is a proposal, and
  it will get versions wrong); **overwrite confirmation** on regeneration; the
  **final rename** (ADR-005); and **all of production QA**, which is a script
  you run yourself.
- **Check state any time** with `/hol-status` — it prints the stage bar,
  milestones, modules, QA records and the next command. Re-lint any time with
  `/hol-validate`.

## 8. What you need up front

**Environment**

| Item                                | Required?                    | Notes                                                                                                               |
| ----------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Pi + the **pi-subagents** extension | yes                          | hard peer — without it every dispatching command stops at its prerequisites step (the extension warns at start).    |
| Node 22                             | yes (bundled with Pi)        | runs the linter/extension/tests; no build step.                                                                     |
| `shellcheck`                        | optional                     | without it the report says `shellcheck: "skipped"`; only L014/W014 are affected.                                    |
| Outbound network                    | only for research, first run | the scraper binary downloads once, pinned + SHA-256-verified.                                                       |
| A **lab repository**                | stages 2, 3, and stage 5     | registered once via `/hol-lab-register` or `/hol-adopt`; the only path outside the project root anything writes to. |
| A registered **dev** environment    | `/hol-qa`, `/hol-adopt`      | parity executes there and nowhere else. A lab with no dev environment simply cannot run automated QA (ADR-012).     |

**Information**

Stage 1 (`/hol-concept`) asks for: the solution and Dell pillar; the **business
problem in the customer's language**; who owns it and who signs for the fix;
the story you want to tell in 3–5 beats; the **aha moment**; the target
platform and how many concurrent instances; and what the lab deliberately
will not cover.

Stage 4 (`/hol-plan`) asks for: the **guide ID** (`HOL-XXXX-NN`), title and
slug; audience, objectives and duration; and the environment block — hosts,
ports, and credentials. holagent's convention is deliberately weak,
_published_ demo credentials (e.g. `demouser / Password123!`); the
`### Lab Credentials:` block is the single source of truth the whole body must
match, enforced by both the linter and a rubric.

Stage 5 (`/hol-platform-init`) is an interview with whoever runs the platform.
You do not need answers to all ten categories — an unanswered question becomes
an open question in the file, which is the agenda for the next conversation.

The **learner's** environment is pre-provisioned by design: a guide never
installs or provisions (ADR-003, unchanged). What changed is that
`lab-prep.md` is now a machine-readable contract the pipeline verifies
(ADR-011), rather than a document someone typed and hoped was accurate.

## 9. After the pipeline

- **Screenshots**: generated guides carry `<< INSERT SCREENSHOT: … >>`
  placeholders, one per image-checklist item. Replace each with
  `![Image](/ImageProxy?filename=<uuid>/<file>.png "Click to enlarge"){data-modal=true}`.
- **The rename leaves the pipeline**: after you confirm the ADR-005 rename,
  `guide.md` no longer exists and the tooling reports `E-PATH` for that dir on
  purpose. Restore `guide.md` to re-enter; `.holagent/` is preserved as the
  record.
- **Stage 5 is not the guide being finished.** `/hol-platform-check` and
  `/hol-launch` both come after it, and `hol_status` reports both under
  `ship`.
- **Production QA** stays yours: `/hol-qa-prod` renders the checks as a script,
  you run it, and it records what you report.

## 10. Where to look next

- `README.md` — install, the full command reference, troubleshooting.
- `docs/user-guide.md` — **where to join the pipeline when you already have
  part of a lab** (spec only, lab built but no guide, an existing environment
  with no spec), the per-command preconditions, and worked scenarios.
- `docs/adr/README.md` — the seventeen architecture decisions, indexed, with
  the shape they add up to.
- `docs/linter-rules.md` — every linter rule with an example fix (generated
  from `format.json`).
- `docs/lifecycle-plan.md` — the plan this lifecycle was built from: the human
  workflow, the gaps, and the phases that closed them.
- `docs/manual-e2e.md` — the gate runbook: what "verified" means here.
- `spec/` — the build specification the package itself was constructed from.
