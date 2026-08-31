# ADR-010: ADR-003 binds the guide, not the lab repo

- **Status**: Accepted (2026-09-01) — scopes ADR-003
- **References**: ADR-003, ADR-008, ADR-012

## Context

ADR-003 says holagent ships no lifecycle scripts: environments are
pre-provisioned, every verification is an inline command in the guide, and
`lab-prep.md` is a handoff document. Stage 3 (build) and stage 5 (QA) appear to
contradict it — they build a lab and execute checks against a running one.

## Decision

ADR-003 binds the **guide**, and continues to bind it unchanged: a guide still
never installs, provisions, or mutates its environment; it still contains no
setup/cleanup scripts; the learner still meets a fully pre-provisioned lab.

It does not bind the **lab repo**, which is a separate artifact in a separate
repository (ADR-008) whose whole purpose is to build and run the thing the
guide teaches. Build scripts, compose files, manifests and test suites live
there and always did — holagent simply stopped pretending they were out of
scope.

`lab-prep.md` changes role accordingly: from a document handed to a
provisioning team to a machine-readable contract (ADR-011) that stage 3
verifies. What it _describes_ is unchanged.

## Consequences

- No change to any guide, guide rule, or linter behaviour.
- The "pre-provisioned" invariant is now testable rather than asserted: the
  environment either matches `lab-prep.md` or it does not.
- The blast radius of build/QA is the lab repo and a dev environment, both
  named explicitly in `lab-ref.json`.
