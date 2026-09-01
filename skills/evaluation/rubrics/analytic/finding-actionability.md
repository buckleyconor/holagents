---
name: finding-actionability
kind: analytic
scope: platform
threshold: 4
---

# Finding actionability (platform review)

Could someone walk into the platform meeting with this and get decisions?
Judges whether the review is a working document or a list of observations.

## Criteria

### findings-are-decisions

Each finding sets up a decision someone can make in the meeting — change this,
or grant that — rather than describing a state of affairs and leaving the
resolution to the reader.

### evidence-survives-challenge

The observations would hold up if the platform team opened the file and looked.
Versions, ports, paths and image references are the lab's real ones, and the
locators point where they say they do.

### severity-discriminates

The severities separate what stops the lab from what merely annoys. A reader
could triage from the severity column alone, and the blockers are few enough
to be believed.

### ownership-is-clear

`us` and `them` are assigned correctly, and the asks are things the platform
team can actually grant. Nothing owned by `them` is really a change we should
make ourselves.

### unknowns-are-questions

The `unknowns` read as questions to put to the team, specific enough to answer
in one sentence — not as a general admission that the requirements are
incomplete.

### brief-is-usable

Taken together, the three lists — what we do not comply with, what we need,
what they will ask — would let someone who did not do the review run the
meeting from it.
