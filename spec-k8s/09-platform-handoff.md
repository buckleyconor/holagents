# Platform Handoff (Renderer)

Status: Draft 0.4 — supersedes Draft 0.3

Ship scope: the **Kubernetes dialect only**. The vCD dialect is deferred; the
shared model and the dialect mechanism stay platform-neutral so that adding it
later is an annex flip, not a refactor (HND-002, ADR-022). A lab declares
**exactly one** platform (`k8s` or `vcd`, never both) — the two production
targets are separate estates and a lab targets one of them (HND-002b).

Module 10 (GitLab CI generator) is **dropped**, not deferred: the
`.gitlab-ci.yml` renderer and its gate are out of scope, and ADR-021's CI half
is dormant.

## Purpose

Define a **deterministic renderer** that assembles the platform handoff — the
document a platform team receives at lab handover — from the lab's already
recorded artifacts. The handoff is **generated, not authored**: no agent writes
prose, and no value is re-interviewed or guessed.

The handoff is the automation of the standing convention that every project
hands over a production-readiness checklist (storage, network ports, image
versions, service details, what-talks-to-what).

This document is the platform-neutral core. Per-platform dialects live in
annexes:

- [Kubernetes dialect](09-annex-kubernetes.md) — Charmed Kubernetes. **In
  scope.**
- [vCD dialect](09-annex-vcd.md) — VMware Cloud Director / Docker-on-Ubuntu.
  **Deferred** — specified, not implemented.

## Single source of truth

### HND-001 Derive, never re-interview

The renderer MUST be assembled from existing artifacts and MUST NOT invent or
re-interview values. Its inputs are:

- `.holagent/lab-ref.json` — repo, `platforms`, environments (ADR-008).
- `lab-prep.md` — baseline, software, credentials, endpoints, artifacts,
  network, verify (ADR-011).
- `<lab-repo>/deployment-profile.yaml` — when the lab targets Kubernetes
  (spec-k8s/02).
- The committed deployment artifacts for each declared platform, at the path
  the profile names: `spec.environments[].manifestsPath` (PRO-002 makes the
  path data, so `manifests/<env>` is a convention the renderer MUST NOT
  hard-code). The per-platform annex names the artifact set it binds to.
- `.holagent/sizing.md` — per-instance footprint and concurrency target
  (`demo_footprint.{gpu,vram_gb,vcpu,ram_gb,storage_gb}`, `concurrency_target`).
- The build sequence (`<lab-repo>/<spec_dir>/07-build-sequence.md`) — milestone
  deliverables, test commands and runner images (ADR-015, ADR-023).
- `~/.holagent/platforms/<name>/requirements.md` — the platform's stated
  rules, with `stated`/`inferred`/`assumed` confidence (ADR-014).
- `.holagent/platform/<name>.json` — platform review findings, so an open
  `them`-owned blocker is surfaced, never silently dropped.
- `.holagent/scores.json` and QA records — the verified state.

A value the handoff requires but none of these sources carry MUST surface as a
coverage gap (HND-008), never as a guessed default.

### HND-002 One model, N dialects

The renderer MUST build a single intermediate model of the lab and render every
dialect from it, so the prose, tables and diagrams cannot disagree:

- **Kubernetes** — the digest-bound inventory and derived tables for the
  Charmed Kubernetes team (see the Kubernetes annex). **In scope.**
- **vCD prose** — short narrative for the VMware Cloud Director platform team
  (see the vCD annex). **Deferred** — the renderer MUST NOT emit it, and the
  gate MUST report a declared-but-unimplemented dialect as `deferred`, never as
  a missing dialect (HND-011).
- **Mermaid** — a topology diagram and a comms-flow diagram, embedded in the
  dialects that carry them.

A dialect MUST be rendered **only when its platform appears in
`lab-ref.platforms`**. A lab declaring `[k8s]` MUST NOT receive a vCD dialect,
and the gate MUST check this conditionally (HND-011).

### HND-002a Platform slug mapping

`lab-ref.platforms` carries the short slugs `/hol-lab-register` collects
(`k8s`, `vcd`); `deployment-profile.yaml` MUST carry `charmed-kubernetes`
(PRO-001) and `extensions/k8s/adapter.ts` names its platforms
`vcd-docker`/`charmed-kubernetes`. The renderer MUST key dialect selection on
one table, not on whichever string it reached first:

| `lab-ref.platforms` | profile `spec.platform` | dialect | output file      |
| ------------------- | ----------------------- | ------- | ---------------- |
| `k8s`               | `charmed-kubernetes`    | K8s     | `handoff/k8s.md` |
| `vcd`               | —                       | vCD     | _deferred_       |

A `lab-ref` slug with no matching profile platform, or a profile whose
`spec.platform` disagrees with `lab-ref.platforms`, is a **coverage warning**,
not a guess and not a failure — the dialect is rendered from the profile when
the profile exists.

Any fact appearing in one dialect MUST be traceable to the shared model.

### HND-002b Single-platform labs

`lab-ref.platforms` carries **exactly one** slug. The two production targets
(Kubernetes and vCD) are separate estates and a lab targets one of them — never
both. The gate enforces this: a lab declaring more than one platform is a
coverage warning, and the dialect set is still rendered from the profile when
the profile exists (HND-002a).

### HND-003 Deterministic generation

Identical inputs MUST produce byte-identical output (the ADP-002 rule). The
renderer reads local files only and MUST NOT contact a cluster, GitLab, Argo or
the platform team.

The artifact MUST NOT carry a **render** timestamp — the renderer's own clock
breaks byte-identical rendering. The render time lives in the record file
(see Artifact location and lifecycle), never in the artifact. A timestamp that
is _input data_ — the `at` of a `qa/parity.json` or `build/<slug>.json` record
— MAY be rendered, because it is stable across renders of the same inputs. A
platform team reading "verified" needs to know when, and `render.json` is not in
their hands.

## Artifact contracts

### HND-004 Generic handoff contract

Every dialect MUST name, for the platform team, at minimum:

- Baseline image or VM template.
- CPU, memory and GPU requirements (from the sizing).
- Storage capacity and mount points (from `lab-prep.md` artifacts and sizing).
- Network: VLANs/subnets, inbound and outbound traffic. `lab-prep.md` carries
  this as one free-text `network` scalar, so today it renders as that sentence
  verbatim; a structured network row set is a source-contract change (OQ-09-1,
  resolved — deferred with the vCD dialect).
- Every service, its image version, its port, and what it talks to (the comms
  matrix, HND-006).

It MUST be material a platform team can act on without reading the guide, and
it MUST carry no unfilled `<< FILL: >>` markers.

The per-dialect contracts (prose shape for vCD, digest binding for Kubernetes)
are specified in the annexes.

### HND-005 Mermaid diagram contract

The handoff MUST contain exactly two distinct diagrams, both valid Mermaid and
both rendered from the shared model:

- **Topology** — components and the hosts they run on.
- **Comms flow** — what-talks-to-what with ports and directions.

Each diagram is defined once in the shared model; a dialect MAY embed one or
both. The count is **per rendered dialect**, because each dialect is a separate
file delivered to a separate team: a lab on two platforms gets two files, each
carrying the pair defined once in the model. The gate counts diagrams in the
file it is checking.

### HND-006 What-talks-to-what matrix

The handoff MUST contain an explicit comms matrix: for every pair of services,
the protocol, port, direction and the requirement it satisfies.

Ports and protocols MUST be derived from `lab-prep.md` endpoint URLs and the
committed deployment artifacts (Kubernetes `Service`/`VirtualService`
definitions; see the annex). Cross-service edges — which service _calls_ which —
are not machine-readable in any current artifact; an edge whose direction
cannot be derived MUST be listed as a coverage gap, not guessed. Closing those
gaps is a source-artifact change, not a handoff change.

For the Kubernetes dialect the edges are partly derivable: a `Service` or
`VirtualService` names the port and the upstream, so in-cluster service→service
edges come from the committed manifests. What stays undecidable is a direct
host:port call between two components, and anything the lab reaches outside its
own namespace.

## Validation

### HND-007 Mermaid syntax check (deterministic)

The linter MUST gain a Mermaid check that is line-based and deterministic — no
Markdown AST and no Mermaid grammar dependency (ADR-004). It MUST reject:

- Unbalanced `graph`/`subgraph`/`end`.
- References to node identifiers that are never declared.
- Malformed edge syntax.

The supported subset is the only thing checked: `graph TD`/`flowchart LR`,
`subgraph … end`, `classDef`/`class`, quoted labels, `-->`/`---`/`-.->`/`==>`
edges with optional `|label|`, and `%%` comments. Full Mermaid validity is out
of scope; a construct outside the subset is a coverage warning, not a parse
failure.

A handoff whose diagram does not parse MUST fail the gate. A broken diagram is
the drift class that survives every review today because nothing parses it.

Where the check lives (OQ-09-3, resolved): a standalone line-based checker in
`extensions/handoff.ts`, called only by `hol_handoff_check` — not a guide
linter rule, so `format.json`, rule-registry parity and the generated
`docs/linter-rules.md` are untouched. The requirement — reject unbalanced
`subgraph`, undeclared node references and malformed edges — is unchanged.

### HND-008 Coverage warnings

Declared-but-unverified and verified-but-undeclared contract items MUST be
reported, reusing the parity coverage model (ADR-016). Coverage gaps are
warnings, never failures: whether the platform can reach a path or port is the
author's call.

### HND-009 Fail closed

A missing or unparseable `lab-prep.md` or `lab-ref.json` MUST return `BLOCKED`,
never a fabricated handoff. A handoff that cannot be derived from the contract
MUST NOT be emitted. Per input, explicitly:

| Input                                                                       | Missing                                                                             |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `lab-ref.json`, `lab-prep.md`                                               | `BLOCKED`                                                                           |
| `lab-ref.platforms` empty, or only deferred dialects                        | `BLOCKED` — nothing shippable to render, and `next` says so                         |
| `deployment-profile.yaml` (a `k8s` lab)                                     | `BLOCKED`                                                                           |
| Committed manifests for a profile environment                               | `BLOCKED` for that dialect                                                          |
| `.holagent/sizing.md`                                                       | Coverage warnings, never `BLOCKED` — an adopted lab may legitimately inherit sizing |
| `~/.holagent/platforms/<n>/requirements.md`                                 | Coverage warning — ADR-014: no interview, no standard to trace to                   |
| `.holagent/platform/<name>.json`                                            | Coverage warning — the review has not run                                           |
| The gate's result follows the ARC-004 taxonomy (spec-k8s/01): `PASS`,       |
| `PASS_WITH_WARNINGS` (coverage only), `FAIL` (an executed check disagreed), |
| `BLOCKED` (an input absent or unparseable).                                 |

### HND-010 Secret-free

The handoff MUST contain no secret, token, kubeconfig or private key in any
dialect. Rendering reuses the redaction pass and the PRO-004 secret screening.

### HND-011 Deterministic gate

A deterministic tool (`hol_handoff_check`) MUST verify the handoff is complete
and consistent, the handoff analogue of `hol_launch_check`:

- Each **implemented** dialect present exactly when its platform is in
  `lab-ref.platforms` (HND-002), no dialect for a platform the lab does not
  target, and a declared-but-deferred dialect reported as `deferred` rather
  than `missing`.
- No `<< FILL: >>` markers.
- The Mermaid parses (HND-007).
- The comms matrix covers every declared endpoint or lists it as a coverage
  gap.
- The dialect meets the minimum-content rule (HND-011a) — it is not a page of
  nothing but gaps.
- The Kubernetes dialect's cited manifest digest matches the committed
  manifests' computed digest (see the annex).
- The operational identifier (`metadata.labId`) matches `^hol-\d{4}-\d{2}$`
  and equals `spec.namespace`; the catalogue identifier (`plan.md id`) matches
  `^HOL-\d{4}-\d{2}$` (HND-012).
- No secret material (HND-010).

### HND-011a Minimum content

A dialect that renders nothing but coverage gaps is not a handoff. The gate
fails a dialect that lacks either:

- at least one component row carrying an image **and** a port (derived from
  the committed manifests), or
- at least one derivable comms edge (service→service, or VirtualService→
  service).

A single-component model with no `VirtualService` has no inter-service calls by
construction; the matrix states that explicitly rather than failing, and no
source flag is needed (OQ-09-2). A multi-component dialect with zero derivable
edges is all-gaps and fails.

### HND-012 Identifiers and environments

The handoff MUST record both identifier spaces and MUST NOT claim they are
equal:

- `deployment-profile.yaml metadata.labId` — the **operational** identifier
  (GitLab project, Kubernetes namespace). Well-formed = `^hol-\d{4}-\d{2}$`
  (lowercase `hol`, 4-digit lab identifier, 2-digit lab version). This is the
  standing naming convention every lab follows; it is also the namespace and
  the GitLab project name, so `spec.namespace` MUST equal `metadata.labId`.
- `plan.md id` (`HOL-XXXX-NN`) — the **catalogue** guide identifier.
  Well-formed = `^HOL-\d{4}-\d{2}$` (uppercase `HOL`), the existing
  plan-frontmatter rule.

The gate checks each identifier is present and matches its own pattern, and
that `spec.namespace` equals `metadata.labId`; it reports both identifiers
without asserting they are the same string. Environment names MUST be read
from `deployment-profile.yaml spec.environments[]` when a profile exists, and
from `lab-ref.json environments[]` otherwise; the annex states which is
authoritative for its dialect.

## Artifact location and lifecycle

- **Output path**: `<lab-repo>/handoff/<dialect>.md` — `handoff/k8s.md` for the
  Kubernetes dialect (HND-002a). Written by the deterministic tool under the
  ADR-021 write allowance.
- **Committing is not the tool's act.** The renderer writes; it does not run
  git. A prompt or an agent commits the file, as every other lab-repo artifact
  is committed (ADR-008). An uncommitted handoff is not delivered.
- **Record file**: `.holagent/handoff/render.json` — render timestamp, input
  digests, per-dialect output digests, and coverage warnings. This is the only
  place a timestamp appears (HND-003).
- **Lifecycle position**: the handoff is produced at the ship stage (ADR-009
  `ship`), after platform review (`.holagent/platform/<name>.json` exists) and
  before launch collateral, so open `them` blockers are visible in the
  document the platform team receives.
- **No scoring scope**: the handoff is a deterministic renderer + deterministic
  gate, not agent-authored content. There is no rubric; quality is a function
  of source-artifact completeness (coverage warnings) and digest agreement
  (the gate). A coverage gap is fixed by editing the source artifacts, not the
  handoff.

## Proposed command surface

New proposals, not existing commands:

- `hol_handoff_render` — render the handoff into the lab repo (ADR-021).
- `hol_handoff_check` — the deterministic gate above.

Both are deterministic, so per ADR-007 they SHOULD also exist as LLM-bypass
commands (`/hol-handoff [labDir]`) rather than tools only — a ship-stage step
with no command in the table is a step nobody runs. `hol_status`'s `ship` block
gains a `handoff` substate (`missing | rendered | stale | deferred`) and `next`
surfaces `/hol-handoff` when platform review is done but the handoff is missing
or stale (OQ-09-4, resolved).

## Acceptance criteria

- One lab's contract produces identical prose, tables and diagrams across runs.
- A lab declaring `[k8s]` renders `handoff/k8s.md` and nothing else; the gate
  enforces the dialect set conditionally.
- A lab declaring only `[vcd]` renders nothing and returns `BLOCKED`, naming the
  deferred dialect — it does not receive a passing empty handoff.
- Every declared endpoint, software and artifact appears in the comms matrix or
  as a coverage warning.
- A deliberately broken Mermaid diagram fails the gate.
- The Kubernetes dialect's manifest digest matches the committed manifests; a
  divergence fails the gate.
- No secret material appears in any dialect.
- Each platform team receives an artifact they can act on without reading the
  guide.
- A lab whose `metadata.labId` or `spec.namespace` violates `^hol-\d{4}-\d{2}$`
  (or whose namespace does not equal `labId`) fails the gate.
- A multi-component dialect with zero derivable comms edges fails the gate.

## Open questions — resolved (Draft 0.4)

- **OQ-09-1 — comms edges (resolved).** Ship the Kubernetes dialect now; the
  `comms:` / structured-`network` ADR-011 contract change is deferred with the
  vCD dialect. In-cluster edges derive from `Service`/`VirtualService`; every
  other edge is a coverage gap.
- **OQ-09-2 — minimum content (resolved).** The gate fails a dialect that
  renders nothing but gaps (HND-011a): ≥1 component row with image+port and ≥1
  derivable comms edge. A single-component model with no `VirtualService`
  states "no inter-service calls" (derived from the component count, not a
  declared flag).
- **OQ-09-3 — Mermaid (resolved).** A standalone line-based checker called only
  by `hol_handoff_check` — not a guide linter rule, so `format.json`, registry
  parity and `docs/linter-rules.md` are untouched.
- **OQ-09-4 — state (resolved).** `readGuideStatus`'s `ship` block gains a
  `handoff` substate (`missing | rendered | stale | deferred`) and `next`
  surfaces `/hol-handoff` when platform review is done but the handoff is
  missing or stale.
- **OQ-09-5 — environment-name precedence (resolved).** Profile
  `spec.environments[]` wins over `lab-ref.json environments[]`; disagreement is
  a coverage warning.
- **OQ-09-6 — code location (resolved).** Platform-neutral core + gate live in
  `extensions/handoff.ts`; the Kubernetes dialect renderer lives in
  `extensions/k8s/handoff-k8s.ts`. Both tools register with `hol.ts`
  (`hol_handoff_render`, `hol_handoff_check`) and as `/hol-handoff` commands.
  The rest of the k8s extension stays unregistered.
