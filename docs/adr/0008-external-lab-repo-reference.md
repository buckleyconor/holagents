# ADR-008: the lab's code lives in its own repo, reached through `lab-ref.json`

- **Status**: Accepted (2026-09-01)
- **References**: ADR-003, ADR-012; `extensions/hol-core.ts` (`readLabRef`, `resolveConfinedRoot`)

## Context

Extending holagent past guide authoring means the package now has opinions
about a lab's _code_ — building it (stage 3), reviewing its deployment
artifacts against a platform's requirements (stage 5), and verifying a running
environment against `lab-prep.md`. That code does not live here: labs are
separate repositories (`~/projects/sign-tutor`, `~/projects/nemoclaw-lab-cl`).

Write confinement (spec 04 §3) refuses any path whose realpath escapes the
session project root. Relaxing it to reach a lab repo would remove the one
mechanism that makes the package's blast radius auditable.

## Decision

Confinement stays exactly as it is **for hol-core's own writes**. hol-core
writes only under `~/.holagent/` and the active lab dir, and both path
resolvers (`resolveGuidePath`, `resolveLabPath`) keep the realpath check.

The lab repo is reached through a recorded pointer instead:
`<lab-dir>/.holagent/lab-ref.json`, holding `repo` (absolute path), `origin`
(`generated` | `adopted`), `adopted_stages`, `spec_dir`, `platforms`, and
`environments` (each with a `kind` of `dev` or `prod`). It is registered once,
with explicit user confirmation, and hol-core only ever **reads** it — the one
exception being a directory-existence check on `<repo>/<spec_dir>` to derive
spec state, which degrades to "missing" if unreadable.

Agents that build or QA a lab write into that repo through ordinary
`write`/`bash` tools, subject to the harness's own permissions — not through
hol-core.

## Consequences

- The confinement invariant is unchanged and still auditable: one module,
  one rule, no per-caller exceptions.
- The lab repo boundary is explicit and inspectable — `/hol-status` prints it,
  and a reader can see exactly which external path a lab is bound to.
- A moved or deleted lab repo degrades gracefully (spec state reads "missing")
  rather than crashing status.
- Registration is a deliberate, confirmed act, so no command can silently
  start writing outside the project.
