---
name: spec-buildability
kind: analytic
scope: spec
threshold: 4
---

# Spec buildability (spec level)

Could an autonomous agent build this without guessing? Judges whether the
spec is a contract or a sketch.

## Criteria

### interfaces-unambiguous

Endpoints, function signatures, schemas and config shapes are specified
precisely enough that two builders would produce compatible
implementations. Error cases are named, not implied.

### milestones-independently-testable

Each build-sequence milestone can be completed and verified on its own,
with an exit criterion a builder could actually check. No milestone is a
phase in disguise.

### decisions-made-not-deferred

Where a choice was needed the spec makes it and gives a one-line reason,
rather than listing options for the builder to resolve. Genuinely open
choices are in section 8, not left implicit in the design.

### footprint-consistent

§9 does not exceed what `sizing.md` budgeted. Where the design needs more,
the spec says so explicitly rather than silently inflating the numbers.

### traceable-to-concept

Every component earns its place by serving a beat, and every beat has
something in the architecture that makes it observable. Nothing in the
build serves no story, and no beat is unsupported.

### assumptions-surfaced

Assumptions that materially affect the build, the security posture, or the
data handling are in section 8 with enough specificity to be confirmed or
rejected — not buried as stated fact in the design.
