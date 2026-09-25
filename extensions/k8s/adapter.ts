/**
 * Deployment adapter boundary (spec-k8s/01 ARC-002 and ARC-003;
 * spec-k8s/03 §Adapter operations).
 *
 * Milestone 1 delivers the contracts only: the operation interfaces, their
 * input/output types, and the adapter registry. No adapter is registered
 * yet (Milestones 2–5 implement the Charmed Kubernetes adapter behind these
 * interfaces), and nothing in this directory is registered with the hol
 * extension — so existing HOLagents behavior is unchanged when Kubernetes
 * is not selected (milestone-1 exit criterion).
 *
 * The boundary supports platform-specific implementations and the
 * Kubernetes adapter MUST NOT invoke or embed the vCD Docker implementation
 * (ARC-002, ADR-K8S-009):
 *
 *     DeploymentAdapter
 *     ├── vcd-docker
 *     └── charmed-kubernetes
 */

import type { Evidence, GateOutcome } from './results.ts';
import type { ProfileError } from './profile.ts';

export const DEPLOYMENT_PLATFORMS = ['vcd-docker', 'charmed-kubernetes'] as const;
export type DeploymentPlatform = (typeof DEPLOYMENT_PLATFORMS)[number];

/**
 * Platform policy document (spec-k8s/05 §Policy interface). The concrete
 * schema is DEP-001 and has not been supplied, so control entries stay
 * untyped until it is.
 */
export interface PolicyDocument {
  apiVersion: string;
  name: string;
  version: string;
  mandatoryControls: unknown[];
  advisoryControls: unknown[];
  environmentRules: Record<string, unknown>;
  exceptionProcess: unknown | null;
}

/**
 * Human approval reference (spec-k8s/04 §Security: approval MUST identify
 * approver, revision, transition, timestamp and evidence digest).
 */
export interface ApprovalRef {
  approver: string;
  revision: string;
  transition: string;
  /** ISO 8601. */
  timestamp: string;
  evidenceDigest: string;
}

/** A rendered resource in a change set. */
export interface ResourceSpec {
  apiVersion: string;
  kind: string;
  name: string;
  namespace?: string;
  /** Content digest of the rendered document. */
  digest: string;
}

/**
 * Deterministic deployment content (ADP-002): identical inputs MUST produce
 * identical output and the same digest; preparation never contacts the
 * cluster.
 */
export interface ChangeSet {
  environment: string;
  sourceRevision: string;
  resources: ResourceSpec[];
  /** Digest over the full desired state; part of the idempotency key. */
  digest: string;
}

// --- operation inputs / outputs (spec-k8s/03 §Adapter operations) ----------

export interface ValidateInput {
  profileText: string;
  environment: string;
  /** `null` when unavailable; a required-but-missing policy blocks (POL-001). */
  policy: PolicyDocument | null;
}
export interface ValidateOutput extends GateOutcome {
  /** Profile parse/validation errors (empty when the profile is well-formed). */
  errors: ProfileError[];
}

export interface PrepareInput {
  environment: string;
  sourceRevision: string;
}

export interface DeployDevInput {
  changeSet: ChangeSet;
  /** Development automation MAY only start with explicit approval (ADP-003). */
  approval: ApprovalRef;
}
export interface DeployDevOutput extends GateOutcome {
  mergeRef?: string;
}

export interface PromoteInput {
  sourceEnvironment: string;
  targetEnvironment: string;
  /** Evidence for the candidate revision; other revisions must not authorize. */
  evidence: Evidence;
}
export interface PromoteOutput extends GateOutcome {
  mergeRequestRef?: string;
}

export type ArgoSyncStatus = 'Synced' | 'OutOfSync' | 'Unknown';
export type ArgoHealthStatus =
  'Healthy' | 'Degraded' | 'Progressing' | 'Missing' | 'Suspended' | 'Unknown';

export interface ObserveInput {
  environment: string;
  expectedRevision: string;
  timeoutMs: number;
  pollIntervalMs: number;
}
/**
 * Exact-revision readiness (ADP-005, GAP-010/011): tests must not start
 * while status is progressing, degraded, missing, unknown, timed out or
 * associated with another revision.
 */
export interface ObserveOutput extends GateOutcome {
  syncStatus?: ArgoSyncStatus;
  healthStatus?: ArgoHealthStatus;
  observedRevision?: string;
  durationMs?: number;
}

/** Mandatory suites, in execution order (ADP-006, UAT-001…003). */
export const TEST_SUITES = ['infrastructure', 'virtualserver', 'acceptance'] as const;
export type TestSuiteId = (typeof TEST_SUITES)[number];

export interface SuiteResult {
  suite: TestSuiteId;
  outcome: GateOutcome;
}

export interface TestInput {
  environment: string;
  revision: string;
  suites: TestSuiteId[];
}
export interface TestOutput extends GateOutcome {
  /** One result per executed suite, in execution order. */
  suites: SuiteResult[];
}

export interface DestroyInput {
  environment: string;
  /** Consequential destruction requires approval (ADP-007). */
  approval: ApprovalRef;
}
export interface DestroyOutput extends GateOutcome {}

// --- the boundary -----------------------------------------------------------

/**
 * The platform-neutral deployment boundary (ARC-002). Implementations MUST
 * use runtime-injected, namespace-scoped least-privilege credentials, MUST
 * NOT write credentials to Git, manifests, logs or evidence, and MUST
 * return `BLOCKED` (fail closed) rather than fall back to broader access
 * when a required dependency is unavailable (spec-k8s/03 §Identity and
 * access).
 */
export interface DeploymentAdapter {
  readonly platform: DeploymentPlatform;

  /** ADP-001: profile, raw-YAML, namespace and policy validation. */
  validate(input: ValidateInput): Promise<ValidateOutput>;
  /** ADP-002: deterministic desired state; no cluster contact. */
  prepare(input: PrepareInput): Promise<ChangeSet>;
  /** ADP-003: approved development deployment into the dev branch. */
  deployDev(input: DeployDevInput): Promise<DeployDevOutput>;
  /** ADP-004: evidence-bearing merge request; never a direct cluster write. */
  promote(input: PromoteInput): Promise<PromoteOutput>;
  /** ADP-005: wait for the expected revision to be Synced and Healthy. */
  observe(input: ObserveInput): Promise<ObserveOutput>;
  /** ADP-006: run the mandatory suites in order. */
  test(input: TestInput): Promise<TestOutput>;
  /** ADP-007: GitOps-driven, approved, idempotent destruction. */
  destroy(input: DestroyInput): Promise<DestroyOutput>;
}

// --- registry ----------------------------------------------------------------

/**
 * Adapter registry. Empty at milestone 1: `getAdapter` returns undefined
 * for both platforms until a later milestone registers an implementation.
 */
const registry = new Map<DeploymentPlatform, DeploymentAdapter>();

export function registerAdapter(adapter: DeploymentAdapter): void {
  registry.set(adapter.platform, adapter);
}

export function getAdapter(platform: DeploymentPlatform): DeploymentAdapter | undefined {
  return registry.get(platform);
}
