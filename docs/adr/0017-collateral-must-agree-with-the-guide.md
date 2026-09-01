# ADR-017: launch collateral is checked against the guide it describes

- **Status**: Accepted (2026-09-01)
- **References**: ADR-005, ADR-007, ADR-013;
  `extensions/hol-core.ts` (`checkLaunch`), `skills/launch-collateral/`,
  `prompts/hol-launch.md`

## Context

Stage 5b writes the material that decides whether a finished lab gets used: an
exec summary, a catalogue entry, internal posts, an optional SE brief. It is
the last stage, and the only one whose incentives run the wrong way. Every
other stage is rewarded for admitting what it does not know — open questions
gate the spec, unverified items gate adoption, unknowns gate a platform review.
Collateral is rewarded for sounding confident.

Two failure modes follow. The obvious one is the unverifiable claim:
"industry-leading", a percentage with no source, a comparison the lab never
measures. The quieter one is drift: the catalogue says sixty minutes and the
plan says ninety, or the title was improved on its way into the description.
Drift survives every human review, because nobody reads the two files side by
side — and it is discovered by a customer who booked an hour.

## Decision

**The parts that can be checked mechanically are.** `hol_launch_check` (ADR-007)
requires the three mandatory artifacts, no unfilled markers, and catalogue
frontmatter carrying `id`, `title`, `duration_minutes`, `short_blurb`,
`audience` and `prerequisites` — then compares `id`, `title` and
`duration_minutes` against `plan.md` and fails on any disagreement. `id`,
`title` and `duration_minutes` are **copied, not composed**. `short_blurb` is
capped at 200 characters, because the catalogue tile is a fixed-width field in
someone else's system and over the limit it is truncated in front of a
customer. `prerequisites` may not be empty: "None" is an entry, and an absent
list makes people assume the worst.

**The part that cannot be checked mechanically gets the strictest rule the
package has.** Every claim must trace to a named source — a guide objective, a
module's success criteria, `plan.md`'s duration, `sizing.md`'s footprint or
density, `concept.md`'s business problem, `lab-prep.md`'s versions. If the
source cannot be named, the sentence does not go in: not softened, not hedged,
out. `analytic/claim-traceability` scores against those sources, supplied with
the collateral, and quotes every untraceable claim verbatim.

**An adopted lab has no business case, and does not get one invented.** Adoption
deliberately writes no `concept.md` (ADR-013). The collateral then says the
business case is unsourced and stays thin; fabricating a customer problem to
fill the gap scores 1 on `business-problem-sourced`. The fix is a retroactive
`/hol-concept`, which `/hol-launch` offers.

## Consequences

- Collateral cannot silently describe a different lab than the one that
  shipped, and a guide whose duration or title later moves is caught by
  `/hol-review-launch` rather than by a customer.
- The author's easiest path is the correct one: copying three fields from
  `plan.md` is less work than composing them.
- `lifecycle.ship.launch` becomes a real stage state (`missing` / `drafted` /
  `approved`) derived like every other stage, rather than "the directory
  exists" — which claimed a stage was done the moment a file appeared.
- Stage-5 collateral now engages the lifecycle, so a lab that reaches launch
  reports its stage bar even if it never had a concept.
- The gate says nothing about whether a claim is true. That is deliberate:
  guessing at truth from text is exactly the judgment the rubric exists for,
  and a gate that pretended to do it would be trusted more than it deserved.
