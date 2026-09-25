/**
 * test/k8s/idempotency.test.ts
 *
 * Milestone 3 (spec-k8s/08): operation idempotency for consequential
 * targets — identical inputs return the recorded outcome; different inputs
 * for a completed operation conflict.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { IdempotencyStore, idempotencyKey } from '../../extensions/k8s/idempotency.ts';

test('idempotency keys bind lab/environment/operation/revision/digest', () => {
  const a = idempotencyKey({
    labId: 'l',
    environment: 'uat',
    operation: 'promote',
    expectedRevision: 'r',
    desiredDigest: 'd',
  });
  const b = idempotencyKey({
    labId: 'l',
    environment: 'uat',
    operation: 'promote',
    expectedRevision: 'r',
    desiredDigest: 'd',
  });
  const c = idempotencyKey({
    labId: 'l',
    environment: 'prod',
    operation: 'promote',
    expectedRevision: 'r',
    desiredDigest: 'd',
  });
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.notEqual(
    a,
    idempotencyKey({
      labId: 'l',
      environment: 'uat',
      operation: 'promote',
      expectedRevision: 'r2',
      desiredDigest: 'd',
    }),
  );
});

test('a completed operation replays its recorded outcome for identical inputs', async () => {
  const store = new IdempotencyStore(() => '2026-09-25T00:00:00.000Z');
  const key = 'k1';
  const begun = store.begin(key, 'digest-1');
  assert.equal(begun.started, true);
  store.complete(key, { classification: 'PASS' });

  const replay = store.begin(key, 'digest-1');
  assert.equal(replay.started, false);
  assert.deepEqual(replay.outcome, { classification: 'PASS' });
});

test('different inputs for a completed operation conflict', async () => {
  const store = new IdempotencyStore(() => '2026-09-25T00:00:00.000Z');
  const key = 'k1';
  store.begin(key, 'digest-1');
  store.complete(key, { classification: 'PASS' });
  assert.throws(() => store.begin(key, 'digest-2'), /conflict/);
});

test('an in-flight operation serializes on the recorded outcome after completion', async () => {
  const store = new IdempotencyStore(() => '2026-09-25T00:00:00.000Z');
  const key = 'k1';
  const first = store.begin(key, 'digest-1');
  assert.equal(first.started, true);

  // Second caller with the same inputs while the first is in flight:
  // not started; the first caller completes.
  const second = store.begin(key, 'digest-1');
  assert.equal(second.started, false);

  store.complete(key, { classification: 'PASS' });

  const third = store.begin(key, 'digest-1');
  assert.equal(third.started, false);
  assert.equal((third.outcome as { classification: string }).classification, 'PASS');
});

test('retry records the attempt; completion replays the outcome', () => {
  const store = new IdempotencyStore(() => '2026-09-25T00:00:00.000Z');
  const key = 'k1';
  store.begin(key, 'digest-1');
  store.retry(key);
  assert.equal(store.get(key)!.attempts, 2, 'retries are bounded and recorded');
  store.complete(key, { classification: 'PASS' });
  const replay = store.begin(key, 'digest-1');
  assert.equal(replay.started, false);
  assert.deepEqual(replay.outcome, { classification: 'PASS' });
});
