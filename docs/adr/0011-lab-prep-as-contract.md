# ADR-011: `lab-prep.md` is a machine-readable contract

- **Status**: Accepted (2026-09-01)
- **References**: ADR-003, ADR-010, ADR-012; `skills/guide-scaffolds/lab-prep.md`

## Context

"The guide matches the environment" is the property a hands-on lab lives or
dies on, and it was enforced only by judgment: the `analytic/environment-alignment`
rubric reads the plan and `lab-prep.md` and forms an opinion. A scorer cannot
tell whether port 6333 is actually listening, whether the preloaded image is
really 25.02, or whether `/lab/corpus.json` exists.

`lab-prep.md` also sat at the end of a one-way chain — a human typed it from
what they had in their head, and nothing downstream could check it.

## Decision

`lab-prep.md` gains mini-YAML frontmatter as its **source of truth**:
`baseline`, `software[]`, `credentials[]`, `endpoints[]`, `artifacts[]`,
`network`, and `verify[]` — each list entry a one-line flow map, within the
existing frontmatter subset (no parser change was needed). The prose tables
remain, restating the same facts for human readers.

Every `verify` entry must be a real, non-interactive command with an observable
result, because `hol_parity` executes them against the dev environment
(ADR-012) and records `.holagent/qa/parity.json`.

The file becomes bidirectional: derived from `sizing.md` at stage 2 (or
reverse-engineered from a running lab at adoption), consumed by the builder at
stage 3, executed by QA, and checked against platform requirements at stage 5.

## Consequences

- Guide/environment parity becomes a test rather than an opinion; the rubric
  keeps its judgment role for everything execution cannot see.
- `sizing.md` → `lab-prep.md` → `plan.md` `environment` can be checked for
  agreement mechanically instead of by review.
- Authors must write executable checks. A verification step that cannot be run
  and observed no longer counts, which is the point.
- Existing guides are unaffected until their `lab-prep.md` is regenerated;
  the frontmatter is additive.
