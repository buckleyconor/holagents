/**
 * Clock abstraction for the k8s extension. Argo polling, retries and
 * approval windows are all time-dependent; tests drive a fake clock so
 * every behaviour (timeout, revision supersession, exception expiry) is
 * deterministic. The real clock is used by any code path that touches a
 * live environment.
 */

export interface Clock {
  now(): string;
  sleep(ms: number): Promise<void>;
}

export const realClock: Clock = {
  now: () => new Date().toISOString(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/** Deterministic clock for contract/integration tests. */
export class FakeClock {
  private ms: number;

  constructor(start = '2026-09-25T00:00:00.000Z') {
    this.ms = Date.parse(start);
  }

  now(): string {
    return new Date(this.ms).toISOString();
  }

  async sleep(ms: number): Promise<void> {
    // Deterministic: advance the fake time so polling loops and timeouts are
    // testable without real waits.
    this.ms += ms;
  }

  advance(ms: number): void {
    this.ms += ms;
  }
}
