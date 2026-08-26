# ADR-005: `guide.md` canonical during the pipeline; rename only after a passing review

- **Status**: Accepted (2026-08-25, design lock; first executed 2026-08-26
  at the M10 gate — `HOL-2000-01`)
- **References**: spec 08 A5/Q7; `prompts/hol-review-guide.md` Step 6;
  `extensions/hol-core.ts` (`resolveGuidePath`)

## Context

Tooling resolves the guide by one stable name; the final filename
`<ID>-<Title>.md` (majority-sample form; spaces preserved) is an
authoring/publishing decision that varies per guide.

## Decision

`guide.md` is the canonical working file for the lifetime of the pipeline.
Only when `/hol-review-guide` produces an all-passing scorecard **and** the
linter reports 0 errors does the parent offer the exact rename command
(`mv guides/<slug>/guide.md "guides/<slug>/<ID>-<Title>.md"`, name derived
from the plan frontmatter). The rename runs only after explicit user
confirmation. After the rename the guide has left the pipeline.

## Consequences

- Stable tooling paths: `hol_validate`/`hol_status`/the linter CLI always
  resolve `guide.md` — no per-guide name handling.
- A renamed guide is invisible to the tooling by design: `E-PATH` on a
  renamed dir is the expected signal; re-entering the pipeline requires
  restoring `guide.md` (the `.holagent/` state directory is kept as the
  record).
- The final name is an authoring decision, not a tooling one; the rename is
  one-way until the file is restored.
