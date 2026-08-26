# holagent — Quickstart

A first-time user's guide: what the package's parts do, how they fit
together, how to drive the pipeline, and what you need before you start.
(Installation and the command reference live in the root `README.md`; this
document is the tour.)

## 1. What holagent is

holagent turns "I want a hands-on lab guide for X" into a finished,
house-style guide file. It does so in verifiable stages: **research** the
vendor/product context (optional), **plan** the guide with you, **plan each
module**, **generate each module** (with a live dry run of every command),
**validate** the format with a deterministic linter, and **score** content
quality with read-only rubric scorers — with a scorecard and a human gate at
every stage.

Four component kinds plus one executable library; the division of labor:
**prompts orchestrate, subagents work, skills carry knowledge, the extension
carries determinism.**

```
                       ┌─────────────────────────────────────────────┐
  you (chat)           │               PI SESSION                    │
 ────────────────────▶ │                                             │
 /hol-plan             │  PROMPT TEMPLATES (10)                      │
 /hol-generate-module  │  the main session orchestrates:             │
 /hol-review-guide …   │  interview → dispatch → verify →            │
                       │  fix-loop → merge → report → next command   │
                       └──────┬──────────────────────────┬──────────┘
            dispatch          │                          │ call tools
        (pi-subagents,        │                          │ (deterministic
            read-only /       ▼                          ▼  gates, no LLM)
           writer children) ┌─────────────────┐   ┌───────────────────────────┐
                            │  AGENTS (6)     │   │  EXTENSION               │
                            │  holagent.*     │   │  hol_validate / hol_status│
                            │                 │   │  / hol_scores (tools) +   │
                            │  planners,      │   │  /hol-validate /          │
                            │  implementer,   │   │  /hol-status (commands)   │
                            │  researchers,   │   │        │                  │
                            │  scorer         │   │        ▼                  │
                            └────────┬────────┘   │  LINTER (25 rules,        │
                                     │            │  shellcheck) + state I/O  │
                                     ▼            └─────────────┬─────────────┘
                            ┌─────────────────┐                  │
                            │  SKILLS (13)    │                  ▼
                            │  knowledge the  │   ┌───────────────────────────┐
                            │  agents read:   │   │  DATA                    │
                            │  format spec,   │   │  ~/.holagent/   research │
                            │  rubrics,       │   │  guides/<slug>/ guide +  │
                            │  scaffolds,     │   │  .holagent/     state    │
                            │  style corpus   │   └───────────────────────────┘
                            └─────────────────┘
```

- **Prompt templates** (`prompts/*.md`, 10 commands) are the only thing you
  ever type. They parse arguments, check state via the extension tools,
  dispatch the agents, run fix loops, merge scores, and present reports.
- **Agents** (`agents/*.md`, 6) are focused child sessions — see §3.
- **Skills** (`skills/*/SKILL.md`, 13) are knowledge the agents read on
  demand — see §4.
- **The extension** (`extensions/`) is the deterministic core — see §5.

## 2. How a guide flows

```
 /hol-research-company ─▶ /hol-research-product        (optional)
        (vendor context cached to ~/.holagent/)
                                   │
 /hol-plan ────▶ plan.md + lab-prep.md
        (interview → draft → plan-scope scoring)
                                   │
                    ★ YOU: approve / request changes / abort
                                   │
   ┌───────────────────────────────┼───────────────────────────────┐
   ▼                               ▼                               ▼
 module 1                       module 2                       module N
 /hol-plan-module              /hol-plan-module              /hol-plan-module
   │ (module-plan scoring; you review the report)
   ▼                               ▼                               ▼
 /hol-generate-module          /hol-generate-module          /hol-generate-module
   │  dry-run → write → lint → score → capped fix loop        │
   │                                                          │
   └───────────────────────────────┬───────────────────────────┘
                                   ▼
                          /hol-review-guide
                          (guide-scope scoring)
                                   │  all passed + linter 0 errors
                                   ▼
                        guide.md ──▶ <ID>-<Title>.md
                                   │
                    ★ YOU: confirm the rename (ADR-005)
                                   ▼
                       the guide has LEFT the pipeline
```

Per-module state machine (what `hol_status` reports):

```
unplanned ─▶ planned ─▶ generated ─▶ validated ─▶ scored-passed
                                       │
                                       └──────────▶ scored-escalated
```

(`generated` = section written; `validated` = linter 0 errors; the
`scored-*` states come from the 4-rubric module fanout. `--fresh` re-scores a
scope at round 1 instead of re-generating it.)

## 3. The agents — responsibilities and dependencies

Runtime names use the package scope: `holagent.<name>`. All six run with
isolated context (`inheritProjectContext: false`, `inheritSkills: false`,
`systemPromptMode: replace`) and **cannot spawn further subagents**
(`maxSubagentDepth: 0`) — orchestration stays in your session (ADR-001).
The only thing a child ever gets that is not in its task is the **skills**
listed in its frontmatter (injected knowledge) plus its tool allowlist.

| Agent                         | Responsibility                                                                                                                                                                                                                                                         | Tools (allowlist)                            | Skills it depends on                                                                                     |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `holagent.guide-planner`      | Drafts `plan.md` + `lab-prep.md` from your confirmed interview answers. Does **not** interview — the parent relays your answers. Returns a draft summary + open questions.                                                                                             | read, write, edit, bash, grep, find, ls      | guide-format, guide-scaffolds, evaluation, design-modules, load-context, lab-anti-patterns, style-corpus |
| `holagent.module-planner`     | Writes one `.holagent/<NN-slug>/plan.md` — step outline, environment delta, commands used, expected-output notes, image checklist, success criteria. Never touches `guide.md`.                                                                                         | read, write, edit, bash, grep, find, ls      | guide-format, guide-scaffolds, evaluation, design-modules, load-context, lab-anti-patterns, style-corpus |
| `holagent.guide-implementer`  | Authors exactly one `## Module N:` section from the module plan: real commands, verbatim expected outputs, checkpoints, `<< INSERT SCREENSHOT >>` placeholders. **Self-checks with the linter CLI** before reporting (bash is for that). Never rewrites other modules. | read, write, edit, bash, grep, find, ls      | guide-format, write-guides, match-writing-style, load-context, style-corpus, lab-anti-patterns           |
| `holagent.company-researcher` | Builds `company.md` + `style-guide.md` + the product list from **scraped local files only** — it never fetches anything itself.                                                                                                                                        | read, write, edit, bash, grep, find, ls      | research-company, analyze-writing-style, load-context                                                    |
| `holagent.product-researcher` | Builds `product.md` (capabilities, architecture, concepts, gotchas) from scraped product docs, tuned for lab authoring. Never fetches.                                                                                                                                 | read, write, edit, bash, grep, find, ls      | research-product, load-context                                                                           |
| `holagent.scorer`             | Scores **one rubric against one content slice** (plan, module plan, module section, or the full guide). Ends its reply with exactly one fenced JSON block (ADR-006).                                                                                                   | read, grep, find, ls — **no bash, no write** | evaluation                                                                                               |

Dependency notes:

- **Writers** (planner/implementer/researchers) depend on `guide-format`
  (the house format spec), `style-corpus` (four sample guides — the style
  ground truth), `lab-anti-patterns` (drift checklist), and `load-context`
  (where everything lives). The implementer additionally depends on
  `write-guides` + `match-writing-style` for prose conventions.
- **Scorers** depend on nothing but the `evaluation` skill — and even its
  rubric text is inlined verbatim into the task, so scoring is
  reproducible from the task file alone. Scorers are dispatched with
  `acceptance: false` (a harness requirement, not a preference).
- **Researchers** depend on the scraper binary, which the `scrape-website`
  skill bootstraps (pinned version + SHA-256) into `~/.holagent/bin/`.
  The researchers then only ever read the cached files.
- `bash` on writer agents is for the linter CLI and local file helpers —
  not for fetching. Network I/O is confined to the parent's scraper
  bootstrap.

## 4. The skills — the knowledge layer

| Skill                   | What it gives the agents                                                                                                                                                                                                |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `guide-format`          | The house format standard: `SKILL.md` (rules prose) + `format.json` (the executable spec the linter implements — 25 rules, L = error, W = warning).                                                                     |
| `guide-scaffolds`       | The plan / module-plan / section skeletons, incl. the frontmatter subset rule (mini-YAML quoting).                                                                                                                      |
| `write-guides`          | Module-authoring conventions: step anatomy, expected-output discipline, checkpoint style, screenshot placeholder form.                                                                                                  |
| `match-writing-style`   | How to apply company tone/voice/terminology from the researched profiles.                                                                                                                                               |
| `design-modules`        | Module-design heuristics: pacing, one concept per module, verifiable success criteria, environment deltas.                                                                                                              |
| `lab-anti-patterns`     | The drift checklist (credentials/host drift, jargon without definition, fabricated outputs, …) that plans and sections are checked against.                                                                             |
| `style-corpus`          | The four in-house sample guides — the style ground truth everything is compared against.                                                                                                                                |
| `evaluation`            | The scoring system: `scoring-guide.md` (inlined into every scorer task), the **13 rubrics** (plan / module-plan / module / guide scopes), and `scorer-prompts.md` (task templates + dispatch contract + fanout tables). |
| `load-context`          | Path conventions (`~/.holagent`, `guides/<slug>/.holagent`), two-phase discovery, and the per-command context matrix.                                                                                                   |
| `scrape-website`        | Scraper CLI usage + the pinned bootstrap flow (`~/.holagent/bin/scraper`, version + SHA-256 from `scraper-manifest.json`).                                                                                              |
| `research-company`      | The company scrape/analysis workflow (primary domain, external-domain confirmation, docs sites).                                                                                                                        |
| `research-product`      | The product-profile workflow.                                                                                                                                                                                           |
| `analyze-writing-style` | Extracts tone/voice/term-substitution rules from scraped documentation.                                                                                                                                                 |

## 5. The extension — the deterministic core

`extensions/hol.ts` is thin on purpose (ADR-007): it only **registers**; all
logic lives in the pure, unit-tested `extensions/hol-core.ts`.

- **Three LLM-callable tools** (what the prompt templates use):
  - `hol_validate` — run the linter on a guide dir; record
    `.holagent/last-validation.json`.
  - `hol_status` — the state machine: plan validity, per-module states, last
    validation, research profiles, and the next recommended command.
  - `hol_scores` — read / **atomically merge** / remove scoring entries in
    `.holagent/scores.json` (merge validates every entry first, then
    temp+rename; `remove` clears one scope — the `--fresh` path).
- **Two LLM-bypass commands** (what _you_ can run without a model):
  `/hol-validate [guideDir]` and `/hol-status [guideDir]`. Same core, no LLM
  in the path — the gates you're shown are the actual linter/status verdicts.
- **`session_start` hook** — creates `~/.holagent` (mode 0700, idempotent)
  and warns, at session start, if pi-subagents is missing (the
  deterministic surface keeps working either way).
- **The linter** (`extensions/linter/`) — the executable format spec: a
  line-based scanner (no Markdown AST, ADR-004) collects structural facts
  (headings, TOC, images, callouts, command candidates, frontmatter via a
  hand-written mini-YAML parser); 25 rules interpret them; extracted inline
  commands are shellchecked (L014 parse errors / W014 style). CLI:
  `node --experimental-strip-types extensions/linter/cli.ts <guideDir>` —
  exit `0` clean (warnings allowed), `1` errors, `2` warnings-only, `3`
  usage/config error.
- **Scraper bootstrap** (`extensions/bootstrap-scraper.ts`) — downloads the
  pinned scraper binary (version + SHA-256 from package-root
  `scraper-manifest.json`) into `~/.holagent/bin/scraper` on first research
  use. The SHA check makes the manifest a supply-chain record.

## 6. Scoring — how quality is judged

Two independent tiers: the **linter** enforces format (mechanical, blocking);
**scorers** enforce content quality (semantic, per rubric). Each scoring
scope fans out one read-only `holagent.scorer` per rubric (ADR-001):

```
                 parent = your session
   builds one task per rubric (scoring guide + rubric + content, verbatim)
        ┌─────────────────┬─────────────────┬─────────────────┐
        ▼                 ▼                 ▼
  scorer (rubric A)  scorer (rubric B)  scorer (rubric C)     read-only
        │                 │                 │
        ▼                 ▼                 ▼
  trailing JSON       trailing JSON       trailing JSON
        └─────────────────┴─────────────────┘
                          ▼
        parent: extract last JSON block → validate shape →
                RECOMPUTE score/status from the criterion scores
                          ▼
        hol_scores merge — one atomic write per scope
                          ▼
                    scorecard + (fix loop if any entry failed)
```

- **Thresholds**: checklist rubrics must be 1.0 (every criterion met);
  analytic/holistic rubrics must average ≥ 4 (5 = fully met, 3 = a real gap
  a reader would hit). A passing entry can still carry sub-5 findings —
  they're recorded for the review, but only `failed` entries drive the fix
  loop.
- **Fix loop (capped)**: a failing entry gets one implementer dispatch per
  round carrying the findings verbatim; re-lint, then re-score only the
  failed rubrics at `rounds: previous + 1`. Analytic/holistic rubrics cap at
  3 rounds; checklist rubrics escalate at 5 rounds without improvement.
  Anything that fails its cap is recorded `escalated` and surfaced to you.
- **`--fresh`**: clears the scope's history and re-scores at round 1
  (re-score without regenerating). Use it after hand-edits or rubric
  wording changes.
- **Unparseable scorer output**: one automatic retry; then the entry is
  recorded `escalated` with finding `"scorer output unparseable"` — the
  system never guesses a score.

## 7. Invoking the pipeline

Install once (see README), then from your Pi session:

```
/hol-research-company [url:<vendor-site> slug:<slug>]   # optional
/hol-research-product <product> [company:<slug>]        # optional
/hol-plan [topic]                 # interview → plan → scoring → YOUR approval
/hol-plan-module <module>         # per module (module = 2 | 02-slug | title fragment)
/hol-generate-module <module>     # dry-run → author → lint → score → fix loop
/hol-generate-all [--fresh]       # …or run the whole per-module pipeline in order
/hol-review-guide                 # final guide-scope review → rename offer
```

Working practices:

- **Run inside `guides/<slug>/`** (or pass a `guideDir` to the two
  extension commands). `/hol-plan` creates that directory once you confirm
  the slug.
- **`/clear` freely between stages** — state lives in files, not the
  conversation. Interrupted? Just re-run the command; every template
  re-detects state via `hol_status` and resumes.
- **You drive the pace**: each stage ends with a report (scorecard, state,
  next recommended command) and waits. The hard human gates are: the
  **plan approval loop** (`/hol-plan` — approve / request changes / abort),
  **overwrite confirmation** when regenerating a module that already has a
  section, and the **final rename** after a passing `/hol-review-guide`
  (ADR-005).
- Check state any time with `/hol-status`; re-lint any time with
  `/hol-validate`.

## 8. What you need up front

**Environment**

| Item                                                  | Required?                    | Notes                                                                                                                                                                                                                          |
| ----------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pi + the **pi-subagents** extension                   | yes                          | hard peer — without it the plan/generate/review commands stop at their prerequisites step (the extension warns at session start).                                                                                              |
| Node 22                                               | yes (bundled with Pi)        | runs the linter/extension/tests; no build step.                                                                                                                                                                                |
| `shellcheck` (`apt install shellcheck`)               | optional                     | without it the report says `shellcheck: "skipped (shellcheck not installed)"`; only L014/W014 are affected.                                                                                                                    |
| Outbound network                                      | only for research, first run | the scraper binary downloads once, pinned + SHA-256-verified.                                                                                                                                                                  |
| The lab environment (or a local replica, e.g. Docker) | yes, for generation          | the parent **dry-runs each module's commands** and captures verbatim expected outputs. If the lab isn't available locally, the steps degrade to "capture during the dry run" signals — don't ship a guide with unseen outputs. |

**Information** (collected by the `/hol-plan` interview — have it handy)

- The **guide ID** (`HOL-XXXX-NN` format) and a **title + slug** — the slug
  becomes `guides/<slug>/`.
- **Target audience**, **objectives** (the plan's measurable goals), and an
  approximate **duration**.
- The **environment block**: hosts, ports, and credentials the learner will
  use. holagent's convention is deliberately weak, _published_ demo
  credentials (e.g. `demouser / Password123!`) — the `### Lab Credentials:`
  block in the guide is the single source of truth the whole body must
  match (the linter and the `credentials-consistent` rubric both enforce
  this).
- Your **module roadmap intent** (how many modules, rough order) — the
  planner proposes, you approve.
- For research steps: the vendor **website URL** (or an existing research
  slug if you've researched this company before — `~/.holagent` caches it).

The environment is **pre-provisioned** by design: holagent never writes
provisioning (ADR-003). `lab-prep.md` (written at `/hol-plan`) is the
handoff for whoever builds the lab — it lists what must exist (images,
fixtures like `/lab/corpus.json`, services down by default, ports free) so
the guide's first module can prove "is the lab alive?".

## 9. After the pipeline

- **Screenshots**: generated guides carry `<< INSERT SCREENSHOT: … >>`
  placeholders (one per item in each module plan's image checklist). Upload
  the real screenshots and replace the placeholder with
  `![Image](/ImageProxy?filename=<uuid>/<file>.png "Click to enlarge"){data-modal=true}`.
- **`lab-prep.md`** goes to the environment builders; the guide file itself
  is what you publish.
- **The rename leaves the pipeline**: after you confirm the ADR-005 rename,
  `guide.md` no longer exists and the tooling reports `E-PATH` for that dir
  on purpose. To re-enter the pipeline (e.g. a later update), restore
  `guide.md` — the `.holagent/` state directory is preserved as the record.

## 10. Where to look next

- `README.md` — install, full command reference, troubleshooting table.
- `docs/linter-rules.md` — every linter rule with an example fix (generated
  from `format.json`).
- `docs/manual-e2e.md` — the milestone-gate runbook (what "verified" means
  for this package).
- `docs/adr/` — the seven architecture decisions, with context and
  consequences.
- `spec/` — the build specification this package was constructed from.
