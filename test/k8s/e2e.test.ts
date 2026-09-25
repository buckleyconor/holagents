/**
 * test/k8s/e2e.test.ts
 *
 * Milestone 6 (spec-k8s/08): the pilot rehearsal — a full lifecycle run
 * against fake GitLab/Argo/cluster transports:
 *
 *   dev deploy → dev verification → UAT promotion (merge) → UAT run →
 *   production promotion (merge) → failure → rollback to the verified
 *   revision.
 *
 * This is the "pilot passes dev, UAT and rollback rehearsal" of
 * spec-k8s/08 with every external dependency faked; live-environment
 * transitions remain BLOCKED until DEP-001…DEP-004 resolve
 * (spec-k8s/STATUS.md).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FakeClock } from '../../extensions/k8s/clock.ts';
import { InMemoryGitLab } from '../../extensions/k8s/gitlab.ts';
import { IdempotencyStore } from '../../extensions/k8s/idempotency.ts';
import { createCharmedKubernetesAdapter } from '../../extensions/k8s/adapter-k8s.ts';
import { TEST_SUITES, type TestSuiteId } from '../../extensions/k8s/results.ts';
import {
  buildEvidenceBundle,
  verifyEvidenceBundle,
  type EvidenceBundle,
} from '../../extensions/k8s/bundle.ts';
import {
  runUat,
  promotionDecision,
  type UatDependencies,
  type UatSuiteResults,
} from '../../extensions/k8s/uat.ts';
import { promote, rollback, type RollbackDependencies } from '../../extensions/k8s/promotion.ts';
import {
  policyDigest,
  validateException,
  validatePolicyDocument,
  type PolicyException,
} from '../../extensions/k8s/policy.ts';
import { type ArgoClient, type ArgoObservation } from '../../extensions/k8s/argo.ts';
import {
  type ProbeRequest,
  type ProbeResponse,
  type ProbeTransport,
  type VsReport,
} from '../../extensions/k8s/virtualserver.ts';
import { type AcceptanceExecutable } from '../../extensions/k8s/acceptance.ts';
import type { TestOutput, SuiteResult } from '../../extensions/k8s/adapter.ts';
import { PROFILE, PROFILE_YAML, POLICY, POLICY_YAML, devFiles } from './fixtures.ts';

const envBranches = [
  { name: 'dev', consequential: false },
  { name: 'uat', consequential: true },
  { name: 'prod', consequential: true },
];

/** Argo whose observations are supplied lazily per application. */
class SupplierArgo implements ArgoClient {
  private suppliers = new Map<string, () => Promise<ArgoObservation | null>>();
  set(app: string, fn: () => Promise<ArgoObservation | null>) {
    this.suppliers.set(app, fn);
  }
  async getApplication(app: string): Promise<ArgoObservation | null> {
    return (await this.suppliers.get(app)?.()) ?? null;
  }
}

/** A compliant VirtualServer fake: framed-only cookie minting and gated documents. */
function compliantTransport(token: string): ProbeTransport {
  return {
    async request(req: ProbeRequest): Promise<ProbeResponse> {
      const framed = req.headers.Origin !== undefined;
      const isAuth = req.url.includes('/auth-hol');
      if (isAuth) {
        if (!framed) return { status: 200, headers: {} };
        return { status: 200, headers: { 'set-cookie': `launchtoken=${token}` } };
      }
      if (req.url.includes('/api/health')) return { status: 200, headers: {} };
      if (framed && req.cookie !== undefined) return { status: 200, headers: {} };
      return { status: 401, headers: {} };
    },
  };
}

const passingExecutable: AcceptanceExecutable = {
  run: async () => ({ exitCode: 0, stdout: 'pilot acceptance ok', stderr: '', timedOut: false }),
};

/** Map an adapter test result onto the UAT suite-result contract. */
function toUatResults(t: TestOutput): UatSuiteResults {
  const suite = (id: TestSuiteId) => t.suites.find((s) => s.suite === id)! as SuiteResult;
  const vs = suite('virtualserver');
  const vsJson = JSON.parse(vs.details!) as Omit<VsReport, 'markdown'>;
  const infra = suite('infrastructure');
  const acc = suite('acceptance');
  return {
    infrastructure: {
      classification: infra.outcome.classification,
      findings: infra.outcome.findings,
    },
    virtualServer: { ...vsJson, markdown: '' } as VsReport,
    acceptance: {
      classification: acc.outcome.classification,
      subcode: acc.outcome.subcode,
      exitCode: acc.metrics?.exitCode ?? 0,
      durationMs: acc.metrics?.durationMs ?? 0,
      timedOut: acc.metrics?.timedOut ?? false,
      stdout: acc.details ?? '',
      stderr: '',
    },
    skipped: t.skipped,
    manifestDigest: t.manifestDigest,
  };
}

test('pilot rehearsal: dev → UAT → prod → rollback, all through the adapter boundary', async () => {
  const clock = new FakeClock('2026-09-25T00:00:00.000Z');
  const gitlab = new InMemoryGitLab(clock);
  await gitlab.ensureProject('example-lab', envBranches);
  const argo = new SupplierArgo();
  const idempotency = new IdempotencyStore(() => clock.now());

  const adapter = createCharmedKubernetesAdapter({
    profile: PROFILE,
    gitlab,
    argo,
    policy: POLICY,
    clock,
    virtualServerTransport: compliantTransport('pilot-token-123'),
    acceptanceExecutable: passingExecutable,
    acceptanceScriptCheck: () => ({ exists: true, executable: true }),
    observationsProvider: async () => [],
    runnerIdentity: 'pilot-runner',
    idempotency,
    argoTimeoutMs: 30_000,
    argoPollIntervalMs: 1_000,
  });

  // --- M2: validation and deterministic preparation -------------------------
  const devManifests = devFiles();
  const validated = await adapter.validate({
    profileText: PROFILE_YAML,
    environment: 'dev',
    policy: POLICY,
    manifests: devManifests,
  });
  assert.equal(validated.classification, 'PASS');

  const noPolicy = await adapter.validate({
    profileText: PROFILE_YAML,
    environment: 'dev',
    policy: null,
  });
  assert.equal(noPolicy.classification, 'BLOCKED');
  assert.equal(noPolicy.subcode, 'BLOCKED_POLICY');

  const changeSet = await adapter.prepare({
    environment: 'dev',
    sourceRevision: (await gitlab.head('example-lab', 'dev'))!,
    manifests: devManifests,
  });

  // --- M2/M3: approved development deployment ------------------------------
  const badDeploy = await adapter.deployDev({
    changeSet,
    approval: {
      approver: 'ada',
      revision: changeSet.sourceRevision,
      transition: 'dev-deploy',
      timestamp: clock.now(),
      evidenceDigest: 'wrong-digest',
    },
  });
  assert.equal(badDeploy.classification, 'BLOCKED');

  const deploy = await adapter.deployDev({
    changeSet,
    approval: {
      approver: 'ada',
      revision: changeSet.sourceRevision,
      transition: 'dev-deploy',
      timestamp: clock.now(),
      evidenceDigest: changeSet.digest,
    },
  });
  assert.equal(deploy.classification, 'PASS');
  const devHead = await gitlab.head('example-lab', 'dev');
  assert.equal(deploy.mergeRef, devHead);

  // Argo reconciles the dev branch.
  argo.set('example-lab-dev', async () => ({
    syncStatus: 'Synced',
    healthStatus: 'Healthy',
    observedRevision: devHead!,
  }));
  const observed = await adapter.observe({
    environment: 'dev',
    expectedRevision: devHead!,
    timeoutMs: 30_000,
    pollIntervalMs: 1_000,
  });
  assert.equal(observed.classification, 'PASS');
  assert.equal(observed.observedRevision, devHead);

  // --- M4: dev verification (infrastructure + VirtualServer + acceptance) --
  const vsInput = {
    host: 'example-lab.example.internal',
    basePath: '/hol',
    authPath: '/auth-hol',
    apiProbe: '/hol/api/health',
  };
  const devTest = await adapter.test({
    environment: 'dev',
    revision: devHead!,
    suites: [...TEST_SUITES],
    manifests: Object.values(devManifests),
    virtualServer: vsInput,
  });
  assert.equal(devTest.classification, 'PASS');
  assert.equal(devTest.virtualServer?.exitCode, 0);

  const devBundle: EvidenceBundle = buildEvidenceBundle({
    schemaVersion: '1',
    labId: PROFILE.labId,
    project: PROFILE.labId,
    environment: 'dev',
    branch: 'dev',
    revision: devHead!,
    argo: {
      application: 'example-lab-dev',
      syncStatus: 'Synced',
      healthStatus: 'Healthy',
      observedRevision: devHead!,
      readyAt: clock.now(),
    },
    manifests: { digest: devTest.manifestDigest! },
    policy: { revision: POLICY.version, digest: policyDigest(POLICY) },
    runner: 'pilot-runner',
    suites: devTest.suites.map((s) => ({
      suite: s.suite,
      classification: s.outcome.classification,
      subcode: s.outcome.subcode,
      findingsCount: s.outcome.findings.length,
      details: s.details,
    })),
    virtualServer: devTest.virtualServer ?? null,
    toolVersions: { holagent: '0.3.0' },
    startedAt: clock.now(),
    completedAt: clock.now(),
    retries: 0,
    classification: 'PASS',
  });
  assert.equal(verifyEvidenceBundle(devBundle).length, 0);

  // --- M5: promote dev → uat (consequential, digest-bound approval) --------
  const noApproval = await adapter.promote({
    sourceEnvironment: 'dev',
    targetEnvironment: 'uat',
    evidence: devBundle,
  });
  assert.equal(noApproval.classification, 'BLOCKED');
  assert.equal(noApproval.subcode, 'BLOCKED_APPROVAL');

  const devPromote = await adapter.promote({
    sourceEnvironment: 'dev',
    targetEnvironment: 'uat',
    evidence: devBundle,
    approval: {
      approver: 'ada',
      revision: devHead!,
      transition: 'dev -> uat',
      timestamp: clock.now(),
      evidenceDigest: devBundle.evidenceDigest,
    },
  });
  assert.equal(devPromote.classification, 'PASS');
  assert.equal(devPromote.mergeRequestRef, '1');
  const uatHead = await gitlab.head('example-lab', 'uat');
  assert.ok(uatHead !== devHead, 'the merge created its own revision');

  // --- M5: UAT run at the merged revision ----------------------------------
  argo.set('example-lab-uat', async () => ({
    syncStatus: 'Synced',
    healthStatus: 'Healthy',
    observedRevision: uatHead!,
  }));
  const uatDeps: UatDependencies = {
    gitlab,
    argo,
    policy: POLICY,
    clock,
    runnerIdentity: 'pilot-runner',
    argoTimeoutMs: 30_000,
    argoPollIntervalMs: 1_000,
  };
  const uatManifests = Object.fromEntries(
    Object.entries(devManifests).map(([p, c]) => [p.replace('manifests/dev', 'manifests/uat'), c]),
  );
  const uatRun = await runUat(uatDeps, {
    profile: PROFILE,
    candidateRevision: uatHead!,
    candidateManifestDigest: devTest.manifestDigest!,
    trigger: 'merge',
    devEvidence: devBundle,
    runSuites: async ({ environment, revision }) =>
      toUatResults(
        await adapter.test({
          environment,
          revision,
          suites: [...TEST_SUITES],
          manifests:
            environment === 'uat' ? Object.values(uatManifests) : Object.values(devManifests),
          virtualServer: vsInput,
        }),
      ),
  });
  assert.equal(uatRun.state, 'AWAITING_APPROVAL');
  const uatBundle = uatRun.bundle!;
  assert.equal(verifyEvidenceBundle(uatBundle).length, 0);
  assert.equal(uatBundle.revision, uatHead);

  const decision = promotionDecision({
    bundle: uatBundle,
    candidateRevision: uatHead!,
    policyAvailable: true,
    approval: {
      approver: 'ada',
      revision: uatHead!,
      transition: 'uat -> prod',
      timestamp: clock.now(),
      evidenceDigest: uatBundle.evidenceDigest,
    },
  });
  assert.equal(decision.promotable, true);

  // --- M5: promote uat → prod ----------------------------------------------
  const prodPromote = await adapter.promote({
    sourceEnvironment: 'uat',
    targetEnvironment: 'prod',
    evidence: uatBundle,
    approval: {
      approver: 'ada',
      revision: uatHead!,
      transition: 'uat -> prod',
      timestamp: clock.now(),
      evidenceDigest: uatBundle.evidenceDigest,
    },
  });
  assert.equal(prodPromote.classification, 'PASS');
  const prodHead = await gitlab.head('example-lab', 'prod');
  assert.ok(prodHead !== uatHead, 'the prod merge created its own revision');

  // --- M5: failure + rollback to the verified revision ----------------------
  const failedProdRevision = prodHead!;
  argo.set('example-lab-prod', async () => {
    const head = await gitlab.head('example-lab', 'prod');
    if (head === null) return null;
    // The failed revision reports degraded; the reverted (restored) head
    // reconciles to Synced/Healthy.
    return head === failedProdRevision
      ? {
          syncStatus: 'OutOfSync' as const,
          healthStatus: 'Degraded' as const,
          observedRevision: head,
        }
      : { syncStatus: 'Synced' as const, healthStatus: 'Healthy' as const, observedRevision: head };
  });
  const prodManifests = Object.fromEntries(
    Object.entries(devManifests).map(([p, c]) => [p.replace('manifests/dev', 'manifests/prod'), c]),
  );
  const rollbackDeps: RollbackDependencies = {
    gitlab,
    argo,
    clock,
    runMinSuites: async (environment, revision) => {
      const t = await adapter.test({
        environment,
        revision,
        suites: ['infrastructure', 'virtualserver'],
        manifests: Object.values(prodManifests),
        virtualServer: vsInput,
      });
      return {
        infrastructure: {
          classification: t.suites[0]!.outcome.classification,
          findings: t.suites[0]!.outcome.findings,
        },
        virtualServer: {
          classification: t.suites[1]!.outcome.classification,
          findings: t.suites[1]!.outcome.findings,
        },
      };
    },
    argoTimeoutMs: 30_000,
    argoPollIntervalMs: 1_000,
  };
  const rollbackResult = await rollback(rollbackDeps, {
    profile: PROFILE,
    environment: 'prod',
    failedRevision: failedProdRevision,
    restoredRevision: uatHead!,
    reason: 'pilot rollback rehearsal',
    restoredManifests: prodManifests,
    approval: {
      approver: 'ada',
      revision: uatHead!,
      transition: 'prod-rollback',
      timestamp: clock.now(),
      evidenceDigest: uatBundle.evidenceDigest,
    },
  });
  // The rollback gate verifies readiness at the revert commit.
  assert.equal(rollbackResult.classification, 'PASS');
  assert.deepEqual(
    {
      failed: rollbackResult.evidence!.failedRevision,
      restored: rollbackResult.evidence!.restoredRevision,
    },
    { failed: failedProdRevision, restored: uatHead },
  );
  const prodHeadAfter = await gitlab.head('example-lab', 'prod');
  assert.equal(prodHeadAfter, rollbackResult.revertCommitSha);
  assert.notEqual(prodHeadAfter, failedProdRevision);

  // --- M6: platform policy onboarding artifacts -----------------------------
  const policyDoc = validatePolicyDocument(POLICY_YAML);
  assert.ok(policyDoc.ok);
  assert.equal(policyDigest(POLICY), policyDigest(POLICY), 'the policy digest is stable');

  const exception: PolicyException = {
    id: 'EXC-001',
    controlId: 'SEC-001',
    resources: ['Deployment/example-lab'],
    environment: 'uat',
    approver: 'ada',
    role: 'platform-admin',
    approvedAt: '2026-09-24T00:00:00.000Z',
    expiresAt: '2026-09-30T00:00:00.000Z',
    revision: devHead!,
    evidenceRef: 'bundle:dev',
  };
  assert.deepEqual(validateException(exception, POLICY, '2026-09-10T00:00:00.000Z', devHead!), []);
  assert.ok(
    validateException(
      { ...exception, expiresAt: '2026-09-02T00:00:00.000Z' },
      POLICY,
      '2026-09-10T00:00:00.000Z',
      devHead!,
    ).length > 0,
    'an expired exception is invalid',
  );
});
