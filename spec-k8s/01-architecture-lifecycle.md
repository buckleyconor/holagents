# Architecture and Lifecycle

Status: Draft 0.1

## Purpose

Define the extension boundaries, components, lifecycle states and compatibility rules for Charmed Kubernetes delivery.

## Architecture requirements

### ARC-001 Preserve HOLagents control

HOLagents core MUST continue to own lifecycle state, deterministic gates, scorecards, approval status and evidence references. Provider-specific GitLab, Argo CD and Kubernetes behavior MUST remain behind adapters.

### ARC-002 Separate deployment adapters

The deployment boundary MUST support platform-specific implementations:

```text
DeploymentAdapter
├── vcd-docker
└── charmed-kubernetes
```

The Kubernetes adapter MUST NOT invoke or embed the vCD Docker implementation.

### ARC-003 Required components

The extension MUST provide independently testable contracts for:

- Deployment-profile validation.
- Raw-YAML generation and validation.
- GitLab project, branch and merge-request operations.
- Argo CD revision and health observation.
- Kubernetes deployment status and evidence.
- Platform-policy evaluation.
- Infrastructure and security testing.
- Repository acceptance scripts.
- VirtualServer access testing.
- Evidence recording and promotion decisions.

### ARC-004 Failure taxonomy

Every gate MUST return exactly one terminal classification:

- `PASS`: all mandatory requirements were satisfied.
- `PASS_WITH_WARNINGS`: mandatory requirements passed and only advisory checks failed.
- `FAIL`: an executed mandatory check detected non-conformance.
- `BLOCKED`: a required dependency, approval, credential, policy or environment was unavailable.
- `ERROR`: execution ended without a reliable compliance result.

Skipped or unavailable mandatory checks MUST NOT be represented as passing.

A `BLOCKED` result MAY carry a subcode identifying the missing dependency (for
example `BLOCKED_CREDENTIALS`, `BLOCKED_POLICY` or `BLOCKED_UAT`). The subcode
is diagnostic; the terminal classification remains `BLOCKED`.

## Lifecycle

The user-facing lifecycle remains:

```text
Concept
→ Specification
→ Milestone build
→ Development QA
→ Guide
→ Platform review
→ Launch
```

The Kubernetes operational flow within build and QA is:

```text
DRAFT
→ SPEC_VALIDATED
→ MANIFESTS_VALIDATED
→ AWAITING_DEPLOY_APPROVAL
→ MERGE_REQUEST_OPEN
→ MERGED
→ ARGO_RECONCILING
→ ENVIRONMENT_READY
→ INFRA_TESTING
→ VIRTUALSERVER_TESTING
→ ACCEPTANCE_TESTING
→ ENVIRONMENT_VERIFIED
→ AWAITING_PROMOTION_APPROVAL
```

Any active state MAY transition to `FAILED`, `BLOCKED` or `ERROR`.

The flow is instantiated per environment. Development entry is
`AWAITING_DEPLOY_APPROVAL`. A promotion into the next environment (see
[GitLab and Argo CD promotion](04-gitlab-argocd-promotion.md)) starts a new
instantiation of the flow at `MERGED` for the target environment's branch and
Argo Application, which repeats the testing and verification states.

### ARC-005 State invariants

- `SPEC_VALIDATED` requires the existing `hol_spec_check` to pass.
- `MANIFESTS_VALIDATED` requires valid raw YAML and all available mandatory platform checks to pass.
- `MERGED` requires an approved GitLab merge or approved development change.
- `ENVIRONMENT_READY` requires Argo CD to report the expected revision as both `Synced` and `Healthy`.
- `ENVIRONMENT_VERIFIED` requires all mandatory suites to pass.
- Promotion approval MUST be bound to the verified revision and evidence digest.

### ARC-006 Resume behavior

A blocked run MAY resume when its dependency becomes available. Resume MUST retain the expected revision and recorded inputs unless a new run is explicitly created. A revision or policy change MUST invalidate affected downstream evidence.

## Evidence contract

Every operational gate MUST emit machine-readable evidence containing:

- Schema and tool versions.
- Lab, project, environment and branch.
- Source, expected, merged and observed revisions where applicable.
- Manifest and policy digests.
- Start and completion timestamps.
- Individual findings and overall classification.
- Approval references.
- Sanitized artifact and log references.

Evidence MUST contain no secret, token, cookie value, kubeconfig or private key.

## Proposed command surface

The following are new proposals, not existing commands:

- `hol_k8s_validate`
- `hol_k8s_deploy`
- `hol_argocd_wait`
- `hol_k8s_security_test`
- `hol_virtualserver_test`
- `hol_uat_run`
- `hol_promote`

Implementations MAY expose subcommands instead, but MUST preserve the contracts.

## Acceptance criteria

- Existing HOLagents stages and approval pauses remain usable.
- Kubernetes and vCD deployment behavior is isolated by adapter.
- Every gate distinguishes pass, warning, failure, blocker and execution error.
- Testing cannot start before exact-revision Argo readiness.
- Evidence is revision-bound, machine-readable and secret-free.
- Environment names and order are configuration rather than workflow constants.
