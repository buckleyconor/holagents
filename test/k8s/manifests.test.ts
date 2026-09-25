/**
 * test/k8s/manifests.test.ts
 *
 * Milestone 2 (spec-k8s/08): deterministic raw-YAML generation and static
 * validation — PRO-001 (deterministic output), PRO-002 (Kustomize
 * prohibited), PRO-003 (no cluster defaults), PRO-004 (no secret
 * material), PRO-005 (strict validation: identity, duplicates,
 * placeholders, namespaces).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  generateManifests,
  manifestSetDigest,
  parseManifestDocuments,
  validateManifests,
  type AppManifestSpec,
} from '../../extensions/k8s/manifests.ts';
import { canonicalString, emitYaml, fieldPath, toPlain } from '../../extensions/k8s/yaml.ts';
import { PROFILE, POLICY, MANIFEST_DOCS, appSpec } from './fixtures.ts';

test('PRO-001: generation is deterministic and key-order independent', () => {
  const a = generateManifests(appSpec());
  const reordered: AppManifestSpec = {
    ...appSpec(),
    labels: { lab: 'example-lab', app: 'example-lab' },
  };
  const b = generateManifests(reordered);
  assert.deepEqual(a.raw, b.raw, 'same content, different key order → identical bytes');

  const changed = generateManifests({ ...appSpec(), replicas: 2 });
  assert.notDeepEqual(a.raw, changed.raw, 'different content → different output');

  // Round-trip: emitted docs parse back and re-emit identically.
  const parsed = parseManifestDocuments(a.raw.join('\n---\n'));
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.docs.map((d) => emitYaml(d)).join('\n---\n'), a.raw.join('\n---\n'));
});

test('generation produces the expected document set', () => {
  const parsed = parseManifestDocuments(MANIFEST_DOCS.join('\n---\n'));
  assert.deepEqual(parsed.errors, []);
  const kinds = parsed.docs.map((d) => (toPlain(d) as { kind: string }).kind);
  assert.deepEqual(kinds, ['Deployment', 'Service', 'VirtualService']);
});

test('PRO-005: clean generated manifests validate PASS with the platform policy', () => {
  const result = validateManifests(MANIFEST_DOCS, PROFILE, POLICY, 'dev');
  assert.equal(result.classification, 'PASS');
  assert.deepEqual(result.findings, []);
  assert.deepEqual(result.errors, []);
  assert.equal(result.manifestDigest.length, 64);
});

test('PRO-005: unresolved placeholders fail validation', () => {
  const result = validateManifests(
    [MANIFEST_DOCS[0]!.replace('example-lab:1.0.0', '{{IMAGE}}')],
    PROFILE,
    POLICY,
    'dev',
  );
  assert.equal(result.classification, 'FAIL');
  assert.ok(result.errors.some((e) => e.code === 'unresolved-placeholder'));
});

test('PRO-003: manifests outside the profile namespace fail', () => {
  const wrong = MANIFEST_DOCS[0]!.replace('namespace: example-lab', 'namespace: other-ns');
  const result = validateManifests(
    [wrong, MANIFEST_DOCS[1]!.replace('namespace: example-lab', 'namespace: other-ns')],
    PROFILE,
    POLICY,
    'dev',
  );
  assert.equal(result.classification, 'FAIL');
  assert.ok(result.errors.some((e) => e.code === 'unauthorized-namespace'));
});

test('PRO-005: duplicate identities fail', () => {
  const result = validateManifests([MANIFEST_DOCS[0]!, MANIFEST_DOCS[0]!], PROFILE, POLICY, 'dev');
  assert.equal(result.classification, 'FAIL');
  assert.ok(result.errors.some((e) => e.code === 'duplicate-identity'));
});

test('PRO-005: missing identity fails', () => {
  const noName = MANIFEST_DOCS[1]!.replace('  name: example-lab', '  namespace: example-lab');
  const result = validateManifests([noName], PROFILE, POLICY, 'dev');
  assert.equal(result.classification, 'FAIL');
  assert.ok(result.errors.some((e) => e.code === 'manifest-identity'));
});

test('PRO-004: secret material in manifests fails validation', () => {
  const withSecret = MANIFEST_DOCS[0]!.replace(
    '          ports:\n            - containerPort: 8090',
    '          ports:\n            - containerPort: 8090\n          env:\n            - name: APP_TOKEN\n              value: aB3dE7fG1hI4jK6lM9oP2qR5sT8vW0xY1zAbCdEfGh',
  );
  const result = validateManifests([withSecret], PROFILE, POLICY, 'dev');
  assert.equal(result.classification, 'FAIL');
  assert.ok(result.errors.some((e) => e.code === 'secret-material'));
});

test('privileged / host access is a mandatory static failure', () => {
  const privileged = MANIFEST_DOCS[0]!.replace(
    'allowPrivilegeEscalation: false',
    'allowPrivilegeEscalation: false\n            privileged: true',
  );
  const host = MANIFEST_DOCS[0]!.replace(
    '        runAsNonRoot: true\n      containers:',
    '        runAsNonRoot: true\n      hostNetwork: true\n      containers:',
  );
  for (const [doc, id] of [
    [privileged, 'MANIFEST-PRIVILEGED'],
    [host, 'MANIFEST-HOST'],
  ] as const) {
    const result = validateManifests([doc], PROFILE, POLICY, 'dev');
    assert.equal(result.classification, 'FAIL');
    assert.ok(
      result.findings.some((f) => f.id === id),
      `expected ${id} finding`,
    );
  }
});

test('cluster-scoped resources require policy approval (fail-closed)', () => {
  const rbac = `apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: example-lab-cluster`;
  // No policy: blocked outright.
  const blocked = validateManifests([rbac], PROFILE, null, 'dev');
  assert.equal(blocked.classification, 'BLOCKED');
  assert.equal(blocked.subcode, 'BLOCKED_POLICY');

  // Policy present but no approval control matches: fails.
  const failed = validateManifests([rbac], PROFILE, POLICY, 'dev');
  assert.equal(failed.classification, 'FAIL');
  assert.ok(failed.errors.some((e) => e.code === 'cluster-scoped-unapproved'));
});

test('policy field-forbidden controls produce findings', () => {
  const host = MANIFEST_DOCS[0]!.replace(
    '        runAsNonRoot: true\n      containers:',
    '        runAsNonRoot: true\n      hostNetwork: true\n      containers:',
  );
  const result = validateManifests([host], PROFILE, POLICY, 'dev');
  const finding = result.findings.find((f) => f.id === 'SEC-001');
  assert.ok(finding, 'SEC-001 (hostNetwork forbidden) should fire');
  assert.equal(finding.severity, 'mandatory');
});

test('policy field-required controls fire when the field is absent', () => {
  const stripped = MANIFEST_DOCS[0]!.replace(
    '        seccompProfile:\n          type: RuntimeDefault\n',
    '',
  );
  const result = validateManifests([stripped], PROFILE, POLICY, 'dev');
  assert.ok(result.findings.some((f) => f.id === 'SEC-002'));
});

test('manifestSetDigest is stable under ordering and content-sensitive', () => {
  const parsed = parseManifestDocuments(MANIFEST_DOCS.join('\n---\n'));
  const entries = parsed.docs.map((d) => {
    const p = toPlain(d) as { apiVersion: string; kind: string; metadata: { name: string } };
    return { kind: p.kind, name: p.metadata.name, digest: canonicalString(d) };
  });
  const a = manifestSetDigest(entries);
  const b = manifestSetDigest([...entries].reverse());
  assert.equal(a, b);
  assert.notEqual(a, manifestSetDigest(entries.map((e) => ({ ...e, digest: 'other' }))));
});

test('fieldPath traverses nested manifest fields', () => {
  const doc = toPlain(parseManifestDocuments(MANIFEST_DOCS[0]!).docs[0]!) as Record<
    string,
    unknown
  >;
  const path = 'spec.template.spec.securityContext.seccompProfile.type';
  const found = fieldPath(doc, path);
  assert.ok(found.found);
  assert.equal(found.value, 'RuntimeDefault');
  const missing = fieldPath(doc, 'spec.no.such.field');
  assert.equal(missing.found, false);
});
