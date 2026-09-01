---
description: Review this lab against a platform team's requirements — platform-reviewer writes severity-tagged findings, deterministic shape gate, platform-scope scoring, pre-meeting brief, then appends whatever the team flags back into requirements.md.
argument-hint: '<platform>'
---

Review the lab at/above the current directory against a platform's
requirements. Platform argument: $@

Two outputs: a findings file, and a brief for the meeting where this gets
argued about. Follow the steps in order. Stop and report at the first hard
failure.

## 1. Prerequisites

- **pi-subagents**: the `subagent` tool must be available. If it is not, stop:
  "pi-subagents is not loaded — install/enable it and retry."
- **Locate the package skills**: `platform-requirements`, `evaluation`,
  `load-context`. Read `platform-requirements/SKILL.md` (the taxonomy, the
  five parts of a finding, the severity definitions) and
  `evaluation/scorer-prompts.md` (platform-scope task template) now.

## 2. State check

- Resolve the platform slug. If the argument is missing, offer the platforms in
  `.holagent/lab-ref.json` and those with a requirements file.
- If `~/.holagent/platforms/<name>/requirements.md` does not exist, stop:
  "no requirements recorded for `<name>` — run `/hol-platform-init <name>`."
  There is nothing to review against, and reviewing against general good
  practice is exactly what this command must not do.
- Run `hol_status`. If `.holagent/lab-ref.json` is absent, stop and direct the
  user to `/hol-lab-register <repo-path>` (or `/hol-adopt` for an existing lab)
  — the review reads the lab's own repo, and there is nothing to read until it
  is registered.
- Run `hol_platform_findings` (`platform: <name>`). If a review already exists,
  show its severity rollup and date; this run **replaces** it, so say that and
  keep the old blockers in view for comparison at step 7.
- Note whether `lab-prep.md` exists. Without it the `resources`, `networking`
  and `security` categories are reviewed from artifacts alone — say so; a
  review with no contract is thinner and the report should admit it.

## 3. Load context (cheap, per `load-context`)

- Read `~/.holagent/platforms/<name>/requirements.md` in full, including its
  Open questions and Change log. Note every `assumed` entry.
- Discover the lab repo's deployment artifacts (`ls`, `find`): compose files,
  `k8s/`, `helm/`, Dockerfiles, Terraform/OVF, Makefile, `scripts/`, CI config.
  Do not read them here — the reviewer does that.

## 4. Dispatch the platform-reviewer (blocking)

`subagent` tool — `agent: "holagent.platform-reviewer"`, `async: false`. Task
payload (self-contained):

- **Paths**: absolute lab dir; absolute lab repo; the requirements file; write
  `.holagent/platform/<name>.json` in the lab dir and nothing else.
- The artifact inventory from step 3.
- The platform slug and the requirements file's `updated` date.
- Reminders: report only, never change the lab or the requirements file;
  read-only and local — no network, no probing; **review only against what the
  requirements file says**, and put everything it is silent on into `unknowns`
  rather than inventing a finding; five parts per finding, every observation
  carrying a locator; severity is consequence, not annoyance; an empty findings
  list is a legitimate result.

## 5. Deterministic gate

- Run the `hol_platform_findings` tool (`platform: <name>`). Require
  `ok: true`. It fails on invalid JSON, a missing field, a duplicate `id`, an
  unknown `severity` or `owner`, and a missing `requirements_source`.
- On failure, re-dispatch the reviewer **once** with the specific problems
  listed. Still failing → stop and report what is outstanding.

## 6. Score (scorer fanout, platform scope)

- Platform-scope rubrics — full fanout, one scorer each:
  `checklist/platform-coverage` (threshold 1.0),
  `analytic/finding-actionability` (4).
- Build one task per rubric from the **platform-scope template** in
  `evaluation/scorer-prompts.md`: `scoring-guide.md` verbatim + the rubric file
  verbatim + scope label `platform-<name>` + content = the findings file, plus
  the requirements file and `lab-prep.md` under their own sub-headings.
- Dispatch `subagent` — `agent: "holagent.scorer"`, `async: false`, one call
  per turn (sequential blocking), **`acceptance: false`** (mandatory — without
  it the harness strips the scorer's trailing JSON block).
- **Extract the last fenced JSON block** of each result. Parse/shape failure →
  re-run that single scorer **once**; still failing → record
  `status: "escalated"`, finding "scorer output unparseable".
- Entry gate per rubric: checklist pass rate ≥ 1.0, analytic mean ≥ threshold →
  `passed`, else `failed`. The parent recomputes `score`/`status` from the
  criterion scores before merging (defense in depth).
- Merge with the `hol_scores` tool (`action: "merge"`), `scope:
"platform-<name>"`, one entry per rubric.

## 7. The pre-meeting brief

Present, in this order — this is what someone walking into the meeting needs:

1. **What we do not comply with** — blockers first, then should-fixes, owned by
   `us`. Requirement, evidence, and the change, one line each.
2. **What we need from them** — the asks, specific enough to be actioned in the
   meeting rather than researched after it.
3. **What they will ask us** — the questions the requirements imply and the lab
   does not answer, plus every `unknown`.
4. The severity rollup, the scorecard, and **every `assumed` requirement this
   review leaned on** — the shakiest ground in the report.
5. If a previous review existed: what changed since — closed, new, worsened.

## 8. Grow the knowledge base — do not skip this

End by asking: **"Did the team flag anything new?"**

Whatever comes back — a rule you did not have, a correction to one you did, an
`assumed` entry confirmed or denied — append it to
`~/.holagent/platforms/<name>/requirements.md`:

- add or amend the row in its category, with the source (who, when) and
  confidence `stated`;
- promote any `assumed` entry the team confirmed, and **delete any they
  contradicted** rather than keeping both;
- move answered items out of Open questions;
- add a Change log row: date, what was learned, source;
- bump `updated` in the frontmatter, and add a `sources` entry.

Never rewrite the change log, and never silently overwrite a stated
requirement — an amendment is a new row plus a log line, so the history stays
readable.

A requirement learned in a meeting and not written down will be learned again,
in another meeting. This step is why the second review is better than the first.

## Note on inventing findings

The temptation is to fill a thin review with general good practice — pinned
digests, non-root containers, network policies. Resist it. This report's whole
authority is that every finding traces to something the platform team actually
requires; one invented finding and the next review gets read as opinion. Where
the requirements are silent, write an `unknown` and take it to the meeting.
