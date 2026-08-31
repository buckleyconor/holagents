---
name: spec-completeness
kind: checklist
scope: spec
threshold: 1.0
---

# Spec completeness

Does the spec set contain everything a builder needs? Scored at `/hol-spec`
and `/hol-review-spec`. The deterministic gate (`hol_spec_check`) covers
file presence and an empty section 8; this rubric covers whether the
content is actually there. Binary criteria: met (1) or not met (0).

## Criteria

### all-sections-present

All ten sections exist with real content: overview, architecture, build
decisions, security, test strategy, documentation plan, build sequence,
open questions, environment & footprint (§9), platform constraints (§10).

### architecture-complete

Components and responsibilities, data flow (described, with a diagram),
data model with key entities and fields, and interface contracts with
inputs, outputs and error cases.

### dependencies-pinned

Every dependency, image and model reference carries an exact version and a
one-line rationale. Nothing is specified as `latest` or left unversioned.

### build-sequence-testable

The build sequence is an ordered milestone list where each milestone names
a deliverable and an exit criterion that can be checked on its own.

### test-cases-tabulated

Test strategy includes a table of concrete cases with ID, coverage, input
and expected result, spanning happy paths, edge cases, failure paths, and
at least one abuse case.

### environment-section-concrete

§9 names exact images, versions, endpoints, credential surfaces, artifact
paths, and per-instance resource figures — no placeholders, no ranges
standing in for decisions.

### lab-prep-derived

`lab-prep.md` exists, its frontmatter carries `baseline`, `software`,
`credentials`, `endpoints`, `artifacts` and `verify`, and every entry
agrees with §9 on images, versions, ports and paths.

### verify-entries-executable

Every `verify` entry in `lab-prep.md` is a non-interactive command with an
observable expected result. No entry describes a check in prose.

### open-questions-substantive

Section 8 lists specific assumptions and specific decisions for a human to
confirm — not a generic statement that assumptions were made.
