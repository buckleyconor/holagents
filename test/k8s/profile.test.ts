import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateProfile,
  PROFILE_API_VERSION,
  PROFILE_KIND,
  PROFILE_PLATFORM,
} from '../../extensions/k8s/profile.ts';

/** The example profile from spec-k8s/02 §Profile schema. */
const BASE = `apiVersion: holagents.io/v1alpha1
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
    runtimeReference: null
`;

/** Minimal profile for focused negative cases. */
const MIN = `apiVersion: holagents.io/v1alpha1
kind: KubernetesDeploymentProfile
metadata:
  labId: example-lab
  profileVersion: "1"
spec:
  platform: charmed-kubernetes
  namespace: example-lab
  environments: []
  promotionOrder: []
  policy:
    required: false
    schemaVersion: null
    reference: null
  tests:
    infrastructure: tests/infrastructure/run.sh
    acceptance: tests/acceptance/run.sh
    virtualServer: tests/virtualserver/test-hol-access.sh
  credentials:
    runtimeReference: null
`;

/** Replace the first match of `re` in `base` (throws when the target is absent). */
function edit(base: string, re: RegExp, to: string): string {
  if (!re.test(base)) throw new Error(`edit target not found: ${re}`);
  return base.replace(re, to);
}

test('spec-k8s/02 example profile validates', () => {
  const r = validateProfile(BASE);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.profile.apiVersion, PROFILE_API_VERSION);
  assert.equal(r.profile.kind, PROFILE_KIND);
  assert.equal(r.profile.labId, 'example-lab');
  assert.equal(r.profile.profileVersion, '1');
  assert.equal(r.profile.platform, PROFILE_PLATFORM);
  assert.equal(r.profile.namespace, 'example-lab');
  assert.deepEqual(
    r.profile.environments.map((e) => [e.name, e.branch, e.consequential]),
    [
      ['dev', 'dev', false],
      ['uat', 'uat', true],
      ['prod', 'prod', true],
    ],
  );
  assert.equal(r.profile.environments[0]!.manifestsPath, 'manifests/dev');
  assert.equal(r.profile.environments[0]!.argoApplication, 'example-lab-dev');
  assert.deepEqual(r.profile.promotionOrder, ['dev', 'uat', 'prod']);
  assert.deepEqual(r.profile.policy, { required: true, schemaVersion: null, reference: null });
  assert.deepEqual(r.profile.tests, {
    infrastructure: 'tests/infrastructure/run.sh',
    acceptance: 'tests/acceptance/run.sh',
    virtualServer: 'tests/virtualserver/test-hol-access.sh',
  });
  assert.deepEqual(r.profile.credentials, { runtimeReference: null });
});

test('PRO-002: environment names, branches and order are profile data (sandbox -> dev)', () => {
  const alt = `apiVersion: holagents.io/v1alpha1
kind: KubernetesDeploymentProfile
metadata:
  labId: example-lab
  profileVersion: "1"
spec:
  platform: charmed-kubernetes
  namespace: example-lab
  environments:
    - name: sandbox
      branch: sandbox
      manifestsPath: manifests/sandbox
      argoApplication: example-lab-sandbox
      consequential: false
    - name: dev
      branch: dev
      manifestsPath: manifests/dev
      argoApplication: example-lab-dev
      consequential: false
  promotionOrder: [sandbox, dev]
  policy:
    required: false
    schemaVersion: null
    reference: null
  tests:
    infrastructure: tests/infrastructure/run.sh
    acceptance: tests/acceptance/run.sh
    virtualServer: tests/virtualserver/test-hol-access.sh
  credentials:
    runtimeReference: null
`;
  const ok = validateProfile(alt);
  assert.equal(ok.ok, true);
  if (!ok.ok) return;
  assert.deepEqual(ok.profile.promotionOrder, ['sandbox', 'dev']);
});

test('bare numeric profileVersion 1 is accepted and normalized', () => {
  const r = validateProfile(edit(BASE, /profileVersion: "1"/, 'profileVersion: 1'));
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.profile.profileVersion, '1');
});

test('parse errors: tab indentation', () => {
  const r = validateProfile(edit(BASE, /^metadata:/m, 'metadata:\n  labId: x\n\tbad: y'));
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.errors[0]!.code, 'yaml-error');
});

test('parse errors: unbalanced flow', () => {
  const r = validateProfile(
    edit(BASE, /promotionOrder: \[dev, uat, prod\]/, 'promotionOrder: [dev, uat'),
  );
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.errors[0]!.code, 'yaml-error');
});

test('parse errors: scalar root is rejected', () => {
  const r = validateProfile('just a scalar');
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.errors[0]!.code, 'bad-root');
});

test('unknown top-level key is rejected', () => {
  const r = validateProfile(BASE + '\nextra: true\n');
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.code === 'unknown-key' && e.path === 'extra'));
});

test('missing top-level key is rejected', () => {
  const r = validateProfile(edit(BASE, /^kind: KubernetesDeploymentProfile\n/m, ''));
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.code === 'missing-key' && e.path === 'kind'));
});

test('wrong apiVersion is rejected', () => {
  const r = validateProfile(
    edit(BASE, /apiVersion: holagents.io\/v1alpha1/, 'apiVersion: holagents.io/v2'),
  );
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.code === 'bad-api-version'));
});

test('wrong platform is rejected', () => {
  const r = validateProfile(edit(BASE, /platform: charmed-kubernetes/, 'platform: vcd-docker'));
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.code === 'bad-platform'));
});

test('unsupported profileVersion is rejected', () => {
  const r = validateProfile(edit(BASE, /profileVersion: "1"/, 'profileVersion: "2"'));
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.code === 'unsupported-profile-version'));
});

test('missing environment branch is rejected', () => {
  const r = validateProfile(edit(BASE, /^      branch: dev\n/m, ''));
  assert.equal(r.ok, false);
  if (!r.ok)
    assert.ok(
      r.errors.some((e) => e.code === 'missing-key' && e.path === 'spec.environments[0].branch'),
    );
});

test('duplicate environment name is rejected', () => {
  const r = validateProfile(edit(BASE, /- name: uat/, '- name: dev'));
  assert.equal(r.ok, false);
  if (!r.ok) {
    const dup = r.errors.find((e) => e.code === 'duplicate-environment');
    assert.ok(dup);
    assert.equal(dup!.path, 'spec.environments[1]');
  }
});

test('duplicate environment branch is rejected', () => {
  const r = validateProfile(edit(BASE, /^      branch: uat\n/m, '      branch: dev\n'));
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.code === 'duplicate-branch'));
});

test('unknown key inside an environment is rejected', () => {
  const r = validateProfile(
    edit(BASE, /consequential: false\n/, 'consequential: false\n      image: nginx\n'),
  );
  assert.equal(r.ok, false);
  if (!r.ok)
    assert.ok(
      r.errors.some((e) => e.code === 'unknown-key' && e.path === 'spec.environments[0].image'),
    );
});

test('non-boolean consequential is rejected', () => {
  const r = validateProfile(edit(BASE, /consequential: false/, 'consequential: yes'));
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.code === 'bad-type'));
});

test('empty environments list is rejected', () => {
  const r = validateProfile(MIN);
  assert.equal(r.ok, false);
  if (!r.ok)
    assert.ok(r.errors.some((e) => e.code === 'bad-value' && e.path === 'spec.environments'));
});

test('promotionOrder referencing an unknown environment is rejected', () => {
  const r = validateProfile(
    edit(BASE, /promotionOrder: \[dev, uat, prod\]/, 'promotionOrder: [dev, staging, prod]'),
  );
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.code === 'promotion-order-entry'));
});

test('promotionOrder missing an environment is rejected', () => {
  const r = validateProfile(
    edit(BASE, /promotionOrder: \[dev, uat, prod\]/, 'promotionOrder: [dev, uat]'),
  );
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.code === 'promotion-order-coverage'));
});

test('promotionOrder repeating an environment is rejected', () => {
  const r = validateProfile(
    edit(BASE, /promotionOrder: \[dev, uat, prod\]/, 'promotionOrder: [dev, uat, uat]'),
  );
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.code === 'promotion-order-entry'));
});

test('kustomize manifest path is rejected (ADR-K8S-001)', () => {
  const r = validateProfile(
    edit(BASE, /manifestsPath: manifests\/dev/, 'manifestsPath: manifests/dev/kustomization.yaml'),
  );
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.code === 'kustomize-or-helm'));
});

test('helm manifest path is rejected (ADR-K8S-001)', () => {
  const r = validateProfile(
    edit(BASE, /manifestsPath: manifests\/uat/, 'manifestsPath: charts/myapp'),
  );
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.code === 'kustomize-or-helm'));
});

test('literal secret material in a reference field is rejected', () => {
  const r = validateProfile(
    edit(
      BASE,
      /runtimeReference: null/,
      'runtimeReference: AbCdEfGh1234567890abcdefghijklmnopqrstuvwx',
    ),
  );
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.code === 'secret-material'));
});

test('URL userinfo in a policy reference is rejected', () => {
  const r = validateProfile(
    edit(
      BASE,
      /reference: null/,
      'reference: https://deploy-bot:s3cret@gitlab.example/policies.git',
    ),
  );
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.code === 'secret-material'));
});

test('multiple problems are all reported at once', () => {
  // Compose deliberately: bad apiVersion + duplicate env name + unknown key.
  const composed = edit(
    edit(BASE, /apiVersion: holagents.io\/v1alpha1/, 'apiVersion: holagents.io/v2'),
    /- name: uat/,
    '- name: dev',
  );
  const r = validateProfile(composed + '\nextra: true\n');
  assert.equal(r.ok, false);
  if (!r.ok) {
    const codes = new Set(r.errors.map((e) => e.code));
    assert.ok(codes.has('bad-api-version'));
    assert.ok(codes.has('duplicate-environment'));
    assert.ok(codes.has('unknown-key'));
  }
});

test('branch containing whitespace is rejected', () => {
  const r = validateProfile(edit(BASE, /^      branch: uat\n/m, '      branch: uat next\n'));
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.code === 'bad-value'));
});
