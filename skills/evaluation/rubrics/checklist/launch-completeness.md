---
name: launch-completeness
kind: checklist
scope: launch
threshold: 1.0
---

# Launch completeness

Does the collateral contain what each of its four readers needs? Scored at
`/hol-launch` and `/hol-review-launch`. The deterministic gate
(`hol_launch_check`) covers file presence, the catalogue frontmatter and
agreement with `plan.md`; this rubric covers whether the content is there.
Binary criteria: met (1) or not met (0).

## Criteria

### required-artifacts-written

`exec-summary.md`, `catalogue-description.md` and `social.md` all exist with
real content — not headings, not one line per section.

### exec-summary-complete

The exec summary states the problem, who has it, what the lab demonstrates,
the aha moment, what it costs to run, what the lab is not for, and what it
asks the reader to do.

### catalogue-body-complete

The catalogue description has an abstract, a longer description, what the
learner will learn, and prerequisites — and names the products and versions
from `lab-prep.md`.

### objectives-are-the-guide-s

What the learner will learn is the guide's objectives, in the guide's own
words. Nothing is added that the guide does not deliver, and nothing
load-bearing is dropped.

### footprint-stated-in-numbers

The exec summary gives the per-instance footprint and the concurrency figure
from `sizing.md` as numbers, with the binding constraint named. No adjectives
standing in for a measurement.

### boundary-stated

The collateral says what the lab is **not** for, in the exec summary and in
the long social post.

### social-variants-present

`social.md` has short, medium and long variants, each usable on its own, none
of them a truncation of another.

### prerequisites-explicit

Prerequisites are listed rather than left implied. "None" appears where there
are none; the list is never absent.

### enablement-brief-usable

If `enablement-brief.md` was written: it has the talk track, the aha moment
setup, the questions customers ask with answers, what to do when a step fails,
and what the lab is not for. (Met by default when no brief was requested.)
