---
name: lab-anti-patterns
description: Known drift classes and content traps in holagent lab guides — the prose companion to the linter rule set, plus content-level traps the linter cannot catch. Use when authoring, reviewing, or fixing guide content (planners, implementer, scorers).
---

# Lab Anti-Patterns

Two lists: **(a)** format drift the linter rejects (symptom → why it breaks →
house fix), and **(b)** content traps the linter cannot see. A guide that
passes `/hol-validate` but sits on list (b) is still a bad lab.

## (a) Format drift classes

| Drift                                                          | Why it breaks                                                                                                                            | House fix                                                                                                            |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Missing H1, or `# Lab Guide: <title>` / `# <title>`            | The platform and the pipeline key the guide off `# HOL-XXXX-NN <Title>` on the first line; without it the guide is unidentifiable (L001) | `# HOL-XXXX-NN <Title>` as the first line, ID assigned up front at `/hol-plan`                                       |
| TOC numbers duplicate or skip (`1, 2, 2, 3`)                   | Reads as a broken document; blocks the sequential check (L003)                                                                           | Renumber `1..N` consecutively                                                                                        |
| Stale TOC anchors (TOC link ≠ heading)                         | Links go dead; readers lose their way (L004)                                                                                             | Regenerate anchors from the actual headings (lowercase, punctuation stripped, spaces → hyphens; duplicates get `-1`) |
| `##` section missing from the TOC, or listed twice             | Coverage drift (L005)                                                                                                                    | The TOC links every non-TOC `##` section exactly once, by anchor (display titles may be shortened)                   |
| `## Phase N - …` / `## Lesson N` section headings              | The module contract is `## Module N:`; other forms break module tooling and scoring (L011)                                               | `## Module <N>: <Title>`, sequential from 1 (an h4 `#### Lesson n:` _inside_ a module is fine)                       |
| `## Lab Credentials:` at h2                                    | Breaks the preamble layout; credentials must sit before the Introduction as h3 (L006)                                                    | `### Lab Credentials:` (h3) with ≥1 credential line                                                                  |
| `## Introduction Overview` / `## Orientation` / other variants | The Introduction is a fixed contract (L008)                                                                                              | Exactly `## Introduction`                                                                                            |
| Introduction without `**Duration:**` / `**Objective:**`        | Scheduling and goal-setting depend on both (L009)                                                                                        | Add both; objective bullets led by action verbs                                                                      |
| `## Module N: Summary` — Summary folded into the last module   | The Summary must be standalone after the last module (L010)                                                                              | Move it out to a `## Summary` section (appendices may follow)                                                        |
| Callout variants `**Tip!**`, `**Use Case!**`, `_Lab Tip:_`     | Mixed variants flag W001 and look unreviewed                                                                                             | `**Tip:**`, `**Use Case:**`, `**Note:**`, `⚠️ **Important:**` only                                                   |
| Local or non-ImageProxy images (`![](x.png)`, other URLs)      | The platform only serves `/ImageProxy?filename=…` (L013)                                                                                 | ImageProxy form, or `<< INSERT SCREENSHOT: … >>` while pending                                                       |
| Raw HTML (`<script>`, `<iframe>`, `<img src=`, `onerror=`)     | Injection-grade content on a public lab platform (W007)                                                                                  | Delete; use the image syntax                                                                                         |
| `TODO` / `TBD` / `FIXME` tokens                                | Publishes an unfinished guide (W008)                                                                                                     | Resolve before publish; pending images use the screenshot placeholder, not `TODO`                                    |
| `##` section without `[Back to top](#table-of-contents)`       | Breaks the navigation contract (L012)                                                                                                    | End every `##` section with the back-to-top link (a `***` divider may follow)                                        |
| `### 1.1 Target Audience` (numbered audience heading)          | The audience heading is fixed (L007)                                                                                                     | `### Target Audience` (h3) before the Introduction                                                                   |
| Commands that fail shellcheck (parse errors, bad quoting)      | The embedded terminal runs them verbatim; a parse error strands the learner (L014)                                                       | Write real bash; run `hol_validate` before publishing                                                                |

## (b) Lab authoring traps

- **Marketing fluff in steps.** "Experience the power of the RAG pipeline"
  is not a step. Every step is an action with an observable outcome.
- **Steps with no verifiable outcome.** If the learner cannot tell whether
  the step worked, the step is broken — add the expected output or state.
- **Missing or wrong expected output.** Show it verbatim when known (a few
  lines is enough); name the signal when it varies. A command with no stated
  result trains the learner to distrust the next one.
- **Commands that only test existence.** `command -v kubectl` or
  `[ -f config ]` pass while the capability is down. When the capability
  implies function (auth, a reachable backend, an importable package), check
  function: `curl …/v2/health/ready` → 200; `ls` + `wc -l` with an expected
  count range.
- **Credential / host / port drift.** Any host, port, or credential that
  differs from the `### Lab Credentials:` block flags W006 and confuses the
  reader. The credentials block is the single source of truth; the body uses
  its exact values.
- **Duplicated environment setup across modules.** "Install X" / "start the
  service" belongs in `lab-prep.md` (the environment is pre-provisioned),
  not repeated as steps. Record the dependency once in the module's
  environment delta instead.
- **Concept islands.** A module that consumes state the previous module did
  not produce, or that teaches a concept nothing later reuses. Fix the
  sequence (`depends_on`), not the prose.
- **Oversized modules.** 300+ lines splits attention; split at a concept
  boundary and renumber downstream modules.
- **Missing checkpoints on long command sequences.** 3+ command steps with
  no `> ✅ **Checkpoint:**` line (W004) — the learner has no point to verify
  before investing more time.
- **Screenshots promised but absent.** The module plan's `image_checklist`
  is a contract; missing or extra images flag W005.
- **Time estimates that ignore mistakes.** `est_minutes` is reading + doing
  - the error the learner will make, not the optimistic minimum.
- **Pseudo-commands.** Anything the learner must mentally finish
  (`kubectl apply -f <config>` with the filename left out) — the embedded
  terminal runs exactly what is inside the backticks.
