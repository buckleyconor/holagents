# Deployment Profile and Raw-YAML Contract

Status: Draft 0.1

## Purpose

Define the machine-readable contract created during concept and specification and consumed by build, deployment, QA and promotion.

## Profile schema

A lab repository MUST contain `deployment-profile.yaml` with this logical structure:

```yaml
apiVersion: holagents.io/v1alpha1
kind: KubernetesDeploymentProfile
metadata:
  labId: example-lab
  profileVersion: '1'
spec:
  platform: charmed-kubernetes
  namespace: example-lab
  environments:
    - name: dev
      branch: dev
      manifestsPath: manifests/dev
      argoApplication: example-lab-dev
      consequential: false
    - name: uat
      branch: uat
      manifestsPath: manifests/uat
      argoApplication: example-lab-uat
      consequential: true
    - name: prod
      branch: prod
      manifestsPath: manifests/prod
      argoApplication: example-lab-prod
      consequential: true
  promotionOrder: [dev, uat, prod]
  policy:
    required: true
    schemaVersion: null
    reference: null
  tests:
    infrastructure: tests/infrastructure/run.sh
    acceptance: tests/acceptance/run.sh
    virtualServer: tests/virtualserver/test-hol-access.sh
  credentials:
    runtimeReference: null
```

`apiVersion` is provisional and MUST be finalized before implementation.

## Requirements

### PRO-001 Target and format

The platform MUST be `charmed-kubernetes`. Deployment resources MUST be complete raw Kubernetes YAML documents. Kustomize files, overlays, Helm templates and unresolved template expressions MUST be rejected.

### PRO-002 Configurable environments

Environment names, branches, order and Argo Application identifiers MUST be profile data. The implementation MUST support the initial `dev → uat → prod` sequence without hard-coding it.

### PRO-003 Repository structure

The generated GitLab project SHOULD use:

```text
.
├── deployment-profile.yaml
├── manifests/
│   ├── dev/
│   ├── uat/
│   └── prod/
├── tests/
│   ├── infrastructure/
│   ├── acceptance/
│   └── virtualserver/
├── evidence-schema/
└── docs/
```

Each environment path MUST contain a complete deployable set because no overlay mechanism is available.

### PRO-004 Validation

Profile validation MUST fail on:

- Missing identity, environment, branch or path fields.
- Duplicate environment names or branches.
- Promotion entries that do not reference exactly one environment.
- Missing or empty manifest paths.
- Kustomize or Helm dependencies.
- Literal credentials or secret values.
- Unsupported profile versions.

### PRO-005 Raw manifest validation

Every resource MUST contain `apiVersion`, `kind` and `metadata.name`. The validator MUST detect:

- YAML parse failures.
- Duplicate resource identities.
- Unresolved placeholders.
- Unauthorized namespaces.
- Cluster-scoped resources lacking explicit policy approval.
- Secret material embedded in generated output.
- Privileged, host or device access requiring policy evaluation.

When mandatory policy is unavailable, checks dependent on that policy MUST return `BLOCKED`, not inferred pass or failure.

### PRO-006 Environment contract derivation

`/hol-spec` SHOULD derive or update `lab-prep.md` from this profile. The environment contract MUST include verification commands, endpoints, Argo Application identity, expected tests, evidence locations and unresolved dependencies.

## Acceptance criteria

- The example schema validates after provisional identifiers are finalized.
- Environment ordering can change without code modification.
- Every environment contains independently deployable raw YAML.
- Validation rejects Kustomize, templates and secret values.
- Missing policy or credentials produces an explicit blocker only when required by the attempted operation.
- `lab-prep.md` can be derived deterministically from the profile.
