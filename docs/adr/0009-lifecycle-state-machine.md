# ADR-009: lifecycle stages extend the state machine without moving `next` backwards

- **Status**: Accepted (2026-09-01)
- **References**: ADR-005, ADR-007, ADR-008; `extensions/hol-core.ts` (`readGuideStatus`), `extensions/state.ts`

## Context

The package covered one stage of the author's workflow: writing the guide. The
lifecycle adds concept and sizing (stage 1), spec (stage 2), build (stage 3)
before it, and platform-fit and launch (stage 5) after it.

Two problems follow. First, stages 1–3 run **before `guide.md` exists**, but
`isGuideDir` required `guide.md` + `.holagent/`, so no deterministic tool could
address a lab that early. Second, every existing guide predates the lifecycle
and has no concept, sizing or spec — a naive stage walk would send them all
backwards to `/hol-concept`.

## Decision

**Two predicates, not one.** `isLabDir` (`.holagent/` present) is the lifecycle
root, used by `hol_status` and `hol_scores`. `isGuideDir` (a lab dir that also
has `guide.md`) is what the linter needs, and `hol_validate` still requires it —
there is nothing to lint without a guide.

**`readGuideStatus` gains a `lifecycle` block** — `concept`, `sizing`, `spec`
(`missing` | `drafted` | `approved` | `adopted` | `n/a`), `build`, a `guide`
rollup, and `ship` — derived from files and scores exactly as module state is.

**A lab opts into the lifecycle.** `engaged` is true once it has a
`concept.md`, a `sizing.md`, or a registered `lab-ref.json`. Until then every
stage reads `n/a` and `next` is computed exactly as the guide-only package
computed it.

**`next` never points backwards.** Stages 1–3 only claim `next` for an engaged
lab that has not yet reached planning; once `plan.md` exists the guide pipeline
owns `next` unconditionally.

**A released guide keeps an accurate status.** After the ADR-005 rename
`guide.md` is gone, so status reads the released `<ID>-<Title>.md` instead:
module states stay correct rather than collapsing to `planned`, and `next`
reports that the guide has left the pipeline.

## Consequences

- Every existing guide's `next` is byte-identical to what it was before.
- `/hol-status` becomes useful two stages earlier and one stage later than it
  used to be — including on released guides, which previously returned
  `E-PATH`.
- Stage state is derived, never stored: there is no lifecycle state file to go
  stale, matching how module state already works.
- `adopted` is explicit in `lab-ref.json` rather than inferred, so an adopted
  lab never looks like one that merely lost its files.
