# ADR-006: Scorer output = single trailing fenced JSON block (no `outputSchema` reliance)

- **Status**: Accepted (2026-08-25, design lock; hardening applied at the M5
  gate, 2026-08-26)
- **References**: spec 02 §4.4; `skills/evaluation/scorer-prompts.md`;
  `extensions/hol-core.ts` (`validateScoreEntry`)

## Context

Scorers run as pi-subagents children. `workflowScript` item options do not
guarantee structured-output schemas, and the dispatch path in use (blocking
single-child `subagent` calls with `acceptance: false`) has no reliable
per-item `outputSchema` support. The scoring contract must be parseable and
testable end-to-end.

## Decision

Every scorer task inlines the full output contract. The scorer ends its
reply with exactly ONE fenced JSON block — the envelope
`{rubric, scope, kind, status, score, findings[]}` — with no prose after
it. The parent extracts the **last** fenced JSON block, validates the shape
(`validateScoreEntry`), and recomputes `score`/`status` from the criterion
scores before merging. On parse/shape failure the parent re-runs that single
scorer once (max 1 retry); still failing → the entry is recorded with
`status: "escalated"` and finding `"scorer output unparseable"`. Scorers
must never emit an `acceptance-report` fence: the runtime strips
everything from such a fence to the end of the message, which would delete
the JSON block (hence dispatches use `acceptance: false`).

## Consequences

- Robust across dispatch modes (blocking and workflow); the contract is
  testable without the harness (fixture tasks in `test/`).
- Parent recomputation is defense in depth: a scorer-reported `score`/
  `status` that disagrees with its own findings is corrected before merge.
- The trailing-block discipline is repeated in every task (template +
  per-task output-contract line); M9's gate found and fixed an output-shape
  deviation at the parent normalizer.
