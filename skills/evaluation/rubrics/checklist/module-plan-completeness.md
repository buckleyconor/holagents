---
name: module-plan-completeness
kind: checklist
scope: module-plan
threshold: 1.0
---

# Module-plan completeness

Does the module plan contain everything the implementer needs to author
the section? Scored at `/hol-review-module-plan`. Binary criteria.

## Criteria

### step-outline

≥2 numbered steps; each names an action AND an expected result.

### image-checklist

≥1 entry; each entry names a concrete, observable screen state
("Terminal showing collection list with 'Manufacturing'"), not a vague
"UI screenshot".

### success-criteria

≥1 verifiable end state the reader can check without the author
present (a named object exists / a command prints a specific output / a
UI shows a specific value).

### environment-delta

Non-empty: states what the module assumes is already true AND what it
leaves behind for later modules.

### commands-listed

Every shell command the module will use appears in the plan's "Commands
used" section in backtick form (so the linter can check them early).
