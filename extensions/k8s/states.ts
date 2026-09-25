/**
 * Operational, promotion and UAT state machines (spec-k8s/01 §Lifecycle,
 * spec-k8s/04 §Promotion states, spec-k8s/07 §States).
 *
 * Milestone 1 delivers the transition contracts as pure predicates; nothing
 * persists state yet. The machines share one shape: an ordered sequence of
 * active states, a set of failure states reachable from any active state,
 * optional extra edges, an optional recovery state, and — where the spec
 * allows it — resume from `BLOCKED` to the state a run was blocked in
 * (spec-k8s/01 ARC-006: resume MUST retain the expected revision and
 * recorded inputs, so a resume only ever returns to the blocked state).
 */

export interface MachineContext {
  /**
   * The state a run was blocked in; together with `from === 'BLOCKED'` it
   * authorizes a resume transition back to that state (ARC-006).
   */
  blockedFrom?: string | null;
  /**
   * The candidate revision changed, invalidating recorded evidence
   * (spec-k8s/04: the transition returns to the recovery state).
   */
  revisionChanged?: boolean;
}

export interface StateMachine {
  /** Every state the machine knows about, sequence first. */
  readonly states: readonly string[];
  /** Whether `to` is reachable from `from` under `ctx`. */
  canTransition(from: string, to: string, ctx?: MachineContext): boolean;
  /** States reachable from `from` under `ctx`, in a stable order. */
  nextStates(from: string, ctx?: MachineContext): string[];
}

interface MachineSpec {
  name: string;
  /** Ordered active states; the last is the natural end of the flow. */
  sequence: readonly string[];
  /** Failure/side states reachable from any active (sequence) state. */
  failureStates: readonly string[];
  /** Additional directed edges (approval exits, rollback track, ...). */
  edges?: readonly (readonly [from: string, to: string])[];
  /**
   * If set, any active state except the last may return to this state when
   * `ctx.revisionChanged` is set.
   */
  recoveryState?: string;
  /** If true (default), `BLOCKED` may resume to `ctx.blockedFrom`. */
  resumable?: boolean;
  /**
   * If true, failure states are also reachable from the last sequence state
   * (e.g. UAT: `AWAITING_APPROVAL` is not yet complete, so a newer revision
   * can still supersede it). The operational flow instead ends there and
   * hands over to the promotion machine.
   */
  failFromLast?: boolean;
}

export function createStateMachine(spec: MachineSpec): StateMachine {
  const { sequence, failureStates, edges = [], recoveryState } = spec;
  const resumable = spec.resumable ?? true;
  const failFromLast = spec.failFromLast ?? false;
  const seqIndex = new Map(sequence.map((s, i) => [s, i]));
  const failureSet = new Set(failureStates);
  const edgeSet = new Set(edges.map(([from, to]) => `${from}\u0000${to}`));
  const known = new Set([...sequence, ...failureStates, ...edges.flatMap(([f, t]) => [f, t])]);

  const canTransition = (from: string, to: string, ctx?: MachineContext): boolean => {
    if (from === to) return false;
    if (!known.has(from) || !known.has(to)) return false;

    // 1. forward along the sequence
    const idx = seqIndex.get(from);
    if (idx !== undefined && idx + 1 < sequence.length && to === sequence[idx + 1]!) return true;

    // 2. extra edges (approval exits, rollback track)
    if (edgeSet.has(`${from}\u0000${to}`)) return true;

    // 3. failure states from any active state (and from the last one when
    //    failFromLast — its evidence is not complete yet)
    if (failureSet.has(to) && idx !== undefined && (idx < sequence.length - 1 || failFromLast))
      return true;

    // 4. revision change invalidates evidence and returns to recovery
    if (recoveryState !== undefined && to === recoveryState) {
      if (!ctx?.revisionChanged) return false;
      return idx !== undefined && idx < sequence.length - 1;
    }

    // 5. resume a blocked run to the state it was blocked in (ARC-006):
    //    the target is exactly the recorded blockedFrom, and only that.
    if (from === 'BLOCKED' && resumable) {
      const target = ctx?.blockedFrom;
      return target !== undefined && target !== null && to === target && seqIndex.has(target);
    }

    return false;
  };

  const nextStates = (from: string, ctx?: MachineContext): string[] => {
    if (!known.has(from)) return [];
    const out: string[] = [];
    const push = (s: string) => {
      if (!out.includes(s) && canTransition(from, s, ctx)) out.push(s);
    };
    const idx = seqIndex.get(from);
    if (idx !== undefined && idx + 1 < sequence.length) push(sequence[idx + 1]!);
    for (const [f, t] of edges) if (f === from) push(t);
    if (idx !== undefined && (idx < sequence.length - 1 || failFromLast))
      for (const s of failureStates) push(s);
    if (recoveryState !== undefined) push(recoveryState);
    if (from === 'BLOCKED' && resumable && ctx?.blockedFrom) push(ctx.blockedFrom);
    return out;
  };

  return {
    states: [...sequence, ...failureStates, ...edges.map(([, t]) => t)],
    canTransition,
    nextStates,
  };
}

// --- Operational flow (spec-k8s/01 §Lifecycle) ----------------------------

/**
 * Per-environment operational flow. The last state ends the instantiation;
 * a promotion into the next environment starts a new instantiation at
 * `MERGED` (spec-k8s/01 §Lifecycle, spec-k8s/04).
 */
export const OPERATIONAL_STATES = [
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
  'FAILED',
  'BLOCKED',
  'ERROR',
] as const;

export type OperationalState = (typeof OPERATIONAL_STATES)[number];

export const operationalMachine: StateMachine = createStateMachine({
  name: 'operational',
  sequence: OPERATIONAL_STATES.slice(0, 13),
  failureStates: ['FAILED', 'BLOCKED', 'ERROR'],
  // AWAITING_PROMOTION_APPROVAL is still in progress (the promotion has not
  // happened), so it may fail, block or error like any other active state.
  failFromLast: true,
});

// --- Promotion states (spec-k8s/04 §Promotion states) ---------------------

/**
 * Promotion flow. `PROMOTED` opens the rollback track on a failed release;
 * the spec names no `ERROR` state for promotion — execution errors are held
 * by the operational machine instead.
 */
export const PROMOTION_STATES = [
  'PROPOSED',
  'EVIDENCE_PENDING',
  'APPROVAL_PENDING',
  'MERGE_READY',
  'MERGED',
  'SYNC_PENDING',
  'HEALTH_PENDING',
  'TESTING',
  'PROMOTED',
  'BLOCKED',
  'FAILED',
  'ROLLBACK_PENDING',
  'ROLLED_BACK',
] as const;

export type PromotionState = (typeof PROMOTION_STATES)[number];

export const promotionMachine: StateMachine = createStateMachine({
  name: 'promotion',
  sequence: PROMOTION_STATES.slice(0, 9),
  failureStates: ['BLOCKED', 'FAILED'],
  edges: [
    ['PROMOTED', 'ROLLBACK_PENDING'],
    ['ROLLBACK_PENDING', 'ROLLED_BACK'],
  ],
  recoveryState: 'EVIDENCE_PENDING',
});

// --- UAT states (spec-k8s/07 §States) -------------------------------------

/**
 * UAT run flow. Substates of the operational testing states
 * (spec-k8s/07 §States). A newer revision supersedes incomplete evidence,
 * so `SUPERSEDED` is reachable from any active state.
 */
export const UAT_STATES = [
  'PENDING',
  'WAITING_FOR_ARGO',
  'RUNNING_INFRA',
  'RUNNING_VIRTUALSERVER',
  'RUNNING_ACCEPTANCE',
  'EVIDENCE_READY',
  'AWAITING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'FAILED',
  'BLOCKED',
  'ERROR',
  'SUPERSEDED',
] as const;

export type UatState = (typeof UAT_STATES)[number];

export const uatMachine: StateMachine = createStateMachine({
  name: 'uat',
  sequence: UAT_STATES.slice(0, 7),
  failureStates: ['FAILED', 'BLOCKED', 'ERROR', 'SUPERSEDED'],
  edges: [
    ['AWAITING_APPROVAL', 'APPROVED'],
    ['AWAITING_APPROVAL', 'REJECTED'],
  ],
  failFromLast: true,
});
