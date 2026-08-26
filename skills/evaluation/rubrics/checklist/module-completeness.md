---
name: module-completeness
kind: checklist
scope: module
threshold: 1.0
---

# Module completeness

Does the generated `## Module <N>:` section deliver what its module
plan promised? Scored after generation and at `/hol-review-module`.
Binary criteria.

## Criteria

### steps-implemented

Every step from the module plan's step outline appears in the section,
in order, none dropped (rewording is fine; missing or reordered steps
are not).

### expected-outputs

For every planned step with an expected result, the section shows it
(verbatim output, a named UI state, or an explicit check).

### images-match-checklist

The number of image lines (ImageProxy or `<< INSERT SCREENSHOT: … >>`
placeholder) matches the plan's image checklist, and each has a
specific description of what the reader should see.

### checkpoint-present

If the module has ≥3 command steps, a `> ✅ **Checkpoint:** …` line
states the module plan's success criterion verbatim or near-verbatim.
(A criterion that is not itself a verifiable end state is a plan-level
defect — it fails `module-plan-completeness` `success-criteria`; score
this criterion met if the checkpoint states the plan's criterion
faithfully.)

### title-alignment

The section heading title matches the module `title` from the plan.
