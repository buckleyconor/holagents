---
name: spec-coherence
kind: holistic
scope: spec
threshold: 4
---

# Spec coherence (spec level)

Read the spec set as one document. Does it describe a single coherent
system that matches the lab it is meant to produce?

## Criteria

### internally-consistent

The sections agree with each other: the architecture matches the build
decisions, the test strategy exercises what the architecture describes, and
§9 matches the deployment the platform section assumes.

### scope-matches-concept

The system specified is the lab described in the concept — not a smaller
one that drops a beat, and not a larger one that has grown a second lab
inside it. The non-goals still hold.

### depth-is-proportionate

Each section is scaled to what this lab actually warrants, and deliberately
thin sections say why. Neither a single-user demo carrying enterprise
payments ceremony, nor a security section that waves at a real data risk.

### a-builder-could-start

Taken whole, someone handed only this spec and the lab repo would know what
to build first, how to tell it worked, and where to look when it did not.
