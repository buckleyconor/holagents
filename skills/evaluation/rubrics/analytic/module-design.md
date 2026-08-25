---
name: module-design
kind: analytic
scope: module-plan
threshold: 4
---

# Module design (module-plan level)

Is the module planned to be buildable and learnable? Score each
criterion 1–5.

## Criteria

### pacing

Step count matches `est_minutes` (roughly 2–4 steps / 5–10 min,
5–8 steps / 10–20 min; flag mismatches with the numbers in the finding).

### verifiable-success

Success criteria are checkable by a reader alone: a named object, a
specific command output, or a named UI value — not "the feature works".

### depends-on-correct

`depends_on` lists exactly the modules whose outputs this module
consumes (missing deps and phantom deps both score low).

### image-specificity

Image checklist entries name concrete observable states with enough
detail to capture (or find) the shot later.
