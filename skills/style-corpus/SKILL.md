---
name: style-corpus
description: The four reference lab guides and how to use them as the executable style spec. Use when authoring or scoring guide content — cadence, command style, checkpoint wording, image placement — or when calibrating what house style means in practice.
---

# Style Corpus

Four real team lab guides live in `./samples/` (next to this file). They are
the executable style spec: where prose guidance and a sample disagree, the
**linter** decides format (run `/hol-validate`) and the samples decide
craft. Read them before writing or scoring guide content.

## What each sample is best for

| Sample                                | Best read for                                                                                                                                                                                                   |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HOL-1354-01 … VSS …`                 | Closest to clean house structure. Read the skeleton (TOC + module headings) and Module 1 end-to-end; the UI-driven cadence (action → what to see → screenshot → next action) is the model                       |
| `HOL-1356-01 … Sign Language Tutor …` | Richest module-body craft: tab-indented commands, expected outputs, "expected oddity" callouts, checkpoints, subsections. The embedded-terminal pattern (Modules 1–2) and the checkpoint wording come from here |
| `HOL-1330-01 … run:AI …`              | Long-module structure with `#### Lesson n:` subheadings and a multi-module arc (cluster → assets → deploy)                                                                                                      |
| `HOL-1345-01 … RAG 2.3 …`             | Credentials/audience preamble, feature/use-case framing, and the Appendix pattern (sample questions grouped by vertical)                                                                                        |

## Reading protocol

1. **Skeleton first:** H1, TOC, `## Module` headings, Summary — two minutes
   per sample. Note the arc (orientation → guided work → independent
   application) and the module count.
2. **One full module end-to-end:** in 1354, Module 1; in 1356, Module 2.
   Read as the learner would — every step, every command, every expected
   output, every screenshot.
3. Keep the sample open while drafting a comparable module — match the
   cadence, not the wording.

## Imitate

- **Step cadence:** action → immediate observable result → (screenshot) →
  next action; short paragraphs between steps.
- **Command style:** tab-indented single-backtick spans, one command per
  line, expected output stated verbatim or by the signal to look for.
- **Checkpoint wording:** one sentence naming a verifiable end state
  (`> ✅ **Checkpoint:** Triton is serving your ISL model.`).
- **Image placement:** immediately after the step that produces the state;
  one image per state.
- **The why:** one line of explanation on non-obvious steps ("the ONNX is
  the portable artefact; the engine is hardware-specific") — the why is what
  makes the lab educational.

## Avoid (drift actually present in the samples)

| Sample | Drift to avoid                                                                                                                                                                                                                                          |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1330   | `**Tip!**` / `**Use Case!**` callout variants (house: `**Tip:**` / `**Use Case:**`); no H1/ID line at all                                                                                                                                               |
| 1345   | `## Phase N - …` section headings (house: `## Module N:`); `## Lab Credentials:` at h2 (house: h3); `## Introduction Overview` (house: `## Introduction`); `### 1.1 Target Audience` (house: unnumbered); no standalone `## Summary`; stale TOC anchors |
| 1354   | No H1/ID line; duplicate `2.` in the TOC numbering                                                                                                                                                                                                      |
| 1356   | `## Module 9: Summary` folds the Summary into a module (house: standalone `## Summary`); Introduction missing from the TOC; `# Lab Guide: …` H1 drift                                                                                                   |

The house fixes for every row are in the `lab-anti-patterns` skill and are
enforced by `hol_validate`.

## Ground rules

- The samples are references, not templates: copy structure and cadence,
  never copy credentials, hosts, or product claims into a new guide.
- Where a sample and `guide-format` disagree, the linter wins — the drift
  rows above exist precisely because real guides drifted.
- When a review or scorecard cites the corpus, cite by guide ID and
  module ("1356, Module 2, step 2.2"), not by file name.
