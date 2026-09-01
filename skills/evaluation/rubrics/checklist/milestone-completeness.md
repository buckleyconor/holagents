---
name: milestone-completeness
kind: checklist
scope: build
threshold: 1.0
---

# Milestone completeness

Did this milestone deliver what the build sequence said it would? Scored at
`/hol-build`, after the milestone has already passed its own declared test —
the test proves the code runs, this rubric asks whether it is the code the
spec asked for. Binary criteria: met (1) or not met (0).

## Criteria

### deliverable-present

Everything the milestone's `deliverable` names exists in the lab repo and does
what the entry says. Nothing named in the deliverable was quietly deferred.

### exit-criterion-met

The milestone's `exit` criterion is demonstrably satisfied, and the declared
`test` command is what demonstrates it — not a narrower check substituted
because the real one was awkward.

### tests-written

Tests were added for this milestone covering the happy path, the edge cases
§5 names for it, and at least one failure path. A test that only asserts the
code loads does not count.

### versions-pinned

Every dependency, image and model reference this milestone introduced matches
§9 and `lab-prep.md` exactly — same versions, same tags, no `latest`, no
substitution the spec did not make.

### no-placeholder-work

No `TODO`, `FIXME`, stub function, hard-coded stand-in value, or commented-out
block substitutes for work this milestone was supposed to deliver.

### no-secrets

No credential, token, key or private endpoint is committed. Demo credentials
are referenced from `lab-prep.md`, not duplicated into the code.

### scope-respected

The change touches this milestone's work only: no later milestone started, no
earlier milestone rewritten, nothing written outside the lab repo.

### decisions-reported

Every choice the builder made where the spec was silent is stated in its
report, and every place the spec was wrong or contradictory is quoted rather
than silently resolved.
