# Platform Handoff — vCD Dialect (Annex)

Status: Draft 0.2 — **deferred** (specified, not implemented)

Annex to [Platform Handoff (Renderer)](09-platform-handoff.md). Applies when a
lab declares `vcd` in `lab-ref.platforms`.

> **Not in the ship scope.** The first handoff implementation renders the
> Kubernetes dialect only. This annex stays as the specification so the shared
> model carries the vCD fields from the start — a deferred dialect is an annex
> flip, not a redesign (HND-002). Until it is implemented, a lab declaring only
> `[vcd]` gets `BLOCKED` from `hol_handoff_check`, not an empty document.

## Scope

Specify how the shared handoff model is derived and rendered as prose for the
VMware Cloud Director platform team. Docker-on-Ubuntu remains exclusive to the
vCD adapter (ADR-K8S-009); this annex is prose only — no Kubernetes resources.

## Derivation

### HND-VCD-001 Sources

The vCD dialect derives its model from, and only from:

- `lab-prep.md` — `baseline`, `software`, `endpoints`, `artifacts`, `network`.
- `sizing.md` — `deployment_target`, `demo_footprint`.
- `~/.holagent/platforms/<name>/requirements.md` — Networking, Storage,
  Resources & quotas, Naming & metadata (ADR-014).
- `.holagent/platform/<name>.json` — open `them`-owned blockers.

Unlike the Kubernetes dialect there is **no committed component manifest** for
vCD today. Any component-level fact not carried by `lab-prep.md` or `sizing.md`
MUST surface as a coverage gap, never as a guessed value.

### HND-VCD-002 Prose contract

The rendered prose MUST name, for the platform team:

- **Baseline image / VM template** — from `lab-prep.md baseline` and
  `sizing.md deployment_target`.
- **CPU, memory and GPU** — from `sizing.md demo_footprint`.
- **Storage capacity and mount points** — from `lab-prep.md artifacts` and
  `sizing.md storage_gb`.
- **Network** — VLANs/subnets, inbound and outbound, from `lab-prep.md
network` and the platform's Networking rules.
- **Every service, its version, port, and what it talks to** — from
  `lab-prep.md software` and `endpoints`; ports and protocols from endpoint
  URLs. Cross-service edges not machine-readable are coverage gaps (HND-006 of
  the core spec).

It MUST be prose the platform team can act on without reading the guide, and it
MUST carry no unfilled `<< FILL: >>` markers. Because it is rendered from a
template, the prose is assembled, not authored; any gap is a data gap in the
sources, not a drafting decision.

## Output

- `<lab-repo>/handoff/vcd.md` — the rendered prose plus the two Mermaid
  diagrams. **Deferred**: not emitted by the first implementation.

## Open item

Whether vCD needs its own committed component artifact (analogous to the
Kubernetes manifests) so its component model stops relying on `lab-prep.md`
software rows alone. Until that exists, the vCD dialect reports coverage gaps
for component-level facts `lab-prep.md` and `sizing.md` do not carry.

What the deferral depends on: the `comms:`/structured-`network` contract change
in spec-k8s/09 OQ-09-1. The Kubernetes dialect can derive edges from
`Service`/`VirtualService`; vCD has no equivalent, so it renders a page of
gaps until the contract carries the edges. That is the honest reason to wait,
not scope pressure.

## Acceptance criteria

- A vCD lab renders prose from `lab-prep.md` + `sizing.md` + the platform KB,
  with no Kubernetes resources.
- Missing component-level facts appear as coverage gaps, not invented values.
- The prose names baseline, compute, storage, network, services and comms.
