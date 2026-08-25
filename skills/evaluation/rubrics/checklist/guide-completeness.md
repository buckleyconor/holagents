---
name: guide-completeness
kind: checklist
scope: guide
threshold: 1.0
---

# Guide completeness

Whole-guide content check at `/hol-review-guide` (format itself is the
linter's job — do not re-score headings/TOC mechanics here). Binary
criteria.

## Criteria

### all-modules-present

Every module in the plan appears in `guide.md` as
`## Module <N>: <Title>`, in plan order, none missing.

### objectives-covered

Each plan objective is actually accomplished by at least one module's
steps (not merely mentioned in the introduction).

### introduction-consistent

`**Duration:**` and `**Objective:**` in the Introduction agree with the
plan (duration ≈ total; objectives list matches).

### summary-honest

A standalone `## Summary` exists and reflects what the modules really
did (no claimed outcomes the modules never produced).

### credentials-consistent

`### Lab Credentials:` exists; no host, port, username, or password
appears in module bodies that is not listed in that block.
