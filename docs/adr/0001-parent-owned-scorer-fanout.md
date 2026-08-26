# ADR-001: Parent session owns scorer fanout and fix loops

- **Status**: Accepted (2026-08-25, design lock; first exercised at M7)
- **References**: spec 02 §1.2, spec 08 A10; all `/hol-review-*` and
  `/hol-generate-*` flows; `skills/evaluation/scorer-prompts.md`

## Context

The reference Claude Code plugin's review agents dispatched their own scorer
subagents (grandchildren). pi-subagents policy keeps orchestration in the
parent session. Scoring flows need N scorer dispatches (one per rubric ×
content slice), and the parent must own the merge, the fix loop, and the
escalation state anyway.

## Decision

Prompt templates (running in the main session) own the fanout and the fix
loops — children never spawn children. Each `holagent.scorer` child is
read-only (tools: read/grep/find/ls, no bash/write/edit) and scores exactly
one rubric against one content slice. The parent extracts the trailing
fenced JSON block per result, **recomputes** `score`/`status` from the
criterion scores (defense in depth), and merges atomically via `hol_scores`.
The parent runs fix dispatches (`holagent.guide-implementer`) and records
escalations.

## Consequences

- One fewer agent layer than the reference plugin (6 agents); fanout runs as
  sequential blocking `subagent` dispatches (harness allows one subagent call
  per turn) with `acceptance: false` mandatory — see
  `scorer-prompts.md` dispatch requirement.
- The parent's context carries the task payloads (guide-scope tasks inline
  the full guide), so tasks are generated from disk by scripts and
  dispatched verbatim — never hand-composed.
- Child output is parsed by the parent, so the scorer output contract must be
  robust and testable without the harness (ADR-006).
