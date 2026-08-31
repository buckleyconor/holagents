# holagent → HOL lab lifecycle — project context & plan

> **Self-contained briefing document.** Written to be pasted into a fresh chat with no prior context.
> Part 1 describes the repository as it exists. Part 2 describes the human workflow it is meant to automate
> and where the gaps are. Part 3 is the proposed plan. Nothing has been implemented yet.

---

# PART 1 — The project as it exists today

## What `holagent` is

A **Pi (pi.dev) agent package** — not a Claude Code `.claude/` layout. `package.json` carries a `pi` manifest (`extensions`, `skills`, `prompts`) plus a `pi-subagents` manifest (`agents`).

- Package `holagent-lab-guides` v0.1.0, `UNLICENSED` (internal team tool)
- Zero runtime dependencies; Node 22 with `--experimental-strip-types` (erasable TypeScript, **no build step**)
- Repo: `~/projects/holagents`, branch `main`, 17 commits mapping 1:1 onto milestones M0–M11, tagged v0.1.0

**What it does:** produces production-quality hands-on lab guides end-to-end. It researches vendor/product context, interviews the author into a guide plan, generates the guide module-by-module against a **pre-provisioned** lab environment, validates it with a deterministic linter, scores it with a rubric fanout, and offers a final user-confirmed rename.

Provenance: architecture derived from the Claude Code plugin `github.com/instruqt/ai-plugins` ("track" plugin: research → plan → generate → validate → score), rebranded and re-architected for Pi. The content standard — house style, linter rules, evaluation rubrics — is the team's own, derived from four real in-house lab guides.

## Component model

Four component types, with a deliberate separation of concerns:

| Type                         | Location                 | Role                                                                                           |
| ---------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------- |
| **Prompts** (slash commands) | `prompts/*.md`           | Orchestrate. The parent session owns interviews, fanout, merges, fix loops, approval gates.    |
| **Subagents**                | `agents/*.md`            | Do the work. Each writes one artifact class. Cannot spawn children.                            |
| **Skills**                   | `skills/<name>/SKILL.md` | Carry knowledge. All LLM-consumed knowledge lives here, referenced by skill-relative paths.    |
| **Extension**                | `extensions/*.ts`        | Carry determinism. Linter, state derivation, score merging — never mediated by model judgment. |

### The 6 agents

All share: `package: holagent`, `inheritProjectContext: false`, `inheritSkills: false`, `systemPromptMode: replace`, `maxSubagentDepth: 0`. None pin a `model:` — they inherit the parent session's model.

| Agent                | Writes                                                      | Notes                                                                                                                             |
| -------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `company-researcher` | `~/.holagent/companies/<slug>/company.md`, `style-guide.md` | Local files only, never fetches. Scraped content is untrusted data.                                                               |
| `product-researcher` | `~/.holagent/products/<co>/<prod>/product.md`               | Tuned to what a lab author needs: versions, workflows in teaching order, entry points, credentials.                               |
| `guide-planner`      | `.holagent/plan.md`, `lab-prep.md`                          | Never interviews — the parent relays confirmed answers. Never invents machine fields.                                             |
| `module-planner`     | `.holagent/<NN-slug>/plan.md`                               | Step outline, environment delta, commands, expected outputs, image checklist, success criteria.                                   |
| `guide-implementer`  | one `## Module N:` section of `guide.md`                    | Does not run the lab; the parent passes captured dry-run output. Self-lints before returning.                                     |
| `scorer`             | nothing (read-only)                                         | One rubric × one content slice. No bash/write/edit, so injected content cannot act. Emits exactly one trailing fenced JSON block. |

### The 13 skills

`guide-format` (house Markdown standard + `format.json`, the linter's rule config) · `guide-scaffolds` (7 copy-then-fill templates + the mini-YAML frontmatter rules) · `evaluation` (scoring system + 13 rubrics) · `design-modules` (sequencing, pacing, environment deltas) · `write-guides` (prose craft) · `lab-anti-patterns` (format drift + content traps the linter can't see) · `style-corpus` (4 real guides as the executable style spec) · `match-writing-style` · `analyze-writing-style` · `research-company` · `research-product` · `scrape-website` (pinned-binary bootstrap, verify-or-refuse SHA-256) · `load-context` (two-phase discovery + per-command context matrix).

### The 10 slash commands + 2 extension commands

```
/hol-research-company [url: slug:]      → company-researcher
/hol-research-product <product>         → product-researcher
/hol-plan [topic]                       → interview → guide-planner → 4-rubric score → approve
/hol-plan-module <module>               → module-planner → 2-rubric score
/hol-generate-module <module> [--fresh] → dry-run capture → guide-implementer → lint → 4-rubric score → capped fix loop
/hol-generate-all [--fresh]             → the above, all modules, resume-table driven
/hol-review-plan | -module-plan | -module | -guide  → re-score only
/hol-validate [dir]   ← extension command, no LLM
/hol-status [dir]     ← extension command, no LLM
```

Plus LLM-callable tools over the same pure core: `hol_validate`, `hol_status`, `hol_scores`.

## Data layout

```
~/.holagent/                          # research cache ($HOLAGENT_DATA_DIR), mode 0700
├── companies/<slug>/                 # company.md, style-guide.md, manifest.json, website/
├── products/<co>/<prod>/             # product.md, manifest.json, website/
└── bin/scraper                       # pinned binary, SHA-256 verified

guides/<slug>/
├── guide.md                          # canonical during the pipeline; final: "<ID>-<Title>.md"
├── lab-prep.md                       # environment handoff (prose, hand-typed)
└── .holagent/
    ├── plan.md                       # guide plan — frontmatter is machine source of truth
    ├── <NN-slug>/plan.md             # per-module plan
    ├── scores.json                   # scoring checkpoints, atomic temp+rename writes
    └── last-validation.json          # latest linter report
```

**Write confinement:** the package writes only under `~/.holagent/` and the active guide dir. `resolveGuidePath` (`extensions/hol-core.ts:88-94`) throws `E-PATH` on any path escaping the project root.

## Key schemas

**Guide plan frontmatter** (mini-YAML subset, real example):

```yaml
id: HOL-2000-01
title: 'Store and Search an Embedded Document Corpus'
slug: vector-corpus-search
audience: [...]        prerequisites: [...]     duration_minutes: 45
objectives: [...]
environment:
  baseline: 'Dev sandbox container, Ubuntu 24.04 (Docker 29.x available)'
  credentials: [...]   urls: [...]              preloaded: [...]
modules:
  - { n: 1, slug: launch-qdrant, title: '…', goal: '…', est_minutes: 10 }
```

**Mini-YAML subset** (`extensions/frontmatter.ts`, hand-written parser): top-level scalars, block lists, flow lists, one-line flow maps per list item, one level of nested maps. Forbidden: multi-line flow collections, trailing inline comments, anchors/aliases.

**Score entry:**

```json
{
  "scope": "module-01-launch-qdrant",
  "rubric": "analytic/step-clarity",
  "kind": "checklist|analytic|holistic",
  "status": "passed|failed|escalated",
  "score": 4.8,
  "rounds": 1,
  "findings": [{ "criterion": "…verbatim…", "score": 5, "finding": null }],
  "updated_at": "ISO-8601"
}
```

Scopes today: `plan` | `module-plan-<NN>` | `module-<NN-slug>` | `guide`.

**Module state machine** (derived from files + scores + last validation, `hol-core.ts:829-978`):
`unplanned → planned → generated → validated → scored-passed | scored-escalated`. A failing fresh lint run drops a scored module back to `generated`.

## Quality machinery

- **Deterministic:** 25 linter rules (L001–L015 errors, W001–W008/W014/W-SH warnings) configured in `skills/guide-format/format.json`, self-registering rule modules, optional `shellcheck` on inline commands. `runLint` is deterministic — byte-identical reports.
- **Judgment:** 13 rubrics across 3 families (checklist threshold 1.0, analytic/holistic threshold 4) and 4 scopes. Read-only scorer subagents, parent-owned fanout and merge.
- **Fix-loop caps:** analytic/holistic max 3 rounds → escalate; checklist max 5 rounds, immediate escalation if the pass rate doesn't improve across two consecutive rounds; unparseable scorer output escalates after 1 retry.
- **Tests/CI:** 103 test cases across 15 files (`node:test` on type-stripped TS). CI runs typecheck + tests + prettier + `package-smoke` + corpus regression. `package-smoke.mjs` asserts manifest paths exist, frontmatter is valid, no runtime deps, and **zero "instruqt"/"claude" strings** in shipped prompts/skills/agents.

## The 7 ADRs (`docs/adr/`)

| ADR | Decision                                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 001 | Parent owns scorer fanout, merge, fix loops, escalation; children never spawn children.                                              |
| 002 | All LLM-consumed knowledge lives inside skill dirs, referenced by skill-relative paths.                                              |
| 003 | **No lifecycle scripts** — environments are pre-provisioned; `lab-prep.md` is a handoff doc.                                         |
| 004 | Line-based linter with a hand-written mini-YAML parser; no Markdown AST, no deps, no build.                                          |
| 005 | `guide.md` is canonical; rename to `<ID>-<Title>.md` only after an all-passing scorecard + 0 errors + explicit user confirmation.    |
| 006 | Scorer output is exactly one trailing fenced JSON block; parent extracts, validates, recomputes, retries once, then escalates.       |
| 007 | `/hol-validate` and `/hol-status` are LLM-bypass extension commands — deterministic operations are never mediated by model judgment. |

## Declared non-goals (from `spec_builder_prompt.md`)

> lab environment provisioning (VM images, K8s/Helm, sample data), screenshot capture & image upload, publishing/upload to the lab platform, automated end-to-end lab execution, standalone scripts beyond guide-embedded commands, i18n

## Two loose files at the repo root

- `spec-generator-prompt.md` — a **reusable template**: an 8-section architect prompt with `{{PLACEHOLDERS}}` (Overview, Architecture, Build decisions, Security, Test strategy, Documentation plan, Build sequence, Open questions), plus a pre-flight checklist. Currently copy-pasted by hand into a frontier model.
- `spec_builder_prompt.md` — the **filled worked example** of that template that actually generated this repo's own `spec/` directory.

Neither is wired into any agent. This is the single biggest piece of manual work in the current process.

## What is proven

One real guide has been through the full pipeline: `guides/vector-corpus-search/` (HOL-2000-01, 3 modules, 25 score entries all passed, renamed and out of the pipeline). `docs/manual-e2e.md` (46 KB) is the audit trail of manual LLM gates M6–M11.

---

# PART 2 — The human workflow, and the gap

## Who and what

Conor is a **Solutions Architect at Dell**, building Hands-on-Lab (HOL) environments where users gain experience of specific Dell solutions. Team coverage: **Cyber Resilience, Storage, Networking, AI, and Client (laptops/desktops)**.

Labs run in either a **VMware Cloud Director (vCD) cloud** or a **Kubernetes cloud**, with **multiple instances of each lab running concurrently**. Efficiency is the dominant constraint — every environment must be shrunk to the smallest functional footprint that still demonstrates the solution to a single user.

## The nine steps, and what the repo covers

| #   | Step                                                                                                                                                                           | Coverage                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| 1   | Brainstorm the solution: research what it does, what business use-cases it solves, how to build a **story** around demonstrating that use-case                                 | ⚠️ Partial — researchers gather facts; nothing produces a narrative                                   |
| 2   | Research deployment environment and **footprint** (GPUs, RAM, storage, products, SW stack), then design a **minimal** demo environment — as small as possible while functional | ❌ Gap — `lab-prep.md` _records_ an environment; nothing _designs_ one                                |
| 3   | Populate `spec-generator-prompt.md`, feed to a frontier model, get spec documents for build / docs / lab guide                                                                 | ❌ Gap in the harness — manual copy-paste                                                             |
| 4   | Build the lab code                                                                                                                                                             | ❌ Gap                                                                                                |
| 5   | Write the step-by-step lab guide                                                                                                                                               | ✅ **Fully covered, and well**                                                                        |
| 6   | QA: smoke tests, dry runs, verify the environment matches the guide exactly, end-to-end testing                                                                                | ⚠️ Partial — linter + dry-run capture + a manual runbook; nothing executes against a live environment |
| 7   | Meet the vCD or Kubernetes team; fit the solution to their requirements (networking, security, storage, config format)                                                         | ❌ Gap                                                                                                |
| 8   | Final end-to-end QA once deployed in production                                                                                                                                | ❌ Gap                                                                                                |
| 9   | Generate social media posts, executive summaries, and lab descriptions to advertise internally                                                                                 | ❌ Gap                                                                                                |

**Assessment: the repo covers step 5 of 9.** Its own boundary says so explicitly — `skills/guide-scaffolds/lab-prep.md:3` reads _"Handoff artifact for the **(out-of-scope)** environment provisioning team."_ ADR-003 and the declared non-goals draw the same line.

**Nothing existing is redundant.** All 6 agents and 13 skills earn their place. The only files that change role are the two root spec prompts, which become a skill.

## Existing lab repos (the shape of the missing stages)

Labs live in **separate repos per lab**, e.g.:

- `~/projects/sign-tutor` — `spec_01_architecture.md` … `spec_05_lab_guide.md` (2,563 lines of specs generated by the manual step 3), `SOFTWARE_INVENTORY.md`, `docker-compose.yml`, `K8S/`, `src/`, `training/`, `triton_repo/`, `tests/`
- `~/projects/nemoclaw-lab-cl` — `deploy/`, `docker/`, `Makefile`, `services/`, `packs/`, `tests/`

**Critically: most existing HOL environments have no spec documents at all.** `sign-tutor` is the exception, not the rule.

---

# PART 3 — The plan

## Confirmed decisions

| Question                    | Decision                                                                                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lab code location           | **Separate repo per lab**, referenced from `.holagent/lab-ref.json`                                                                                                                   |
| Platform requirements       | **Tribal knowledge** — no written vCD/K8s requirement docs exist; the agent interviews and grows a requirements file per platform                                                     |
| Packaging                   | **Extend `holagent` in place**; no breaking changes to existing commands                                                                                                              |
| Build order                 | A: concept→spec · B: adopt + platform-fit · C: build+QA · D: launch collateral                                                                                                        |
| QA execution boundary       | `hol_parity` executes **only against the dev instance**. Production QA is never agent-executed — it emits a checklist + read-only script for the human to run, and records the result |
| Existing labs have no specs | Adoption **cannot** start from a spec. `/hol-adopt` reverse-engineers `lab-prep.md` from the running dev environment + whatever code exists                                           |
| Adoption scope              | Supported for **guide, QA, and platform-check** (skip concept/sizing/spec/build)                                                                                                      |

## Target architecture

```
STAGE 1  concept   /hol-concept        → .holagent/concept.md + sizing.md
STAGE 2  spec      /hol-spec           → <lab-repo>/spec/*.md + lab-prep.md
STAGE 3  build     /hol-build /hol-qa  → <lab-repo>/ code + tests + parity record
STAGE 4  guide     ★ EXISTS TODAY ★    → guide.md  (unchanged)
STAGE 5  ship      /hol-platform-check /hol-launch → findings + collateral

         /hol-adopt  ─────────────────┐  existing lab, no spec:
                                      └─▶ enter at STAGE 4, stages 1–3 marked `adopted`
```

### File layout

```
holagents/guides/<slug>/                    # the lifecycle root
├── guide.md                                # STAGE 4 (existing)
├── lab-prep.md                             # THE CONTRACT — now with frontmatter
├── launch/  exec-summary.md  catalogue-description.md  social.md    # STAGE 5
└── .holagent/
    ├── concept.md      # STAGE 1 — story, business use-case, demo beats
    ├── sizing.md       # STAGE 1 — footprint, minimisation, density
    ├── lab-ref.json    # pointer to the lab repo + environments + platform targets
    ├── qa/parity.json  qa/smoke.json  qa/e2e-prod.json              # STAGE 3/5
    ├── platform/<name>.json                                         # STAGE 5
    └── plan.md  <NN-slug>/plan.md  scores.json  last-validation.json  # existing

~/.holagent/platforms/<name>/requirements.md   # grown by interview

<lab-repo>/  spec/01-overview.md … 08-open-questions.md   # STAGE 2 writes
             src/ docker/ k8s/ tests/                     # STAGE 3 writes
```

---

## Phase A — core changes + Stage 1 & 2

### A0. Core changes (must land first)

**1. Guide-dir detection.** `isGuideDir` requires `guide.md` **and** `.holagent/` (`hol-core.ts:95-97`, `extensions/state.ts`). Stages 1–3 run before `guide.md` exists. Change to: `.holagent/` alone suffices, `guide.md` optional. Update `test/extension/core.test.ts` + `load.test.ts`.

**2. Lifecycle state.** `readGuideStatus` derives only plan + module state today, and `next` knows only `/hol-plan` / `/hol-generate-module` / `/hol-review-guide` (`hol-core.ts:955-961`). Add a `lifecycle` block to `GuideStatus`:

```ts
lifecycle: {
  concept: 'missing' | 'drafted' | 'approved' | 'adopted';
  sizing:  'missing' | 'drafted' | 'approved' | 'adopted';
  spec:    'missing' | 'drafted' | 'approved' | 'adopted';
  build:   'missing' | 'in-progress' | 'smoke-passed' | 'adopted';
  guide:   <existing module rollup>;
  ship:    { platform: …, launch: … };
}
```

Derived from file presence + `scores.json` scopes, exactly as module state is today. Extend `next` to walk stages in order. `/hol-status` prints a stage bar above the existing module list.

**3. `lab-prep.md` becomes machine-readable — the highest-value change in this plan.** Add mini-YAML frontmatter to `skills/guide-scaffolds/lab-prep.md`, with the existing prose tables rendered from it:

```yaml
baseline: 'Ubuntu 24.04 container, Docker 29.x'
software:    - { name: Triton, version: '25.02', where: /opt/tritonserver }
credentials: - { user: demouser, secret: 'Password123!', applies_to: 'sandbox shell' }
endpoints:   - { url: 'http://localhost:6333', purpose: 'Qdrant REST' }
artifacts:   - { path: /lab/corpus.json, purpose: 'document corpus' }
verify:      - { check: 'curl -sf http://localhost:6333/healthz', expect: 200 }
```

This turns "the guide matches the lab" from a rubric opinion (`analytic/environment-alignment`) into a **test** (`hol_parity`), and keeps `sizing.md → lab-prep.md → plan.md environment` in lockstep automatically. Add a validation check that the plan's `environment` block and `lab-prep.md` frontmatter agree.

**4. ADR-008 — external lab repo reference.** Write confinement stays for **hol-core's own writes**. `lab-ref.json` records an absolute path outside the project root, registered once via `/hol-lab-register <path>` with explicit user confirmation; builder/QA agents write there through ordinary `write`/`bash` tools, never through hol-core.

```json
{
  "repo": "/home/democenter/projects/sign-tutor",
  "origin": "adopted | generated",
  "platforms": ["k8s", "vcd"],
  "environments": [
    { "name": "dev-gb10", "kind": "dev", "endpoint": "https://…" },
    { "name": "prod-k8s", "kind": "prod", "endpoint": "https://…" }
  ]
}
```

**5. ADR-012 — dev-only execution boundary.** Any tool that executes against a lab environment takes an environment **name** and hard-refuses anything whose `kind` is not `dev`. Enforced in the extension (ADR-007 territory), not in a prompt — the model cannot talk its way past it.

**6.** ADR-009 lifecycle state machine · ADR-010 scoping ADR-003 (the _guide_ still has no lifecycle scripts; the _lab repo_ does) · ADR-011 lab-prep as a machine-readable contract.

### A1. Stage 1 — `/hol-concept`

- **Command** `prompts/hol-concept.md` — parent-conducted interview, same shape as `prompts/hol-plan.md` (prerequisites → state check → cheap context load → batched interview → dispatch → validate → score → approval loop). Interview covers: solution + Dell pillar (Cyber Resilience / Storage / Networking / AI / Client), target persona, business problem, the "aha" moment, research to reuse.
- **Agent** `agents/concept-author.md` → `.holagent/concept.md`: business problem, who cares and why, demo story arc and its beats, the aha moment, differentiation, success criteria, explicit non-goals.
- **Agent** `agents/sizing-architect.md` → `.holagent/sizing.md`: production footprint vs **minimal demo footprint** per component (GPU/vRAM, RAM, vCPU, storage, network), the reduction decisions and what breaks if shrunk further, software stack + versions + licensing, **density math** (N concurrent instances on vCD / K8s), candidate deployment target.
- **Skills** `solution-story` (use-case → narrative → demo beats; anti-patterns: feature tours, unverifiable claims) and `lab-sizing` (minimisation playbook — quantisation, model/replica sizing, shared vs per-tenant services, ephemeral vs persistent; a worked density example).
- **Rubrics** (scope `concept`): `checklist/concept-completeness` (1.0), `analytic/business-value` (4), `analytic/footprint-realism` (4), `holistic/story-coherence` (4).

### A2. Stage 2 — `/hol-spec`

Replaces the manual "fill the prompt, paste into a frontier model" loop.

- **Skill** `skills/spec-authoring/` — folds in both root files: `spec-generator-prompt.md` → `template.md` (the 8-section contract), `spec_builder_prompt.md` → `worked-example.md` (a proven filled instance). Extended with two HOL-specific sections: **environment & footprint spec** (from `sizing.md`) and **platform-target constraints** (from `~/.holagent/platforms/*/requirements.md`).
- **Command** `prompts/hol-spec.md` — requires approved `concept.md` + `sizing.md`; registers the lab repo; dispatches; validates; scores; approval loop.
- **Agent** `agents/spec-author.md` → `<lab-repo>/spec/01-overview.md … 08-open-questions.md`, **and generates `lab-prep.md`** from the sizing + architecture (the contract is derived, not typed).
- **Rubrics** (scope `spec`): `checklist/spec-completeness` (1.0), `analytic/spec-buildability` (4 — "could an agent build this without guessing?"), `holistic/spec-coherence` (4).
- **Deterministic gate:** section 8 (Open Questions & Assumptions) must be non-empty — straight from `spec-generator-prompt.md:145`: _"If that section is empty, the model probably hid guesses inside the design."_

**Phase A deliverable:** `/hol-concept` → `/hol-spec` → (existing) `/hol-plan`. Workflow steps 1–3 automated, feeding the guide pipeline that already works.

---

## Phase B — adoption on-ramp + platform fit

### B0. `/hol-adopt` — enter the lifecycle at Stage 4

Most existing HOL environments have **no spec documents**, so adoption must work backwards from what exists. This is what makes the rest of Phase B usable on the current catalogue rather than only on labs built from scratch.

- **Command** `prompts/hol-adopt.md` — `/hol-adopt <slug> --repo <path> --env <dev-endpoint>`. Creates `guides/<slug>/.holagent/`, registers `lab-ref.json` with `origin: "adopted"`, dispatches the surveyor, presents the reconstructed contract for confirmation.
- **Agent** `agents/lab-surveyor.md` — inspects deployment artifacts (compose files, K8s manifests, Makefile, Dockerfiles, inventory notes) **and** the running dev environment, and reverse-engineers:
  - `lab-prep.md` with full frontmatter — baseline, software + versions, credentials, endpoints, artifacts, and `verify` checks derived from real health endpoints;
  - a thin `.holagent/sizing.md` — observed footprint, so platform-check and density conversations have numbers;
  - **no `concept.md`, no `spec/`** — those stages are marked `adopted` and skipped, not fabricated.
- Everything inferred is presented for confirmation before it is written — a reverse-engineered contract is a _proposal_, and it will get versions and paths wrong.

**Shortest path to value on the existing catalogue:** A0 + B0 + B1 alone gives platform-fit review and guide authoring against labs like `sign-tutor` and `nemoclaw-lab-cl`, without building Stages 1–3 at all.

### B1. Platform fit

- **Command** `prompts/hol-platform-init.md` — first run per platform (`vcd`, `k8s`) conducts a structured interview → `~/.holagent/platforms/<name>/requirements.md`. Question bank: networking (ingress, egress, segmentation, DNS), security (image provenance/scanning, privileged containers, secrets, RBAC), storage (classes, persistence, quotas), config format (compose vs Helm vs OVF vs Terraform), registry, tenancy/isolation, resource quotas, naming conventions, backup/lifecycle, and what the team needs _from you_ before onboarding.
- **Command** `prompts/hol-platform-check.md` — dispatches the reviewer, then **ends by asking "did the team flag anything new?"** and appends. The knowledge base grows after every meeting.
- **Agent** `agents/platform-reviewer.md` — reads the lab repo's deployment artifacts + `lab-prep.md` frontmatter + `sizing.md`, checks against `requirements.md`, writes `.holagent/platform/<name>.json` with severity-tagged findings (`blocker` / `should-fix` / `note`), and produces a **pre-meeting brief**: what we don't comply with, what we need from them, what they'll ask.
- **Skill** `skills/platform-requirements/` — question bank + requirement taxonomy, so vCD and K8s interviews stay consistent and comparable.
- **Rubrics** (scope `platform-<name>`): `checklist/platform-coverage` (1.0), `analytic/finding-actionability` (4).

---

## Phase C — Stage 3: build + QA

- **Commands** `hol-build.md` (one spec milestone), `hol-build-all.md` (resume-table driven, mirroring `hol-generate-all.md`), `hol-qa.md`, `hol-qa-prod.md`, `hol-lab-register.md`.
- **Agent** `agents/lab-builder.md` — implements one milestone from `<lab-repo>/spec/07-build-sequence.md` at a time, each independently testable, writing code + tests in the lab repo. Same discipline as `guide-implementer`: one unit per dispatch, self-check before returning.
- **Agent** `agents/qa-runner.md` — smoke tests, dry runs, guide↔environment parity.
- **Tool** `hol_parity` — parses `lab-prep.md` frontmatter, executes the declared `verify` checks plus endpoint/artifact/version assertions, records `.holagent/qa/parity.json`. Takes an environment **name** and **refuses any environment whose `kind` is not `dev`** (ADR-012).
- **Production QA never executes.** `/hol-qa-prod` renders the same checks as a copy-pasteable verification script + human checklist; you run it against production and the result is recorded to `.holagent/qa/e2e-prod.json`. Covers workflow step 8 without handing an agent production credentials.
- The dry-run material `/hol-generate-module` currently captures by hand can now be sourced from a real, parity-verified dev environment — closing the loop between Stage 3 and Stage 4.
- **Rubrics** (scope `build-<milestone>`): `checklist/milestone-completeness` (1.0), `analytic/spec-fidelity` (4).

---

## Phase D — Stage 5b: launch collateral

- **Command** `prompts/hol-launch.md`; **Agent** `agents/launch-writer.md`.
- Reads `guide.md` + `concept.md` + `sizing.md`; writes `guides/<slug>/launch/`: `exec-summary.md`, `catalogue-description.md` (short + long blurb, abstract, prerequisites), `social.md` (internal post variants), optional `enablement-brief.md` (SE talk track).
- **Skill** `skills/launch-collateral/` — per-artifact format + house tone + anti-patterns (no hype, no unverifiable claims).
- **Rubrics** (scope `launch`): `checklist/launch-completeness` (1.0), `analytic/claim-traceability` (4 — every claim traceable to the guide or spec; prevents marketing fiction).

---

## Conventions every new component must follow

- **ADR-001**: parent-owned fanout. New agents get `maxSubagentDepth: 0`, `inheritProjectContext: false`, `inheritSkills: false`, `systemPromptMode: replace`. The prompt template owns scoring, merging, fix loops, escalation.
- **ADR-006**: scorers emit exactly one trailing fenced JSON block; dispatch with `acceptance: false`.
- **ADR-002**: all LLM-consumed knowledge lives in skill dirs, referenced by skill-relative paths.
- **ADR-007**: anything deterministic goes in the extension, not model judgment.
- New `scores.json` scopes: `concept`, `spec`, `build-<milestone>`, `platform-<name>`, `launch` (`validateScoreEntry`).
- New rows in `skills/load-context/SKILL.md`'s per-command context matrix.
- `package-smoke.mjs` rejects "instruqt" and "claude" in shipped prompts/skills/agents.
- Every core change gets tests; CI runs typecheck + node:test + prettier + package-smoke + corpus.
- Package description and README reframed from "lab guides" to "lab lifecycle". **All existing command names and behaviour unchanged.**

---

## Verification

**Per phase:** `npm test`, `npm run format:check`, `npm run docs:rules` drift check, `node scripts/package-smoke.mjs` on a fresh `npm pack` — all green in CI.

**Phase A end-to-end**, on a real lab:

1. `/hol-concept "Dell PowerProtect cyber recovery vault"` → `concept.md` + `sizing.md` → scorecard → approve.
2. `/hol-lab-register ~/projects/<lab>` → `lab-ref.json` written, confirmation prompt shown.
3. `/hol-spec` → `<lab-repo>/spec/01…08.md` + generated `lab-prep.md` → Open-Questions gate fires → approve.
4. `/hol-status` shows the stage bar and `next: /hol-plan`.
5. `/hol-plan` (unchanged) consumes the generated `lab-prep.md` and still produces a valid `plan.md` — regression proof that Stage 4 is untouched.
6. `/clear` between every stage; each command re-detects state from disk.

**Regression proof for A0:** re-run `guides/vector-corpus-search/` through `/hol-status`, `/hol-validate`, `/hol-review-guide` — identical results before and after.

**Phase B:**

1. `/hol-adopt sign-tutor --repo ~/projects/sign-tutor --env <dev>` → surveyor reconstructs `lab-prep.md` + `sizing.md`; verify every inferred version/path against `SOFTWARE_INVENTORY.md` and `docker-compose.yml` by hand — this is where reverse-engineering accuracy gets judged.
2. `/hol-status` shows `concept: adopted · spec: adopted · guide: ○`, `next: /hol-plan`.
3. `/hol-platform-init k8s` → `requirements.md`; `/hol-platform-check k8s` against `~/projects/nemoclaw-lab-cl` → findings JSON + pre-meeting brief; confirm the append-new-requirements loop.

**Phase C:** `/hol-build` one milestone → tests pass. `/hol-qa --env dev-gb10` → `parity.json` flags a deliberately broken `lab-prep.md` entry. **ADR-012 negative test:** `/hol-qa --env prod-k8s` must refuse, and must still refuse when asked nicely to override — asserted in `test/extension/`. `/hol-qa-prod` emits a script that runs clean by hand.

**Phase D:** `/hol-launch` on HOL-2000-01 → collateral generated; `analytic/claim-traceability` catches a planted unverifiable claim.

---

## Smaller things to settle during build

1. Spec file layout for **new** labs: `spec/01-overview.md` (proposed, matches this repo's own `spec/`) vs `spec_01_architecture.md` flat (what `sign-tutor` uses). Only affects Phase A.
2. Whether `/hol-adopt` should seed a `concept.md` retroactively — Phase D launch collateral otherwise has no business-value source for existing labs. Suggest offering an optional short interview at adoption time rather than inferring it.
