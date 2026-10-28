/**
 * test/k8s/gitlab.test.ts
 *
 * Milestone 2 (spec-k8s/08): GitLab contracts — GAP-001 (one project per
 * lab), GAP-003 (candidate revisions, evidence-bearing MR description),
 * GAP-005 (source branch never modified), GAP-006 (protection rules),
 * GAP-012 (merge commits).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FakeClock } from '../../extensions/k8s/clock.ts';
import {
  InMemoryGitLab,
  buildPromotionMrDescription,
  type ApprovalRecord,
} from '../../extensions/k8s/gitlab.ts';

const envBranches = [
  { name: 'dev', consequential: false },
  { name: 'uat', consequential: true },
  { name: 'prod', consequential: true },
];

async function setup() {
  const clock = new FakeClock('2026-09-25T00:00:00.000Z');
  const gitlab = new InMemoryGitLab(clock);
  await gitlab.ensureProject('example-lab', envBranches);
  return gitlab;
}

function approval(revision: string): ApprovalRecord {
  return {
    approver: 'ada',
    revision,
    transition: 'dev -> uat',
    timestamp: '2026-09-25T00:00:00.000Z',
    evidenceDigest: 'fixture-digest',
  };
}

test('GAP-001: one project per lab, idempotent provisioning', async () => {
  const gitlab = await setup();
  const first = await gitlab.ensureProject('example-lab', envBranches);
  const again = await gitlab.ensureProject('example-lab', envBranches);
  assert.equal(again.baseRevision, first.baseRevision);
  assert.deepEqual(first.branches, ['dev', 'uat', 'prod']);
  assert.equal(await gitlab.head('example-lab', 'dev'), first.baseRevision);
  assert.equal(await gitlab.head('example-lab', 'uat'), first.baseRevision);
});

test('GAP-006: consequential branches are protected, dev is not', async () => {
  const gitlab = await setup();
  const project = await gitlab.ensureProject('example-lab', envBranches);
  assert.deepEqual(project.protectedBranches, ['uat', 'prod']);
});

test('commits advance the branch head deterministically', async () => {
  const gitlab = await setup();
  const sha = await gitlab.commit(
    'example-lab',
    'dev',
    { 'manifests/dev/service.yaml': 'content' },
    'm1',
    'me',
  );
  assert.equal(await gitlab.head('example-lab', 'dev'), sha);
  const sha2 = await gitlab.commit(
    'example-lab',
    'dev',
    { 'manifests/dev/service.yaml': 'content2' },
    'm2',
    'me',
  );
  assert.notEqual(sha, sha2);
  assert.equal(await gitlab.head('example-lab', 'dev'), sha2);
});

test('GAP-003: candidate must be the source head at MR time; stale merges are rejected', async () => {
  const gitlab = await setup();
  const h1 = await gitlab.commit('example-lab', 'dev', { a: '1' }, 'one', 'me');
  const mr = await gitlab.createMergeRequest('example-lab', {
    sourceBranch: 'dev',
    targetBranch: 'uat',
    candidateRevision: h1,
    title: 'promote: dev -> uat',
    description: 'd',
  });
  assert.equal(mr.candidateRevision, h1);
  assert.equal(mr.state, 'opened');

  // The source branch moves past the candidate: the MR must not merge.
  await gitlab.commit('example-lab', 'dev', { a: '2' }, 'two', 'me');
  await assert.rejects(
    () => gitlab.mergeMergeRequest('example-lab', mr.iid),
    /moved past the approved candidate/,
  );

  // A candidate that is not the head cannot even open an MR.
  await assert.rejects(
    () =>
      gitlab.createMergeRequest('example-lab', {
        sourceBranch: 'dev',
        targetBranch: 'uat',
        candidateRevision: h1,
        title: 'stale',
        description: 'd',
      }),
    /is not the head of dev/,
  );
});

test('GAP-006: protected branches refuse merges without a matching approval', async () => {
  const gitlab = await setup();
  const h1 = await gitlab.commit('example-lab', 'dev', { a: '1' }, 'one', 'me');
  const mr = await gitlab.createMergeRequest('example-lab', {
    sourceBranch: 'dev',
    targetBranch: 'uat',
    candidateRevision: h1,
    title: 't',
    description: 'd',
  });

  await assert.rejects(() => gitlab.mergeMergeRequest('example-lab', mr.iid), /requires approval/);

  // Approval bound to the wrong revision does not authorize this candidate.
  await assert.rejects(
    () => gitlab.approveMergeRequest('example-lab', mr.iid, approval('not-the-candidate')),
    /does not bind to candidate/,
  );
  await assert.rejects(() => gitlab.mergeMergeRequest('example-lab', mr.iid), /requires approval/);
});

test('happy merge: the target advances to a new revision (GAP-012)', async () => {
  const gitlab = await setup();
  const h1 = await gitlab.commit('example-lab', 'dev', { a: '1' }, 'one', 'me');
  const mr = await gitlab.createMergeRequest('example-lab', {
    sourceBranch: 'dev',
    targetBranch: 'uat',
    candidateRevision: h1,
    title: 'promote: dev -> uat',
    description: 'd',
  });
  await gitlab.approveMergeRequest('example-lab', mr.iid, approval(h1));
  const mergedSha = await gitlab.mergeMergeRequest('example-lab', mr.iid);

  assert.equal(await gitlab.head('example-lab', 'uat'), mergedSha);
  assert.notEqual(mergedSha, h1, 'GAP-012: the merge creates its own revision');
  const stored = await gitlab.getMergeRequest('example-lab', mr.iid);
  assert.equal(stored!.state, 'merged');
  assert.equal(stored!.mergedRevision, mergedSha);
  assert.equal(stored!.approvals.length, 1);

  // GAP-005: the source branch is untouched by the merge.
  assert.equal(await gitlab.head('example-lab', 'dev'), h1);
});

test('non-consequential targets merge without approval', async () => {
  const gitlab = await setup();
  const h1 = await gitlab.commit('example-lab', 'uat', { a: '1' }, 'one', 'me');
  const mr = await gitlab.createMergeRequest('example-lab', {
    sourceBranch: 'uat',
    targetBranch: 'dev',
    candidateRevision: h1,
    title: 't',
    description: 'd',
  });
  const mergedSha = await gitlab.mergeMergeRequest('example-lab', mr.iid);
  assert.equal(await gitlab.head('example-lab', 'dev'), mergedSha);
});

test('GAP-003/GAP-009: the MR description carries the promotion-evidence fields', async () => {
  const gitlab = await setup();
  const h1 = await gitlab.commit('example-lab', 'dev', { a: '1' }, 'one', 'me');
  const description = buildPromotionMrDescription({
    sourceEnvironment: 'dev',
    targetEnvironment: 'uat',
    candidateRevision: h1,
    targetRevision: 'target-head',
    manifestDigest: 'manifest-digest',
    policyDigest: 'policy-digest',
    argo: { syncStatus: 'Synced', healthStatus: 'Healthy', observedRevision: h1 },
    evidence: { infrastructure: 'PASS', virtualServer: 'PASS', acceptance: 'PASS' },
    warnings: ['warning about token=supersecretvalue12345'],
    blockers: [],
    approvalStatus: 'pending',
    evidenceAt: '2026-09-25T00:00:00.000Z',
  });
  for (const field of [
    '## Promotion: dev -> uat',
    `| Candidate revision | \`${h1}\` |`,
    '| Manifest digest | `manifest-digest` |',
    '| Policy digest | `policy-digest` |',
    `| Argo (source) | Synced / Healthy at \`${h1}\` |`,
    '- Infrastructure/security: **PASS**',
    '- VirtualServer access: **PASS**',
    '- Application acceptance: **PASS**',
    '### Approval status',
    'does not authorize this merge',
  ]) {
    assert.ok(description.includes(field), `missing: ${field}`);
  }
  // GAP-004: embedded tokens are redacted from the MR body.
  assert.ok(!description.includes('supersecretvalue12345'));
  assert.ok(description.includes('[REDACTED]'));

  // And the in-memory client redacts on the way in.
  const mr = await gitlab.createMergeRequest('example-lab', {
    sourceBranch: 'dev',
    targetBranch: 'uat',
    candidateRevision: h1,
    title: 't',
    description: `token=supersecretvalue12345`,
  });
  assert.ok(!mr.description.includes('supersecretvalue12345'));
});

test('unknown project/branch errors are descriptive', async () => {
  const gitlab = await setup();
  await assert.rejects(
    () => gitlab.commit('missing', 'dev', { a: 'x' }, 'm', 'me'),
    /unknown project/,
  );
  await assert.rejects(
    () => gitlab.commit('example-lab', 'nope', { a: 'x' }, 'm', 'me'),
    /unknown branch/,
  );
});
