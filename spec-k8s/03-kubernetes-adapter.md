# Kubernetes Deployment Adapter

Status: Draft 0.1

## Purpose

Specify the Charmed Kubernetes adapter interface and its approval, idempotency and evidence behavior.

## Adapter operations

### ADP-001 Validate

`validate(profile, environment, policy) → ValidationResult`

The operation MUST validate the profile, raw YAML, namespace boundaries and available platform policy. It MUST return `BLOCKED` when mandatory policy is unavailable.

### ADP-002 Prepare deployment

`prepare(environment, sourceRevision) → ChangeSet`

The operation MUST produce deterministic environment content, a resource inventory and a content digest. Identical inputs MUST produce identical output. It MUST NOT contact the cluster or store credentials.

### ADP-003 Deploy development

`deployDev(changeSet, approval) → DeploymentResult`

Development deployment MAY be automated only after explicit approval. The operation SHOULD commit or merge the approved desired state into the configured development branch and let Argo CD reconcile it.

### ADP-004 Promote

`promote(sourceEnvironment, targetEnvironment, evidence) → MergeRequestResult`

Promotion MUST create or update a GitLab merge request. It MUST NOT directly write to UAT or production clusters. Consequential merge requests MUST require configured human approval.

### ADP-005 Observe

`observe(environment, expectedRevision, timeout) → ReconciliationResult`

The operation MUST wait until the configured Argo Application reports:

- Sync status `Synced`.
- Health status `Healthy`.
- A deployed revision matching the expected immutable Git revision.

Tests MUST NOT start while status is progressing, degraded, missing, unknown, timed out or associated with another revision.

### ADP-006 Test

`test(environment, revision, suites) → TestResult`

The operation MUST execute mandatory suites in this order:

1. Infrastructure and security.
2. VirtualServer access.
3. Repository application acceptance.

A later suite SHOULD NOT execute after a blocking infrastructure failure unless explicitly configured for diagnostic purposes.

### ADP-007 Destroy

`destroy(environment, approval) → DestroyResult`

Destruction MUST be expressed as a reviewed Git change and reconciled through Argo CD. Consequential destruction requires approval. Repeating destruction for an already absent environment MUST be safe and idempotent.

## Idempotency and concurrency

Each mutating operation MUST use an idempotency key derived from lab, environment, operation, expected revision and desired-state digest.

- Repeating identical inputs MUST resume or return the original outcome.
- Reusing a key with different inputs MUST fail.
- Concurrent branch movement or superseded revisions MUST stop the operation rather than overwrite unreviewed state.
- Retries MUST be bounded and recorded.

## Identity and access

The adapter MUST require runtime-injected, namespace-scoped least-privilege credentials. It MUST NOT write credentials to Git, manifests, logs or evidence.

The concrete mechanism is `DEP-002`. Until resolved:

- Offline rendering and validation MAY continue.
- Operations requiring cluster or Argo access MUST return `BLOCKED_CREDENTIALS`.
- The implementation MUST NOT fall back to cluster-admin, static kubeconfig or broad shared credentials.

## Evidence

Every operation MUST record its input digest, actor, environment, expected revision, result, duration and sanitized diagnostics. Deployment and promotion evidence MUST link the associated GitLab merge request and Argo observation.

## Acceptance criteria

- Identical preparation inputs produce identical resources and digests.
- Development automation cannot start without recorded approval.
- UAT and production changes use merge requests rather than direct cluster writes.
- Tests wait for exact-revision Argo readiness.
- Retries do not create duplicate commits, merge requests or test evidence.
- Missing credentials fail closed as a blocker.
- Destroy is GitOps-driven, approved, auditable and idempotent.
