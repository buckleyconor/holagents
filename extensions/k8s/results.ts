/**
 * Shared result and evidence contracts for the Charmed Kubernetes extension
 * (spec-k8s/01 §Failure taxonomy and §Evidence contract;
 * spec-k8s/06 §Aggregate result and §Exit codes).
 *
 * Every operational gate returns exactly one terminal classification, and a
 * missing dependency is never represented as passing: it is `BLOCKED`, with
 * a diagnostic subcode. These types are milestone-1 contracts — no adapter
 * implements them yet (see ./adapter.ts).
 */

export const GATE_CLASSIFICATIONS = [
  'PASS',
  'PASS_WITH_WARNINGS',
  'FAIL',
  'BLOCKED',
  'ERROR',
] as const;

export type GateClassification = (typeof GATE_CLASSIFICATIONS)[number];

export function isGateClassification(v: unknown): v is GateClassification {
  return typeof v === 'string' && (GATE_CLASSIFICATIONS as readonly string[]).includes(v);
}

/**
 * Subcodes identify the missing dependency behind a `BLOCKED` result
 * (spec-k8s/01 §Failure taxonomy). The subcode is diagnostic; the terminal
 * classification stays `BLOCKED`.
 */
const SUBCODE_RE = /^BLOCKED_[A-Z0-9_]+$/;

/** Subcodes named by the spec; the pattern above is the acceptance rule. */
export const KNOWN_BLOCKED_SUBCODES = [
  'BLOCKED_CREDENTIALS',
  'BLOCKED_POLICY',
  'BLOCKED_UAT',
] as const;

export function isBlockedSubcode(v: unknown): v is string {
  return typeof v === 'string' && SUBCODE_RE.test(v);
}

/** A finding on one resource, one per evaluated control (spec-k8s/05 POL-003). */
export interface Finding {
  /** Requirement identifier — a policy control id or a suite check id. */
  id: string;
  severity: 'mandatory' | 'advisory';
  resource?: string;
  expected: string;
  observed: string;
  remediation?: string;
  /** Policy revision the finding was evaluated against, when policy-derived. */
  policyRevision?: string;
}

/** The base shape every gate outcome shares. */
export interface GateOutcome {
  classification: GateClassification;
  /** Diagnostic, `BLOCKED` only, and must match the subcode pattern. */
  subcode?: string;
  findings: Finding[];
}

/** Structural check on an outcome; returns problems (empty = well-formed). */
export function validateOutcome(o: GateOutcome): string[] {
  const problems: string[] = [];
  if (!isGateClassification(o.classification))
    problems.push(`classification ${String(o.classification)} is not a gate classification`);
  if (o.subcode !== undefined) {
    if (!isBlockedSubcode(o.subcode)) {
      problems.push(`subcode ${JSON.stringify(o.subcode)} does not match BLOCKED_[A-Z0-9_]+`);
    } else if (o.classification !== 'BLOCKED') {
      problems.push(`subcode ${o.subcode} requires classification BLOCKED`);
    }
  }
  o.findings.forEach((f, i) => {
    if (typeof f.id !== 'string' || f.id === '') problems.push(`finding[${i}] missing id`);
    if (f.severity !== 'mandatory' && f.severity !== 'advisory')
      problems.push(`finding[${i}] severity must be mandatory or advisory`);
    if (typeof f.expected !== 'string' || f.expected === '')
      problems.push(`finding[${i}] missing expected condition`);
    if (typeof f.observed !== 'string' || f.observed === '')
      problems.push(`finding[${i}] missing observed condition`);
  });
  return problems;
}

/**
 * Revisions observed at a gate (spec-k8s/01 §Evidence contract). Fields are
 * populated where applicable to the gate.
 */
export interface EvidenceRevisions {
  source?: string;
  expected?: string;
  merged?: string;
  observed?: string;
}

/**
 * Machine-readable evidence for one operational gate
 * (spec-k8s/01 §Evidence contract). Evidence MUST contain no secret, token,
 * cookie value, kubeconfig or private key — references are sanitized.
 */
export interface Evidence {
  schemaVersion: string;
  toolVersion: string;
  labId: string;
  project?: string;
  environment: string;
  branch?: string;
  revisions: EvidenceRevisions;
  digests: {
    manifests?: string;
    policy?: string;
  };
  /** ISO 8601. */
  startedAt: string;
  /** ISO 8601; absent while the gate is still running. */
  completedAt?: string;
  outcome: GateOutcome;
  /** Approval references (approver, revision, transition, digest). */
  approvals: string[];
  /** Sanitized artifact and log references. */
  artifacts: string[];
}

/** Structural check on an evidence record; returns problems (empty = ok). */
export function validateEvidence(e: Evidence): string[] {
  const problems = validateOutcome(e.outcome);
  for (const field of ['schemaVersion', 'toolVersion', 'labId', 'environment'] as const) {
    if (typeof e[field] !== 'string' || e[field] === '') problems.push(`evidence missing ${field}`);
  }
  const started = Date.parse(e.startedAt);
  if (Number.isNaN(started)) problems.push('evidence startedAt is not a timestamp');
  if (e.completedAt !== undefined) {
    const completed = Date.parse(e.completedAt);
    if (Number.isNaN(completed)) problems.push('evidence completedAt is not a timestamp');
    else if (!Number.isNaN(started) && completed < started)
      problems.push('evidence completedAt is before startedAt');
  }
  for (const [field, value] of Object.entries(e.revisions)) {
    if (value !== undefined && (typeof value !== 'string' || value === ''))
      problems.push(`evidence revisions.${field} must be a non-empty string`);
  }
  for (const list of [e.approvals, e.artifacts] as const) {
    for (const item of list) {
      if (typeof item !== 'string' || item === '')
        problems.push('evidence approvals/artifacts entries must be non-empty strings');
    }
  }
  return problems;
}

// --- VirtualServer result contract (spec-k8s/06) -------------------------

/** Mandatory suites, in execution order (ADP-006, UAT-001…UAT-003). */
export const TEST_SUITES = ['infrastructure', 'virtualserver', 'acceptance'] as const;
export type TestSuiteId = (typeof TEST_SUITES)[number];

/** Deterministic exit codes for the VirtualServer runner (spec-k8s/06). */
export const VS_EXIT = {
  PASS: 0,
  PASS_WITH_WARNINGS: 1,
  FAIL: 2,
  BLOCKED: 3,
  INVALID_INPUT: 4,
  ERROR: 5,
} as const;

export type VsExitCode = (typeof VS_EXIT)[keyof typeof VS_EXIT];

/**
 * Map an aggregate result to its exit code. Invalid input is not a gate
 * classification — it is a runner contract violation (exit 4).
 */
export function vsExitCode(classification: GateClassification, invalidInput = false): number {
  if (invalidInput) return VS_EXIT.INVALID_INPUT;
  switch (classification) {
    case 'PASS':
      return VS_EXIT.PASS;
    case 'PASS_WITH_WARNINGS':
      return VS_EXIT.PASS_WITH_WARNINGS;
    case 'FAIL':
      return VS_EXIT.FAIL;
    case 'BLOCKED':
      return VS_EXIT.BLOCKED;
    case 'ERROR':
      return VS_EXIT.ERROR;
  }
}

export const VS_TEST_IDS = ['VS-01', 'VS-02', 'VS-03', 'VS-04', 'VS-05', 'VS-06'] as const;
export type VsTestId = (typeof VS_TEST_IDS)[number];

export type VsTestStatus = 'PASS' | 'FAIL' | 'WARN';

/** One run of the six-test suite (spec-k8s/06). */
export interface VsSuiteResult {
  /** Preflight auth-path probe: `BLOCKED` means the suite did not run. */
  preflight: 'READY' | 'BLOCKED';
  /** The six tests in order; empty when preflight was BLOCKED. */
  tests: { id: VsTestId; status: VsTestStatus }[];
  /** An explicitly supplied token did not match the minted token. */
  tokenMismatch: boolean;
  /** Runner or evidence generation failed (no trustworthy result). */
  runnerError?: boolean;
}

/**
 * Aggregate result precedence (spec-k8s/06 §Aggregate result):
 * 1. FAIL if tests 1–5 fail or any explicit token mismatch occurs.
 * 2. BLOCKED if a required precondition cannot be established and no test
 *    failure exists.
 * 3. PASS_WITH_WARNINGS when tests 1–5 pass and only test 6 warns.
 * 4. PASS when all six tests pass.
 * 5. ERROR when runner or evidence generation fails without a trustworthy
 *    test result.
 */
export function aggregateVirtualServer(r: VsSuiteResult): GateClassification {
  const byId = new Map(r.tests.map((t) => [t.id, t]));
  const t1to5 = VS_TEST_IDS.slice(0, 5).map((id) => byId.get(id));
  const t6 = byId.get('VS-06');
  const anyFail1to5 = t1to5.some((t) => t?.status === 'FAIL');
  const anyFail = r.tests.some((t) => t.status === 'FAIL');

  if (r.tokenMismatch || anyFail1to5) return 'FAIL';
  if (r.preflight === 'BLOCKED' && !anyFail) return 'BLOCKED';
  const all1to5Pass = t1to5.every((t) => t?.status === 'PASS');
  if (all1to5Pass && t6?.status === 'WARN') return 'PASS_WITH_WARNINGS';
  if (all1to5Pass && t6?.status === 'PASS') return 'PASS';
  // Runner/evidence failure, a missing or inconsistent test result, or a
  // VS-06 failure that the six-test contract does not otherwise explain.
  return 'ERROR';
}

/** Structural check on a suite result; returns problems (empty = ok). */
export function validateVsSuiteResult(r: VsSuiteResult): string[] {
  const problems: string[] = [];
  if (r.preflight !== 'READY' && r.preflight !== 'BLOCKED')
    problems.push(`preflight ${String(r.preflight)} must be READY or BLOCKED`);
  if (r.preflight === 'BLOCKED' && r.tests.length !== 0)
    problems.push('a BLOCKED preflight must not carry test results');
  const ids = r.tests.map((t) => t.id);
  for (const id of VS_TEST_IDS) {
    if (!ids.includes(id)) problems.push(`missing test ${id}`);
  }
  if (new Set(ids).size !== ids.length) problems.push('duplicate test ids');
  const expectedOrder = VS_TEST_IDS.filter((id) => ids.includes(id));
  if (JSON.stringify(ids) !== JSON.stringify(expectedOrder))
    problems.push('tests are not in VS-01..VS-06 order');
  for (const t of r.tests) {
    if (t.status !== 'PASS' && t.status !== 'FAIL' && t.status !== 'WARN')
      problems.push(`test ${t.id} status ${String(t.status)} is not PASS/FAIL/WARN`);
  }
  return problems;
}
