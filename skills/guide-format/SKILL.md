---
name: guide-format
description: House format standard for holagent lab guides (Markdown). Use whenever authoring, editing, or checking a guide file: section skeleton, TOC/anchor rules, module conventions, callouts, image syntax, and the known drift classes. The linter (hol_validate / /hol-validate) is the arbiter; this skill explains why.
---

# Guide Format

The house standard for holagent lab guides. A guide is **one Markdown file**
(`guides/<slug>/guide.md`) rendered by the lab platform against a
**pre-provisioned** environment. When in doubt, run `/hol-validate` — the linter is
the arbiter and its rules are configured in this skill's `format.json`.

## Document skeleton (exact order)

1. `# <ID> <Title>` — H1, first line. ID format `HOL-XXXX-NN` (e.g. `HOL-1345-01`),
   assigned by the author up front. `# HOL-1345-01 NVIDIA Enterprise RAG 2.3 Blueprint`
2. `ℹ️ You can resize or hide the lab guide anytime by sliding it left or right.` —
   the platform notice, **verbatim**, within the first 3 non-empty lines.
3. `## Table of Contents` — numbered list `1..N`; every entry
   `- [n. Title](#anchor)`; anchors must resolve to real headings (GitHub anchor
   rules: lowercase, punctuation stripped, spaces → hyphens; duplicates get `-1`,
   `-2` suffixes).
4. `### Lab Credentials:` — **h3**, before the Introduction. At least one line with
   Username/Password (optionally FQDN/IP). **Single source of truth** for every
   credential and host URL used anywhere in the guide (W006 flags drift).
5. `### Target Audience` — **h3**, audience list.
6. `## Introduction` — exactly this heading (no "Overview"/"Orientation" variants).
   Must contain `**Duration:**` (estimated minutes) and `**Objective:**`
   (intro sentence + bullets, action-verb led). Prerequisites may follow here or as
   their own subsection.
7. `## Module 1: <Title>` … `## Module N: <Title>` — the body. Numbering is
   sequential from 1; always `## Module <N>:` (never `## Phase N - …`, never
   `## Lesson N` at section level).
8. `## Summary` — standalone section **after the last module** (never folded into a
   module heading like "Module 9: Summary").
9. `## Appendix I: …` — optional, after Summary.
10. Every `##` section ends with `[Back to top](#table-of-contents)` (a `***`
    divider may follow).
11. TOC coverage: every `##` section (except Table of Contents) appears in the TOC
    exactly once, and display numbers are sequential.

## Module body conventions

- **Steps**: numbered list (`1.` style). UI actions name the control in bold with
  quotes: Click the **"New Collection"** button.
- **Commands**: tab-indented (or 4 spaces), single backtick span, one command per
  line. These lines are **extracted and shellchecked** (L014/W014) — write them as
  real shell:

  ```
  	`curl -s http://triton:8000/v2/health`
  	`python training/extract_landmarks.py --src datasets/isl_frames`
  ```

  Prose in backticks (capital-start, no shell tokens) is not treated as a command.

- **Expected results**: state them after each command/action ("200 returned is a
  successful result"). Never leave a step without an observable outcome.
- **Checkpoints**: `> ✅ **Checkpoint:** <verifiable end state>` — at least one per
  module that has 3+ command steps (W004).
- **Callouts** (standard forms only; mixed variants trigger W001):
  `**Tip:**` · `**Note:**` · `⚠️ **Important:**` · `**Use Case:**` · `> 💡 <tip>`
- **Images**: exactly one of
  - uploaded: `![Image](/ImageProxy?filename=<uuid>/<file>.png "Click to enlarge"){data-modal=true}`
  - pending: `<< INSERT SCREENSHOT: <what the reader should see> >>`
    (W005 cross-checks the module plan's image checklist against actual images.)

## Known drift classes (what NOT to emit)

| Drift                                           | Fix                                       |
| ----------------------------------------------- | ----------------------------------------- |
| Missing H1/ID, or `# Lab Guide: <title>`        | `# HOL-XXXX-NN <Title>` first line        |
| TOC with duplicate or skipped numbers           | Renumber 1..N consecutively               |
| Stale anchors (TOC text ≠ heading text)         | Regenerate anchors from headings          |
| `## Phase N - …` / `## Lesson N` sections       | `## Module N: …`                          |
| `## Lab Credentials:` (h2)                      | `### Lab Credentials:` (h3)               |
| `### 1.1 Target Audience`                       | `### Target Audience`                     |
| `## Introduction Overview` / `## Orientation`   | `## Introduction`                         |
| `## Module N: Summary`                          | Standalone `## Summary` after last module |
| `**Tip!**`, `**Use Case!**`                     | `**Tip:**`, `**Use Case:**`               |
| Bare `![](x.png)` / missing `{data-modal=true}` | Full ImageProxy form or placeholder       |
| Raw HTML (`<script>`, `<img src=`, `onerror=`)  | Remove; use image syntax (W007)           |
| `TODO`/`TBD`/`FIXME` markers                    | Resolve before publish (W008)             |

## Linter

- `/hol-validate [guideDir]` — deterministic report; errors (L0xx) block,
  warnings (W0xx) advise. Rule config: `format.json` (this directory).
- Rules: L001–L014 (errors), W001–W008 + W014 + W-SH (warnings). See
  `docs/linter-rules.md` (generated from `format.json`) for the full table.
- A module is **validated** only when the linter reports 0 errors.
