/**
 * UAT orchestration (spec-k8s/07). UAT is an evidence-producing stage
 * between development and production: entry conditions, the three suites in
 * order, the content-addressed evidence bundle, the promotion decision, and
 * scheduling rules (scheduled runs never promote automatically; concurrent
 * runs for the same lab/environment/revision are serialized).
 *
 * With configurable environment names (ADR-K8S-003), the UAT environment is
 * the second-to-last entry of `promotionOrder` — the environment between
 * development and production. Profiles with fewer than three environments
 * have no UAT stage, and transitions requiring one return `BLOCKED_UAT`.
 */
import { createHash } from 'node:crypto';
import type { KubernetesDeploymentProfile } from './profile.ts';
import type { GitLabClient } from './gitlab.ts';
import { waitApplicationReady, type ArgoClient } from './argo.ts';
import type { Clock } from './clock.ts';
import { policyDigest, type PlatformPolicy } from './policy.ts';
import { uatMachine, type UatState } from './states.ts';
import type { EvidenceBundle } from './bundle.ts';
import { buildEvidenceBundle, verifyEvidenceBundle } from './bundle.ts';
import type { GateOutcome, TestSuiteId } from './results.ts';
import type { VsReport } from './virtualserver.ts';
import type { AcceptanceResult } from './acceptance.ts';
import type { ApprovalRef } from './adapter.ts';

export interface UatDependencies {
  gitlab: GitLabClient;
  argo: ArgoClient;
  policy: PlatformPolicy | null;
  clock: Clock;
  /** Runner identity reference — never a credential. */
  runnerIdentity: string;
  argoTimeoutMs?: number;
  argoPollIntervalMs?: number;
}

/** One UAT run's suite results (the three suites, independently visible). */
export interface UatSuiteResults {
  infrastructure: GateOutcome;
  virtualServer: VsReport;
  acceptance: AcceptanceResult;
  skipped: TestSuiteId[];
  /** Digest over the manifests of the tested revision. */
  manifestDigest?: string;
}

/**
 * The suite-execution boundary. The adapter implements this against the
 * Argo-gated environment; tests inject fakes.
 */
export type UatSuiteRunner = (input: {
  environment: string;
  revision: string;
}) => Promise<UatSuiteResults>;

/** The UAT environment for a profile, or null when none is configured. */
export function uatEnvironment(profile: KubernetesDeploymentProfile): string | null {
  const order = profile.promotionOrder;
  return order.length >= 3 ? order[order.length - 2]! : null;
}

export interface UatRunInput {
  profile: KubernetesDeploymentProfile;
  /** The UAT branch head after the promotion merge (the expected revision). */
  candidateRevision: string;
  /** Digest over the candidate content — cross-environment identity. */
  candidateManifestDigest: string;
  trigger: 'merge' | 'schedule' | 'manual';
  /** The dev-environment bundle for the same candidate content. */
  devEvidence: EvidenceBundle | null;
  runSuites: UatSuiteRunner;
}

export interface UatRunResult {
  state: UatState;
  environment: string | null;
  classification: 'PASS' | 'FAIL' | 'BLOCKED' | 'ERROR';
  subcode?: string;
  bundle: EvidenceBundle | null;
  reasons: string[];
}

/**
 * Run UAT for a candidate revision (spec-k8s/07). Fails closed at every
 * entry condition: missing UAT environment, unmerged revision, wrong-revision
 * Argo state, missing policy or credentials.
 */
export async function runUat(deps: UatDependencies, input: UatRunInput): Promise<UatRunResult> {
  const { profile } = input;
  const uatEnv = uatEnvironment(profile);
  if (uatEnv === null) {
    return {
      state: 'BLOCKED',
      environment: null,
      classification: 'BLOCKED',
      subcode: 'BLOCKED_UAT',
      bundle: null,
      reasons: ['profile has no UAT environment (needs >= 3 promotionOrder entries)'],
    };
  }
  const env = profile.environments.find((e) => e.name === uatEnv)!;

  // UAT state machine (spec-k8s/07 §States); PENDING is the entry state.
  let current: UatState = 'PENDING';
  const walk = (to: UatState) => {
    if (to !== 'PENDING' && !uatMachine.canTransition(current, to))
      throw new Error(`invalid UAT state transition ${current} -> ${to}`);
    current = to;
  };

  const done = (state: UatState, result: Omit<UatRunResult, 'state'>): UatRunResult => {
    walk(state);
    return { state, ...result };
  };

  // Entry: a candidate revision has passed development verification.
  // (Cross-environment identity is by manifest digest — branch heads are
  // environment-specific commits.)
  if (input.devEvidence === null) {
    return done('BLOCKED', {
      environment: uatEnv,
      classification: 'BLOCKED',
      subcode: 'BLOCKED_EVIDENCE',
      bundle: null,
      reasons: ['candidate revision has no dev-environment evidence'],
    });
  }
  const devProblems = verifyEvidenceBundle(input.devEvidence);
  if (
    devProblems.length > 0 ||
    input.devEvidence.classification !== 'PASS' ||
    input.devEvidence.manifests?.digest !== input.candidateManifestDigest
  ) {
    return done('BLOCKED', {
      environment: uatEnv,
      classification: 'BLOCKED',
      subcode: 'BLOCKED_EVIDENCE',
      bundle: null,
      reasons:
        devProblems.length > 0
          ? devProblems
          : [
              `dev evidence does not verify the candidate content (digest ${input.candidateManifestDigest})`,
            ],
    });
  }

  // Entry: the revision is merged into the configured UAT branch.
  const uatHead = await deps.gitlab.head(profile.labId, env.branch);
  if (uatHead === null || uatHead !== input.candidateRevision) {
    return done('BLOCKED', {
      environment: uatEnv,
      classification: 'BLOCKED',
      subcode: 'BLOCKED_REVISION',
      bundle: null,
      reasons: [
        `candidate revision ${input.candidateRevision} is not the head of the UAT branch ${env.branch}`,
      ],
    });
  }

  // Argo readiness at the exact revision (WAITING_FOR_ARGO).
  walk('WAITING_FOR_ARGO');
  const readiness = await waitApplicationReady(
    deps.argo,
    env.argoApplication,
    input.candidateRevision,
    {
      timeoutMs: deps.argoTimeoutMs ?? 300000,
      pollIntervalMs: deps.argoPollIntervalMs ?? 10000,
      clock: deps.clock,
    },
  );
  if (readiness.classification === 'BLOCKED') {
    return done('BLOCKED', {
      environment: uatEnv,
      classification: 'BLOCKED',
      subcode: readiness.subcode,
      bundle: null,
      reasons: [
        `argo readiness blocked on ${env.argoApplication} (${readiness.subcode ?? 'unknown'})`,
      ],
    });
  }
  if (readiness.classification === 'FAIL') {
    return done('FAILED', {
      environment: uatEnv,
      classification: 'FAIL',
      bundle: null,
      reasons: [
        `argo readiness failed at ${env.argoApplication} (${readiness.syncStatus}/${readiness.healthStatus} at ${readiness.observedRevision ?? 'unknown revision'}${readiness.timedOut ? ', timed out' : ''})`,
      ],
    });
  }

  // Required policy and credentials.
  if (profile.policy.required && deps.policy === null) {
    return done('BLOCKED', {
      environment: uatEnv,
      classification: 'BLOCKED',
      subcode: 'BLOCKED_POLICY',
      bundle: null,
      reasons: ['mandatory platform policy is required but unavailable (POL-001)'],
    });
  }
  if (profile.credentials.runtimeReference === null) {
    return done('BLOCKED', {
      environment: uatEnv,
      classification: 'BLOCKED',
      subcode: 'BLOCKED_CREDENTIALS',
      bundle: null,
      reasons: ['runtime credentials are not configured (DEP-002) — cluster access fails closed'],
    });
  }

  // The three suites, in order (RUNNING_*).
  walk('RUNNING_INFRA');
  const results = await input.runSuites({ environment: uatEnv, revision: input.candidateRevision });
  walk('RUNNING_VIRTUALSERVER');
  walk('RUNNING_ACCEPTANCE');

  const classes: string[] = [
    results.infrastructure.classification,
    results.virtualServer.aggregate,
    results.acceptance.classification,
  ];
  if (classes.includes('ERROR')) {
    return done('ERROR', {
      environment: uatEnv,
      classification: 'ERROR',
      bundle: null,
      reasons: ['a suite ended without a reliable result'],
    });
  }
  if (classes.includes('FAIL')) {
    return done('FAILED', {
      environment: uatEnv,
      classification: 'FAIL',
      bundle: null,
      reasons: suiteProblems(results),
    });
  }
  if (classes.includes('BLOCKED')) {
    return done('BLOCKED', {
      environment: uatEnv,
      classification: 'BLOCKED',
      bundle: null,
      reasons: suiteProblems(results),
    });
  }

  // Evidence bundle (EVIDENCE_READY).
  walk('EVIDENCE_READY');
  const overall = overallClass(results);
  const bundle = buildEvidenceBundle({
    schemaVersion: '1',
    labId: profile.labId,
    project: profile.labId,
    environment: uatEnv,
    branch: env.branch,
    revision: input.candidateRevision,
    argo: {
      application: env.argoApplication,
      syncStatus: 'Synced',
      healthStatus: 'Healthy',
      observedRevision: input.candidateRevision,
      readyAt: readiness.completedAt,
    },
    manifests: { digest: results.manifestDigest ?? input.candidateManifestDigest },
    policy:
      deps.policy !== null
        ? { revision: deps.policy.version, digest: policyDigest(deps.policy) }
        : null,
    runner: deps.runnerIdentity,
    suites: [
      {
        suite: 'infrastructure',
        classification: results.infrastructure.classification,
        subcode: results.infrastructure.subcode,
        findingsCount: results.infrastructure.findings.length,
      },
      {
        suite: 'virtualserver',
        classification: results.virtualServer.aggregate,
        findingsCount: results.virtualServer.tests.filter((t) => t.status !== 'PASS').length,
        details: results.virtualServer.json,
      },
      {
        suite: 'acceptance',
        classification: results.acceptance.classification,
        subcode: results.acceptance.subcode,
        findingsCount: 0,
        details: results.acceptance.stdout,
      },
    ],
    virtualServer: {
      markdownDigest: digestOf(results.virtualServer.markdown),
      jsonDigest: results.virtualServer.evidenceDigest,
      exitCode: results.virtualServer.exitCode,
    },
    toolVersions: {
      holagent: '0.3.0',
      virtualserverContract: results.virtualServer.contractVersion,
    },
    startedAt: readiness.completedAt,
    completedAt: deps.clock.now(),
    retries: 0,
    classification: overall,
  });

  walk('AWAITING_APPROVAL');
  return {
    state: 'AWAITING_APPROVAL',
    environment: uatEnv,
    classification: overall === 'PASS' || overall === 'PASS_WITH_WARNINGS' ? 'PASS' : overall,
    bundle,
    reasons: suiteProblems(results),
  };
}

// --- promotion decision (spec-k8s/07 §Promotion decision) --------------------

export interface PromotionDecisionInput {
  bundle: EvidenceBundle;
  candidateRevision: string;
  /** Mandatory platform policy was available at run time. */
  policyAvailable: boolean;
  /** Explicit acceptance of a VirtualServer PASS_WITH_WARNINGS. */
  virtualServerAccepted?: boolean;
  /** Required human approval, bound to revision and evidence digest. */
  approval: ApprovalRef | null;
}

/**
 * A candidate is promotable only when every condition of spec-k8s/07
 * §Promotion decision holds.
 */
export function promotionDecision(input: PromotionDecisionInput): {
  promotable: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  const { bundle } = input;

  const integrity = verifyEvidenceBundle(bundle);
  if (integrity.length > 0) reasons.push(...integrity.map((p) => `evidence integrity: ${p}`));
  if (bundle.revision !== input.candidateRevision)
    reasons.push(
      `evidence is for revision ${bundle.revision}, not the candidate ${input.candidateRevision}`,
    );
  if (!input.policyAvailable) reasons.push('mandatory platform policy was not available');
  if (bundle.argo.observedRevision !== bundle.revision)
    reasons.push('argo was not ready at the tested revision');

  const infra = bundle.suites.find((s) => s.suite === 'infrastructure');
  if (!infra || (infra.classification !== 'PASS' && infra.classification !== 'PASS_WITH_WARNINGS'))
    reasons.push('mandatory infrastructure checks did not pass');
  const vs = bundle.suites.find((s) => s.suite === 'virtualserver');
  if (!vs) reasons.push('virtualserver suite missing');
  else if (vs.classification === 'FAIL') reasons.push('virtualserver suite failed');
  else if (vs.classification === 'PASS_WITH_WARNINGS' && !input.virtualServerAccepted)
    reasons.push('virtualserver returned PASS_WITH_WARNINGS without explicit acceptance');
  const acc = bundle.suites.find((s) => s.suite === 'acceptance');
  if (!acc || acc.classification !== 'PASS') reasons.push('application acceptance did not pass');

  if (input.approval === null) reasons.push('required human approval was not recorded');
  else if (input.approval.revision !== input.candidateRevision)
    reasons.push('approval is not bound to the candidate revision');
  else if (input.approval.evidenceDigest !== bundle.evidenceDigest)
    reasons.push('approval is not bound to this evidence digest');

  return { promotable: reasons.length === 0, reasons };
}

// --- scheduling (spec-k8s/07 §Scheduling) -------------------------------------

interface UatRunRecord {
  run: Promise<UatRunResult>;
}

/**
 * Serializes UAT runs per lab/environment/revision and enforces the
 * scheduling rule: scheduled runs never promote automatically.
 */
export class UatScheduler {
  private runs = new Map<string, UatRunRecord>();

  /**
   * Start (or join) a UAT run. A run for the same lab/environment/revision
   * is deduplicated; a scheduled trigger never carries auto-promotion.
   */
  start(
    deps: UatDependencies,
    input: UatRunInput,
    opts: { autoPromote?: boolean } = {},
  ): {
    deduplicated: boolean;
    run: Promise<UatRunResult>;
    autoPromote: boolean;
  } {
    const uatEnv = uatEnvironment(input.profile) ?? 'none';
    const k = `${input.profile.labId}|${uatEnv}|${input.candidateRevision}`;
    const existing = this.runs.get(k);
    if (existing) {
      return { deduplicated: true, run: existing.run, autoPromote: false };
    }
    // Scheduled runs MUST never promote automatically (spec-k8s/07).
    const autoPromote = input.trigger !== 'schedule' && opts.autoPromote === true;
    const run = runUat(deps, input);
    this.runs.set(k, { run });
    return { deduplicated: false, run, autoPromote };
  }
}

// --- helpers -------------------------------------------------------------------

function suiteProblems(results: UatSuiteResults): string[] {
  const out: string[] = [];
  if (results.infrastructure.classification === 'FAIL')
    out.push(`infrastructure/security: FAIL (${results.infrastructure.findings.length} findings)`);
  else if (results.infrastructure.classification === 'BLOCKED')
    out.push(`infrastructure/security: BLOCKED (${results.infrastructure.subcode ?? 'unknown'})`);
  if (results.virtualServer.aggregate === 'FAIL') out.push('virtualserver: FAIL');
  else if (results.virtualServer.aggregate === 'PASS_WITH_WARNINGS')
    out.push('virtualserver: PASS_WITH_WARNINGS (acceptance required)');
  if (results.acceptance.classification === 'FAIL')
    out.push(`acceptance: FAIL (exit ${results.acceptance.exitCode})`);
  for (const s of results.skipped) out.push(`${s} skipped after blocking failure`);
  return out;
}

function overallClass(results: UatSuiteResults): GateOutcome['classification'] {
  const all = [
    results.infrastructure.classification,
    results.virtualServer.aggregate,
    results.acceptance.classification,
  ];
  if (all.includes('ERROR')) return 'ERROR';
  if (all.includes('BLOCKED')) return 'BLOCKED';
  if (all.includes('FAIL')) return 'FAIL';
  if (all.includes('PASS_WITH_WARNINGS')) return 'PASS_WITH_WARNINGS';
  return 'PASS';
}

function digestOf(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}
