---
name: spec-authoring
description: Turning an approved concept and sizing into the eight-section lab spec that an autonomous agent can build from. Use when writing or reviewing spec documents (spec-author, /hol-spec, /hol-review-spec), or when judging whether a spec is buildable without guessing.
---

# Spec Authoring

Stage 2 turns a story and a footprint into a build contract. The spec is the
primary source of truth for whoever builds the lab — an agent at `/hol-build`,
or a human — so it must be precise, unambiguous, and self-contained.

Two files carry the standard:

| File                | What it is                                                              |
| ------------------- | ----------------------------------------------------------------------- |
| `template.md`       | The section contract: the eight generic sections plus two HOL additions |
| `worked-example.md` | A real filled instance — the prompt that generated this package's spec  |

Read `template.md` before writing. Read `worked-example.md` when you need to see
what "specific enough" looks like in practice.

## Where the inputs come from

| Spec section                 | Source                                                          |
| ---------------------------- | --------------------------------------------------------------- |
| Overview, goals, non-goals   | `concept.md` — problem, success criteria, non-goals             |
| Architecture                 | The beats: each beat needs components that make it observable   |
| Build decisions              | `sizing.md` software stack, plus judgment                       |
| Environment & footprint (§9) | `sizing.md` — near-verbatim; this is what becomes `lab-prep.md` |
| Platform constraints (§10)   | `~/.holagent/platforms/<name>/requirements.md`, when it exists  |

Nothing in the spec may contradict the concept or the sizing. Where the spec
needs something the sizing did not budget for, that is a **finding to raise**,
not a number to quietly change.

## The open-questions rule

Section 8 — Open Questions & Assumptions — is the most valuable part of the
output, and it is gated deterministically (`hol_spec_check`): a spec whose
section 8 is empty **fails**.

This is not bureaucracy. A spec always contains guesses; the only question is
whether they are visible. An empty section 8 means the guesses were written
into the design as though they were decisions, which is exactly the failure
that costs a rebuild later. Every assumption made to fill a gap, and every
decision a human should confirm, goes there — explicitly, never silently, and
never for anything touching security or data.

## Buildability

The test for every section: **could an agent build this without guessing?**

- Interfaces have concrete signatures, endpoints, payloads and error cases.
- Dependencies are named and pinned, each with a one-line reason it earns its
  place. Prefer the standard library or well-maintained, widely-used packages.
- The build sequence is an ordered list of milestones, each independently
  testable — `/hol-build` consumes it one milestone at a time, so a milestone
  that cannot be verified on its own will stall the pipeline.
- Test cases are a table with IDs, inputs and expected results, covering happy
  paths, edge cases, failure paths, and a few abuse cases.
- Every environment fact in §9 is observable: a port that can be probed, a path
  that can be stat'd, a version that can be printed. Vague readiness conditions
  become unverifiable `verify` entries in `lab-prep.md`.

## Scale the depth

A small single-user demo lab does not need the security posture of a public
payments service. Scale each section to the concept and the footprint, and say
why when a section is deliberately thin — an unexplained thin section reads as
an omission.

## Anti-patterns

| Pattern                         | Why it fails                                                          |
| ------------------------------- | --------------------------------------------------------------------- |
| Empty open questions            | The guesses are still there, just invisible. Gated; fails.            |
| Architecture that ignores beats | Components exist that no beat needs, or a beat has nothing to show it |
| Footprint drift                 | §9 quietly larger than `sizing.md`, breaking the density budget       |
| `latest` anywhere               | Not reproducible; not a footprint                                     |
| Milestones that are phases      | "Build the backend" is not independently testable                     |
| Spec that writes the code       | Implementation pasted in place of a contract; the agent needs room    |
