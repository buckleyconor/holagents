/**
 * Raw Kubernetes manifests (spec-k8s/02 PRO-001, PRO-003, PRO-005;
 * ADR-K8S-001). Manifests are complete raw YAML documents — no Kustomize,
 * no Helm, no unresolved templates. Generation is deterministic: identical
 * inputs produce byte-identical documents (ADP-002).
 */
import {
  scanSecrets,
  type KubernetesDeploymentProfile,
  type ProfileError,
  type YNode,
} from './profile.ts';
import { parseProfileYaml } from './profile.ts';
import { canonicalDigest, emitYaml, fieldPath, toPlain } from './yaml.ts';
import { evaluatePolicy, type PlatformPolicy, type PolicyFinding } from './policy.ts';
import { isBlockedSubcode, type Finding, type GateClassification } from './results.ts';

// --- generation --------------------------------------------------------------

export interface AppManifestSpec {
  /** Resource name (Deployment/Service). */
  name: string;
  namespace: string;
  image: string;
  replicas: number;
  servicePort: number;
  containerPort: number;
  probePath: string;
  resources: {
    cpuRequest: string;
    cpuLimit: string;
    memoryRequest: string;
    memoryLimit: string;
  };
  labels: Record<string, string>;
  seccompProfileType: 'RuntimeDefault' | 'Localhost';
  /** Optional Istio VirtualService (Charmed Kubernetes). */
  virtualService?: { host: string };
}

function m(entries: [string, YNode][]): YNode {
  return { kind: 'map', entries, duplicates: [] };
}
function s(value: string | number | boolean): YNode {
  return { kind: 'scalar', value };
}

/**
 * Deterministically generate the raw-YAML document set for an application.
 * Byte-identical for identical inputs.
 */
export function generateManifests(spec: AppManifestSpec): { docs: YNode[]; raw: string[] } {
  const labelEntries = Object.entries(spec.labels).sort(([a], [b]) => a.localeCompare(b));
  const labels = m(labelEntries.map(([k, v]) => [k, s(v)] as [string, YNode]));

  const deployment = m([
    ['apiVersion', s('apps/v1')],
    ['kind', s('Deployment')],
    [
      'metadata',
      m([
        ['name', s(spec.name)],
        ['namespace', s(spec.namespace)],
        ['labels', labels],
      ]),
    ],
    [
      'spec',
      m([
        ['replicas', s(spec.replicas)],
        ['selector', m([['matchLabels', m([['app', s(spec.name)]])]])],
        [
          'template',
          m([
            ['metadata', m([['labels', m([['app', s(spec.name)]])]])],
            [
              'spec',
              m([
                [
                  'securityContext',
                  m([
                    ['seccompProfile', m([['type', s(spec.seccompProfileType)]])],
                    ['runAsNonRoot', s(true)],
                  ]),
                ],
                [
                  'containers',
                  {
                    kind: 'list',
                    items: [
                      m([
                        ['name', s('app')],
                        ['image', s(spec.image)],
                        [
                          'ports',
                          { kind: 'list', items: [m([['containerPort', s(spec.containerPort)]])] },
                        ],
                        [
                          'securityContext',
                          m([
                            ['runAsNonRoot', s(true)],
                            ['allowPrivilegeEscalation', s(false)],
                          ]),
                        ],
                        [
                          'readinessProbe',
                          m([
                            [
                              'httpGet',
                              m([
                                ['path', s(spec.probePath)],
                                ['port', s(spec.containerPort)],
                              ]),
                            ],
                            ['initialDelaySeconds', s(5)],
                            ['periodSeconds', s(10)],
                          ]),
                        ],
                        [
                          'livenessProbe',
                          m([
                            [
                              'httpGet',
                              m([
                                ['path', s(spec.probePath)],
                                ['port', s(spec.containerPort)],
                              ]),
                            ],
                            ['initialDelaySeconds', s(15)],
                            ['periodSeconds', s(20)],
                          ]),
                        ],
                        [
                          'resources',
                          m([
                            [
                              'requests',
                              m([
                                ['cpu', s(spec.resources.cpuRequest)],
                                ['memory', s(spec.resources.memoryRequest)],
                              ]),
                            ],
                            [
                              'limits',
                              m([
                                ['cpu', s(spec.resources.cpuLimit)],
                                ['memory', s(spec.resources.memoryLimit)],
                              ]),
                            ],
                          ]),
                        ],
                      ]),
                    ],
                  },
                ],
              ]),
            ],
          ]),
        ],
      ]),
    ],
  ]);

  const service = m([
    ['apiVersion', s('v1')],
    ['kind', s('Service')],
    [
      'metadata',
      m([
        ['name', s(spec.name)],
        ['namespace', s(spec.namespace)],
        ['labels', labels],
      ]),
    ],
    [
      'spec',
      m([
        ['selector', m([['app', s(spec.name)]])],
        [
          'ports',
          {
            kind: 'list',
            items: [
              m([
                ['name', s('http')],
                ['port', s(spec.servicePort)],
                ['targetPort', s(spec.containerPort)],
              ]),
            ],
          },
        ],
      ]),
    ],
  ]);

  const docs: YNode[] = [deployment, service];
  if (spec.virtualService) {
    docs.push(
      m([
        ['apiVersion', s('networking.istio.io/v1beta1')],
        ['kind', s('VirtualService')],
        [
          'metadata',
          m([
            ['name', s(spec.name)],
            ['namespace', s(spec.namespace)],
          ]),
        ],
        [
          'spec',
          m([
            ['hosts', { kind: 'list', items: [s(spec.virtualService.host)] }],
            [
              'http',
              {
                kind: 'list',
                items: [
                  m([
                    [
                      'route',
                      {
                        kind: 'list',
                        items: [
                          m([
                            [
                              'destination',
                              m([
                                ['host', s(`${spec.name}.${spec.namespace}.svc`)],
                                ['port', m([['number', s(spec.servicePort)]])],
                              ]),
                            ],
                          ]),
                        ],
                      },
                    ],
                  ]),
                ],
              },
            ],
          ]),
        ],
      ]),
    );
  }

  return { docs, raw: docs.map((d) => emitYaml(d)) };
}

// --- multi-document parsing ----------------------------------------------------

export interface ManifestDocuments {
  docs: YNode[];
  errors: ProfileError[];
}

/** Parse a multi-document raw-YAML manifest (documents separated by `---`). */
export function parseManifestDocuments(text: string): ManifestDocuments {
  const chunks = text
    .split(/^---\s*$/m)
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
  const docs: YNode[] = [];
  const errors: ProfileError[] = [];
  chunks.forEach((chunk, i) => {
    const { node, errors: e } = parseProfileYaml(chunk);
    if (node === null)
      errors.push(...e.map((x) => ({ ...x, path: `doc[${i}]${x.path ? '.' + x.path : ''}` })));
    else if (node.kind !== 'map')
      errors.push({
        code: 'bad-root',
        message: `document ${i} must be a mapping`,
        path: `doc[${i}]`,
      });
    else docs.push(node);
  });
  return { docs, errors };
}

// --- static validation (PRO-005) ------------------------------------------------

export interface ManifestResource {
  doc: YNode;
  apiVersion: string;
  kind: string;
  name: string;
  namespace?: string;
  clusterScoped: boolean;
  digest: string;
}

export interface ManifestValidation {
  classification: GateClassification;
  subcode?: string;
  errors: ProfileError[];
  /** Detection/policy findings (privileged access, host paths, policy rules). */
  findings: (Finding | PolicyFinding)[];
  resources: ManifestResource[];
  /** Digest over the canonical form of the full manifest set. */
  manifestDigest: string;
}

const PLACEHOLDER_RE = /\{\{.*?\}\}|\$\(([^)]*)\)|<FILL:[^>]*>/;
const PRIVILEGED_CHECKS: { field: string; label: string }[] = [
  { field: 'spec.template.spec.hostPID', label: 'host PID namespace' },
  { field: 'spec.template.spec.hostIPC', label: 'host IPC namespace' },
  { field: 'spec.template.spec.hostNetwork', label: 'host network namespace' },
];

/**
 * Static validation of raw manifests against the profile and available
 * platform policy (PRO-005). Fails closed: structural problems are `FAIL`,
 * a missing mandatory policy is `BLOCKED_POLICY`.
 */
export function validateManifests(
  texts: string[],
  profile: KubernetesDeploymentProfile,
  policy: PlatformPolicy | null,
  environment: string,
): ManifestValidation {
  const errors: ProfileError[] = [];
  const findings: (Finding | PolicyFinding)[] = [];
  const { docs, errors: parseErrors } = parseManifestDocuments(
    texts.map((t) => t.trimEnd()).join('\n---\n'),
  );
  errors.push(...parseErrors);

  const resources: ManifestResource[] = [];
  const identities = new Map<string, number>();

  for (const [i, doc] of docs.entries()) {
    const plain = toPlain(doc) as Record<string, unknown>;
    const meta = (plain.metadata ?? {}) as Record<string, unknown>;
    const apiVersion = typeof plain.apiVersion === 'string' ? plain.apiVersion : '';
    const kind = typeof plain.kind === 'string' ? plain.kind : '';
    const name = typeof meta.name === 'string' ? meta.name : '';
    if (!apiVersion || !kind || !name) {
      errors.push({
        code: 'manifest-identity',
        message: `document ${i} is missing apiVersion/kind/metadata.name`,
        path: `doc[${i}]`,
      });
      continue;
    }
    const namespace = typeof meta.namespace === 'string' ? meta.namespace : undefined;
    const clusterScoped = namespace === undefined;

    const identity = `${apiVersion}/${kind}/${namespace ?? 'cluster'}/${name}`;
    identities.set(identity, (identities.get(identity) ?? 0) + 1);

    // Unresolved placeholders (PRO-001: no unresolved template expressions).
    const placeholderHits: string[] = [];
    walkScalars(doc, '', (path, value) => {
      if (typeof value === 'string' && PLACEHOLDER_RE.test(value))
        placeholderHits.push(path || '<root>');
    });
    for (const path of placeholderHits) {
      errors.push({
        code: 'unresolved-placeholder',
        message: `unresolved template placeholder at ${path}`,
        path: `doc[${i}].${path}`,
      });
    }

    // Namespace boundary (PRO-005: unauthorized namespaces).
    if (namespace !== undefined && namespace !== profile.namespace) {
      errors.push({
        code: 'unauthorized-namespace',
        message: `resource ${kind}/${name} targets namespace "${namespace}", expected "${profile.namespace}"`,
        path: `doc[${i}].metadata.namespace`,
      });
    }

    // Secret material embedded in output (PRO-004/PRO-005).
    const secretErrors: ProfileError[] = [];
    scanSecrets(doc, '', `doc[${i}]`, secretErrors);
    errors.push(...secretErrors);

    resources.push({
      doc,
      apiVersion,
      kind,
      name,
      namespace,
      clusterScoped,
      digest: canonicalDigest(doc),
    });
  }

  for (const [identity, count] of identities) {
    if (count > 1)
      errors.push({
        code: 'duplicate-identity',
        message: `duplicate resource identity ${identity}`,
        path: identity,
      });
  }

  // Privileged / host / device access requiring policy evaluation (PRO-005).
  for (const res of resources) {
    if (res.kind !== 'Deployment') continue;
    const check = (field: string, label: string) => {
      const { found, value } = fieldPath(toPlain(res.doc), field);
      if (found && value === true) {
        findings.push(
          detectionFinding('MANIFEST-HOST', `no ${label} usage`, `${label} is enabled`, res),
        );
      }
    };
    for (const c of PRIVILEGED_CHECKS) check(c.field, c.label);
    for (const container of containersOf(res)) {
      const privileged = fieldPath(container, 'securityContext.privileged');
      if (privileged.found && privileged.value === true)
        findings.push(
          detectionFinding(
            'MANIFEST-PRIVILEGED',
            'no privileged containers',
            'privileged container detected',
            res,
          ),
        );
      const hostPaths = hostPathVolumes(toPlain(res.doc));
      if (hostPaths.length > 0)
        findings.push(
          detectionFinding(
            'MANIFEST-HOSTPATH',
            'no hostPath volumes',
            `hostPath volumes: ${hostPaths.join(', ')}`,
            res,
          ),
        );
    }
  }

  // Cluster-scoped resources require explicit policy approval (PRO-005).
  for (const res of resources.filter((r) => r.clusterScoped)) {
    if (policy === null) {
      if (profile.policy.required) {
        return {
          classification: 'BLOCKED',
          subcode: 'BLOCKED_POLICY',
          errors,
          findings,
          resources,
          manifestDigest: setDigest(resources),
        };
      }
      findings.push(
        detectionFinding(
          'MANIFEST-CLUSTERSCOPED',
          'cluster-scoped resources require policy approval',
          `${res.kind}/${res.name} is cluster-scoped with no policy available`,
          res,
        ),
      );
      continue;
    }
    const approvalControls = allControls(policy).filter(
      (c) => c.approvalRequired && c.rule.resource.kind === res.kind,
    );
    if (approvalControls.length === 0) {
      errors.push({
        code: 'cluster-scoped-unapproved',
        message: `cluster-scoped ${res.kind}/${res.name} has no policy approval control`,
        path: `doc.kind=${res.kind}`,
      });
    }
  }

  // Policy evaluation (static application point, POL-002 point 2).
  if (policy !== null) {
    const { findings: policyFindings, mandatoryViolations } = evaluatePolicy(
      policy,
      environment,
      docs,
    );
    findings.push(...policyFindings);
    if (mandatoryViolations.length > 0 && errors.length === 0) {
      return finished('FAIL', errors, findings, resources, undefined);
    }
  }

  // Classification (ARC-004 precedence).
  if (errors.length > 0) return finished('FAIL', errors, findings, resources, undefined);
  const mandatory = findings.filter((f) => f.severity === 'mandatory');
  if (mandatory.length > 0) return finished('FAIL', errors, findings, resources, undefined);
  if (findings.length > 0)
    return finished('PASS_WITH_WARNINGS', errors, findings, resources, undefined);
  return finished('PASS', errors, findings, resources, undefined);

  function finished(
    classification: GateClassification,
    errors: ProfileError[],
    findings: (Finding | PolicyFinding)[],
    resources: ManifestResource[],
    subcode: string | undefined,
  ): ManifestValidation {
    if (subcode !== undefined && !isBlockedSubcode(subcode))
      throw new Error(`internal: bad subcode ${subcode}`);
    return {
      classification,
      subcode,
      errors,
      findings,
      resources,
      manifestDigest: setDigest(resources),
    };
  }
}

/** Digest entry for a manifest set (used by prepare and promotion). */
export interface ManifestDigestEntry {
  kind: string;
  name: string;
  digest: string;
}

/** Deterministic digest over a set of manifest resources (sorted by identity). */
export function manifestSetDigest(entries: ManifestDigestEntry[]): string {
  const ordered = [...entries].sort((a, b) =>
    `${a.kind}/${a.name}`.localeCompare(`${b.kind}/${b.name}`),
  );
  return canonicalDigest({
    kind: 'map',
    duplicates: [],
    entries: ordered.map((r) => [`${r.kind}/${r.name}`, { kind: 'scalar', value: r.digest }]),
  });
}

function setDigest(resources: ManifestResource[]): string {
  return manifestSetDigest(
    resources.map((r) => ({ kind: r.kind, name: r.name, digest: r.digest })),
  );
}

function detectionFinding(
  id: string,
  expected: string,
  observed: string,
  res: ManifestResource,
): Finding {
  return {
    id,
    severity: 'mandatory',
    resource: `${res.kind}/${res.name}`,
    expected,
    observed,
  };
}

function containersOf(res: ManifestResource): unknown[] {
  const { value } = fieldPath(toPlain(res.doc), 'spec.template.spec.containers');
  return Array.isArray(value) ? value : [];
}

function hostPathVolumes(doc: unknown): string[] {
  const { found, value } = fieldPath(doc, 'spec.template.spec.volumes');
  if (!found || !Array.isArray(value)) return [];
  const out: string[] = [];
  for (const vol of value) {
    const hp = fieldPath(vol, 'hostPath');
    if (hp.found && hp.value !== null && typeof hp.value === 'object') {
      const path = fieldPath(hp.value, 'path');
      out.push(path.found ? String(path.value) : '<unknown>');
    }
  }
  return out;
}

function walkScalars(
  node: YNode,
  path: string,
  visit: (path: string, value: string | number | boolean | null) => void,
) {
  if (node.kind === 'scalar') {
    visit(path, node.value);
    return;
  }
  if (node.kind === 'list') {
    node.items.forEach((item, i) => walkScalars(item, `${path}[${i}]`, visit));
    return;
  }
  for (const [k, v] of node.entries) walkScalars(v, path ? `${path}.${k}` : k, visit);
}

function allControls(policy: PlatformPolicy) {
  return [
    ...policy.mandatoryControls,
    ...policy.advisoryControls,
    ...Object.values(policy.environmentRules).flat(),
  ];
}
