# Platform Policy and Security Testing

Status: Draft 0.1

## Purpose

Define how administrator requirements influence specification, manifest validation and runtime security tests without inventing rules that have not yet been provided.

## Policy interface

The platform policy MUST be independently versioned and SHOULD contain:

```yaml
apiVersion: holagents.io/platform-policy/v1alpha1
metadata:
  name: charmed-kubernetes
  version: TBD
spec:
  mandatoryControls: []
  advisoryControls: []
  environmentRules: {}
  exceptionProcess: null
```

The concrete schema remains `DEP-001`.

### POL-001 Missing policy

If mandatory policy is required for a transition and is missing, malformed or unsupported, that transition MUST return `BLOCKED_POLICY`. HOLagents MUST NOT infer requirements from Kubernetes defaults or previous deployments.

### POL-002 Policy application points

Platform policy MUST be evaluated at:

1. Specification validation.
2. Raw-manifest validation.
3. Runtime infrastructure testing.
4. Platform review before promotion.

A policy revision change MUST invalidate affected evidence.

### POL-003 Findings

Findings MUST include requirement identifier, severity, resource, expected condition, observed condition, remediation and policy revision. Mandatory violations fail; advisory findings warn unless policy states otherwise.

## Infrastructure and security suite

The suite MUST be capable of evaluating supplied requirements for:

- Seccomp profiles.
- Added and dropped Linux capabilities.
- Privileged containers and privilege escalation.
- Host PID, IPC and network namespaces.
- Host paths, devices and hardware access.
- Service accounts and RBAC scope.
- Namespaces and cross-namespace access.
- Network exposure and policy.
- Storage classes and persistent volumes.
- Resource requests, limits and quotas.
- Secrets and configuration references.
- Probes and workload readiness.

The suite MUST distinguish static manifest inspection from runtime observation. Host or hardware probes MUST not execute without explicit policy authorization.

## Test identity

Runtime security tests require namespace-scoped least privilege and runtime-injected credentials. Until `DEP-002` is resolved, tests requiring cluster access MUST return `BLOCKED_CREDENTIALS`.

Security tests MUST NOT broaden permissions merely to determine whether broader access is possible.

## Exceptions

Policy exceptions MAY be supported only when they are:

- Explicitly permitted by policy.
- Attributable to an authorized approver.
- Limited to named requirements and resources.
- Time-bounded.
- Linked to evidence and revision.

An expired or revision-mismatched exception is invalid.

## Integration with existing tools

- `hol_spec_check` SHOULD validate policy references and required declarations.
- `hol_build_test` SHOULD validate generated manifest packaging.
- `hol_platform_findings` SHOULD record policy findings.
- `hol_qa_record` SHOULD record runtime security evidence.
- `hol_launch_check` SHOULD prevent launch with unresolved blocking findings.

These are intended extensions; their current behavior MUST not be misrepresented before implementation.

## Acceptance criteria

- Missing mandatory policy returns `BLOCKED`, not success.
- Supplied policies are applied at spec, manifest and runtime stages.
- Seccomp, capability and host-access results are independently visible.
- Runtime tests use least privilege and expose no credentials.
- Policy and exception revisions are bound to evidence.
- Mandatory violations prevent promotion.
