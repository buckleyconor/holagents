/**
 * Shared fixtures for the k8s extension tests (spec-k8s/). Not a test file —
 * the test glob only matches `*.test.ts`.
 */
import { validateProfile, type KubernetesDeploymentProfile } from '../../extensions/k8s/profile.ts';
import { validatePolicyDocument, type PlatformPolicy } from '../../extensions/k8s/policy.ts';
import { generateManifests, type AppManifestSpec } from '../../extensions/k8s/manifests.ts';
import type { VsReport } from '../../extensions/k8s/virtualserver.ts';
import { VS_TEST_IDS } from '../../extensions/k8s/results.ts';
import { buildEvidenceBundle, type EvidenceBundle } from '../../extensions/k8s/bundle.ts';

/** spec-k8s/02 example profile, with runtime credentials configured (DEP-002 resolved). */
export const PROFILE_YAML = `apiVersion: holagents.io/v1alpha1
kind: KubernetesDeploymentProfile
metadata:
  labId: example-lab
  profileVersion: "1"
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
    runtimeReference: env:K8S_KUBE
`;

export const parsedProfile = validateProfile(PROFILE_YAML);
if (!parsedProfile.ok)
  throw new Error(`fixture profile must validate: ${JSON.stringify(parsedProfile.errors)}`);
export const PROFILE: KubernetesDeploymentProfile = parsedProfile.profile;

export const POLICY_YAML = `apiVersion: holagents.io/platform-policy/v1alpha1
name: charmed-kubernetes
version: v1
mandatoryControls:
  - id: SEC-001
    severity: mandatory
    description: no host network namespaces
    appliesTo: static
    rule:
      type: field-forbidden
      resource:
        kind: Deployment
      field: spec.template.spec.hostNetwork
  - id: SEC-002
    severity: mandatory
    description: seccomp profile required
    appliesTo: static
    rule:
      type: field-required
      resource:
        kind: Deployment
      field: spec.template.spec.securityContext.seccompProfile.type
advisoryControls:
  - id: SEC-010
    severity: advisory
    description: CPU limits should stay under 2
    appliesTo: static
    rule:
      type: field-max
      resource:
        kind: Deployment
      field: spec.replicas
      value: 10
environmentRules: {}
exceptionProcess:
  maxDurationDays: 7
  requiredEvidence: true
  approverRoles:
    - platform-admin
`;

export const parsedPolicy = validatePolicyDocument(POLICY_YAML);
if (!parsedPolicy.ok)
  throw new Error(`fixture policy must validate: ${JSON.stringify(parsedPolicy.errors)}`);
export const POLICY: PlatformPolicy = parsedPolicy.policy;

export function appSpec(): AppManifestSpec {
  return {
    name: 'example-lab',
    namespace: 'example-lab',
    image: 'registry.internal.example/example-lab:1.0.0',
    replicas: 1,
    servicePort: 8080,
    containerPort: 8090,
    probePath: '/healthz',
    resources: {
      cpuRequest: '100m',
      cpuLimit: '500m',
      memoryRequest: '128Mi',
      memoryLimit: '512Mi',
    },
    labels: { app: 'example-lab', lab: 'example-lab' },
    seccompProfileType: 'RuntimeDefault',
    virtualService: { host: 'example-lab.example.internal' },
  };
}

/** Generated manifest documents (deterministic). */
export const MANIFEST_DOCS = generateManifests(appSpec()).raw;

/** Repository files for the dev environment (path → content). */
export function devFiles(): Record<string, string> {
  return {
    'manifests/dev/deployment.yaml': MANIFEST_DOCS[0]!,
    'manifests/dev/service.yaml': MANIFEST_DOCS[1]!,
    'manifests/dev/virtualservice.yaml': MANIFEST_DOCS[2]!,
  };
}

/** A hand-built VirtualServer report for suite-runner fakes. */
export function vsReport(
  aggregate: VsReport['aggregate'],
  exitCode: number,
  overrides: Partial<VsReport> = {},
): VsReport {
  return {
    schemaVersion: '1',
    contractVersion: '1',
    runId: 'vs-fixture',
    startedAt: '2026-09-25T00:00:00.000Z',
    completedAt: '2026-09-25T00:00:05.000Z',
    host: 'example-lab.example.internal',
    basePath: '/hol',
    authPath: '/auth-hol',
    apiProbe: '/hol/api/health',
    environment: 'uat',
    branch: 'uat',
    expectedRevision: 'fixture-revision',
    tokenProvided: false,
    tokenDigest: null,
    mintedTokenDigest: null,
    tokenMatch: null,
    preflight: { status: 'READY', httpStatus: 200 },
    tests: VS_TEST_IDS.map((id) => ({ id, status: 'PASS', observedHttp: 200, durationMs: 1 })),
    aggregate,
    exitCode,
    log: ['fixture log'],
    markdown: '# fixture report',
    json: '{}',
    evidenceDigest: 'fixture-digest',
    ...overrides,
  };
}

/** A clean passing suite result set for UAT fakes. */
export function passingUatResults(manifestDigest: string) {
  return {
    infrastructure: { classification: 'PASS' as const, findings: [] },
    virtualServer: vsReport('PASS', 0),
    acceptance: {
      classification: 'PASS' as const,
      exitCode: 0,
      durationMs: 10,
      timedOut: false,
      stdout: 'acceptance ok',
      stderr: '',
    },
    skipped: [],
    manifestDigest: manifestDigest,
  };
}

/** Build a clean dev/UAT evidence bundle. */
export function makeBundle(p: {
  environment: string;
  branch: string;
  revision: string;
  argoApplication: string;
  manifestDigest: string;
  classification?: EvidenceBundle['classification'];
}): EvidenceBundle {
  const env = PROFILE.environments.find((e) => e.name === p.environment)!;
  void env;
  return buildEvidenceBundle({
    schemaVersion: '1',
    labId: PROFILE.labId,
    project: PROFILE.labId,
    environment: p.environment,
    branch: p.branch,
    revision: p.revision,
    argo: {
      application: p.argoApplication,
      syncStatus: 'Synced',
      healthStatus: 'Healthy',
      observedRevision: p.revision,
      readyAt: '2026-09-25T00:01:00.000Z',
    },
    manifests: { digest: p.manifestDigest },
    policy: { revision: POLICY.version, digest: 'fixture-policy-digest' },
    runner: 'test-runner',
    suites: [
      { suite: 'infrastructure', classification: 'PASS', findingsCount: 0 },
      { suite: 'virtualserver', classification: 'PASS', findingsCount: 0 },
      { suite: 'acceptance', classification: 'PASS', findingsCount: 0 },
    ],
    virtualServer: { markdownDigest: 'm', jsonDigest: 'j', exitCode: 0 },
    toolVersions: { holagent: '0.3.0' },
    startedAt: '2026-09-25T00:00:00.000Z',
    completedAt: '2026-09-25T00:01:00.000Z',
    retries: 0,
    classification: p.classification ?? 'PASS',
  });
}
