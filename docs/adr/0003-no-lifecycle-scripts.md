# ADR-003: No lifecycle-script layer — inline commands only

- **Status**: Accepted (2026-08-25, design lock)
- **References**: spec 08 scoping; `lab-prep.md` convention;
  `skills/write-guides/SKILL.md`

## Context

The reference plugin's lab model includes sandbox lifecycle scripts
(setup/check/solve/cleanup). holagent's lab environments are
**pre-provisioned**: the sandbox arrives with services, images, and
fixtures already in place, and the deliverable is the guide document — not
sandbox state.

## Decision

The pipeline neither generates nor executes lifecycle scripts. Every
verification in a guide is an inline command in the guide body (tab-indented
backtick form, shellchecked by L014/W014). `lab-prep.md` is a handoff
artifact for environment builders: it documents the pre-provisioned state
and invariants (what must be true before module 1), not provisioning steps.

## Consequences

- Guides are self-contained: a learner copies inline commands; there is no
  hidden script state to diverge from the document.
- Scope reduction: no script validation surface; the linter stays a
  line-based Markdown checker.
- Environment invariants are proven by the guide's own first module (the
  "observe" module pattern — e.g. `HOL-2000-01` module 1 confirms the
  preloaded image, the free port, then starts the service).
- Expected outputs are captured by the parent's dry run on the dev machine
  (disposable containers), not by a managed sandbox.
