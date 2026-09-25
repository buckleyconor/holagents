import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEPLOYMENT_PLATFORMS,
  TEST_SUITES,
  getAdapter,
  registerAdapter,
  type DeploymentAdapter,
} from '../../extensions/k8s/adapter.ts';
// The barrel re-exports the whole milestone-1 contract surface.
import {
  OPERATIONAL_STATES,
  aggregateVirtualServer,
  validateProfile,
} from '../../extensions/k8s/index.ts';

test('the deployment boundary supports vcd-docker and charmed-kubernetes (ARC-002)', () => {
  assert.deepEqual([...DEPLOYMENT_PLATFORMS], ['vcd-docker', 'charmed-kubernetes']);
});

test('milestone 1: no adapter is registered yet', () => {
  assert.equal(getAdapter('charmed-kubernetes'), undefined);
  assert.equal(getAdapter('vcd-docker'), undefined);
});

test('test suites are the three mandatory suites in order (ADP-006, UAT-001..003)', () => {
  assert.deepEqual([...TEST_SUITES], ['infrastructure', 'virtualserver', 'acceptance']);
});

test('the barrel exports the milestone-1 contracts', () => {
  assert.ok(OPERATIONAL_STATES.includes('ARGO_RECONCILING'));
  assert.equal(
    aggregateVirtualServer({ preflight: 'BLOCKED', tests: [], tokenMismatch: false }),
    'BLOCKED',
  );
  assert.equal(validateProfile('not a mapping').ok, false);
});

/**
 * A minimal fake adapter proves the interface is implementable and that the
 * registry round-trips. Registered last so the "no adapter" test above runs
 * against a clean registry.
 */
const fake: DeploymentAdapter = {
  platform: 'charmed-kubernetes',
  async validate() {
    return {
      classification: 'BLOCKED',
      subcode: 'BLOCKED_POLICY',
      findings: [],
      errors: [],
    };
  },
  async prepare() {
    throw new Error('not implemented until milestone 2');
  },
  async deployDev() {
    throw new Error('not implemented until milestone 3');
  },
  async promote() {
    throw new Error('not implemented until milestone 2');
  },
  async observe() {
    throw new Error('not implemented until milestone 3');
  },
  async test() {
    throw new Error('not implemented until milestone 4');
  },
  async destroy() {
    throw new Error('not implemented until milestone 5');
  },
};

test('registry: register and retrieve an adapter', async () => {
  registerAdapter(fake);
  assert.equal(getAdapter('charmed-kubernetes'), fake);
  assert.equal(getAdapter('vcd-docker'), undefined);

  const out = await fake.validate({
    profileText: '',
    environment: 'dev',
    policy: null,
  });
  assert.equal(out.classification, 'BLOCKED');
  assert.equal(out.subcode, 'BLOCKED_POLICY');

  await assert.rejects(() => fake.prepare({ environment: 'dev', sourceRevision: 'r1' }));
});
