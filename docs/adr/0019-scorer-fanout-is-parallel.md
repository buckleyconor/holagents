# ADR-019: Scorer fanout is parallel (supersedes ADR-001's sequential consequence)

- **Status**: Accepted (2026-09-12)
- **References**: ADR-001, ADR-006; `skills/evaluation/scorer-prompts.md`;
  the scoring steps of every `/hol-*` prompt template; `agents/scorer.md`

## Context

ADR-001's consequence recorded that scorer fanout "runs as sequential blocking
`subagent` dispatches (harness allows one subagent call per turn)", and ADR-006
required `acceptance: false` on every scorer dispatch because the harness
injected an acceptance-report prompt whose output-strip regex deleted the
scorer's trailing JSON.

The harness has since gained `workflowScript` + `runs.all([...])` — ordinary
parallel fanout with per-item options, including `acceptance`. The two
constraints that forced sequential dispatch no longer hold.

## Decision

Scorer fanout is **parallel**: one `subagent` call per scoring phase, a
`workflowScript` running `runs.all([...])`, one item per rubric, `async: false`
(blocking) and `acceptance: false` on every item. The parent still owns the
fanout, extraction, recomputation, merge and fix loop — ADR-001's decision is
unchanged; only the dispatch mechanism moved.

Tasks are **path-based**, not inline. The workflow sandbox has no filesystem,
so inlining the scoring guide, rubric and content would force large Markdown
(full of backticks and quotes) through JS-string escaping — fragile, and the
source of the M10 50KB inline-truncation incident. Each task names the scoring
guide, rubric and content by absolute path; the scorer (which has
`read`/`grep`/`find`/`ls`) reads them before scoring. This is stronger than
inlining: it reads the committed files, so there is no truncation and no drift
between the scored text and disk.

## Consequences

- Scoring fanout wall-clock drops from N sequential dispatches to one parallel
  wave (max fanout 4 — module/plan/concept). Token cost is unchanged.
- The task templates in `scorer-prompts.md` collapse to one path-based shape
  plus a per-scope content-paths table; the 15 scoring prompt templates no
  longer repeat the inline composition.
- `acceptance: false` is kept per item. Current harness versions may infer "no
  acceptance" for read-only agents, but the explicit flag is version-proof;
  ADR-006's rationale is preserved and only its "sequential" consequence is
  superseded.
- Retry-on-parse-failure moves from inline to a second small `runs.all`/
  `runs.run` wave for the failed rubric(s).
- Read-only scorers write nothing, so parallel dispatch has no write-conflict
  risk; the "one writer per cwd" rule does not apply to them.
- Content that is a slice (the module `## Module <N>:` section) is passed as a
  file path plus a locator; the scorer greps the heading and reads only that
  section.
