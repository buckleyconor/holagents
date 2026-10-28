/**
 * VirtualServer access runner (spec-k8s/06). Integrates the existing
 * six-test contract as a deterministic pre-promotion gate: preflight probe,
 * six tests in order with cookie reuse, token correlation by one-way digest,
 * aggregate precedence and deterministic exit codes, plus Markdown and JSON
 * reports that never contain token or cookie values.
 *
 * The runner is transport-injected: `ProbeTransport` stands in for HTTP
 * against the deployed application (and its like-for-like simulator — only
 * the hostname may differ). Input validation guards against command
 * injection and cross-origin URLs (spec-k8s/06 §Security).
 */
import { createHash } from 'node:crypto';
import { redactText, secretDigest } from './redact.ts';
import type { Clock } from './clock.ts';
import { realClock } from './clock.ts';
import {
  aggregateVirtualServer,
  VS_TEST_IDS,
  vsExitCode,
  type GateClassification,
  type VsTestId,
  type VsTestStatus,
} from './results.ts';

export interface VsInput {
  /** Simulator hostname (required). */
  host: string;
  /** Expected launch token, when supplied. Treated as a secret. */
  token?: string;
  /** Application base path; defaults to `/`. */
  basePath?: string;
  /** Mint path; defaults to `/auth-hol`. */
  authPath?: string;
  /** Subresource or API probe path; defaults to `<basePath>/probe`. */
  apiProbe?: string;
}

const HOSTNAME_RE = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i;
const PATH_RE = /^\/[A-Za-z0-9._~/-]*$/;
const INJECTION_RE = /[\s;|&`<>\\$]/;

/** Input validation (spec-k8s/06 §Security). */
export function validateVsInput(input: VsInput): string[] {
  const problems: string[] = [];
  if (!HOSTNAME_RE.test(input.host))
    problems.push(
      `host "${input.host}" is not a valid hostname (cross-origin or shell metacharacters refused)`,
    );
  if (input.host.includes('://')) problems.push('host must not contain a scheme');
  const paths: [string, string | undefined][] = [
    ['basePath', input.basePath],
    ['authPath', input.authPath],
    ['apiProbe', input.apiProbe],
  ];
  for (const [name, value] of paths) {
    if (value === undefined) continue;
    if (!PATH_RE.test(value)) problems.push(`${name} must be an absolute path`);
    if (INJECTION_RE.test(value))
      problems.push(`${name} contains shell metacharacters or whitespace`);
  }
  return problems;
}

// --- transport ---------------------------------------------------------------

export interface ProbeRequest {
  url: string;
  headers: Record<string, string>;
  /** Cookie header value, when the request carries the launch cookie. */
  cookie?: string;
}

export interface ProbeResponse {
  status: number;
  headers: Record<string, string>;
  body?: string;
  /** Transport-level failure (DNS, TLS, connection, timeout). */
  error?: 'dns' | 'tls' | 'connection' | 'timeout';
}

export interface ProbeTransport {
  request(req: ProbeRequest): Promise<ProbeResponse>;
}

// --- report ------------------------------------------------------------------

export interface VsTestRecord {
  id: VsTestId;
  status: VsTestStatus;
  observedHttp: number | null;
  durationMs: number;
}

export interface VsReport {
  schemaVersion: '1';
  contractVersion: '1';
  runId: string;
  startedAt: string;
  completedAt: string;
  host: string;
  basePath: string;
  authPath: string;
  apiProbe: string;
  environment?: string;
  branch?: string;
  expectedRevision?: string;
  argo?: {
    application: string;
    observedRevision?: string;
    syncStatus?: string;
    healthStatus?: string;
  };
  tokenProvided: boolean;
  tokenDigest: string | null;
  mintedTokenDigest: string | null;
  tokenMatch: boolean | null;
  preflight: { status: 'READY' | 'BLOCKED'; httpStatus?: number; reason?: string };
  tests: VsTestRecord[];
  aggregate: GateClassification;
  exitCode: number;
  /** Sanitized request log lines (no tokens, cookies or full headers). */
  log: string[];
  markdown: string;
  json: string;
  evidenceDigest: string;
}

const COOKIES_RE = /launchtoken=([^;]+)/;

function launchToken(response: ProbeResponse): string | null {
  const setCookies = (response.headers['set-cookie'] ?? '').split(/,(?=[A-Za-z_]+=)/);
  for (const sc of setCookies) {
    const m = sc.match(COOKIES_RE);
    if (m) return m[1]!;
  }
  return null;
}

export interface VsRunnerOptions {
  transport: ProbeTransport;
  clock?: Clock;
  environment?: string;
  branch?: string;
  expectedRevision?: string;
  /** Argo readiness observations for the tested revision (GAP-011). */
  argo?: {
    application: string;
    observedRevision?: string;
    syncStatus?: string;
    healthStatus?: string;
  };
}

/**
 * Execute the six-test suite (spec-k8s/06). Testing must begin only after
 * Argo reported the expected revision as Synced and Healthy — the caller
 * enforces that gate; `opts.argo` records the observation in the report so
 * the evidence is revision-bound.
 */
export async function runVirtualServerSuite(
  input: VsInput,
  opts: VsRunnerOptions,
): Promise<VsReport> {
  const clock = opts.clock ?? realClock;
  const startedAt = clock.now();
  const basePath = input.basePath ?? '/';
  const authPath = input.authPath ?? '/auth-hol';
  const apiProbe = input.apiProbe ?? `${basePath.replace(/\/$/, '')}/probe`;
  const origin = `https://${input.host}`;
  const log: string[] = [];

  const makeReport = (
    partial: Omit<VsReport, 'markdown' | 'json' | 'evidenceDigest' | 'completedAt'>,
    completedAt: string,
  ): VsReport => {
    const body: Record<string, unknown> = { ...partial, completedAt };
    delete (body as Record<string, unknown>).markdown;
    const json = redactText(JSON.stringify(body, null, 2));
    const evidenceDigest = createHash('sha256').update(json).digest('hex');
    const markdown = renderMarkdown(partial, completedAt);
    return { ...partial, completedAt, markdown, json, evidenceDigest };
  };

  const problems = validateVsInput(input);
  if (problems.length > 0) {
    return makeReport(
      {
        schemaVersion: '1',
        contractVersion: '1',
        runId: newRunId(clock),
        startedAt,
        host: input.host,
        basePath,
        authPath,
        apiProbe,
        environment: opts.environment,
        branch: opts.branch,
        expectedRevision: opts.expectedRevision,
        argo: opts.argo,
        tokenProvided: input.token !== undefined,
        tokenDigest: input.token ? secretDigest(input.token) : null,
        mintedTokenDigest: null,
        tokenMatch: null,
        preflight: { status: 'BLOCKED', reason: `invalid input: ${problems.join('; ')}` },
        tests: [],
        aggregate: 'ERROR',
        exitCode: 4,
        log,
      },
      clock.now(),
    );
  }

  // Preflight: probe the authentication path before the six tests.
  const preflightRes = await opts.transport.request({ url: `${origin}${authPath}`, headers: {} });
  log.push(`preflight GET ${authPath} -> ${preflightRes.error ?? preflightRes.status}`);
  let preflight: VsReport['preflight'];
  if (preflightRes.error) {
    preflight = { status: 'BLOCKED', reason: `transport failure: ${preflightRes.error}` };
  } else if (preflightRes.status === 404) {
    preflight = { status: 'BLOCKED', reason: 'auth path returned 404 (lab not deployed?)' };
  } else {
    preflight = { status: 'READY', httpStatus: preflightRes.status };
  }

  if (preflight.status === 'BLOCKED') {
    return makeReport(
      {
        schemaVersion: '1',
        contractVersion: '1',
        runId: newRunId(clock),
        startedAt,
        host: input.host,
        basePath,
        authPath,
        apiProbe,
        environment: opts.environment,
        branch: opts.branch,
        expectedRevision: opts.expectedRevision,
        argo: opts.argo,
        tokenProvided: input.token !== undefined,
        tokenDigest: input.token ? secretDigest(input.token) : null,
        mintedTokenDigest: null,
        tokenMatch: null,
        preflight,
        tests: [],
        aggregate: 'BLOCKED',
        exitCode: 3,
        log,
      },
      clock.now(),
    );
  }

  const docUrl = `${origin}${basePath.replace(/\/$/, '')}/`;
  const framed = { Origin: origin, Referer: docUrl };

  // VS-01: direct mint without iframe headers — must be blocked.
  const t1res = await opts.transport.request({ url: `${origin}${authPath}`, headers: {} });
  log.push(`VS-01 mint (direct) -> ${t1res.status}`);
  const t1cookie = launchToken(t1res);
  const t1: VsTestRecord = {
    id: 'VS-01',
    status: t1cookie === null ? 'PASS' : 'FAIL',
    observedHttp: t1res.status,
    durationMs: 0,
  };
  if (t1cookie !== null) log.push('VS-01 launch-token issued on direct mint (blocked expected)');

  // VS-02: framed mint with correct Origin — must issue the cookie.
  const t2res = await opts.transport.request({ url: `${origin}${authPath}`, headers: framed });
  log.push(`VS-02 mint (framed) -> ${t2res.status}`);
  const token = launchToken(t2res);
  const t2: VsTestRecord = {
    id: 'VS-02',
    status: token !== null ? 'PASS' : 'FAIL',
    observedHttp: t2res.status,
    durationMs: 0,
  };

  const tokenMatch =
    input.token !== undefined && token !== null
      ? secretDigest(token) === secretDigest(input.token)
      : null;
  if (input.token !== undefined && token !== null && !tokenMatch)
    log.push('VS-02 minted token does not match the supplied token (digest mismatch)');

  const cookieValue = token !== null ? `launchtoken=${token}` : undefined;

  // VS-03/VS-04/VS-05/VS-06 reuse the VS-02 cookie; they never re-mint.
  let t3: VsTestRecord;
  let t4: VsTestRecord;
  let t5: VsTestRecord;
  let t6: VsTestRecord;
  if (cookieValue === undefined) {
    // No cookie from VS-02: the dependent tests cannot be established and
    // fail (the aggregate precedence then yields FAIL).
    t3 = { id: 'VS-03', status: 'FAIL', observedHttp: null, durationMs: 0 };
    t4 = { id: 'VS-04', status: 'FAIL', observedHttp: null, durationMs: 0 };
    t5 = { id: 'VS-05', status: 'FAIL', observedHttp: null, durationMs: 0 };
    t6 = { id: 'VS-06', status: 'FAIL', observedHttp: null, durationMs: 0 };
  } else {
    const t3res = await opts.transport.request({ url: docUrl, headers: {}, cookie: undefined });
    log.push(`VS-03 document (direct, no cookie) -> ${t3res.status}`);
    t3 = {
      id: 'VS-03',
      status: t3res.status === 401 || t3res.status === 403 ? 'PASS' : 'FAIL',
      observedHttp: t3res.status,
      durationMs: 0,
    };
    const t4res = await opts.transport.request({ url: docUrl, headers: {}, cookie: cookieValue });
    log.push(`VS-04 document (direct, cookie) -> ${t4res.status}`);
    t4 = {
      id: 'VS-04',
      status: t4res.status === 401 || t4res.status === 403 ? 'PASS' : 'FAIL',
      observedHttp: t4res.status,
      durationMs: 0,
    };
    const t5res = await opts.transport.request({
      url: docUrl,
      headers: framed,
      cookie: cookieValue,
    });
    log.push(`VS-05 document (framed, cookie) -> ${t5res.status}`);
    t5 = {
      id: 'VS-05',
      status: t5res.status === 200 ? 'PASS' : 'FAIL',
      observedHttp: t5res.status,
      durationMs: 0,
    };
    const t6res = await opts.transport.request({
      url: `${origin}${apiProbe}`,
      headers: framed,
      cookie: cookieValue,
    });
    log.push(`VS-06 subresource (framed, cookie) -> ${t6res.status}`);
    t6 = {
      id: 'VS-06',
      status: t6res.status === 200 ? 'PASS' : 'FAIL',
      observedHttp: t6res.status,
      durationMs: 0,
    };
  }

  // The six-test contract: test 6 warns (not fails) when tests 1-5 pass.
  const tests = [t1, t2, t3, t4, t5, t6];
  const firstFivePass = tests.slice(0, 5).every((t) => t.status === 'PASS');
  if (firstFivePass && t6.status === 'FAIL') t6.status = 'WARN';

  const aggregate = aggregateVirtualServer({
    preflight: 'READY',
    tests: tests.map((t) => ({ id: t.id, status: t.status })),
    tokenMismatch: tokenMatch === false,
  });
  const exitCode = vsExitCode(aggregate);

  return makeReport(
    {
      schemaVersion: '1',
      contractVersion: '1',
      runId: newRunId(clock),
      startedAt,
      host: input.host,
      basePath,
      authPath,
      apiProbe,
      environment: opts.environment,
      branch: opts.branch,
      expectedRevision: opts.expectedRevision,
      argo: opts.argo,
      tokenProvided: input.token !== undefined,
      tokenDigest: input.token ? secretDigest(input.token) : null,
      mintedTokenDigest: token !== null ? secretDigest(token) : null,
      tokenMatch,
      preflight,
      tests,
      aggregate,
      exitCode,
      log,
    },
    clock.now(),
  );
}

function newRunId(clock: Clock): string {
  return `vs-${clock.now().replace(/[:.]/g, '-')}-${createHash('sha256')
    .update(clock.now())
    .digest('hex')
    .slice(0, 8)}`;
}

function renderMarkdown(
  p: Omit<VsReport, 'markdown' | 'json' | 'evidenceDigest' | 'completedAt'>,
  completedAt: string,
): string {
  const lines = [
    `# VirtualServer access report — ${p.host}`,
    '',
    `- Run: \`${p.runId}\``,
    `- Window: ${p.startedAt} → ${completedAt}`,
    p.environment
      ? `- Environment: ${p.environment} (branch ${p.branch ?? 'n/a'}, expected revision ${p.expectedRevision ?? 'n/a'})`
      : null,
    p.argo
      ? `- Argo: ${p.argo.application} — ${p.argo.syncStatus ?? 'n/a'} / ${p.argo.healthStatus ?? 'n/a'} at ${p.argo.observedRevision ?? 'n/a'}`
      : null,
    `- Preflight: **${p.preflight.status}**${p.preflight.reason ? ` — ${p.preflight.reason}` : ''}`,
    `- Token: provided=${p.tokenProvided}, match=${p.tokenMatch === null ? 'n/a' : String(p.tokenMatch)}`,
    '',
    '| Test | Request | Result | HTTP |',
    '| --- | --- | --- | --- |',
    ...p.tests.map((t) => {
      const names: Record<VsTestId, string> = {
        'VS-01': 'direct mint (no iframe headers)',
        'VS-02': 'framed mint (correct Origin)',
        'VS-03': 'direct document (no cookie)',
        'VS-04': 'direct document (cookie)',
        'VS-05': 'framed document (cookie)',
        'VS-06': 'subresource/API (cookie)',
      };
      return `| ${t.id} | ${names[t.id]} | **${t.status}** | ${t.observedHttp ?? '—'} |`;
    }),
    '',
    `**Aggregate: ${p.aggregate}** (exit code ${p.exitCode})`,
    '',
    '## Sanitized log',
    '',
    '```text',
    ...p.log,
    '```',
  ];
  return redactText(lines.filter((l) => l !== null).join('\n'));
}
