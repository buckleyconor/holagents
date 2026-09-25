/**
 * Promotion and rollback (spec-k8s/04; ADR-K8S-004/006). Consequential
 * promotion uses evidence-bearing GitLab merge requests and human approval;
 * HOLagents never writes to UAT or production clusters directly. Rollback is
 * a reviewed Git revert (or promotion of a previously verified revision),
 * reconciled and verified through the same Argo gate, with the policy-
 * designated minimum tests.
 *
 * Production cannot bypass UAT: promotion walks `promotionOrder` between
 * adjacent environments only, and the final environment accepts a candidate
 * only on the verified evidence of the UAT environment (spec-k8s/07).
 */
import type { KubernetesDeploymentProfile } from './profile.ts';
import type { GitLabClient } from './gitlab.ts';
import { buildPromotionMrDescription } from './gitlab.ts';
import type { ArgoClient } from './argo.ts';
import { waitApplicationReady } from './argo.ts';
import type { Clock } from './clock.ts';
import { idempotencyKey, IdempotencyStore } from './idempotency.ts';
import { verifyEvidenceBundle } from './bundle.ts';
import type { EvidenceBundle } from './bundle.ts';
import type { ApprovalRef } from './adapter.ts';
import type { GateClassification, GateOutcome } from './results.ts';

export interface PromotionDependencies {
  gitlab: GitLabClient;
  clock: Clock;
  idempotency: IdempotencyStore;
}

export interface PromotionInput {
  profile: KubernetesDeploymentProfile;
  sourceEnvironment: string;
  targetEnvironment: string;
  candidateRevision: string;
  /** The source environment's evidence bundle for the candidate revision. */
  sourceBundle: EvidenceBundle;
  /** Observed Argo status of the source environment's application. */
  sourceArgo: {
    application: string;
    syncStatus: string;
    healthStatus: string;
    observedRevision: string;
  };
  /** Required for consequential targets; bound to revision and digest. */
  approval: ApprovalRef | null;
}

export interface PromotionResult {
  classification: GateClassification;
  subcode?: string;
  reasons: string[];
  mergeRequestIid?: number;
  mergedRevision?: string;
}

/**
 * Promote a candidate revision from one environment to the next
 * (ADP-004, GAP-003). Fails closed on non-adjacent promotion, stale or
 * mismatched evidence, and missing consequential approval.
 */
export async function promote(
  deps: PromotionDependencies,
  input: PromotionInput,
): Promise<PromotionResult> {
  const { profile } = input;
  const order = profile.promotionOrder;
  const sourceIdx = order.indexOf(input.sourceEnvironment);
  const targetIdx = order.indexOf(input.targetEnvironment);

  if (sourceIdx === -1 || targetIdx === -1) {
    return {
      classification: 'ERROR',
      reasons: [
        `unknown environment(s): source=${input.sourceEnvironment}, target=${input.targetEnvironment}; promotionOrder=${order.join(' -> ')}`,
      ],
    };
  }
  if (targetIdx !== sourceIdx + 1) {
    return {
      classification: 'ERROR',
      reasons: [
        `promotion must occur between adjacent environments (GAP-002): ${input.sourceEnvironment} -> ${input.targetEnvironment} is not adjacent in ${order.join(' -> ')}`,
      ],
    };
  }

  // Evidence for the candidate revision — another revision must not authorize.
  const integrity = verifyEvidenceBundle(input.sourceBundle);
  if (
    integrity.length > 0 ||
    input.sourceBundle.revision !== input.candidateRevision ||
    input.sourceBundle.environment !== input.sourceEnvironment
  ) {
    return {
      classification: 'BLOCKED',
      subcode: 'BLOCKED_EVIDENCE',
      reasons:
        integrity.length > 0
          ? integrity
          : [
              `source evidence does not verify ${input.sourceEnvironment} at ${input.candidateRevision}`,
            ],
    };
  }
  if (
    input.sourceBundle.classification !== 'PASS' &&
    input.sourceBundle.classification !== 'PASS_WITH_WARNINGS'
  ) {
    return {
      classification: 'BLOCKED',
      subcode: 'BLOCKED_EVIDENCE',
      reasons: [
        `source environment ${input.sourceEnvironment} is not verified (classification ${input.sourceBundle.classification})`,
      ],
    };
  }

  const targetEnv = profile.environments.find((e) => e.name === input.targetEnvironment)!;

  // Consequential targets require approval bound to revision and digest.
  if (targetEnv.consequential) {
    if (input.approval === null) {
      return {
        classification: 'BLOCKED',
        subcode: 'BLOCKED_APPROVAL',
        reasons: [
          `target environment ${input.targetEnvironment} is consequential and requires approval`,
        ],
      };
    }
    if (input.approval.revision !== input.candidateRevision) {
      return {
        classification: 'BLOCKED',
        subcode: 'BLOCKED_APPROVAL',
        reasons: [
          `approval is not bound to the candidate revision (${input.approval.revision} != ${input.candidateRevision})`,
        ],
      };
    }
    if (input.approval.evidenceDigest !== input.sourceBundle.evidenceDigest) {
      return {
        classification: 'BLOCKED',
        subcode: 'BLOCKED_APPROVAL',
        reasons: ['approval is not bound to this evidence digest'],
      };
    }
    if (input.approval.approver === '') {
      return {
        classification: 'BLOCKED',
        subcode: 'BLOCKED_APPROVAL',
        reasons: ['approval must identify an approver'],
      };
    }
  }

  // Idempotency (spec-k8s/03): same inputs return the original outcome.
  const key = idempotencyKey({
    labId: profile.labId,
    environment: input.targetEnvironment,
    operation: 'promote',
    expectedRevision: input.candidateRevision,
    desiredDigest: input.sourceBundle.evidenceDigest,
  });
  const begun = deps.idempotency.begin(key, JSON.stringify(input));
  if (!begun.started) {
    return begun.outcome as PromotionResult;
  }

  const sourceHead = await deps.gitlab.head(profile.labId, input.sourceEnvironment);
  const targetHead = await deps.gitlab.head(profile.labId, input.targetEnvironment);

  const description = buildPromotionMrDescription({
    sourceEnvironment: input.sourceEnvironment,
    targetEnvironment: input.targetEnvironment,
    candidateRevision: input.candidateRevision,
    targetRevision: targetHead ?? 'unknown',
    manifestDigest: input.sourceBundle.manifests?.digest ?? '',
    policyDigest: input.sourceBundle.policy?.digest ?? '',
    argo: {
      syncStatus: input.sourceArgo.syncStatus,
      healthStatus: input.sourceArgo.healthStatus,
      observedRevision: input.sourceArgo.observedRevision,
    },
    evidence: {
      infrastructure:
        input.sourceBundle.suites.find((s) => s.suite === 'infrastructure')?.classification ??
        'n/a',
      virtualServer:
        input.sourceBundle.suites.find((s) => s.suite === 'virtualserver')?.classification ?? 'n/a',
      acceptance:
        input.sourceBundle.suites.find((s) => s.suite === 'acceptance')?.classification ?? 'n/a',
    },
    warnings: input.sourceBundle.suites
      .filter((s) => s.classification === 'PASS_WITH_WARNINGS')
      .map((s) => `${s.suite}: PASS_WITH_WARNINGS`),
    blockers: input.sourceBundle.suites
      .filter((s) => s.classification === 'FAIL' || s.classification === 'BLOCKED')
      .map((s) => `${s.suite}: ${s.classification}`),
    approvalStatus:
      input.approval !== null
        ? `approved by ${input.approval.approver} at ${input.approval.timestamp} for revision ${input.approval.revision} (evidence ${input.approval.evidenceDigest})`
        : `no approval required (non-consequential target)`,
    evidenceAt: input.sourceBundle.completedAt,
  });

  // The candidate must be the source branch head at MR time.
  if (sourceHead !== input.candidateRevision) {
    return {
      classification: 'BLOCKED',
      subcode: 'BLOCKED_REVISION',
      reasons: [
        `candidate revision ${input.candidateRevision} is not the head of ${input.sourceEnvironment} (${sourceHead ?? 'missing'})`,
      ],
    };
  }

  const mr = await deps.gitlab.createMergeRequest(profile.labId, {
    sourceBranch: input.sourceEnvironment,
    targetBranch: input.targetEnvironment,
    title: `promote ${input.sourceEnvironment} -> ${input.targetEnvironment} @ ${input.candidateRevision.slice(0, 12)}`,
    description,
    candidateRevision: input.candidateRevision,
  });
  if (input.approval !== null) {
    await deps.gitlab.approveMergeRequest(profile.labId, mr.iid, {
      approver: input.approval.approver,
      revision: input.approval.revision,
      transition: `${input.sourceEnvironment} -> ${input.targetEnvironment}`,
      timestamp: input.approval.timestamp,
      evidenceDigest: input.approval.evidenceDigest,
    });
  }
  const mergedRevision = await deps.gitlab.mergeMergeRequest(profile.labId, mr.iid);

  const result: PromotionResult = {
    classification: 'PASS',
    reasons: [
      `promoted ${input.sourceEnvironment} -> ${input.targetEnvironment} via MR !${mr.iid}`,
    ],
    mergeRequestIid: mr.iid,
    mergedRevision,
  };
  deps.idempotency.complete(key, result);
  return result;
}

// --- rollback (spec-k8s/04 §Rollback) -----------------------------------------

export interface RollbackInput {
  profile: KubernetesDeploymentProfile;
  /** The environment to roll back (e.g. production). */
  environment: string;
  failedRevision: string;
  /** A previously verified revision to restore. */
  restoredRevision: string;
  reason: string;
  /** Content of the verified change set at `restoredRevision`. */
  restoredManifests: Record<string, string>;
  /** Follows configured environment policy (consequential requires approval). */
  approval: ApprovalRef;
}

export interface RollbackDependencies {
  gitlab: GitLabClient;
  argo: ArgoClient;
  clock: Clock;
  /**
   * The policy-designated minimum tests after reconciliation (spec-k8s/04:
   * "the policy-designated minimum tests MUST run after reconciliation").
   */
  runMinSuites: (
    environment: string,
    revision: string,
  ) => Promise<{
    infrastructure: GateOutcome;
    virtualServer: GateOutcome;
  }>;
  argoTimeoutMs?: number;
  argoPollIntervalMs?: number;
}

export interface RollbackResult {
  classification: GateClassification;
  subcode?: string;
  reasons: string[];
  /** The revert commit (the revision Argo reconciles to). */
  revertCommitSha?: string;
  /** Evidence linking failed and restored revisions (spec-k8s/04). */
  evidence?: {
    failedRevision: string;
    restoredRevision: string;
    revertCommitSha: string;
    reason: string;
    approver: string;
    verification: { infrastructure: string; virtualServer: string };
  };
}

/**
 * Roll back an environment through a reviewed Git revert, verify through the
 * Argo gate at the restored revision, and run the minimum suites.
 * HOLagents never performs an undocumented direct production rollback.
 */
export async function rollback(
  deps: RollbackDependencies,
  input: RollbackInput,
): Promise<RollbackResult> {
  const { profile } = input;
  const env = profile.environments.find((e) => e.name === input.environment);
  if (env === undefined) {
    return {
      classification: 'ERROR',
      reasons: [`unknown environment ${input.environment}`],
    };
  }
  if (input.approval.revision !== input.restoredRevision) {
    return {
      classification: 'BLOCKED',
      subcode: 'BLOCKED_APPROVAL',
      reasons: [
        `rollback approval is not bound to the restored revision (${input.approval.revision} != ${input.restoredRevision})`,
      ],
    };
  }
  if (env.consequential && input.approval.approver === '') {
    return {
      classification: 'BLOCKED',
      subcode: 'BLOCKED_APPROVAL',
      reasons: [
        `rollback of consequential environment ${input.environment} requires a named approver`,
      ],
    };
  }

  // Reviewed Git revert: a single commit on the environment branch
  // restoring the verified content.
  const revertSha = await deps.gitlab.commit(
    profile.labId,
    env.branch,
    input.restoredManifests,
    `revert: restore ${input.restoredRevision.slice(0, 12)} after failure of ${input.failedRevision.slice(0, 12)} — ${input.reason}`,
    'holagent-rollback',
  );

  // The restored revision MUST become Synced and Healthy (same Argo gate).
  const readiness = await waitApplicationReady(deps.argo, env.argoApplication, revertSha, {
    timeoutMs: deps.argoTimeoutMs ?? 300000,
    pollIntervalMs: deps.argoPollIntervalMs ?? 10000,
    clock: deps.clock,
  });
  if (readiness.classification !== 'PASS') {
    return {
      classification: readiness.classification === 'BLOCKED' ? 'BLOCKED' : 'FAIL',
      subcode: readiness.subcode,
      reasons: [
        `post-rollback readiness ${readiness.classification} at ${env.argoApplication} (observed ${readiness.observedRevision ?? 'unknown'})`,
      ],
      revertCommitSha: revertSha,
    };
  }

  // Minimum tests after reconciliation.
  const min = await deps.runMinSuites(input.environment, input.restoredRevision);
  if (min.infrastructure.classification === 'FAIL' || min.virtualServer.classification === 'FAIL') {
    return {
      classification: 'FAIL',
      reasons: [
        `post-rollback minimum suites failed (infra ${min.infrastructure.classification}, virtualserver ${min.virtualServer.classification})`,
      ],
      revertCommitSha: revertSha,
    };
  }

  return {
    classification: 'PASS',
    reasons: [
      `rolled back ${input.environment} to ${input.restoredRevision} via revert ${revertSha.slice(0, 12)}`,
    ],
    revertCommitSha: revertSha,
    evidence: {
      failedRevision: input.failedRevision,
      restoredRevision: input.restoredRevision,
      revertCommitSha: revertSha,
      reason: input.reason,
      approver: input.approval.approver,
      verification: {
        infrastructure: min.infrastructure.classification,
        virtualServer: min.virtualServer.classification,
      },
    },
  };
}
