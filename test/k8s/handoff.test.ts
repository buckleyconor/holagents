import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkHandoff,
  checkMermaid,
  detectSecrets,
  parseEndpointUrl,
  renderHandoff,
} from '../../extensions/handoff.ts';

// ---------------------------------------------------------------- Mermaid

test('checkMermaid accepts the supported subset', () => {
  const r = checkMermaid(
    [
      'graph TD',
      '  app["app<br/>registry/app:1.2.3"]',
      '  ingress -->|80| app',
    ].join('\n'),
  );
  assert.equal(r.ok, true, r.problems.join('; '));
});

test('checkMermaid rejects unbalanced subgraph/end', () => {
  const r = checkMermaid(['graph TD', '  subgraph sg', '  app["a"]', '  end', '  end'].join('\n'));
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => p.includes('end')));
});

test('checkMermaid rejects undeclared node reference in class', () => {
  const r = checkMermaid(
    ['graph TD', '  classDef hot fill:#f00', '  class missingNode hot'].join('\n'),
  );
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => p.includes('undeclared node')));
});

test('checkMermaid rejects a dangling edge', () => {
  const r = checkMermaid(['graph TD', '  app["a"]', '  app -->'].join('\n'));
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => p.includes('followed by a node id')));
});

test('checkMermaid warns (not fails) on constructs outside the subset', () => {
  const r = checkMermaid(['graph TD', '  app["a"]', '  style app fill:#f00'].join('\n'));
  assert.equal(r.ok, true);
  assert.ok(r.warnings.length > 0);
});

// ---------------------------------------------------------------- helpers

function writeProfile(dir: string, labId: string) {
  writeFileSync(
    join(dir, 'deployment-profile.yaml'),
    `apiVersion: holagents.io/v1alpha1
kind: KubernetesDeploymentProfile
metadata:
  labId: ${labId}
  profileVersion: "1"
spec:
  platform: charmed-kubernetes
  namespace: ${labId}
  environments:
    - name: dev
      branch: dev
      manifestsPath: manifests/dev
      argoApplication: ${labId}-dev
      consequential: false
  promotionOrder: [dev]
  policy:
    required: true
    schemaVersion: null
    reference: null
  tests:
    infrastructure: tests/infrastructure/run.sh
    acceptance: tests/acceptance/run.sh
    virtualServer: tests/virtualserver/test-hol-access.sh
  credentials:
    runtimeReference: null
`,
  );
}

function writeManifests(dir: string) {
  const d = join(dir, 'manifests', 'dev');
  mkdirSync(d, { recursive: true });
  writeFileSync(
    join(d, 'deployment.yaml'),
    `apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
  namespace: hol-0001-01
  labels:
    app: app
spec:
  replicas: 1
  selector:
    matchLabels:
      app: app
  template:
    metadata:
      labels:
        app: app
    spec:
      containers:
        - name: app
          image: registry.example.com/app:1.2.3
          ports:
            - containerPort: 8080
              protocol: TCP
          readinessProbe:
            httpGet:
              path: /healthz
              port: 8080
          resources:
            requests:
              cpu: 250m
              memory: 256Mi
            limits:
              cpu: "1"
              memory: 512Mi
`,
  );
  writeFileSync(
    join(d, 'service.yaml'),
    `apiVersion: v1
kind: Service
metadata:
  name: app
  namespace: hol-0001-01
spec:
  selector:
    app: app
  ports:
    - name: http
      port: 80
      targetPort: 8080
      protocol: TCP
`,
  );
  writeFileSync(
    join(d, 'virtualservice.yaml'),
    `apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: app
  namespace: hol-0001-01
spec:
  hosts:
    - app.example.com
  http:
    - route:
        - destination:
            host: app.hol-0001-01.svc
            port:
              number: 80
`,
  );
}

function writeLab(guideDir: string, repo: string) {
  mkdirSync(join(guideDir, '.holagent'), { recursive: true });
  writeFileSync(
    join(guideDir, '.holagent', 'lab-ref.json'),
    JSON.stringify({
      repo,
      origin: 'generated',
      adopted_stages: [],
      spec_dir: 'spec',
      platforms: ['k8s'],
      environments: [{ name: 'dev', kind: 'dev' }],
    }),
  );
  writeFileSync(
    join(guideDir, '.holagent', 'plan.md'),
    `---
id: HOL-0001-01
title: Example Lab
slug: example-lab
duration_minutes: 45
---
`,
  );
  writeFileSync(
    join(guideDir, '.holagent', 'sizing.md'),
    `---
target_platforms:
  - k8s
concurrency_target: 8
deployment_target: 'Charmed Kubernetes, x86, RTX PRO 6000'
demo_footprint:
  gpu: '1'
  vram_gb: 48
  vcpu: 16
  ram_gb: 64
  storage_gb: 200
---
`,
  );
  writeFileSync(
    join(guideDir, 'lab-prep.md'),
    `---
baseline: Ubuntu 22.04 with NVIDIA driver
network: 'Learner traffic arrives on HTTPS 443; lab exposes app.example.com'
software:
  - { name: app, version: 1.2.3, where: registry.example.com/app }
credentials:
  - { user: demo, secret: 'Password123!', applies_to: app }
endpoints:
  - { url: 'https://app.example.com', purpose: learner UI }
artifacts:
  - { path: /data, purpose: model cache }
verify:
  - { check: 'curl -fsS https://app.example.com', expect: '200' }
---
`,
  );
}

// ---------------------------------------------------------------- end to end

test('renderHandoff + checkHandoff pass on a conformant k8s lab, and fail on drift', () => {
  const base = mkdtempSync(join(tmpdir(), 'holagent-handoff-'));
  const guideDir = join(base, 'guide');
  const repo = join(base, 'repo');
  mkdirSync(guideDir, { recursive: true });
  mkdirSync(repo, { recursive: true });
  try {
    writeLab(guideDir, repo);
    writeProfile(repo, 'hol-0001-01');
    writeManifests(repo);

    const render = renderHandoff(guideDir);
    assert.equal(render.classification, 'PASS', render.message);
    assert.deepEqual(render.outputFiles, ['handoff/k8s.md']);
    const handoff = readFileSync(join(repo, 'handoff', 'k8s.md'), 'utf8');
    assert.ok(handoff.includes('hol-0001-01'));
    assert.ok(handoff.includes('HOL-0001-01'));
    assert.ok(handoff.includes('app.example.com'));
    assert.ok(!handoff.includes('Password123!'), 'credentials must not leak into the handoff');

    const check = checkHandoff(guideDir);
    assert.equal(check.classification, 'PASS', check.checks.map((c) => `${c.name}:${c.detail}`).join('; '));

    // Drift: change a committed manifest value; the gate must fail on digest mismatch.
    const svcPath = join(repo, 'manifests', 'dev', 'service.yaml');
    writeFileSync(svcPath, readFileSync(svcPath, 'utf8').replace('port: 80', 'port: 81'));
    const drifted = checkHandoff(guideDir);
    assert.equal(drifted.classification, 'FAIL');
    const digestCheck = drifted.checks.find((c) => c.name === 'manifest-digest');
    assert.ok(digestCheck && !digestCheck.ok, 'manifest-digest must disagree');
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('renderHandoff is BLOCKED for a vCD-only lab', () => {
  const base = mkdtempSync(join(tmpdir(), 'holagent-handoff-vcd-'));
  const guideDir = join(base, 'guide');
  const repo = join(base, 'repo');
  mkdirSync(guideDir, { recursive: true });
  mkdirSync(repo, { recursive: true });
  try {
    writeLab(guideDir, repo);
    writeFileSync(
      join(guideDir, '.holagent', 'lab-ref.json'),
      JSON.stringify({ repo, origin: 'generated', adopted_stages: [], spec_dir: 'spec', platforms: ['vcd'], environments: [{ name: 'dev', kind: 'dev' }] }),
    );
    const render = renderHandoff(guideDir);
    assert.equal(render.classification, 'BLOCKED');
    assert.equal(render.subcode, 'BLOCKED_DEFERRED_DIALECT');
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- utilities

test('detectSecrets flags token-shaped material but not ordinary text', () => {
  assert.equal(detectSecrets('ordinary prose with ports and paths'), false);
  assert.equal(detectSecrets('token: sk-abcdefgh12345678'), true);
});

test('parseEndpointUrl derives host, port and protocol', () => {
  assert.deepEqual(parseEndpointUrl('https://app.example.com'), { host: 'app.example.com', port: 443, protocol: 'https' });
  assert.deepEqual(parseEndpointUrl('http://10.0.0.5:8080'), { host: '10.0.0.5', port: 8080, protocol: 'http' });
  assert.equal(parseEndpointUrl('not a url'), null);
});
