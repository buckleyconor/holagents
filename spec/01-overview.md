# 01 — Overview

> **Status: this spec describes the v0.1.0 guide-authoring build (milestones
> M0–M11), which shipped as specified.** It is the historical build contract and
> is still cited by code comments (`spec §02 §4.1`, `spec 07 M9`), so its section
> numbering is load-bearing — but it does **not** describe the package as it stands.
>
> v0.2.0 extended holagent from guide authoring to the whole lab lifecycle
> (concept → spec → build → QA → guide → ship). For that work see
> `docs/lifecycle-plan.md` (the plan), `docs/adr/README.md` (ADRs 008–017, the
> decisions), and `README.md` / `docs/quickstart.md` (the current shape).

## Problem

Authoring hands-on lab guides (HOL) for Dell AI solutions is currently manual: each guide
requires product research, structural planning, careful module-by-module authoring, and
quality checking against an unwritten house standard. The four existing sample guides
(show the drift: broken TOC numbering, stale anchors, `Module` vs `Phase` headings,
inconsistent callouts) demonstrate that consistency depends on the individual author.

**holagent** makes the pipeline explicit, reproducible, and agent-driven.

## What we are building

A single installable **Pi.dev agent package** (`holagent-lab-guides`) that provides 12
`hol-*` commands running the full guide lifecycle:

```
research (vendor/product) → plan → plan modules → generate modules →
validate (deterministic linter) → score (rubric fanout) → review → done
```

A guide is **one Markdown file** (`guide.md`) targeting a **pre-provisioned lab
environment** (browser + embedded terminal, pre-staged pods/data, fixed demo
credentials). The environment itself is built by other tooling — holagent consumes an
environment description and emits a human-facing **lab prep spec** for environment
builders.

### Provenance

The architecture derives from an existing Claude Code plugin
(`instruqt/ai-plugins`, the "track" plugin) that performs the same pipeline for a
different platform's track format. That plugin is used here as an **architecture
reference only**. All branding, format, and domain content is holagent's own.
(See `08-open-questions.md` Q1–Q2 for the provenance assumptions.)

## Goals

| #   | Goal                                                                                                                                                                                      | Measurable as                                                                                                                                  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | **Plan** — `/hol-plan` interviews the user (guide ID up front, audience, objectives, environment) and produces `.holagent/plan.md` + `lab-prep.md`, scored and approved before generation | Plan file parses; checklist rubric 100%; user approval recorded                                                                                |
| G2  | **Generate** — `/hol-generate-module <slug>` authors one `## Module N:` section into `guide.md` that is format-conformant                                                                 | Linter: 0 errors on the guide after each module                                                                                                |
| G3  | **Validate** — `/hol-validate` gives a deterministic pass/fail with stable rule IDs, including shellcheck on extracted inline commands                                                    | Reproducible report; rule IDs stable across runs; exit codes per `02-architecture.md` §Interfaces                                              |
| G4  | **Score** — rubric scoring (checklist 0/1, analytic 1–5, holistic 1–5) with parent-owned parallel fanout and bounded fix loops                                                            | Every scorer returns strict JSON; scores persisted to `.holagent/scores.json`; fix loops capped (analytic 3 rounds, checklist escalation at 5) |
| G5  | **Research** — vendor site scrape → reusable company profile + style guide; product research → product profile, cached in `~/.holagent/`                                                  | Research done once per company/product; reused by later guides                                                                                 |
| G6  | **State** — `/hol-status` renders pipeline state; `/hol-generate-all` is idempotent and resumable                                                                                         | Re-running any command never corrupts or duplicates state                                                                                      |

## Success criteria (acceptance)

1. **Golden path**: a new 5-module guide is produced end-to-end with 0 linter errors,
   checklist 100%, analytic mean ≥ 4, holistic ≥ 4.
2. **Drift detection**: the linter regression suite (the four sample guides) reports the
   known drift classes as errors (broken TOC numbering, stale anchors, `Phase`
   headings, missing H1/ID) — see `05-test-strategy.md` corpus tests.
3. **Zero provenance branding**: `grep -ri instruqt` over the package returns nothing
   (CI-enforced).
4. **Reusability**: a second guide for the same company/product reuses cached research
   with no re-scrape.
5. **Install**: one command (`pi install git:<repo>@<tag>`) makes all 12 commands
   available; no manual steps beyond optional `shellcheck`.

## Non-goals (out of scope, v1)

- Lab **environment provisioning** (VM images, K8s/Helm charts, sample data staging) —
  holagent emits a prep spec, not the environment.
- **Screenshot capture** and image upload to the lab platform (guides use
  `<< INSERT SCREENSHOT: … >>` placeholders; authors fill in real
  `/ImageProxy?filename=<uuid>/<file>` links later).
- **Publishing/upload** of guides to the lab platform.
- **Automated end-to-end lab execution** (no Instruqt-style `track test`); testing =
  linter + rubric scoring + optional manual lab run confirmed by the author.
- **Standalone scripts** beyond guide-embedded inline commands (no lifecycle
  setup/check/solve/cleanup script layer).
- **i18n** — English only.
- Any network service, daemon, or production deployment of the tool itself.

## Users

| Persona                                            | Role                                                                                       |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Lab-guide author / technical content engineer      | Primary user; runs the `hol-*` commands, approves plans, fills screenshots, final sign-off |
| Field technical specialist / AI solution architect | Indirect; consumes the finished guides in the lab environment                              |
| Lab environment builder                            | Indirect; consumes `lab-prep.md` from `/hol-plan`                                          |

## Operating context

- Single team, local use; ~5–20 guides/yr, 3–9 modules each, 10–25 KB Markdown per guide.
- Dev machine: Ubuntu 24.04.4 LTS, x86_64, Node 22 (bundled with pi 22.22.3).
- Generated content targets: dev sandbox containers (browser + embedded terminal) and
  production Charmed Kubernetes (x86, NVIDIA RTX PRO 6000, Blackwell `sm_120`).
- Data: demo lab credentials (deliberately weak), scraped vendor content, internal style
  corpus; no PII.
