/**
 * test/k8s/virtualserver.test.ts
 *
 * Milestone 4 (spec-k8s/08): the six-test VirtualServer contract —
 * VS-01/02 (no direct cookie mint, framed mint), VS-03/04 (direct
 * documents blocked with and without the cookie), VS-05 (framed
 * documents), VS-06 (API probe), plus preflight, token binding, report
 * redaction and exit codes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { FakeClock } from '../../extensions/k8s/clock.ts';
import { aggregateVirtualServer, vsExitCode, VS_TEST_IDS } from '../../extensions/k8s/results.ts';
import {
  runVirtualServerSuite,
  type ProbeRequest,
  type ProbeResponse,
  type ProbeTransport,
} from '../../extensions/k8s/virtualserver.ts';

interface Behaviour {
  preflightStatus?: number;
  preflightError?: 'dns' | 'tls' | 'connection' | 'timeout';
  directMintCookie?: string | null; // cookie minted on direct (unframed) auth
  framedMintCookie?: string | null; // cookie minted on framed auth
  docDirectNoCookie?: number;
  docDirectWithCookie?: number;
  docFramedWithCookie?: number;
  apiFramedWithCookie?: number;
}

function makeTransport(behaviour: Behaviour): ProbeTransport & { requests: ProbeRequest[] } {
  const requests: ProbeRequest[] = [];
  let directAuthCalls = 0;
  return {
    requests,
    async request(req: ProbeRequest): Promise<ProbeResponse> {
      requests.push(req);
      const framed = req.headers.Origin !== undefined;
      const isAuth = req.url.includes('/auth-hol');
      if (isAuth && !framed) {
        directAuthCalls += 1;
        if (directAuthCalls === 1) {
          // preflight
          if (behaviour.preflightError !== undefined)
            return { status: 200, headers: {}, error: behaviour.preflightError };
          return { status: behaviour.preflightStatus ?? 200, headers: {} };
        }
        // VS-01: direct mint
        return {
          status: 200,
          headers:
            behaviour.directMintCookie !== undefined && behaviour.directMintCookie !== null
              ? { 'set-cookie': `launchtoken=${behaviour.directMintCookie}` }
              : {},
        };
      }
      if (isAuth && framed) {
        return {
          status: 200,
          headers:
            behaviour.framedMintCookie !== undefined && behaviour.framedMintCookie !== null
              ? { 'set-cookie': `launchtoken=${behaviour.framedMintCookie}` }
              : {},
        };
      }
      const isApi = req.url.includes('/api/health');
      const hasCookie = req.cookie !== undefined;
      if (isApi) return { status: behaviour.apiFramedWithCookie ?? 200, headers: {} };
      if (framed) return { status: behaviour.docFramedWithCookie ?? 200, headers: {} };
      if (hasCookie) return { status: behaviour.docDirectWithCookie ?? 401, headers: {} };
      return { status: behaviour.docDirectNoCookie ?? 401, headers: {} };
    },
  };
}

const vsInput = {
  host: 'example-lab.example.internal',
  basePath: '/hol',
  authPath: '/auth-hol',
  apiProbe: '/hol/api/health',
  token: undefined,
};

async function runHappy(overrides: Partial<Behaviour> = {}) {
  const transport = makeTransport({ framedMintCookie: 'secrettoken123', ...overrides });
  const clock = new FakeClock('2026-09-25T00:00:00.000Z');
  const report = await runVirtualServerSuite(vsInput, {
    transport,
    clock,
    environment: 'uat',
    branch: 'uat',
    expectedRevision: 'rev-1',
    argo: {
      application: 'app-uat',
      observedRevision: 'rev-1',
      syncStatus: 'Synced',
      healthStatus: 'Healthy',
    },
  });
  return { report, transport };
}

test('VS contract: a compliant service passes all six tests', async () => {
  const { report } = await runHappy();
  assert.deepEqual(
    report.tests.map((t) => t.status),
    ['PASS', 'PASS', 'PASS', 'PASS', 'PASS', 'PASS'],
  );
  assert.equal(report.aggregate, 'PASS');
  assert.equal(report.exitCode, 0);
  assert.equal(report.preflight.status, 'READY');
  assert.ok(report.mintedTokenDigest !== null, 'the minted token is reported as a digest only');
  assert.equal(report.tokenDigest, null, 'no supplied token');
});

test('the cookie minted by VS-02 is reused verbatim for VS-03..VS-06', async () => {
  const { report, transport } = await runHappy();
  const framedDoc = transport.requests.find(
    (r) => r.url.endsWith('/hol/') && r.headers.Origin !== undefined && !r.url.includes('/api'),
  );
  assert.ok(framedDoc, 'a framed document request exists');
  assert.equal(framedDoc.cookie, 'launchtoken=secrettoken123');
  assert.ok(report.mintedTokenDigest !== null);
});

test('a supplied token must match the minted token (digest comparison)', async () => {
  const transport = makeTransport({ framedMintCookie: 'secrettoken123' });
  const clock = new FakeClock('2026-09-25T00:00:00.000Z');
  const ok = await runVirtualServerSuite(
    { ...vsInput, token: 'secrettoken123' },
    {
      transport,
      clock,
      environment: 'uat',
      branch: 'uat',
      expectedRevision: 'rev-1',
    },
  );
  assert.equal(ok.tokenMatch, true);
  assert.equal(ok.aggregate, 'PASS');

  const bad = await runVirtualServerSuite(
    { ...vsInput, token: 'something-else' },
    {
      transport: makeTransport({ framedMintCookie: 'secrettoken123' }),
      clock: new FakeClock('2026-09-25T00:00:00.000Z'),
      environment: 'uat',
      branch: 'uat',
      expectedRevision: 'rev-1',
    },
  );
  assert.equal(bad.tokenMatch, false);
  assert.equal(bad.aggregate, 'FAIL');
  assert.equal(bad.exitCode, 2);
});

test('preflight 404 or a transport error blocks the run (nothing is attempted)', async () => {
  const behaviours: Partial<Behaviour>[] = [{ preflightStatus: 404 }, { preflightError: 'dns' }];
  for (const behaviour of behaviours) {
    const { report } = await runHappy(behaviour);
    assert.equal(report.preflight.status, 'BLOCKED');
    assert.equal(report.aggregate, 'BLOCKED');
    assert.equal(report.exitCode, 3);
    assert.deepEqual(report.tests, []);
  }
});

test('VS-01 failing (direct cookie mint) is a mandatory failure', async () => {
  const { report } = await runHappy({ directMintCookie: 'leakedtoken123' });
  const vs1 = report.tests.find((t) => t.id === VS_TEST_IDS[0])!;
  assert.equal(vs1.status, 'FAIL');
  assert.equal(report.aggregate, 'FAIL');
  assert.equal(report.exitCode, 2);
});

test('VS-06 is advisory: 1-5 passing with a failing API probe warns', async () => {
  const { report } = await runHappy({ apiFramedWithCookie: 500 });
  const statuses = report.tests.map((t) => t.status);
  assert.deepEqual(statuses, ['PASS', 'PASS', 'PASS', 'PASS', 'PASS', 'WARN']);
  assert.equal(report.aggregate, 'PASS_WITH_WARNINGS');
  assert.equal(report.exitCode, vsExitCode(report.aggregate));
});

test('an invalid host is a contract error (exit 4)', async () => {
  const transport = makeTransport({ framedMintCookie: 'x' });
  const report = await runVirtualServerSuite(
    { ...vsInput, host: 'bad host\n' },
    {
      transport,
      clock: new FakeClock('2026-09-25T00:00:00.000Z'),
      environment: 'uat',
      branch: 'uat',
      expectedRevision: 'rev-1',
    },
  );
  assert.equal(report.aggregate, 'ERROR');
  assert.equal(report.exitCode, 4);
});

test('reports are sanitized: no raw token values in markdown or JSON', async () => {
  const { report } = await runHappy();
  assert.ok(!report.markdown.includes('secrettoken123'), 'markdown must not contain the raw token');
  assert.ok(!report.json.includes('secrettoken123'), 'json must not contain the raw token');
  const parsed = JSON.parse(report.json);
  assert.equal(parsed.schemaVersion, '1');
  assert.equal(parsed.contractVersion, '1');
  assert.equal(parsed.aggregate, 'PASS');
  // The evidence digest authenticates the JSON content itself.
  assert.equal(report.evidenceDigest, createHash('sha256').update(report.json).digest('hex'));
});

test('aggregateVirtualServer and vsExitCode agree with the runner', async () => {
  const { report } = await runHappy({ apiFramedWithCookie: 500 });
  const re = aggregateVirtualServer({
    preflight: report.preflight.status,
    tests: report.tests.map((t) => ({ id: t.id, status: t.status })),
    tokenMismatch: report.tokenMatch === false,
  });
  assert.equal(report.aggregate, re);
  assert.equal(report.exitCode, vsExitCode(re));
});

test('the evidence digest is stable for identical runs', async () => {
  const a = (await runHappy()).report;
  const b = (await runHappy()).report;
  assert.equal(a.evidenceDigest, b.evidenceDigest);
  assert.equal(a.markdown, b.markdown);
});
