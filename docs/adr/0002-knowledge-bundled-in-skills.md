# ADR-002: Knowledge bundled inside skill directories

- **Status**: Accepted (2026-08-25, design lock)
- **References**: spec 02 §1.3, spec 03 layout; `skills/*/`

## Context

Rubrics, the format spec, plan/module scaffolds, the style corpus, and the
research workflows must be reachable from the main session and from child
agents. Pi resolves relative paths in a SKILL.md against the skill's own
directory, and a package's install path varies (npm vs git; user vs project
scope).

## Decision

All LLM-consumed knowledge lives inside the package's skill directories and
is referenced by skill-relative paths (e.g. `evaluation/rubrics/analytic/
step-clarity.md` from the evaluation skill). Code that needs a package file
at runtime (the linter's `format.json`, the bootstrap's
`scraper-manifest.json`) resolves it package-relative from the extension,
not from the conversation.

## Consequences

- Install-location-independent: no prompt or skill ever contains an
  install-path absolute reference.
- Knowledge files must stay within their skill tree; moving a rubric is a
  path change for every template that inlines it (task generators read from
  disk, so drift is caught at generation time).
- The style corpus samples live under `skills/style-corpus/samples/`
  (synced from `lab-guides/`, which is **not** in the tarball).
