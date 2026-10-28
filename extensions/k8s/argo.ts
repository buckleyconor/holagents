/**
 * Argo CD observation and the exact-revision readiness gate
 * (spec-k8s/03 ADP-005; spec-k8s/04 GAP-010..GAP-012; ADR-K8S-004/005).
 *
 * Argo owns reconciliation; HOLagents observes and gates. Tests MUST NOT
 * start while status is progressing, degraded, missing, unknown, timed out
 * or associated with another revision. Missing access returns `BLOCKED`.
 */
import type { Clock } from './clock.ts';
import { realClock } from './clock.ts';
import type { ArgoHealthStatus, ArgoSyncStatus } from './adapter.ts';

export interface ArgoObservation {
  syncStatus: ArgoSyncStatus;
  healthStatus: ArgoHealthStatus;
  /** The Git revision currently deployed. */
  observedRevision: string;
}

/**
 * Narrow Argo client interface (Application status only — the least
 * privilege the gate needs, spec-k8s/04 §Security).
 */
export interface ArgoClient {
  /**
   * Null when the Application cannot be observed at all (missing
   * credentials, missing Application, unavailable API) — a blocker, not a
   * failure (GAP-012).
   */
  getApplication(name: string): Promise<ArgoObservation | null>;
}

export type ReadinessVerdict =
  | { status: 'READY' }
  | { status: 'NOT_READY' }
  | { status: 'FAILED' }
  | { status: 'BLOCKED'; subcode: string };

/**
 * Pure readiness decision for one observation (GAP-011/012). Exported so
 * the policy is unit-testable without a clock.
 */
export function assessReadiness(
  obs: ArgoObservation | null,
  expectedRevision: string,
): ReadinessVerdict {
  if (obs === null) return { status: 'BLOCKED', subcode: 'BLOCKED_CREDENTIALS' };
  if (obs.observedRevision !== expectedRevision) {
    // Wrong revision: never ready. A degraded sync or sync failure at the
    // wrong revision is a terminal failure; otherwise keep polling until
    // the timeout decides (GAP-012: unresolved revision mismatch -> FAIL
    // with observed-revision evidence).
    if (obs.syncStatus === 'OutOfSync' || obs.healthStatus === 'Degraded')
      return { status: 'FAILED' };
    return { status: 'NOT_READY' };
  }
  if (obs.syncStatus === 'Synced' && obs.healthStatus === 'Healthy') return { status: 'READY' };
  if (obs.syncStatus === 'OutOfSync' || obs.healthStatus === 'Degraded')
    return { status: 'FAILED' };
  // Progressing / Missing / Suspended / Unknown at the expected revision:
  // keep polling within the timeout.
  return { status: 'NOT_READY' };
}

export interface ReadinessResult {
  classification: 'PASS' | 'FAIL' | 'BLOCKED';
  subcode?: string;
  syncStatus?: ArgoSyncStatus;
  healthStatus?: ArgoHealthStatus;
  observedRevision?: string;
  /** ISO 8601 completion time (when the gate terminated). */
  completedAt: string;
  /** Polling configuration, recorded for evidence (GAP-012). */
  pollIntervalMs: number;
  timeoutMs: number;
  polls: number;
  timedOut: boolean;
}

/**
 * Wait until the configured Argo Application reports the expected revision
 * as both `Synced` and `Healthy` (ADP-005). Polling interval and timeout
 * are configurable and recorded (GAP-012). Fails closed: timeout or
 * unresolved mismatch is `FAIL` with observed-revision evidence; missing
 * access is `BLOCKED`.
 */
export async function waitApplicationReady(
  client: ArgoClient,
  application: string,
  expectedRevision: string,
  opts: { timeoutMs: number; pollIntervalMs: number; clock?: Clock },
): Promise<ReadinessResult> {
  const clock = opts.clock ?? realClock;
  const started = Date.parse(clock.now());
  let polls = 0;
  let last: ArgoObservation | null = null;

  for (;;) {
    polls += 1;
    last = await client.getApplication(application);
    const verdict = assessReadiness(last, expectedRevision);
    const elapsed = Date.parse(clock.now()) - started;

    if (verdict.status === 'READY') {
      return result('PASS', last, elapsed, polls, false);
    }
    if (verdict.status === 'FAILED') {
      return result('FAIL', last, elapsed, polls, false);
    }
    if (verdict.status === 'BLOCKED') {
      return { ...result('BLOCKED', last, elapsed, polls, false), subcode: verdict.subcode };
    }
    if (elapsed >= opts.timeoutMs) {
      // GAP-012: timeout returns FAIL with observed-revision evidence.
      return result('FAIL', last, elapsed, polls, true);
    }
    await clock.sleep(opts.pollIntervalMs);
  }

  function result(
    classification: 'PASS' | 'FAIL' | 'BLOCKED',
    obs: ArgoObservation | null,
    _elapsed: number,
    polls: number,
    timedOut: boolean,
  ): ReadinessResult {
    return {
      classification,
      syncStatus: obs?.syncStatus,
      healthStatus: obs?.healthStatus,
      observedRevision: obs?.observedRevision,
      completedAt: clock.now(),
      pollIntervalMs: opts.pollIntervalMs,
      timeoutMs: opts.timeoutMs,
      polls,
      timedOut,
    };
  }
}
