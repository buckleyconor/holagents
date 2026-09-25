# Charmed Kubernetes Extension — Status (spec-k8s)

Pilot status as of the milestone 6 implementation on `feat/k8s-ext`.

## Implemented (deterministic, fully tested with fakes)

All code lives in `extensions/k8s/` (implementation) and `test/k8s/` (contracts,
integration, and the end-to-end pilot rehearsal). Nothing is registered with
the hol extension: existing HOLagents behaviour is unchanged when Kubernetes
is not selected.

| Milestone | Scope                                                                                                                                                                                                            | Status                                                                                                                                                               |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1         | Profile contract (`deployment-profile.yaml`), result/evidence schemas, operational/promotion/UAT state machines, adapter boundary                                                                                | Implemented (contracts + fake-adapter tests)                                                                                                                         |
| 2         | Deterministic raw-YAML generation and static validation (PRO-001…PRO-005), one-project-per-lab GitLab provisioning, candidate-revision merge requests with the GAP-003 evidence description                      | Implemented (contract tests)                                                                                                                                         |
| 3         | Argo CD exact-revision readiness (GAP-010…GAP-012), operation idempotency for consequential targets                                                                                                              | Implemented (contract tests)                                                                                                                                         |
| 4         | Test orchestration: policy-driven infrastructure suite, six-test VirtualServer runner (spec-k8s/06, exit codes 0–5), repository acceptance contract (UAT-003), evidence bundles (spec-k8s/01 §Evidence contract) | Implemented (contract tests)                                                                                                                                         |
| 5         | UAT flow (spec-k8s/07): entry gates, suite execution, promotion decision; promotion through evidence-bearing MRs with digest-bound approvals; GitOps rollback with Argo verification and minimum suites          | Implemented (integration tests)                                                                                                                                      |
| 6         | Platform policy onboarding machinery (validation, digest, time-bounded exceptions), pilot rehearsal                                                                                                              | Implemented — the rehearsal (`test/k8s/e2e.test.ts`) passes dev deploy → UAT promotion → production promotion → rollback against fake GitLab/Argo/cluster transports |

Test strategy (spec-k8s/08): the above is contract/integration/E2E coverage
with injectable fakes. The suite runs under `node:test` and ships nothing
(ADR-018); `InMemoryGitLab`, `SupplierArgo` and the VirtualServer probe
transport are the test doubles named in the spec.

## Deliberately not implemented (fail-closed until dependencies resolve)

- **No live-environment transitions.** The live GitLab client, the live
  Argo CD client and the live cluster observation path are not wired.
  Every path that would need them fails closed (`BLOCKED_POLICY`,
  `BLOCKED_CREDENTIALS`, `BLOCKED_APPROVAL`) rather than guessing.
- **No `hol_k8s_validate` / `hol_k8s_deploy` tool surface.** The
  `DeploymentAdapter` implementations exist in
  `extensions/k8s/adapter-k8s.ts`; exposing them as hol tools is a
  pipeline decision once DEP-001…DEP-004 are confirmed.
- **No promotion of the ADRs.** ADR-K8S-001…ADR-K8S-009 remain embedded in
  `spec-k8s/08-implementation-plan-adrs.md` until the extension is adopted.

## External dependencies

| ID      | Dependency                                            | Effect while unresolved                                                                                                                                                                                                                        |
| ------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DEP-001 | Kubernetes administrator policy content (spec-k8s/05) | The policy contract, evaluation machinery and exceptions are implemented and tested; the administrator's actual policy document is not supplied, so `profile.policy.reference` stays `null` and required-policy labs block as `BLOCKED_POLICY` |
| DEP-002 | Cluster credential references                         | `profile.credentials.runtimeReference` is the contract; no secret wiring exists, and absent credentials surface as `BLOCKED_CREDENTIALS`                                                                                                       |
| DEP-003 | Argo CD Applications per environment                  | Argo readiness is a narrow observation interface; no live Application exists yet, so readiness is unobservable in a real environment until wiring is confirmed                                                                                 |
| DEP-004 | GitLab protection/approval rules                      | `InMemoryGitLab` enforces the intended semantics (protection, candidate-bound approvals); the live rules must be confirmed before any consequential merge can be executed against a real GitLab instance                                       |

## Provisional naming

`apiVersion: holagents.io/v1alpha1` and `kind: KubernetesDeploymentProfile`
are provisional per spec-k8s/02; the policy `apiVersion` is marked TBD in
`extensions/k8s/policy.ts` pending DEP-001.
