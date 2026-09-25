/**
 * test/k8s/argo.test.ts
 *
 * Milestone 3 (spec-k8s/08): Argo CD exact-revision readiness — GAP-010
 * (resolve the immutable expected revision before polling), GAP-011
 * (readiness requires Synced+Healthy at the expected revision), and the
 * fail-closed behaviour when cluster access is unavailable.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FakeClock } from '../../extensions/k8s/clock.ts';
import {
  assessReadiness,
  waitApplicationReady,
  type ArgoClient,
  type ArgoObservation,
} from '../../extensions/k8s/argo.ts';

const REV = 'rev-expected';
const OTHER = 'rev-other';

class ScriptedArgo implements ArgoClient {
  calls = 0;
  private observations: (ArgoObservation | null)[];
  constructor(observations: (ArgoObservation | null)[]) {
    this.observations = observations;
  }
  async getApplication(_name: string): Promise<ArgoObservation | null> {
    const i = Math.min(this.calls, this.observations.length - 1);
    this.calls += 1;
    return this.observations[i]!;
  }
}

test('GAP-011: Synced+Healthy at the expected revision is READY', () => {
  const r = assessReadiness(
    { syncStatus: 'Synced', healthStatus: 'Healthy', observedRevision: REV },
    REV,
  );
  assert.deepEqual(r, { status: 'READY' });
});

test('GAP-011: a healthy wrong revision is NOT_READY, never READY', () => {
  const r = assessReadiness(
    { syncStatus: 'Synced', healthStatus: 'Healthy', observedRevision: OTHER },
    REV,
  );
  assert.deepEqual(r, { status: 'NOT_READY' });
});

test('GAP-011: OutOfSync or Degraded at the expected revision is FAILED', () => {
  assert.deepEqual(
    assessReadiness(
      { syncStatus: 'OutOfSync', healthStatus: 'Healthy', observedRevision: REV },
      REV,
    ),
    { status: 'FAILED' },
  );
  assert.deepEqual(
    assessReadiness({ syncStatus: 'Synced', healthStatus: 'Degraded', observedRevision: REV }, REV),
    { status: 'FAILED' },
  );
});

test('GAP-011: a degraded wrong revision is FAILED (not merely not-ready)', () => {
  const r = assessReadiness(
    { syncStatus: 'OutOfSync', healthStatus: 'Degraded', observedRevision: OTHER },
    REV,
  );
  assert.deepEqual(r, { status: 'FAILED' });
});

test('progressing at the expected revision keeps polling (NOT_READY)', () => {
  const r = assessReadiness(
    { syncStatus: 'Unknown', healthStatus: 'Progressing', observedRevision: REV },
    REV,
  );
  assert.deepEqual(r, { status: 'NOT_READY' });
});

test('absent application observation fails closed (BLOCKED_CREDENTIALS)', () => {
  const r = assessReadiness(null, REV);
  assert.deepEqual(r, { status: 'BLOCKED', subcode: 'BLOCKED_CREDENTIALS' });
});

test('waitApplicationReady polls until the exact revision is ready', async () => {
  const clock = new FakeClock('2026-09-25T00:00:00.000Z');
  const argo = new ScriptedArgo([
    { syncStatus: 'Unknown', healthStatus: 'Progressing', observedRevision: REV },
    { syncStatus: 'Unknown', healthStatus: 'Progressing', observedRevision: REV },
    { syncStatus: 'Synced', healthStatus: 'Healthy', observedRevision: REV },
  ]);
  const result = await waitApplicationReady(argo, 'app', REV, {
    timeoutMs: 30_000,
    pollIntervalMs: 1_000,
    clock,
  });
  assert.equal(result.classification, 'PASS');
  assert.equal(result.observedRevision, REV);
  assert.equal(result.polls, 3, 'two polls then the ready observation');
  assert.equal(result.timedOut, false);
  assert.equal(clock.now(), '2026-09-25T00:00:02.000Z', 'fake clock advanced by the sleeps');
});

test('waitApplicationReady times out on a healthy wrong revision (FAIL, not READY)', async () => {
  const clock = new FakeClock('2026-09-25T00:00:00.000Z');
  const argo = new ScriptedArgo([
    { syncStatus: 'Synced', healthStatus: 'Healthy', observedRevision: OTHER },
  ]);
  const result = await waitApplicationReady(argo, 'app', REV, {
    timeoutMs: 5_000,
    pollIntervalMs: 1_000,
    clock,
  });
  assert.equal(result.classification, 'FAIL');
  assert.equal(result.observedRevision, OTHER, 'the observed revision is reported as evidence');
  assert.equal(result.timedOut, true);
});

test('waitApplicationReady surfaces missing credentials as BLOCKED', async () => {
  const clock = new FakeClock('2026-09-25T00:00:00.000Z');
  const argo = new ScriptedArgo([null]);
  const result = await waitApplicationReady(argo, 'app', REV, {
    timeoutMs: 5_000,
    pollIntervalMs: 1_000,
    clock,
  });
  assert.equal(result.classification, 'BLOCKED');
  assert.equal(result.subcode, 'BLOCKED_CREDENTIALS');
  assert.equal(result.polls, 1, 'no retry loop while blocked');
});
