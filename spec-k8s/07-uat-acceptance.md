# UAT and Application Acceptance

Status: Draft 0.1

## Purpose

Introduce UAT as an evidence-producing stage between development and production.

## UAT entry conditions

A UAT run MAY start only when:

- A candidate revision has passed development verification.
- A promotion merge request has been approved and merged into the configured UAT branch.
- Argo CD reports that exact revision as `Synced` and `Healthy`.
- Required policy and credentials are available.

Until the UAT environment exists, transitions requiring it MUST return `BLOCKED_UAT`.

## Required suites

### UAT-001 Infrastructure and security

The platform suite MUST run first and evaluate all available mandatory platform controls, including seccomp, capabilities and host or hardware access.

### UAT-002 VirtualServer

The access suite MUST follow [VirtualServer Access Testing](06-virtualserver-testing.md).

### UAT-003 Application acceptance

Each repository MUST contain a non-interactive acceptance entry point, initially:

```text
tests/acceptance/run.sh
```

The script contract MUST define:

- Required environment variables and inputs.
- Timeout.
- Deterministic exit status.
- Test and tool versions.
- JSON or JUnit result location.
- Cleanup behavior.

The script MUST test the deployed revision and MUST not deploy or mutate another environment. Missing, non-executable or timed-out mandatory scripts return `BLOCKED` or `ERROR`; executed failed assertions return `FAIL`.

## Scheduling

UAT MUST run after merge and Argo readiness. It MAY also run:

- On a configurable schedule.
- Manually against an immutable revision.
- As an authorized retry.

Scheduled runs MUST never promote automatically. Concurrent runs for the same lab, environment and revision SHOULD be deduplicated or serialized.

## Evidence bundle

Each run MUST produce an immutable or content-addressed bundle with:

- Lab, project, branch, environment and revision.
- Argo Application and readiness observations.
- Policy revision.
- Runner identity reference without credentials.
- Infrastructure/security results.
- VirtualServer Markdown and JSON.
- Application acceptance results.
- Tool versions, timings and retry relationships.
- Final classification and evidence digests.

## Promotion decision

A candidate is promotable only when:

- Argo was ready at the tested revision.
- Mandatory platform policy was available.
- All mandatory infrastructure checks passed.
- VirtualServer returned `PASS` or an explicitly accepted `PASS_WITH_WARNINGS`.
- Application acceptance passed.
- Evidence integrity checks passed.
- Required human approval was recorded.

Automation MAY create or update the next promotion merge request. It MUST NOT merge a consequential transition without configured approval.

## States

```text
PENDING
→ WAITING_FOR_ARGO
→ RUNNING_INFRA
→ RUNNING_VIRTUALSERVER
→ RUNNING_ACCEPTANCE
→ EVIDENCE_READY
→ AWAITING_APPROVAL
→ APPROVED | REJECTED
```

Alternative terminal states are `FAILED`, `BLOCKED`, `ERROR` and `SUPERSEDED`.

These are substates of the operational flow in
[Architecture and lifecycle](01-architecture-lifecycle.md): `RUNNING_INFRA`
runs inside `INFRA_TESTING`, `RUNNING_VIRTUALSERVER` inside
`VIRTUALSERVER_TESTING`, and `RUNNING_ACCEPTANCE` inside `ACCEPTANCE_TESTING`.

A newer revision MUST supersede incomplete evidence for an older revision. Older evidence remains retained but cannot authorize the newer candidate.

## Acceptance criteria

- UAT is mandatory before production promotion.
- All three suites remain independently visible.
- Tests execute against the expected Argo revision.
- Repository acceptance scripts are deterministic and non-interactive.
- Scheduled runs do not promote automatically.
- Evidence is revision-specific, secret-free and linked to promotion.
- Human approval is invalidated if the candidate or evidence changes.
