/**
 * test/k8s/bundle.test.ts
 *
 * Milestone 4 (spec-k8s/08): the evidence bundle contract — a promotion
 * requires the full bundle for its source environment (spec-k8s/01
 * §Evidence contract): environment, branch, revision, Argo observation,
 * policy version/digest, runner, suites, timestamps, retries,
 * classification. Verification is deterministic; bundles are sanitized.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  authorizesPromotion,
  buildEvidenceBundle,
  verifyEvidenceBundle,
  type EvidenceBundle,
} from '../../extensions/k8s/bundle.ts';
import { makeBundle } from './fixtures.ts';

test('a clean bundle verifies with zero problems', () => {
  const bundle = makeBundle({
    environment: 'dev',
    branch: 'dev',
    revision: 'rev-1',
    argoApplication: 'example-lab-dev',
    manifestDigest: 'manifest-digest-1',
  });
  assert.equal(verifyEvidenceBundle(bundle).length, 0);
});

test('bundles bind the Argo observation to the revision (GAP-010)', () => {
  const bundle = makeBundle({
    environment: 'dev',
    branch: 'dev',
    revision: 'rev-1',
    argoApplication: 'example-lab-dev',
    manifestDigest: 'd',
  });
  const tampered = { ...bundle, argo: { ...bundle.argo, observedRevision: 'rev-other' } };
  assert.ok(verifyEvidenceBundle(tampered).some((p) => p.includes('not revision-bound')));
});

test('the classification is a signed field of the evidence', () => {
  const bundle = makeBundle({
    environment: 'dev',
    branch: 'dev',
    revision: 'rev-1',
    argoApplication: 'example-lab-dev',
    manifestDigest: 'd',
  });
  assert.equal(bundle.classification, 'PASS');

  // Tampering with the classification invalidates the signed digest, and a
  // non-PASS bundle can never authorize a promotion.
  const inconsistent: EvidenceBundle = { ...bundle, classification: 'FAIL' };
  assert.ok(verifyEvidenceBundle(inconsistent).some((p) => p.includes('digest')));
  assert.equal(authorizesPromotion(inconsistent, bundle.revision), false);
});

test('tampering invalidates the digest', () => {
  const bundle = makeBundle({
    environment: 'uat',
    branch: 'uat',
    revision: 'rev-2',
    argoApplication: 'example-lab-uat',
    manifestDigest: 'd',
  });
  const tampered = { ...bundle, runner: 'someone-else' };
  assert.ok(verifyEvidenceBundle(tampered).some((p) => p.includes('digest')));
});

test('secret material in suite details is redacted before signing (GAP-004)', () => {
  const bundle = buildEvidenceBundle({
    schemaVersion: '1',
    labId: 'example-lab',
    project: 'example-lab',
    environment: 'dev',
    branch: 'dev',
    revision: 'rev-1',
    argo: {
      application: 'app',
      syncStatus: 'Synced',
      healthStatus: 'Healthy',
      observedRevision: 'rev-1',
      readyAt: '2026-09-25T00:01:00.000Z',
    },
    manifests: null,
    policy: { revision: 'v1', digest: 'p' },
    runner: 'r',
    suites: [
      {
        suite: 'infrastructure',
        classification: 'PASS',
        findingsCount: 0,
        details: 'deploy token=supersecretvalue12345 leaked in logs',
      },
    ],
    toolVersions: {},
    startedAt: '2026-09-25T00:00:00.000Z',
    completedAt: '2026-09-25T00:01:00.000Z',
    retries: 0,
    classification: 'PASS',
  });
  assert.ok(!bundle.suites[0]!.details!.includes('supersecretvalue12345'));
  assert.ok(bundle.suites[0]!.details!.includes('[REDACTED]'));
});

test('authorizesPromotion requires the exact revision and a passing bundle', () => {
  const bundle = makeBundle({
    environment: 'dev',
    branch: 'dev',
    revision: 'rev-1',
    argoApplication: 'example-lab-dev',
    manifestDigest: 'd',
  });
  assert.equal(authorizesPromotion(bundle, 'rev-1'), true);
  assert.equal(authorizesPromotion(bundle, 'rev-2'), false);

  const failing: EvidenceBundle = { ...bundle, classification: 'FAIL' };
  assert.equal(authorizesPromotion(failing, 'rev-1'), false);
});
