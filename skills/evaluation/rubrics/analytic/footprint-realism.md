---
name: footprint-realism
kind: analytic
scope: sizing
threshold: 4
---

# Footprint realism (sizing level)

Is this footprint honest, reduced for the right reasons, and deployable at
the stated concurrency? Judges the engineering argument in `sizing.md`.

## Criteria

### production-baseline-honest

A production footprint is stated before any reduction, and it is plausible
for the solution rather than a lightly-padded version of the demo figure.

### reductions-justified

Every reduction names what it costs and what would break if it went
further. No row leaves the "what breaks if smaller" column empty or
generic.

### aha-moment-protected

Nothing the aha moment depends on has been reduced to the point where the
reveal stops being convincing, and the sizing says so explicitly.

### density-computed

Per-instance footprint, concurrency target, and aggregate are stated as
numbers, and the binding constraint (what runs out first, at what N) is
identified. Shared vs per-tenant resources are separated.

### stack-pinned

Software components carry exact versions and image references. No
component is specified as "latest" or left unversioned.

### estimates-labelled

Numbers that were estimated rather than measured or sourced appear in Open
questions & assumptions, not silently in the tables.
