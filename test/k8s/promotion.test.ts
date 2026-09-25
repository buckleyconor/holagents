/**
 * test/k8s/promotion.test.ts
 *
 * Milestone 5 (spec-k8s/08): the promotion flow (spec-k8s/04) —
 * adjacency enforcement, evidence/approval gates, idempotent merge
 * requests, and GitOps rollback with a restored revision.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FakeClock } from '../../extensions/k8s/clock.ts';
import { InMemoryGitLab } from '../../extensions/k8s/gitlab.ts';
import { IdempotencyStore } from '../../extensions/k8s/idempotency.ts';
import {
  promote,
  rollback,
  type PromotionDependencies,
  type PromotionInput,
  type RollbackDependencies,
  type RollbackInput,
} from '../../extensions/k8s/promotion.ts';
import { PROFILE, makeBundle } from './fixtures.ts';
import { type ArgoClient, type ArgoObservation } from '../../extensions/k8s/argo.ts';
import { buildEvidenceBundle, type EvidenceBundle } from '../../extensions/k8s/bundle.ts';
import type { ApprovalRef } from '../../extensions/k8s/adapter.ts';

const envBranches = [
  { name: 'dev', consequential: false },
  { name: 'uat', consequential: true },
  { name: 'prod', consequential: true },
];

const DEV_HEAD = 'dev-head';
const UAT_HEAD = 'uat-head';

function devBundle(revision: string = DEV_HEAD): EvidenceBundle {
  return makeBundle({
    environment: 'dev',
    branch: 'dev',
    revision,
    argoApplication: 'example-lab-dev',
    manifestDigest: 'digest-dev',
  });
}

function uatBundle(revision: string = UAT_HEAD): EvidenceBundle {
  return makeBundle({
    environment: 'uat',
    branch: 'uat',
    revision,
    argoApplication: 'example-lab-uat',
    manifestDigest: 'digest-uat',
  });
}

function setup() {
  const clock = new FakeClock('2026-09-25T00:00:00.000Z');
  const gitlab = new InMemoryGitLab(clock);
  const idempotency = new IdempotencyStore(() => clock.now());
  const deps: PromotionDependencies = { gitlab, clock, idempotency };
  return { gitlab, deps };
}

function approval(revision: string, digest: string, transition: string): ApprovalRef {
  return {
    approver: 'ada',
    revision,
    transition,
    timestamp: '2026-09-25T00:02:00.000Z',
    evidenceDigest: digest,
  };
}

test('non-adjacent promotions are rejected (spec-k8s/04 §Promotion flow)', async () => {
  const { deps } = setup();
  const input: PromotionInput = {
    profile: PROFILE,
    sourceEnvironment: 'dev',
    targetEnvironment: 'prod',
    candidateRevision: DEV_HEAD,
    sourceBundle: devBundle(),
    sourceArgo: {
      application: 'a',
      syncStatus: 'Synced',
      healthStatus: 'Healthy',
      observedRevision: DEV_HEAD,
    },
    approval: approval(DEV_HEAD, 'x', 'dev -> prod'),
  };
  const result = await promote(deps, input);
  assert.equal(result.classification, 'ERROR');
  assert.ok(result.reasons.some((r) => r.includes('adjacent')));
});

test('stale dev evidence (revision mismatch) blocks', async () => {
  const { deps } = setup();
  const input: PromotionInput = {
    profile: PROFILE,
    sourceEnvironment: 'dev',
    targetEnvironment: 'uat',
    candidateRevision: 'newer-head',
    sourceBundle: devBundle(),
    sourceArgo: {
      application: 'a',
      syncStatus: 'Synced',
      healthStatus: 'Healthy',
      observedRevision: DEV_HEAD,
    },
    approval: approval(DEV_HEAD, 'x', 'dev -> uat'),
  };
  const result = await promote(deps, input);
  assert.equal(result.classification, 'BLOCKED');
  assert.equal(result.subcode, 'BLOCKED_EVIDENCE');
});

test('a non-passing source bundle blocks', async () => {
  const { deps } = setup();
  const failing: EvidenceBundle = {
    ...devBundle(),
    classification: 'FAIL',
  };
  const input: PromotionInput = {
    profile: PROFILE,
    sourceEnvironment: 'dev',
    targetEnvironment: 'uat',
    candidateRevision: DEV_HEAD,
    sourceBundle: failing,
    sourceArgo: {
      application: 'a',
      syncStatus: 'Synced',
      healthStatus: 'Healthy',
      observedRevision: DEV_HEAD,
    },
    approval: approval(DEV_HEAD, 'x', 'dev -> uat'),
  };
  const result = await promote(deps, input);
  assert.equal(result.classification, 'BLOCKED');
  assert.equal(result.subcode, 'BLOCKED_EVIDENCE');
});

test('consequential targets require a digest-bound approval (GAP-007)', async () => {
  const { deps } = setup();
  const base: PromotionInput = {
    profile: PROFILE,
    sourceEnvironment: 'uat',
    targetEnvironment: 'prod',
    candidateRevision: UAT_HEAD,
    sourceBundle: uatBundle(),
    sourceArgo: {
      application: 'a',
      syncStatus: 'Synced',
      healthStatus: 'Healthy',
      observedRevision: UAT_HEAD,
    },
    approval: null,
  };
  const noApproval = await promote(deps, base);
  assert.equal(noApproval.classification, 'BLOCKED');
  assert.equal(noApproval.subcode, 'BLOCKED_APPROVAL');

  const wrongDigest = await promote(deps, {
    ...base,
    approval: approval(UAT_HEAD, 'wrong-digest', 'uat -> prod'),
  });
  assert.equal(wrongDigest.classification, 'BLOCKED');
  assert.equal(wrongDigest.subcode, 'BLOCKED_APPROVAL');

  const wrongRevision = await promote(deps, {
    ...base,
    approval: approval('old-revision', uatBundle().evidenceDigest, 'uat -> prod'),
  });
  assert.equal(wrongRevision.classification, 'BLOCKED');
  assert.equal(wrongRevision.subcode, 'BLOCKED_APPROVAL');
});

test('happy path: the MR merges and the target branch advances', async () => {
  const { gitlab, deps } = setup();
  await gitlab.ensureProject('example-lab', envBranches);
  // The candidate is the dev branch head after the (already approved) dev deploy.
  const devHead = await gitlab.commit(
    'example-lab',
    'dev',
    { 'manifests/dev/service.yaml': 'x' },
    'deploy',
    'ada',
  );
  const bundle = devBundle(devHead);
  const input: PromotionInput = {
    profile: PROFILE,
    sourceEnvironment: 'dev',
    targetEnvironment: 'uat',
    candidateRevision: devHead,
    sourceBundle: bundle,
    sourceArgo: {
      application: 'a',
      syncStatus: 'Synced',
      healthStatus: 'Healthy',
      observedRevision: devHead,
    },
    approval: approval(devHead, bundle.evidenceDigest, 'dev -> uat'),
  };
  const result = await promote(deps, input);
  assert.equal(result.classification, 'PASS');
  assert.equal(result.mergeRequestIid, 1);
  assert.equal(result.mergedRevision, await gitlab.head('example-lab', 'uat'));
  assert.ok(result.mergedRevision !== devHead, 'GAP-012: the merge creates its own revision');

  // GAP-005: the source branch is untouched.
  assert.equal(await gitlab.head('example-lab', 'dev'), devHead);
});

test('a candidate that is not the source head blocks (BLOCKED_REVISION)', async () => {
  const { gitlab, deps } = setup();
  await gitlab.ensureProject('example-lab', envBranches);
  const bundle = devBundle();
  const input: PromotionInput = {
    profile: PROFILE,
    sourceEnvironment: 'dev',
    targetEnvironment: 'uat',
    candidateRevision: DEV_HEAD,
    sourceBundle: bundle,
    sourceArgo: {
      application: 'a',
      syncStatus: 'Synced',
      healthStatus: 'Healthy',
      observedRevision: DEV_HEAD,
    },
    approval: approval(DEV_HEAD, bundle.evidenceDigest, 'dev -> uat'),
  };
  const result = await promote(deps, input);
  assert.equal(result.classification, 'BLOCKED');
  assert.equal(result.subcode, 'BLOCKED_REVISION');
  void gitlab;
});

test('promotion is idempotent: identical inputs replay without a new MR', async () => {
  const { gitlab, deps } = setup();
  await gitlab.ensureProject('example-lab', envBranches);
  const devHead = await gitlab.commit(
    'example-lab',
    'dev',
    { 'manifests/dev/service.yaml': 'x' },
    'deploy',
    'ada',
  );
  const bundle = devBundle(devHead);
  const input: PromotionInput = {
    profile: PROFILE,
    sourceEnvironment: 'dev',
    targetEnvironment: 'uat',
    candidateRevision: devHead,
    sourceBundle: bundle,
    sourceArgo: {
      application: 'a',
      syncStatus: 'Synced',
      healthStatus: 'Healthy',
      observedRevision: devHead,
    },
    approval: approval(devHead, bundle.evidenceDigest, 'dev -> uat'),
  };
  const first = await promote(deps, input);
  const second = await promote(deps, input);
  assert.deepEqual(second, first);
  const mr = await gitlab.getMergeRequest('example-lab', 1);
  assert.equal(mr!.state, 'merged');
});

// ---------------------------------------------------------------------------
// Rollback (spec-k8s/04 §Rollback flow)
// ---------------------------------------------------------------------------

class HeadEchoArgo implements ArgoClient {
  private gitlab: InMemoryGitLab;
  private branch: string;
  constructor(gitlab: InMemoryGitLab, branch: string) {
    this.gitlab = gitlab;
    this.branch = branch;
  }
  async getApplication(_name: string): Promise<ArgoObservation | null> {
    const head = await this.gitlab.head('example-lab', this.branch);
    return head === null
      ? null
      : { syncStatus: 'Synced', healthStatus: 'Healthy', observedRevision: head };
  }
}

class StaleArgo implements ArgoClient {
  async getApplication(_name: string): Promise<ArgoObservation | null> {
    return { syncStatus: 'OutOfSync', healthStatus: 'Degraded', observedRevision: 'old' };
  }
}

async function rollbackSetup(
  argoFactory: (gitlab: InMemoryGitLab) => ArgoClient,
  minSuites?: RollbackDependencies['runMinSuites'],
) {
  const clock = new FakeClock('2026-09-25T00:00:00.000Z');
  const gitlab = new InMemoryGitLab(clock);
  await gitlab.ensureProject('example-lab', envBranches);
  const deps: RollbackDependencies = {
    gitlab,
    argo: argoFactory(gitlab),
    clock,
    runMinSuites:
      minSuites ??
      (async () => ({
        infrastructure: { classification: 'PASS', findings: [] },
        virtualServer: { classification: 'PASS', findings: [] },
      })),
    argoTimeoutMs: 30_000,
    argoPollIntervalMs: 1_000,
  };
  return { gitlab, deps };
}

const restoredManifests: Record<string, string> = {
  'manifests/prod/service.yaml': 'restored-content',
};

function rollbackInput(): RollbackInput {
  return {
    profile: PROFILE,
    environment: 'prod',
    failedRevision: 'prod-bad',
    restoredRevision: 'prod-verified',
    reason: 'UAT evidence failure',
    restoredManifests,
    approval: approval('prod-verified', 'digest-restored', 'prod-rollback'),
  };
}

test('happy path rollback restores the verified revision and reports the chain', async () => {
  const { gitlab, deps } = await rollbackSetup((gl) => new HeadEchoArgo(gl, 'prod'));
  const result = await rollback(deps, rollbackInput());
  assert.equal(result.classification, 'PASS');
  const evidence = result.evidence!;
  assert.equal(evidence.failedRevision, 'prod-bad');
  assert.equal(evidence.restoredRevision, 'prod-verified');
  assert.ok(result.revertCommitSha !== undefined);
  assert.deepEqual(evidence.verification, { infrastructure: 'PASS', virtualServer: 'PASS' });
  // The restored content is now the prod branch head.
  const head = await gitlab.head('example-lab', 'prod');
  assert.equal(head, result.revertCommitSha);
});

test('rollback approval must bind the restored revision (GAP-008)', async () => {
  const { deps } = await rollbackSetup(() => new HeadEchoArgo(null as never, 'prod'));
  const input: RollbackInput = {
    ...rollbackInput(),
    approval: approval('something-else', 'digest-restored', 'prod-rollback'),
  };
  const result = await rollback(deps, input);
  assert.equal(result.classification, 'BLOCKED');
  assert.equal(result.subcode, 'BLOCKED_APPROVAL');
});

test('a failing restored state fails the rollback (no success reported)', async () => {
  const { deps } = await rollbackSetup(() => new StaleArgo());
  const result = await rollback(deps, rollbackInput());
  assert.equal(result.classification, 'FAIL');
  assert.ok(result.reasons.some((r) => r.includes('readiness')));
});

test('failing minimum suites fail the rollback', async () => {
  const { gitlab, deps } = await rollbackSetup(
    (gl) => new HeadEchoArgo(gl, 'prod'),
    async () => ({
      infrastructure: { classification: 'PASS', findings: [] },
      virtualServer: {
        classification: 'FAIL',
        findings: [{ id: 'VS-03', severity: 'mandatory', expected: '401', observed: '200' }],
      },
    }),
  );
  const result = await rollback(deps, rollbackInput());
  assert.equal(result.classification, 'FAIL');
  assert.ok(result.reasons.some((r) => r.includes('minimum suites')));
});
