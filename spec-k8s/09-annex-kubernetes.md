# Platform Handoff — Kubernetes Dialect (Annex)

Status: Draft 0.2 — **deferred** (specified, not implemented)

Annex to [Platform Handoff (Renderer)](09-platform-handoff.md). Applies when a
lab declares `k8s` in `lab-ref.platforms` (HND-002a).

## Scope

Specify how the shared handoff model is derived and rendered for the Charmed
Kubernetes team. This dialect **binds to committed manifests**; it does not
re-render them.

## Derivation

### HND-K8S-001 Bind to committed manifests, never re-render

The dialect MUST reference the committed manifests for every environment in
`deployment-profile.yaml spec.environments[]` — at each environment's
`manifestsPath`, not a hard-coded `manifests/<env>` (PRO-002) — identified by
the manifest-set digest (`manifestSetDigest` / the ADP-002 inventory digest).
It MUST NOT emit `Deployment`, `Service` or `VirtualService` documents itself —
that is the milestone-2 generator's output, and a second emitter is the drift
class the handoff exists to kill.

The component model — image, container port, service port, resource
requests/limits, probe path — is derived from those committed manifests, not
from a re-render. So is the in-cluster half of the comms matrix: a `Service` or
`VirtualService` names a port and an upstream, and those edges are emitted as
derived. A direct host:port edge between components stays a coverage gap
(HND-006).

### HND-K8S-002 Namespace

The namespace is reported as a fact from `deployment-profile.yaml
spec.namespace`. The standing naming convention is `hol-XXXX-YY` (lowercase
`hol`, 4-digit lab identifier, 2-digit lab version) — the same string as the
namespace, the GitLab project name and `metadata.labId`. The gate therefore
checks `spec.namespace` matches `^hol-\d{4}-\d{2}$` and equals
`metadata.labId` (HND-012 of the core spec). The dialect states the namespace;
it does not emit a `Namespace` resource. If a `Namespace` resource is required
for deployment, it belongs in the committed manifests, not the handoff.

### HND-K8S-003 External endpoints are VirtualServices, not Ingress

External endpoints MUST be reported as Istio `VirtualService` host → `Service`
→ port, because Charmed Kubernetes uses the VirtualService path (spec-k8s/06,
ADR-K8S-001/009). `Ingress` is out of scope for this platform and MUST NOT be
named as the external-exposure mechanism.

### HND-K8S-004 NetworkPolicy and ResourceQuota are reported, not emitted

The comms-matrix allow-list and the quota are **reported as tables**, not
emitted as `NetworkPolicy`/`ResourceQuota` YAML:

- **Comms allow-list** — the HND-006 matrix rendered as who-may-reach-whom.
- **ResourceQuota** — derived from `.holagent/sizing.md`: per-instance
  `demo_footprint` (`vcpu`, `ram_gb`, `storage_gb`) × `concurrency_target`
  gives the namespace totals; `demo_footprint.gpu` maps to `nvidia.com/gpu` and
  `vram_gb` is reported beside it. The baseline comes from `sizing.md
deployment_target` and `lab-prep.md baseline`.

Emitting `NetworkPolicy` or `ResourceQuota` resources for actual deployment is
milestone-2 scope (a change to spec-k8s/02 and spec-k8s/08), not the handoff.
Per-service resource splits are not derivable because `sizing.md` is
per-instance totals; anything finer is a coverage gap.

## Output

- `<lab-repo>/handoff/k8s.md` — the rendered dialect: digest-bound manifest
  inventory, the derived component/endpoint/comms tables, the quota table, the
  open `them`-owned blockers from `.holagent/platform/k8s.json` (never silently
  dropped), and the two Mermaid diagrams (HND-005, counted in this file).
- The cited manifest digest MUST match the committed manifests at check time
  (HND-011 of the core spec); a divergence fails the gate.

## Acceptance criteria

- The dialect names every committed manifest by digest and emits no
  `Deployment`/`Service`/`VirtualService` documents.
- External endpoints are VirtualService-based, not Ingress-based.
- The quota table is derived from `sizing.md` with the GPU → `nvidia.com/gpu`
  mapping, and per-service gaps are listed as coverage gaps.
- Open `them`-owned blockers appear in the dialect; a review with an unresolved
  blocker never renders as a clean handoff.
- The namespace is present and checked against platform naming rules.
- A manifest drift (committed files change without re-render) fails
  `hol_handoff_check`.
