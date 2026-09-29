# ADR-022: the platform handoff is a deterministic renderer bound to committed artifacts

- **Status**: Accepted (2026-09-28, draft)
- **References**: ADR-007, ADR-008, ADR-014, ADR-016, ADR-021;
  `spec-k8s/09-platform-handoff.md`, `spec-k8s/09-annex-kubernetes.md`,
  `spec-k8s/09-annex-vcd.md` (deferred)

## Context

The handoff was first spec'd as a "deterministic agent" that re-rendered
Kubernetes YAML and read the lab's service model from a source that no artifact
carried. That made it either a second emitter of the milestone-2 manifests (the
drift class the handoff exists to kill) or a page of coverage warnings, and it
forced the vCD dialect onto labs that only target Kubernetes.

The rest of the package separates _deciding_ from _checking_: an agent authors,
a deterministic tool checks, a rubric scores. A handoff assembled by
byte-identical template substitution is not agent work, and there is no content
a rubric could improve — a gap in the handoff is a gap in the source artifacts.

## Decision

The handoff is a **deterministic renderer** (`hol_handoff_render`) plus a
**deterministic gate** (`hol_handoff_check`). No agent, no scorer scope.

- One shared model is derived from the recorded artifacts; every dialect is a
  template over that model, so prose, tables and diagrams cannot disagree.
- Dialects are rendered **only** for platforms in `lab-ref.platforms`; a
  Kubernetes-only lab gets no vCD dialect, and the gate checks it that way.
- **The vCD dialect is deferred** (2026-09-28): the first implementation ships
  the Kubernetes dialect only, and a lab declaring only `vcd` gets `BLOCKED`
  from the gate rather than a passing empty handoff. The shared model still
  carries the vCD fields, so lifting the deferral is an annex flip. The reason
  to wait is honest: Kubernetes can derive comms edges from
  `Service`/`VirtualService`; vCD has no committed component artifact, so its
  dialect would be a page of coverage gaps until ADR-011 carries the edges.
- The Kubernetes dialect **binds to the committed manifests for each
  `spec.environments[].manifestsPath` by digest** and never re-renders them;
  the gate recomputes the digest and fails on drift.
- Coverage gaps reuse the ADR-016 parity model: declared-but-unverified is a
  warning, never a guess. A gap is fixed by editing the source artifact, not
  the handoff.
- The render timestamp lives in `.holagent/handoff/render.json`, never in the
  artifact, so byte-identical rendering survives.

## Consequences

- No new rubric scope. Handoff quality is exactly source-artifact completeness
  (coverage warnings) and digest agreement (the gate).
- The Kubernetes dialect stops being a second YAML emitter; the milestone-2
  generator remains the single source of manifest YAML.
- Platform facts come from the interviewed knowledge base (ADR-014) and the
  platform findings file, so open `them` blockers surface in the document the
  platform team receives.
- Dialect selection needs one alias table: `lab-ref.platforms` carries `k8s`/
  `vcd`, `deployment-profile.yaml` carries `charmed-kubernetes`, and
  `extensions/k8s/adapter.ts` carries `vcd-docker`/`charmed-kubernetes`. The
  mapping is spec'd in HND-002a rather than left to whichever string a reader
  reached first.
