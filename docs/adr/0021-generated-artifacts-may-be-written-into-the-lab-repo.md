# ADR-021: generated artifacts may be written into the registered lab repo (amends ADR-008)

- **Status**: Accepted (2026-09-28, draft — amends ADR-008); amended
  2026-09-28 to strike the CI-generator clause (module 10 dropped)
- **References**: ADR-008; `spec-k8s/09-platform-handoff.md`

## Context

One lifecycle stage is a deterministic tool whose _output belongs in the lab
repo_, not under `~/.holagent/` or the active lab dir: the platform handoff
renderer (`hol_handoff_render` → `<lab-repo>/handoff/<platform>.md`). ADR-008
says hol-core only ever **reads** `lab-ref.json` and that agents write into the
lab repo through ordinary `write`/`bash` tools — not through hol-core. Routing
the renderer through an agent would reintroduce nondeterminism into a step whose
entire value is byte-identical output.

A second tool — `hol_ci_render` → `.gitlab-ci.yml` — was originally part of
this ADR. Module 10 was dropped on 2026-09-28, so the CI clause is struck and
`.gitlab-ci.yml` is no longer a write target.

## Decision

ADR-008's write confinement is **extended by a named, closed set**, not
relaxed. One deterministic tool — `hol_handoff_render` — may write into the
repo recorded in `lab-ref.json`, confined to a fixed, realpath-checked path:

- `handoff/` under the repo root, one file per **rendered** dialect
  (`handoff/k8s.md`; the vCD dialect is deferred per ADR-022).

The tool may not overwrite a target that it did not generate: a hand-written
`handoff/*.md` stops the render with `BLOCKED` unless the user confirms.

The tool resolves the repo through `readLabRef` (ADR-008), refuses an absent or
unreadable `lab-ref.json`, and fails closed (`BLOCKED`) rather than writing
elsewhere. Everything else in ADR-008 is unchanged: every other hol-core write
stays under `~/.holagent/` and the active lab dir, and agents continue to use
ordinary tools.

## Consequences

- The confinement invariant is still auditable: one module, one rule, plus one
  named tool with a fixed, checkable path — no per-caller exception mechanism.
- A moved or deleted lab repo fails closed for this tool too, rather than
  silently writing somewhere unexpected.
- Determinism is preserved where it matters (the handoff is a byte-identical
  render), because the write is performed by the tool, not an agent.
