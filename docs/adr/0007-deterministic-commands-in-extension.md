# ADR-007: `/hol-validate` and `/hol-status` are extension commands (LLM-bypass)

- **Status**: Accepted (2026-08-25, design lock)
- **References**: spec 02 §1.4/§4; `extensions/hol.ts`

## Context

Some operations are fully deterministic (run the linter; read plan/module/
score state) and must not be mediated by model judgment or re-implemented in
prompt prose. The rest of the pipeline (planning, authoring, scoring
orchestration) needs model orchestration.

## Decision

The extension registers two **LLM-bypass commands** — `/hol-validate
[guideDir]` (runs the linter, records `.holagent/last-validation.json`) and
`/hol-status [guideDir]` (plan validity, per-module states, last
validation, next recommended command) — plus the three LLM-callable tools
`hol_validate` / `hol_status` / `hol_scores` (the same deterministic core,
`extensions/hol-core.ts`, from prompt templates). Every other command is a
prompt template.

## Consequences

- Determinism for deterministic operations: a human or a prompt gets the
  same linter verdict and state; gates in the prompt templates call the
  tools rather than re-deriving state from memory.
- Thin extension surface: `hol.ts` only registers; all logic is in the
  pure, unit-tested `hol-core.ts`.
- The model cannot bypass the linter's verdict: `scored-*` states and the
  review pre-flight all key off the recorded report, not conversation.
