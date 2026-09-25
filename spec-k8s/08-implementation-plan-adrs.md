# Implementation Plan and Architecture Decisions

Status: Draft 0.1

## Milestone 1: Contracts and state

Deliver:

- Deployment-profile schema and validator.
- Shared result and evidence schemas.
- Operational state machine.
- Adapter interfaces.

Exit criteria:

- Profiles support configurable environments.
- Missing policy and credentials are represented as blockers.
- Existing HOLagents behavior remains unchanged when Kubernetes is not selected.

## Milestone 2: Raw manifests and GitLab

Deliver:

- Deterministic raw-YAML generation.
- Static Kubernetes validation.
- One-project-per-lab provisioning interface.
- Merge-request creation with evidence.

Exit criteria:

- No Kustomize or Helm dependency exists.
- Identical inputs produce identical resources.
- Secrets are absent from generated output and commits.

## Milestone 3: Argo observation and development deployment

Deliver:

- Explicit development approval gate.
- Argo Application discovery and status client.
- Exact-revision `Synced` and `Healthy` wait gate.
- Reconciliation evidence.

Exit criteria:

- Testing cannot start against another revision.
- Timeouts and degraded state fail closed.
- Missing access returns a blocker.

## Milestone 4: Test orchestration

Deliver:

- Infrastructure/security runner interface.
- VirtualServer JSON evidence and exit codes.
- Repository acceptance-script contract.
- Unified evidence bundle.

Exit criteria:

- Suites remain separately reported.
- Mandatory failures prevent promotion.
- Secrets are redacted.

## Milestone 5: UAT and production promotion

Deliver:

- UAT branch and Argo Application integration.
- Scheduled and merge-triggered UAT.
- Evidence-bearing promotion requests.
- Git-driven rollback.

Exit criteria:

- Production cannot bypass UAT.
- Consequential transitions require approval.
- Rollback is reconciled and verified through Argo CD.

## Milestone 6: Platform policy and pilot

Deliver:

- Platform administrator policy bundle.
- Namespace-scoped runner identity.
- Approved GitLab and Argo permissions.
- Pilot with one representative lab.

Exit criteria:

- All open dependencies affecting execution are resolved.
- Platform review has no unresolved mandatory finding.
- Pilot passes development, UAT and rollback rehearsal.

## Test strategy

- Unit tests cover schemas, state transitions, result precedence, revision comparison, idempotency and redaction.
- Contract tests use fake GitLab, Argo and Kubernetes adapters.
- Integration tests use a non-production namespace and intentionally exercise unhealthy, stale revision, blocked policy and credential failures.
- Golden tests verify deterministic raw YAML and evidence.
- End-to-end tests cover development deployment, UAT promotion, test execution and rollback.

## Architecture decision records

### ADR-K8S-001: Raw Kubernetes YAML

Status: Accepted  
Decision: Generate complete raw YAML. Do not use Kustomize or Helm.  
Consequence: Environment-specific duplication is permitted and generated deterministically.

### ADR-K8S-002: One GitLab project per lab

Status: Accepted  
Decision: Each generated lab receives a dedicated GitLab project.  
Consequence: Provisioning, naming, retention and ownership require operational controls.

### ADR-K8S-003: Branch environments

Status: Accepted  
Decision: Environment definitions use configurable ordered branches.  
Consequence: The workflow must not hard-code `dev`, `uat` or `prod`.

### ADR-K8S-004: Argo CD owns reconciliation

Status: Accepted  
Decision: Merged Git state is reconciled automatically by Argo CD.  
Consequence: HOLagents observes and gates; it does not directly deploy to production.

### ADR-K8S-005: Exact-revision readiness

Status: Accepted  
Decision: Tests start only when the expected revision is `Synced` and `Healthy`.  
Consequence: Revision correlation is mandatory.

### ADR-K8S-006: Mandatory UAT

Status: Accepted  
Decision: Introduce UAT with infrastructure, VirtualServer and developer acceptance suites.  
Consequence: Production remains blocked until UAT exists.

### ADR-K8S-007: External platform policy

Status: Accepted  
Decision: Administrator rules are versioned inputs. Missing mandatory policy blocks rather than inventing defaults.  
Consequence: Platform policy must be onboarded before production use.

### ADR-K8S-008: Runtime credentials

Status: Deferred  
Decision: Require namespace-scoped least privilege and runtime injection while deferring the mechanism.  
Consequence: Cluster-connected milestones remain blocked until `DEP-002` is resolved.

### ADR-K8S-009: Separate vCD and Kubernetes adapters

Status: Accepted  
Decision: Docker-on-Ubuntu remains in the vCD adapter only.  
Consequence: Shared code is limited to platform-neutral lifecycle contracts.

## Definition of done

The extension is ready for production pilot when:

- All module acceptance criteria pass.
- `DEP-001` and `DEP-002` are resolved.
- UAT exists and cannot be bypassed.
- GitLab and Argo access is least privilege and audited.
- Rollback has been rehearsed.
- The VirtualServer report is both human-readable and machine-readable.
- Existing vCD operation has not regressed.
