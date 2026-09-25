# HOLagents Kubernetes Extension Specification

Status: Draft 0.1  
Target: Charmed Kubernetes  
Deployment format: Raw Kubernetes YAML  
GitOps: GitLab and Argo CD

## Purpose

This package specifies an extension to HOLagents that generates, deploys, tests and promotes lab applications through Charmed Kubernetes while preserving deterministic gates, evidence and human approval.

The design extends the existing lifecycle rather than replacing it:

`concept → spec → milestone build → development QA → guide → platform review → launch`

Kubernetes deployment and promotion are introduced as operational substates within that lifecycle.

## Confirmed decisions

- Each lab has one GitLab project.
- Kubernetes resources are committed as raw YAML; Kustomize and Helm are out of scope.
- Environment definitions use configurable ordered branches. The initial sequence is `dev → uat → prod`; a future sequence such as `sandbox → dev` must not require code changes.
- Argo CD automatically synchronizes merged changes.
- HOLagents waits for the expected Git revision to become both `Synced` and `Healthy` before testing.
- Development automation requires explicit approval.
- Consequential promotion uses evidence-bearing GitLab merge requests and human approval.
- UAT includes platform security tests and developer-owned repository scripts.
- The VirtualServer test is a blocking pre-promotion gate, except for its explicitly advisory sixth probe.
- Docker-on-Ubuntu remains exclusive to the vCD adapter.

## Open external dependencies

- `DEP-001`: Kubernetes administrator policy content has not yet been supplied.
- `DEP-002`: The runner identity and cluster credential mechanism have not yet been selected.
- `DEP-003`: The UAT environment and its Argo CD Application do not yet exist.
- `DEP-004`: GitLab protection, approval and service-account rules require confirmation.

These dependencies do not block core development. Any runtime transition requiring an unresolved dependency must return `BLOCKED` rather than assume a default.

## Modules

1. [Architecture and lifecycle](01-architecture-lifecycle.md)
2. [Deployment profile](02-deployment-profile.md)
3. [Kubernetes deployment adapter](03-kubernetes-adapter.md)
4. [GitLab and Argo CD promotion](04-gitlab-argocd-promotion.md)
5. [Platform policy and security](05-platform-policy-security.md)
6. [VirtualServer testing](06-virtualserver-testing.md)
7. [UAT and acceptance testing](07-uat-acceptance.md)
8. [Implementation plan and ADRs](08-implementation-plan-adrs.md)
9. [Pilot status](STATUS.md) — implementation status per milestone and the
   outstanding external dependencies (DEP-001…DEP-004)

The implementation lives in `extensions/k8s/` (contracts and adapter
boundary) with contract/integration/E2E tests in `test/k8s/`.

## Normative language

`MUST`, `MUST NOT`, `SHOULD`, `SHOULD NOT` and `MAY` indicate requirement strength.

## Sources

- [HOLagents repository](https://github.com/buckleyconor/holagents)
- [HOLagents-generated lab example](https://github.com/buckleyconor/nvidia-vss-rag-nemoclaw-lab)
