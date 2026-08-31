---
name: concept-completeness
kind: checklist
scope: concept
threshold: 1.0
---

# Concept completeness

Does the concept contain everything the spec, the guide plan, and the launch
collateral need? Scored at `/hol-concept` and `/hol-review-concept`. Binary
criteria: met (1) or not met (0).

## Criteria

### identity

Frontmatter has `solution`, a `pillar` from the known set (cyber-resilience,
storage, networking, ai, client), at least one `audience` entry, a
`business_problem`, and an `aha_moment`.

### problem-stated-without-product

The business problem section describes what goes wrong for the customer in
their own terms and names no product. A competitor's customer could read it
and recognise the problem.

### personas

At least one named role, with what they own and what concretely changes for
them. "IT professionals" or "users" alone does not count.

### beats

3–5 story beats, each stating both an action the learner takes and an
observable result. No beat is a description of a feature.

### aha-moment-located

The aha moment is a single moment, names the beat it lands in, and is
something the learner causes and can see.

### success-and-non-goals

Success criteria are learner outcomes (things they can explain or do), and
non-goals name at least one thing the lab deliberately excludes.

### open-questions-present

Open questions & assumptions is non-empty. An empty section means guesses
are hidden in the prose above.
