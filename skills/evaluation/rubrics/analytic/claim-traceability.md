---
name: claim-traceability
kind: analytic
scope: launch
threshold: 4
---

# Claim traceability (launch collateral)

Does every claim point at something the lab actually does? This is the rubric
the launch stage exists for: every other stage is rewarded for admitting what
it does not know, and this one is rewarded for sounding confident.

Score against the sources supplied with the collateral — the guide, `plan.md`,
`sizing.md`, `concept.md`, `lab-prep.md`. **A claim you cannot locate in those
sources is untraceable, regardless of how plausible it is.** Quote every one
you find; a count is not a finding.

## Criteria

### capability-claims-traced

Every "the learner will be able to…" and every stated capability corresponds
to a guide objective, a module's success criteria, or something the guide has
the learner observe.

### numbers-traced

Every number — duration, footprint, concurrency, throughput, size, time — comes
from `plan.md`, `sizing.md`, `lab-prep.md`, or output the guide actually shows.
No number is rounded into a better one.

### no-unverifiable-superlatives

No "industry-leading", "seamless", "enterprise-grade", "dramatically", or
equivalent. No percentage without a source. Concrete, checkable statements
throughout.

### no-unmeasured-comparisons

No claim of the form "faster/cheaper/simpler than X" unless the lab actually
measures itself against X. Implicit comparisons ("no more waiting for…") count.

### business-problem-sourced

The problem statement comes from `concept.md`, in the customer's language. On
an adopted lab with no concept, the collateral says the business case is
unsourced rather than inventing a customer problem — inventing one scores 1.

### versions-match-the-contract

Every product and version named matches `lab-prep.md` exactly. Nothing is
described as a version the lab does not run.

### boundary-is-honest

What the lab is not for reflects its real limits — the reductions in
`sizing.md`, the non-goals in `concept.md`, what the guide does not cover —
rather than a token disclaimer.

### tone-does-not-oversell

The collateral reads as a colleague describing work, not as marketing. A
reader who then takes the lab would find it was accurately described.
