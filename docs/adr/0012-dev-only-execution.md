# ADR-012: only `dev` environments may be executed against

- **Status**: Accepted (2026-09-01)
- **References**: ADR-007, ADR-008, ADR-011; `extensions/hol-core.ts` (`resolveDevEnvironment`)

## Context

Stage 3 and stage 5 execute commands against a real lab environment to prove it
matches `lab-prep.md`. The same lab exists twice: a development instance the
author owns, and a production instance serving concurrent users in the vCD or
Kubernetes cloud. Running a parity sweep against production risks disrupting
live users, and hands an agent production credentials.

The author's own workflow already distinguishes these: development QA is
hands-on and iterative; production QA is a final end-to-end pass they perform
themselves.

## Decision

`lab-ref.json` classifies every environment with a `kind` of `dev` or `prod`.
Every executing tool takes an environment **name** and resolves it through
`resolveDevEnvironment`, which refuses anything whose `kind` is not `dev`, and
refuses an unknown name or a missing `lab-ref.json`.

The guard lives in `extensions/hol-core.ts` — deterministic, unit-tested,
LLM-bypass (ADR-007) — not in prompt prose. A prompt cannot argue past it and
neither can a user instruction relayed through one.

Production verification takes a different path with different mechanics:
`/hol-qa-prod` executes nothing. It renders the `verify` checks as a script and
a human checklist, the author runs them, and the outcome is recorded to
`.holagent/qa/e2e-prod.json`.

## Consequences

- No agent ever executes against production, regardless of how it is asked.
- The dev/prod split is explicit, inspectable in `/hol-status`, and set once at
  registration rather than decided per command.
- Production QA stays a human act, which matches both the risk and the existing
  workflow; what the package contributes is the checklist, not the execution.
- A lab with no `dev` environment registered simply cannot run automated QA —
  a deliberate, legible failure.
