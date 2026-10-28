# GitLab and Argo CD Promotion

Status: Draft 0.1

## Purpose

Define one-project-per-lab GitOps promotion, exact-revision reconciliation and rollback.

## Repository and branch requirements

### GAP-001 Project ownership

Each generated lab MUST have one GitLab project containing raw manifests, repository test scripts and the deployment profile.

### GAP-002 Branch environments

Branches represent environments. Their names and order MUST come from `promotionOrder`. Promotion MUST normally occur between adjacent environments.

### GAP-003 Merge requests

A promotion merge request MUST identify:

- Source and target environments.
- Candidate and target revisions.
- Manifest and policy digests.
- Source-environment Argo status.
- Infrastructure, VirtualServer and acceptance evidence.
- Warnings, blockers and approved exceptions.
- Required approval status.

Evidence for another revision MUST NOT authorize merge.

## Argo CD readiness gate

### GAP-010 Expected revision

After merge, HOLagents MUST resolve and record the immutable expected revision before polling Argo CD.

### GAP-011 Ready condition

Readiness requires `Synced` and `Healthy` for the expected revision. `Healthy` at another revision is not ready.

### GAP-012 Failure behavior

- Progressing status continues polling within the configured timeout.
- Degraded or sync failure returns `FAIL`.
- Missing status access, missing credentials or unavailable API returns `BLOCKED`.
- Timeout or unresolved revision mismatch returns `FAIL` with observed revision evidence.
- Tests MUST not execute before readiness.

Polling interval and timeout MUST be configurable and recorded.

## Promotion states

```text
PROPOSED
→ EVIDENCE_PENDING
→ APPROVAL_PENDING
→ MERGE_READY
→ MERGED
→ SYNC_PENDING
→ HEALTH_PENDING
→ TESTING
→ PROMOTED
```

Alternative states are `BLOCKED`, `FAILED`, `ROLLBACK_PENDING` and `ROLLED_BACK`.

A candidate revision change MUST invalidate evidence and return the transition to `EVIDENCE_PENDING`.

## Rollback

Rollback SHOULD use a reviewed Git revert or promotion of a previously verified revision.

- HOLagents MUST NOT perform an undocumented direct production rollback.
- Rollback approval follows configured environment policy.
- The restored revision MUST become `Synced` and `Healthy`.
- The policy-designated minimum tests MUST run after reconciliation.
- Rollback evidence MUST link failed and restored revisions, reason, approvals and verification results.

## Security

- Branch protection and approval rules MUST not be bypassed.
- Service identities MUST receive only required GitLab and Argo observation permissions.
- Merge-request descriptions and evidence MUST not expose secrets.
- Human approval MUST identify approver, revision, transition, timestamp and evidence digest.

## Acceptance criteria

- `dev → uat → prod` promotion works from configuration.
- Another branch sequence can be configured without code changes.
- Every consequential promotion has an evidence-bearing merge request and approval.
- Tests cannot run against the wrong revision.
- A failed release can be restored through Git and verified through the same Argo gate.
- No production flow requires direct Kubernetes writes by HOLagents.
