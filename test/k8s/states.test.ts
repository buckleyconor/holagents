import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  OPERATIONAL_STATES,
  PROMOTION_STATES,
  UAT_STATES,
  operationalMachine,
  promotionMachine,
  uatMachine,
} from '../../extensions/k8s/states.ts';

const OPERATIONAL_SEQUENCE = [
  'DRAFT',
  'SPEC_VALIDATED',
  'MANIFESTS_VALIDATED',
  'AWAITING_DEPLOY_APPROVAL',
  'MERGE_REQUEST_OPEN',
  'MERGED',
  'ARGO_RECONCILING',
  'ENVIRONMENT_READY',
  'INFRA_TESTING',
  'VIRTUALSERVER_TESTING',
  'ACCEPTANCE_TESTING',
  'ENVIRONMENT_VERIFIED',
  'AWAITING_PROMOTION_APPROVAL',
] as const;

test('operational: happy path walks the full sequence', () => {
  for (let i = 0; i < OPERATIONAL_SEQUENCE.length - 1; i += 1) {
    const from = OPERATIONAL_SEQUENCE[i]!;
    const to = OPERATIONAL_SEQUENCE[i + 1]!;
    assert.ok(operationalMachine.canTransition(from, to), `${from} -> ${to} must be allowed`);
  }
});

test('operational: no skipping ahead', () => {
  assert.equal(operationalMachine.canTransition('DRAFT', 'MANIFESTS_VALIDATED'), false);
  assert.equal(operationalMachine.canTransition('MANIFESTS_VALIDATED', 'MERGED'), false);
  assert.equal(operationalMachine.canTransition('MERGED', 'ENVIRONMENT_READY'), false);
});

test('operational: every active state may fail, block or error (ARC-004)', () => {
  for (const from of OPERATIONAL_SEQUENCE) {
    for (const to of ['FAILED', 'BLOCKED', 'ERROR']) {
      assert.ok(operationalMachine.canTransition(from, to), `${from} -> ${to} must be allowed`);
    }
  }
});

test('operational: the failure states are terminal (except resume from BLOCKED)', () => {
  for (const from of ['FAILED', 'ERROR', 'BLOCKED']) {
    for (const to of OPERATIONAL_STATES) {
      assert.equal(
        operationalMachine.canTransition(from, to, { blockedFrom: null }),
        false,
        `${from} -> ${to} must not be allowed without a resume`,
      );
    }
  }
});

test('operational: a blocked run resumes to the state it was blocked in (ARC-006)', () => {
  assert.ok(
    operationalMachine.canTransition('BLOCKED', 'ARGO_RECONCILING', {
      blockedFrom: 'ARGO_RECONCILING',
    }),
  );
  assert.equal(operationalMachine.canTransition('BLOCKED', 'ARGO_RECONCILING'), false);
  assert.equal(
    operationalMachine.canTransition('BLOCKED', 'FAILED', { blockedFrom: 'FAILED' }),
    false,
    'resume must return to an active (sequence) state',
  );
});

test('operational: nextStates from DRAFT', () => {
  assert.deepEqual(operationalMachine.nextStates('DRAFT'), [
    'SPEC_VALIDATED',
    'FAILED',
    'BLOCKED',
    'ERROR',
  ]);
});

test('operational: machine knows all 16 states', () => {
  assert.deepEqual([...operationalMachine.states], [...OPERATIONAL_STATES]);
});

const PROMOTION_SEQUENCE = [
  'PROPOSED',
  'EVIDENCE_PENDING',
  'APPROVAL_PENDING',
  'MERGE_READY',
  'MERGED',
  'SYNC_PENDING',
  'HEALTH_PENDING',
  'TESTING',
  'PROMOTED',
] as const;

test('promotion: happy path walks the full sequence', () => {
  for (let i = 0; i < PROMOTION_SEQUENCE.length - 1; i += 1) {
    const from = PROMOTION_SEQUENCE[i]!;
    const to = PROMOTION_SEQUENCE[i + 1]!;
    assert.ok(promotionMachine.canTransition(from, to), `${from} -> ${to} must be allowed`);
  }
});

test('promotion: revision change invalidates evidence and returns to EVIDENCE_PENDING', () => {
  for (const from of PROMOTION_SEQUENCE.slice(0, -1).filter((s) => s !== 'EVIDENCE_PENDING')) {
    assert.ok(
      promotionMachine.canTransition(from, 'EVIDENCE_PENDING', { revisionChanged: true }),
      `${from} -> EVIDENCE_PENDING on revision change`,
    );
  }
  assert.equal(
    promotionMachine.canTransition('EVIDENCE_PENDING', 'EVIDENCE_PENDING', {
      revisionChanged: true,
    }),
    false,
    'already there is not a transition',
  );
  assert.equal(
    promotionMachine.canTransition('TESTING', 'EVIDENCE_PENDING'),
    false,
    'no revision change, no return',
  );
  assert.equal(
    promotionMachine.canTransition('PROMOTED', 'EVIDENCE_PENDING', { revisionChanged: true }),
    false,
    'a promoted candidate is not pulled back into evidence',
  );
});

test('promotion: rollback track PROMOTED -> ROLLBACK_PENDING -> ROLLED_BACK', () => {
  assert.ok(promotionMachine.canTransition('PROMOTED', 'ROLLBACK_PENDING'));
  assert.ok(promotionMachine.canTransition('ROLLBACK_PENDING', 'ROLLED_BACK'));
  assert.equal(promotionMachine.canTransition('ROLLED_BACK', 'PROPOSED'), false);
  assert.equal(promotionMachine.canTransition('ROLLBACK_PENDING', 'FAILED'), false);
});

test('promotion: no ERROR state (spec-k8s/04 names only BLOCKED/FAILED)', () => {
  assert.ok(!PROMOTION_STATES.includes('ERROR' as (typeof PROMOTION_STATES)[number]));
  assert.equal(promotionMachine.canTransition('TESTING', 'ERROR'), false);
  assert.equal(promotionMachine.canTransition('FAILED', 'PROPOSED'), false);
});

test('promotion: machine states match the spec', () => {
  const expected = [...PROMOTION_SEQUENCE, 'BLOCKED', 'FAILED', 'ROLLBACK_PENDING', 'ROLLED_BACK'];
  assert.deepEqual(new Set(promotionMachine.states), new Set(expected));
});

const UAT_SEQUENCE = [
  'PENDING',
  'WAITING_FOR_ARGO',
  'RUNNING_INFRA',
  'RUNNING_VIRTUALSERVER',
  'RUNNING_ACCEPTANCE',
  'EVIDENCE_READY',
  'AWAITING_APPROVAL',
] as const;

test('uat: happy path to AWAITING_APPROVAL, then APPROVED or REJECTED', () => {
  for (let i = 0; i < UAT_SEQUENCE.length - 1; i += 1) {
    const from = UAT_SEQUENCE[i]!;
    const to = UAT_SEQUENCE[i + 1]!;
    assert.ok(uatMachine.canTransition(from, to), `${from} -> ${to} must be allowed`);
  }
  assert.ok(uatMachine.canTransition('AWAITING_APPROVAL', 'APPROVED'));
  assert.ok(uatMachine.canTransition('AWAITING_APPROVAL', 'REJECTED'));
  assert.equal(uatMachine.canTransition('AWAITING_APPROVAL', 'PENDING'), false);
});

test('uat: a newer revision supersedes incomplete evidence', () => {
  for (const from of UAT_SEQUENCE) {
    assert.ok(uatMachine.canTransition(from, 'SUPERSEDED'), `${from} -> SUPERSEDED`);
  }
  assert.equal(uatMachine.canTransition('SUPERSEDED', 'WAITING_FOR_ARGO'), false);
});

test('uat: a blocked run resumes (ARC-006)', () => {
  assert.ok(
    uatMachine.canTransition('BLOCKED', 'WAITING_FOR_ARGO', { blockedFrom: 'WAITING_FOR_ARGO' }),
  );
  assert.equal(
    uatMachine.canTransition('BLOCKED', 'RUNNING_INFRA', { blockedFrom: 'WAITING_FOR_ARGO' }),
    false,
    'resume must return to the recorded blockedFrom state',
  );
  assert.equal(uatMachine.canTransition('BLOCKED', 'RUNNING_INFRA'), false);
});

test('uat: terminal states do not move', () => {
  for (const from of ['APPROVED', 'REJECTED', 'FAILED', 'ERROR', 'SUPERSEDED']) {
    for (const to of UAT_STATES) {
      assert.equal(uatMachine.canTransition(from, to, { blockedFrom: null }), false);
    }
  }
});
