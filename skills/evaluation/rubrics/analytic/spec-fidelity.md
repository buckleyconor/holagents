---
name: spec-fidelity
kind: analytic
scope: build
threshold: 4
---

# Spec fidelity (milestone level)

Is this the thing the spec specified, built the way the spec said to build it?
Judges the gap between the contract and what landed.

## Criteria

### interfaces-match

Endpoints, signatures, schemas and config shapes match §2 and §3 as written.
Where the implementation diverged, the divergence is reported and justified,
not discovered by reading the code.

### architecture-respected

The code sits where the architecture says it sits, with the responsibilities
the architecture gave it. No component quietly absorbed another's job because
it was convenient.

### tests-prove-the-claim

The tests actually exercise the milestone's deliverable rather than asserting
around it. A reader could believe the exit criterion is met because of what
the tests check, not because the suite is green.

### fits-the-existing-code

The milestone matches the layout, naming and idiom of what earlier milestones
left. A reviewer could not tell from style alone that a different pass wrote
it.

### footprint-honoured

What this milestone adds stays inside the per-instance footprint §9 and
`sizing.md` budgeted — image sizes, service count, memory and GPU claims. Any
overrun is stated, not absorbed.

### silence-handled-well

Where the spec did not decide, the builder made the smallest reasonable choice
and said so. Nothing was redesigned, and no gap was filled with an invention
that will surprise the next milestone.

### failure-modes-considered

The error paths §4 and §5 call for are implemented rather than left to
exception defaults — the milestone fails the way the spec said it should fail.
