/**
 * test/k8s/uat.test.ts
 *
 * Milestone 5 (spec-k8s/08): the UAT state machine (spec-k8s/07) — entry
 * gates (dev evidence, UAT branch revision, Argo exact revision, policy,
 * credentials), the three UAT suites, and the promotion decision.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FakeClock } from '../../extensions/k8s/clock.ts';
import { InMemoryGitLab } from '../../extensions/k8s/gitlab.ts';
import {
  verifyEvidenceBundle,
  buildEvidenceBundle,
  type EvidenceBundle,
} from '../../extensions/k8s/bundle.ts';
import {
  UatScheduler,
  promotionDecision,
  runUat,
  type UatDependencies,
  type UatRunInput,
  type UatSuiteResults,
} from '../../extensions/k8s/uat.ts';
import { type ArgoClient, type ArgoObservation } from '../../extensions/k8s/argo.ts';
import {
  PROFILE,
  PROFILE_YAML,
  POLICY,
  makeBundle,
  passingUatResults,
  vsReport,
} from './fixtures.ts';
import { validateProfile } from '../../extensions/k8s/profile.ts';

const envBranches = [
  { name: 'dev', consequential: false },
  { name: 'uat', consequential: true },
  { name: 'prod', consequential: true },
];

const DEV_HEAD = 'dev-head-rev';
const DIGEST = 'manifest-digest-1';

function devBundle(): EvidenceBundle {
  return makeBundle({
    environment: 'dev',
    branch: 'dev',
    revision: DEV_HEAD,
    argoApplication: 'example-lab-dev',
    manifestDigest: DIGEST,
  });
}

class ReadyArgo implements ArgoClient {
  private observation: ArgoObservation | null = {
    syncStatus: 'Synced',
    healthStatus: 'Healthy',
    observedRevision: '',
  };
  setObservation(obs: ArgoObservation | null) {
    this.observation = obs;
  }
  async getApplication(_name: string): Promise<ArgoObservation | null> {
    return this.observation;
  }
}

async function setup(
  overrides: { profile?: typeof PROFILE; policy?: UatDependencies['policy'] } = {},
) {
  const clock = new FakeClock('2026-09-25T00:00:00.000Z');
  const gitlab = new InMemoryGitLab(clock);
  await gitlab.ensureProject('example-lab', envBranches);
  // Simulate the promotion merge: the UAT branch head is the candidate.
  const uatHead = await gitlab.commit(
    'example-lab',
    'uat',
    { 'manifests/uat/service.yaml': 'candidate' },
    'promote dev -> uat',
    'ada',
  );
  const argo = new ReadyArgo();
  argo.setObservation({ syncStatus: 'Synced', healthStatus: 'Healthy', observedRevision: uatHead });
  const policy = overrides.policy !== undefined ? overrides.policy : POLICY;
  const deps: UatDependencies = {
    gitlab,
    argo,
    policy,
    clock,
    runnerIdentity: 'holagent',
    argoTimeoutMs: 30_000,
    argoPollIntervalMs: 1_000,
  };
  const profile = overrides.profile !== undefined ? overrides.profile : PROFILE;
  const results: UatSuiteResults = passingUatResults(DIGEST);
  const input: UatRunInput = {
    profile,
    candidateRevision: uatHead,
    candidateManifestDigest: DIGEST,
    trigger: 'merge',
    devEvidence: devBundle(),
    runSuites: async () => results,
  };
  return { gitlab, clock, argo, deps, input, results };
}

test('UAT-001: a profile without a UAT environment cannot run UAT', async () => {
  const twoEnv = twoEnvProfile();
  const { deps } = await setup({ profile: twoEnv });
  const result = await runUat(deps, {
    profile: twoEnv,
    candidateRevision: 'r',
    candidateManifestDigest: DIGEST,
    trigger: 'merge',
    devEvidence: null,
    runSuites: async () => passingUatResults(DIGEST),
  });
  assert.equal(result.state, 'BLOCKED');
  assert.equal(result.classification, 'BLOCKED');
  assert.equal(result.subcode, 'BLOCKED_UAT');
});

function twoEnvProfile() {
  const parsed = validateProfile(
    PROFILE_YAML.replace(
      /    - name: uat\n( *)branch: uat\n( *)manifestsPath: manifests\/uat\n( *)argoApplication: example-lab-uat\n( *)consequential: true\n/,
      '',
    ).replace('promotionOrder: [dev, uat, prod]', 'promotionOrder: [dev, prod]'),
  );
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
  return parsed.profile;
}

test('entry: missing dev evidence blocks', async () => {
  const { deps, input } = await setup();
  const result = await runUat(deps, { ...input, devEvidence: null });
  assert.equal(result.classification, 'BLOCKED');
  assert.equal(result.subcode, 'BLOCKED_EVIDENCE');
});

test('entry: dev evidence must verify the candidate content digest', async () => {
  const { deps, input } = await setup();
  const result = await runUat(deps, { ...input, candidateManifestDigest: 'different-content' });
  assert.equal(result.classification, 'BLOCKED');
  assert.equal(result.subcode, 'BLOCKED_EVIDENCE');
});

test('entry: a failing dev bundle cannot enter UAT', async () => {
  const failing: EvidenceBundle = buildEvidenceBundle({
    ...devBundle(),
    suites: [
      { suite: 'infrastructure', classification: 'FAIL', findingsCount: 3 },
      { suite: 'virtualserver', classification: 'PASS', findingsCount: 0 },
      { suite: 'acceptance', classification: 'PASS', findingsCount: 0 },
    ],
    classification: 'FAIL',
  });
  const { deps, input } = await setup();
  const result = await runUat(deps, { ...input, devEvidence: failing });
  assert.equal(result.classification, 'BLOCKED');
  assert.equal(result.subcode, 'BLOCKED_EVIDENCE');
});

test('entry: the candidate must match the UAT branch head', async () => {
  const { deps, input } = await setup();
  const result = await runUat(deps, { ...input, candidateRevision: 'not-the-head' });
  assert.equal(result.classification, 'BLOCKED');
  assert.equal(result.subcode, 'BLOCKED_REVISION');
});

test('entry: unavailable Argo access blocks', async () => {
  const { deps, input, argo } = await setup();
  argo.setObservation(null);
  const result = await runUat(deps, input);
  assert.equal(result.classification, 'BLOCKED');
  assert.equal(result.subcode, 'BLOCKED_CREDENTIALS');
});

test('entry: a wrong/stale Argo revision fails', async () => {
  const { deps, input, argo } = await setup();
  argo.setObservation({
    syncStatus: 'OutOfSync',
    healthStatus: 'Degraded',
    observedRevision: 'stale',
  });
  const result = await runUat(deps, input);
  assert.equal(result.classification, 'FAIL');
});

test('entry: required policy unavailable blocks (POL-001)', async () => {
  const { deps, input } = await setup({ policy: null });
  const result = await runUat(deps, input);
  assert.equal(result.classification, 'BLOCKED');
  assert.equal(result.subcode, 'BLOCKED_POLICY');
});

test('entry: missing runtime credentials block (ADP-006)', async () => {
  const parsed = validateProfile(
    PROFILE_YAML.replace('runtimeReference: env:K8S_KUBE', 'runtimeReference: null'),
  );
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
  const { deps } = await setup({ profile: parsed.profile });
  const result = await runUat(deps, {
    profile: parsed.profile,
    candidateRevision: (await deps.gitlab.head('example-lab', 'uat'))!,
    candidateManifestDigest: DIGEST,
    trigger: 'merge',
    devEvidence: devBundle(),
    runSuites: async () => passingUatResults(DIGEST),
  });
  assert.equal(result.classification, 'BLOCKED');
  assert.equal(result.subcode, 'BLOCKED_CREDENTIALS');
});

test('happy path: AWAITING_APPROVAL with a verifying UAT bundle', async () => {
  const { deps, input } = await setup();
  const result = await runUat(deps, input);
  assert.equal(result.state, 'AWAITING_APPROVAL');
  assert.equal(result.classification, 'PASS');
  const bundle = result.bundle!;
  assert.equal(verifyEvidenceBundle(bundle).length, 0);
  assert.equal(bundle.environment, 'uat');
  assert.equal(bundle.revision, input.candidateRevision);
  assert.equal(bundle.classification, 'PASS');
  assert.equal(bundle.manifests!.digest, DIGEST);
});

test('a failing UAT suite fails the run (no bundle)', async () => {
  const { deps, input, results } = await setup();
  results.virtualServer = vsReport('FAIL', 2, {
    tests: [
      { id: 'VS-01', status: 'PASS', observedHttp: 403, durationMs: 1 },
      { id: 'VS-02', status: 'PASS', observedHttp: 200, durationMs: 1 },
      { id: 'VS-03', status: 'FAIL', observedHttp: 200, durationMs: 1 },
      { id: 'VS-04', status: 'PASS', observedHttp: 401, durationMs: 1 },
      { id: 'VS-05', status: 'PASS', observedHttp: 200, durationMs: 1 },
      { id: 'VS-06', status: 'PASS', observedHttp: 200, durationMs: 1 },
    ],
  });
  const result = await runUat(deps, input);
  assert.equal(result.state, 'FAILED');
  assert.equal(result.classification, 'FAIL');
  assert.equal(result.bundle, null);
});

test('the promotion decision requires a digest-bound approval for consequential targets', async () => {
  const { deps, input } = await setup();
  const run = await runUat(deps, input);
  const bundle = run.bundle!;
  const base = {
    bundle,
    candidateRevision: input.candidateRevision,
    policyAvailable: true,
    approval: {
      approver: 'ada',
      revision: input.candidateRevision,
      transition: 'uat -> prod',
      timestamp: '2026-09-25T00:02:00.000Z',
      evidenceDigest: bundle.evidenceDigest,
    },
  };

  assert.equal(promotionDecision(base).promotable, true);

  // Digest mismatch: the approval does not bind this run.
  const wrongDigest = promotionDecision({
    ...base,
    approval: { ...base.approval, evidenceDigest: 'other' },
  });
  assert.equal(wrongDigest.promotable, false);

  // Revision mismatch: a stale approval does not bind this candidate.
  const wrongRevision = promotionDecision({
    ...base,
    approval: { ...base.approval, revision: 'old' },
  });
  assert.equal(wrongRevision.promotable, false);

  // No policy available: never promotable.
  const noPolicy = promotionDecision({ ...base, policyAvailable: false });
  assert.equal(noPolicy.promotable, false);
});

test('PASS_WITH_WARNINGS requires explicit VirtualServer acceptance (UAT-002)', async () => {
  const { deps, input, results } = await setup();
  results.virtualServer = vsReport('PASS_WITH_WARNINGS', 1);
  const run = await runUat(deps, input);
  const bundle = run.bundle!;
  const approval = {
    approver: 'ada',
    revision: input.candidateRevision,
    transition: 'uat -> prod',
    timestamp: '2026-09-25T00:02:00.000Z',
    evidenceDigest: bundle.evidenceDigest,
  };

  const refused = promotionDecision({
    bundle,
    candidateRevision: input.candidateRevision,
    policyAvailable: true,
    approval,
  });
  assert.equal(refused.promotable, false);
  assert.ok(refused.reasons.some((r) => r.includes('PASS_WITH_WARNINGS')));

  const accepted = promotionDecision({
    bundle,
    candidateRevision: input.candidateRevision,
    policyAvailable: true,
    approval,
    virtualServerAccepted: true,
  });
  assert.equal(accepted.promotable, true);
});

test('scheduled UAT runs are deduplicated and never auto-promote', async () => {
  const { deps, input } = await setup();
  const scheduler = new UatScheduler();
  const first = scheduler.start(deps, input, { autoPromote: true });
  const second = scheduler.start(deps, { ...input, trigger: 'schedule' }, { autoPromote: true });
  assert.equal(second.deduplicated, true);
  const [r1, r2] = await Promise.all([first.run, second.run]);
  assert.equal(r1, r2, 'deduplicated runs share one result');
  assert.equal(first.autoPromote, true, 'merge-triggered runs may request auto-promotion');
  assert.equal(second.autoPromote, false, 'scheduled runs never auto-promote');
});
