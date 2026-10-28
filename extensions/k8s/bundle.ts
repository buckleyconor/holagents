/**
 * Unified evidence bundle (spec-k8s/07 §Evidence bundle). Each run produces
 * an immutable, content-addressed bundle: lab/project/branch/environment/
 * revision, Argo readiness observations, policy revision, runner identity
 * reference (without credentials), the three suite results, tool versions,
 * timings and retry relationships, the final classification, and a digest
 * over the redacted canonical JSON.
 *
 * Revision specificity: a bundle binds to exactly one Git revision and one
 * Argo observation; `verifyEvidenceBundle` recomputes the digest so a
 * mutated or stale bundle cannot authorize a promotion (spec-k8s/07: a
 * newer revision supersedes older evidence, which is retained but cannot
 * authorize the newer candidate).
 */
import { createHash } from 'node:crypto';
import { redactText } from './redact.ts';
import type { GateClassification } from './results.ts';
import type { TestSuiteId } from './results.ts';

export interface SuiteSummary {
  suite: TestSuiteId;
  classification: GateClassification;
  subcode?: string;
  findingsCount: number;
  /** Sanitized details (redacted by the builder). */
  details?: string;
}

export interface EvidenceBundle {
  schemaVersion: '1';
  labId: string;
  project: string;
  environment: string;
  branch: string;
  /** The Git revision this bundle was produced against. */
  revision: string;
  argo: {
    application: string;
    syncStatus: string;
    healthStatus: string;
    observedRevision: string;
    readyAt: string;
  };
  /** Manifest digest for the tested revision (spec-k8s/07 §Evidence bundle). */
  manifests: { digest: string } | null;
  policy: { revision: string; digest: string } | null;
  /** Runner identity reference — never a credential. */
  runner: string;
  suites: SuiteSummary[];
  virtualServer?: {
    markdownDigest: string;
    jsonDigest: string;
    exitCode: number;
  } | null;
  toolVersions: Record<string, string>;
  startedAt: string;
  completedAt: string;
  retries: number;
  classification: GateClassification;
  evidenceDigest: string;
}

export type EvidenceBundleInput = Omit<EvidenceBundle, 'evidenceDigest'>;

/**
 * Build a content-addressed bundle. All free-text is redacted before the
 * digest is computed, so the digest also authenticates the redaction.
 */
export function buildEvidenceBundle(input: EvidenceBundleInput): EvidenceBundle {
  const sanitized: EvidenceBundleInput = {
    ...input,
    suites: input.suites.map((s) => ({
      ...s,
      details: s.details !== undefined ? redactText(s.details) : undefined,
    })),
    toolVersions: { ...input.toolVersions },
  };
  const json = redactText(JSON.stringify(sanitized, null, 2));
  return { ...sanitized, evidenceDigest: createHash('sha256').update(json).digest('hex') };
}

/**
 * Integrity check on a bundle (spec-k8s/07: evidence integrity checks pass
 * before promotion): digest recomputation, revision binding, and absence
 * of secret material.
 */
export function verifyEvidenceBundle(bundle: EvidenceBundle): string[] {
  const problems: string[] = [];
  const { evidenceDigest, ...rest } = bundle;
  const json = redactText(JSON.stringify(rest, null, 2));
  const recomputed = createHash('sha256').update(json).digest('hex');
  if (recomputed !== evidenceDigest)
    problems.push('evidence digest mismatch (bundle mutated or stale)');

  for (const [field, value] of [
    ['labId', bundle.labId],
    ['project', bundle.project],
    ['environment', bundle.environment],
    ['branch', bundle.branch],
    ['revision', bundle.revision],
  ] as const) {
    if (typeof value !== 'string' || value === '') problems.push(`bundle missing ${field}`);
  }
  // Revision binding: the Argo observation must match the tested revision.
  if (bundle.argo.observedRevision !== bundle.revision)
    problems.push(
      `bundle is not revision-bound (argo observed ${bundle.argo.observedRevision}, tested ${bundle.revision})`,
    );
  if (bundle.argo.syncStatus !== 'Synced' || bundle.argo.healthStatus !== 'Healthy')
    problems.push('bundle records an Argo state that is not Synced/Healthy');
  if (bundle.argo.observedRevision === '') problems.push('bundle records no observed revision');

  // Secret scan over the serialized bundle (defence in depth).
  const text = JSON.stringify(bundle);
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text))
    problems.push('bundle contains a private key block');
  if (
    /\b(sk-[A-Za-z0-9]{8,}|gh[pousr]_[A-Za-z0-9]{8,}|xox[baprs]-[A-Za-z0-9-]{4,}|AKIA[A-Z0-9]{16})\b/.test(
      text,
    )
  )
    problems.push('bundle contains a token-shaped value');
  if (/[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@/.test(text))
    problems.push('bundle contains URL userinfo');

  const started = Date.parse(bundle.startedAt);
  const completed = Date.parse(bundle.completedAt);
  if (Number.isNaN(started) || Number.isNaN(completed) || completed < started)
    problems.push('bundle timestamps are invalid or inverted');

  return problems;
}

/**
 * Supersession check (spec-k8s/07 §States): a newer revision supersedes
 * incomplete evidence for an older revision; older evidence remains
 * retained but cannot authorize the newer candidate.
 */
export function authorizesPromotion(bundle: EvidenceBundle, candidateRevision: string): boolean {
  return bundle.revision === candidateRevision && bundle.classification === 'PASS';
}
