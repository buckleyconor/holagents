import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GATE_CLASSIFICATIONS,
  aggregateVirtualServer,
  isBlockedSubcode,
  isGateClassification,
  validateEvidence,
  validateOutcome,
  validateVsSuiteResult,
  vsExitCode,
  VS_TEST_IDS,
  VS_EXIT,
  type Evidence,
  type GateOutcome,
  type VsSuiteResult,
} from '../../extensions/k8s/results.ts';

function suite(tests: VsSuiteResult['tests'], extra: Partial<VsSuiteResult> = {}): VsSuiteResult {
  return {
    preflight: 'READY',
    tests,
    tokenMismatch: false,
    ...extra,
  };
}

const allPass = (): VsSuiteResult['tests'] =>
  VS_TEST_IDS.map((id) => ({ id, status: 'PASS' as const }));

test('gate classifications are the five terminal values (spec-k8s/01 ARC-004)', () => {
  assert.deepEqual(
    [...GATE_CLASSIFICATIONS],
    ['PASS', 'PASS_WITH_WARNINGS', 'FAIL', 'BLOCKED', 'ERROR'],
  );
  for (const c of GATE_CLASSIFICATIONS) assert.ok(isGateClassification(c));
  assert.equal(isGateClassification('PASSING'), false);
});

test('blocked subcode pattern', () => {
  for (const s of ['BLOCKED_CREDENTIALS', 'BLOCKED_POLICY', 'BLOCKED_UAT'])
    assert.ok(isBlockedSubcode(s));
  assert.equal(isBlockedSubcode('blocked_credentials'), false);
  assert.equal(isBlockedSubcode('POLICY_MISSING'), false);
});

test('validateOutcome: well-formed blocked outcome', () => {
  const o: GateOutcome = {
    classification: 'BLOCKED',
    subcode: 'BLOCKED_POLICY',
    findings: [
      { id: 'POL-001', severity: 'mandatory', expected: 'policy present', observed: 'missing' },
    ],
  };
  assert.deepEqual(validateOutcome(o), []);
});

test('validateOutcome: rejects a subcode on a non-BLOCKED result', () => {
  const o: GateOutcome = { classification: 'PASS', subcode: 'BLOCKED_POLICY', findings: [] };
  assert.ok(validateOutcome(o).length > 0);
});

test('validateOutcome: rejects a malformed subcode and bad findings', () => {
  const o: GateOutcome = {
    classification: 'BLOCKED',
    subcode: 'nope',
    findings: [{ id: '', severity: 'warning' as never, expected: '', observed: 'x' }],
  };
  const problems = validateOutcome(o);
  assert.ok(problems.some((p) => p.includes('subcode')));
  assert.ok(problems.some((p) => p.includes('finding')));
});

test('validateEvidence: minimal well-formed record', () => {
  const e: Evidence = {
    schemaVersion: '1',
    toolVersion: '0.3.0',
    labId: 'example-lab',
    environment: 'dev',
    revisions: { expected: 'abc123', observed: 'abc123' },
    digests: { manifests: 'd1' },
    startedAt: '2026-09-25T10:00:00Z',
    completedAt: '2026-09-25T10:05:00Z',
    outcome: { classification: 'PASS', findings: [] },
    approvals: [],
    artifacts: ['evidence/dev-abc123.json'],
  };
  assert.deepEqual(validateEvidence(e), []);
});

test('validateEvidence: rejects missing labId and inverted timestamps', () => {
  const e: Evidence = {
    schemaVersion: '1',
    toolVersion: '0.3.0',
    labId: '',
    environment: 'dev',
    revisions: {},
    digests: {},
    startedAt: '2026-09-25T10:05:00Z',
    completedAt: '2026-09-25T10:00:00Z',
    outcome: { classification: 'PASS', findings: [] },
    approvals: [],
    artifacts: [],
  };
  const problems = validateEvidence(e);
  assert.ok(problems.some((p) => p.includes('labId')));
  assert.ok(problems.some((p) => p.includes('completedAt')));
});

test('vsExitCode: the deterministic exit-code contract (spec-k8s/06)', () => {
  assert.equal(vsExitCode('PASS'), 0);
  assert.equal(vsExitCode('PASS_WITH_WARNINGS'), 1);
  assert.equal(vsExitCode('FAIL'), 2);
  assert.equal(vsExitCode('BLOCKED'), 3);
  assert.equal(vsExitCode('ERROR'), 5);
  assert.equal(vsExitCode('PASS', true), 4); // invalid input overrides
  assert.equal(vsExitCode('FAIL', true), 4);
  assert.equal(VS_EXIT.INVALID_INPUT, 4);
});

test('aggregate: all six pass -> PASS', () => {
  assert.equal(aggregateVirtualServer(suite(allPass())), 'PASS');
});

test('aggregate: only VS-06 warns -> PASS_WITH_WARNINGS', () => {
  const tests = allPass();
  tests[5] = { id: 'VS-06', status: 'WARN' };
  assert.equal(aggregateVirtualServer(suite(tests)), 'PASS_WITH_WARNINGS');
});

test('aggregate: any of tests 1-5 fails -> FAIL', () => {
  const tests = allPass();
  tests[2] = { id: 'VS-03', status: 'FAIL' };
  assert.equal(aggregateVirtualServer(suite(tests)), 'FAIL');
});

test('aggregate: explicit token mismatch -> FAIL even when tests pass', () => {
  assert.equal(aggregateVirtualServer(suite(allPass(), { tokenMismatch: true })), 'FAIL');
});

test('aggregate: blocked preflight with no results -> BLOCKED', () => {
  assert.equal(aggregateVirtualServer(suite([], { preflight: 'BLOCKED' })), 'BLOCKED');
});

test('aggregate: failed test outranks blocked preflight', () => {
  const tests = allPass();
  tests[1] = { id: 'VS-02', status: 'FAIL' };
  assert.equal(aggregateVirtualServer(suite(tests, { preflight: 'BLOCKED' })), 'FAIL');
});

test('aggregate: runner error without trustworthy results -> ERROR', () => {
  assert.equal(aggregateVirtualServer(suite([], { runnerError: true })), 'ERROR');
});

test('aggregate: missing test result is not trustworthy -> ERROR', () => {
  const tests = allPass().slice(0, 5); // VS-06 missing
  assert.equal(aggregateVirtualServer(suite(tests)), 'ERROR');
});

test('aggregate: VS-06 failure with 1-5 passing is unexplained -> ERROR', () => {
  const tests = allPass();
  tests[5] = { id: 'VS-06', status: 'FAIL' };
  assert.equal(aggregateVirtualServer(suite(tests)), 'ERROR');
});

test('validateVsSuiteResult: ordering and completeness', () => {
  assert.deepEqual(validateVsSuiteResult(suite(allPass())), []);
  const swapped: VsSuiteResult['tests'] = [
    { id: 'VS-02', status: 'PASS' },
    { id: 'VS-01', status: 'PASS' },
    { id: 'VS-03', status: 'PASS' },
    { id: 'VS-04', status: 'PASS' },
    { id: 'VS-05', status: 'PASS' },
    { id: 'VS-06', status: 'PASS' },
  ];
  assert.ok(validateVsSuiteResult(suite(swapped)).some((p) => p.includes('order')));
  assert.ok(validateVsSuiteResult(suite(allPass().slice(0, 5))).some((p) => p.includes('VS-06')));
  assert.ok(
    validateVsSuiteResult(suite([], { preflight: 'BLOCKED' })).some((p) => p.includes('order')) ||
      validateVsSuiteResult(suite([], { preflight: 'BLOCKED' })).some((p) => p.includes('VS-06')),
  );
});

test('validateVsSuiteResult: blocked preflight must not carry results', () => {
  const problems = validateVsSuiteResult(suite(allPass(), { preflight: 'BLOCKED' }));
  assert.ok(problems.some((p) => p.includes('BLOCKED preflight')));
});
