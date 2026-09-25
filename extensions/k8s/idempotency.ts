/**
 * Idempotency keys for mutating operations (spec-k8s/03 §Idempotency and
 * concurrency). Each mutating operation uses a key derived from lab,
 * environment, operation, expected revision and desired-state digest:
 *
 *  - repeating identical inputs resumes or returns the original outcome;
 *  - reusing a key with different inputs fails;
 *  - bounded, recorded retries (the store records retry counts).
 */
import { createHash } from 'node:crypto';

export interface IdempotencyKeyParts {
  labId: string;
  environment: string;
  operation: 'deployDev' | 'promote' | 'destroy';
  expectedRevision: string;
  /** Desired-state digest (change-set digest, ADP-002). */
  desiredDigest: string;
}

/** Deterministic key: sha256 over the five parts, hex. */
export function idempotencyKey(parts: IdempotencyKeyParts): string {
  const payload = JSON.stringify({
    lab: parts.labId,
    env: parts.environment,
    op: parts.operation,
    rev: parts.expectedRevision,
    digest: parts.desiredDigest,
  });
  return createHash('sha256').update(payload).digest('hex');
}

export interface IdempotencyRecord {
  key: string;
  inputsDigest: string;
  /** JSON-serializable original outcome, returned unchanged on repeat. */
  outcome: unknown;
  attempts: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * In-memory idempotency store. Milestone 3 keeps it process-local; a
 * durable store is an integration concern (and must survive restarts in
 * live use — see spec-k8s/STATUS.md).
 */
export class IdempotencyStore {
  private records = new Map<string, IdempotencyRecord>();
  private readonly now: () => string;

  constructor(now: () => string = () => new Date().toISOString()) {
    this.now = now;
  }

  /**
   * Begin (or resume) an operation under `key`. Returns the recorded
   * outcome when identical inputs were already completed; throws when the
   * key is reused with different inputs (spec-k8s/03).
   */
  begin(key: string, inputsDigest: string): { started: boolean; outcome: unknown } {
    const existing = this.records.get(key);
    if (existing) {
      if (existing.inputsDigest !== inputsDigest)
        throw new Error(
          `idempotency conflict: key ${key} was used with different inputs (recorded ${existing.inputsDigest}, got ${inputsDigest})`,
        );
      return { started: false, outcome: existing.outcome };
    }
    const t = this.now();
    this.records.set(key, {
      key,
      inputsDigest,
      outcome: undefined,
      attempts: 1,
      createdAt: t,
      updatedAt: t,
    });
    return { started: true, outcome: undefined };
  }

  /** Record the outcome for a key begun earlier. */
  complete(key: string, outcome: unknown): void {
    const record = this.records.get(key);
    if (!record) throw new Error(`no in-flight idempotency record for ${key}`);
    record.outcome = outcome;
    record.updatedAt = this.now();
  }

  /** Record a retry attempt (bounded, recorded — spec-k8s/03). */
  retry(key: string): void {
    const record = this.records.get(key);
    if (!record) throw new Error(`no in-flight idempotency record for ${key}`);
    record.attempts += 1;
    record.updatedAt = this.now();
  }

  get(key: string): IdempotencyRecord | undefined {
    return this.records.get(key);
  }
}
