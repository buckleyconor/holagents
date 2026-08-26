---
name: plan-completeness
kind: checklist
scope: plan
threshold: 1.0
---

# Plan completeness

Does the plan contain everything a generator (and the environment team)
needs? Scored at `/hol-review-plan` — the plan approval gate. Binary
criteria: met (1) or not met (0).

## Criteria

### id-and-identity

`id` matches `HOL-\d{4}-\d{2}`; `title` present; `slug` is
lowercase-hyphenated and derivable from the title.

### objectives

3–5 objectives (the validator warns outside this band), each concrete (a learner outcome,
not an activity: "Configure resource quotas" not "Learn about quotas").

### modules-complete

Every module has `n` (sequential from 1), `slug`, `title`, non-empty
`goal`, and `est_minutes`. No gaps or duplicates in numbering.

### environment-block

`environment` has `baseline`, ≥1 `credentials`, ≥1 `urls`, and
`preloaded` — and every module goal is plausibly supported by them.

### lab-prep

`lab-prep.md` exists and covers: baseline, preloaded software,
credentials, URLs/hosts/ports, network access, expected starting
artifacts, and a verification method.

### duration-consistent

`duration_minutes` is between 0.5× and 2× the sum of module
`est_minutes`.
