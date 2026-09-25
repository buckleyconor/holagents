/**
 * Platform policy contract (spec-k8s/05). Administrator requirements are
 * versioned inputs: missing mandatory policy blocks the affected transition
 * rather than inventing defaults (POL-001, ADR-K8S-007).
 *
 * The concrete administrator policy content is DEP-001 and has not been
 * supplied. This module defines the evaluation machinery and a small rule
 * vocabulary (implementation-defined, pending DEP-001 confirmation) so that
 * supplied policies are applied at the four application points (POL-002):
 * specification validation, raw-manifest validation, runtime infrastructure
 * testing, and platform review before promotion.
 */
import { createHash } from 'node:crypto';
import type { ProfileError } from './profile.ts';
import { parseProfileYaml } from './profile.ts';
import { fieldPath, toPlain } from './yaml.ts';
import type { YNode } from './profile.ts';

export const POLICY_API_VERSION = 'holagents.io/platform-policy/v1alpha1'; // version TBD per spec-k8s/05

export interface ResourceSelector {
  /** Resource kind the control applies to (e.g. `Deployment`, `Pod`). */
  kind: string;
  /** Match cluster-scoped resources of this kind too. */
  includeClusterScoped?: boolean;
}

/** Rule vocabulary (implementation-defined pending DEP-001). */
export type PolicyRule =
  | { type: 'field-required'; resource: ResourceSelector; field: string }
  | { type: 'field-forbidden'; resource: ResourceSelector; field: string }
  | { type: 'field-allowed'; resource: ResourceSelector; field: string; values: string[] }
  | { type: 'field-max'; resource: ResourceSelector; field: string; value: number }
  | { type: 'annotation-required'; resource: ResourceSelector; key: string };

export interface PolicyControl {
  id: string;
  severity: 'mandatory' | 'advisory';
  description: string;
  /** Where the control is evaluated. */
  appliesTo: 'static' | 'runtime' | 'both';
  rule: PolicyRule;
  /**
   * Cluster-scoped or privileged resources may require explicit policy
   * approval (spec-k8s/02 PRO-005): when true, a violation is a blocker
   * even if the control itself is advisory.
   */
  approvalRequired?: boolean;
}

export interface PolicyExceptionProcess {
  maxDurationDays: number;
  /** Exceptions must link to evidence. */
  requiredEvidence: boolean;
  approverRoles: string[];
}

export interface PlatformPolicy {
  apiVersion: string;
  name: string;
  /** Policy revision; a change invalidates affected evidence (POL-002). */
  version: string;
  mandatoryControls: PolicyControl[];
  advisoryControls: PolicyControl[];
  /** Additional controls scoped to a named environment. */
  environmentRules: Record<string, PolicyControl[]>;
  exceptionProcess: PolicyExceptionProcess | null;
}

export interface PolicyFinding {
  /** Control id (requirement identifier, POL-003). */
  id: string;
  severity: 'mandatory' | 'advisory';
  resource: string;
  expected: string;
  observed: string;
  remediation?: string;
  /** Policy revision the finding was evaluated against. */
  policyRevision: string;
  /** Set when a valid exception covers this finding (downgraded to advisory). */
  exceptionRef?: string;
  /** `static` (manifest inspection) vs `runtime` (observation). */
  source: 'static' | 'runtime';
}

// --- parsing / validation ----------------------------------------------------

const CONTROL_KEYS = [
  'id',
  'severity',
  'description',
  'appliesTo',
  'rule',
  'approvalRequired',
] as const;
const TOP_KEYS = [
  'apiVersion',
  'name',
  'version',
  'mandatoryControls',
  'advisoryControls',
  'environmentRules',
  'exceptionProcess',
] as const;

function controlFromNode(node: YNode, path: string, errors: ProfileError[]): PolicyControl | null {
  if (node.kind !== 'map') {
    errors.push({ code: 'bad-type', message: 'control must be a mapping', path });
    return null;
  }
  const get = (key: string) => node.entries.find(([k]) => k === key)?.[1];
  const str = (key: string): string | null => {
    const n = get(key);
    if (!n || n.kind !== 'scalar' || typeof n.value !== 'string' || n.value === '') {
      errors.push({ code: 'missing-key', message: `missing key "${key}"`, path: `${path}.${key}` });
      return null;
    }
    return n.value;
  };
  const id = str('id');
  const sevRaw = str('severity');
  const sev: 'mandatory' | 'advisory' | null =
    sevRaw === 'mandatory' || sevRaw === 'advisory' ? sevRaw : null;
  if (sevRaw !== null && sev === null)
    errors.push({
      code: 'bad-value',
      message: 'severity must be mandatory or advisory',
      path: `${path}.severity`,
    });
  const description = str('description');
  const appliesToRaw = str('appliesTo');
  const appliesTo: 'static' | 'runtime' | 'both' | null =
    appliesToRaw === 'static' || appliesToRaw === 'runtime' || appliesToRaw === 'both'
      ? appliesToRaw
      : null;
  if (appliesToRaw !== null && appliesTo === null)
    errors.push({
      code: 'bad-value',
      message: 'appliesTo must be static, runtime or both',
      path: `${path}.appliesTo`,
    });
  const ruleNode = get('rule');
  let rule: PolicyRule | null = null;
  if (ruleNode && ruleNode.kind === 'map') {
    const rm: Record<string, unknown> = toPlain(ruleNode) as Record<string, unknown>;
    const type = rm.type as string;
    const resource = rm.resource as Record<string, unknown> | undefined;
    if (!resource || typeof resource.kind !== 'string') {
      errors.push({
        code: 'bad-value',
        message: 'rule.resource.kind is required',
        path: `${path}.rule`,
      });
    } else {
      const selector: ResourceSelector = {
        kind: resource.kind,
        includeClusterScoped: resource.includeClusterScoped === true,
      };
      if (type === 'field-required' || type === 'field-forbidden') {
        if (typeof rm.field !== 'string')
          errors.push({
            code: 'bad-value',
            message: 'rule.field is required',
            path: `${path}.rule`,
          });
        else
          rule =
            type === 'field-required'
              ? { type, resource: selector, field: rm.field }
              : { type, resource: selector, field: rm.field };
      } else if (type === 'field-allowed') {
        if (typeof rm.field !== 'string' || !Array.isArray(rm.values))
          errors.push({
            code: 'bad-value',
            message: 'rule.field and rule.values are required',
            path: `${path}.rule`,
          });
        else rule = { type, resource: selector, field: rm.field, values: rm.values as string[] };
      } else if (type === 'field-max') {
        if (typeof rm.field !== 'string' || typeof rm.value !== 'number')
          errors.push({
            code: 'bad-value',
            message: 'rule.field and numeric rule.value are required',
            path: `${path}.rule`,
          });
        else rule = { type, resource: selector, field: rm.field, value: rm.value };
      } else if (type === 'annotation-required') {
        if (typeof rm.key !== 'string')
          errors.push({ code: 'bad-value', message: 'rule.key is required', path: `${path}.rule` });
        else rule = { type, resource: selector, key: rm.key };
      } else {
        errors.push({
          code: 'bad-value',
          message: `unknown rule type "${type}"`,
          path: `${path}.rule`,
        });
      }
    }
  } else {
    errors.push({ code: 'missing-key', message: 'missing key "rule"', path: `${path}.rule` });
  }
  for (const [key] of node.entries) {
    if (!(CONTROL_KEYS as readonly string[]).includes(key))
      errors.push({ code: 'unknown-key', message: `unknown key "${key}"`, path: `${path}.${key}` });
  }
  const ar = get('approvalRequired');
  if (id === null || description === null || rule === null || sev === null || appliesTo === null)
    return null;
  return {
    id,
    severity: sev,
    description,
    appliesTo: appliesTo,
    rule,
    approvalRequired: ar !== undefined && ar.kind === 'scalar' && ar.value === true,
  };
}

/** Parse and validate a platform policy document (spec-k8s/05). */
export function validatePolicyDocument(
  text: string,
): { ok: true; policy: PlatformPolicy } | { ok: false; errors: ProfileError[] } {
  const { node, errors } = parseProfileYaml(text);
  if (node === null || node.kind !== 'map')
    return {
      ok: false,
      errors: errors.length
        ? errors
        : [{ code: 'bad-root', message: 'policy root must be a mapping', path: '' }],
    };
  const problems = [...errors];
  const get = (key: string) => node.entries.find(([k]) => k === key)?.[1];
  for (const [key] of node.entries) {
    if (!(TOP_KEYS as readonly string[]).includes(key))
      problems.push({ code: 'unknown-key', message: `unknown key "${key}"`, path: key });
  }
  for (const key of TOP_KEYS) {
    if (!get(key))
      problems.push({ code: 'missing-key', message: `missing key "${key}"`, path: key });
  }
  const str = (key: string): string | null => {
    const n = get(key);
    return n && n.kind === 'scalar' && typeof n.value === 'string' ? n.value : null;
  };
  const apiVersion = str('apiVersion');
  if (apiVersion !== null && apiVersion !== POLICY_API_VERSION)
    problems.push({
      code: 'bad-api-version',
      message: `apiVersion must be ${POLICY_API_VERSION}`,
      path: 'apiVersion',
    });
  const name = str('name');
  const version = str('version');

  const parseControls = (key: 'mandatoryControls' | 'advisoryControls'): PolicyControl[] => {
    const n = get(key);
    if (!n) return [];
    if (n.kind !== 'list') {
      problems.push({ code: 'bad-type', message: `${key} must be a list`, path: key });
      return [];
    }
    const out: PolicyControl[] = [];
    n.items.forEach((item, i) => {
      const c = controlFromNode(item, `${key}[${i}]`, problems);
      if (c) out.push(c);
    });
    return out;
  };

  const mandatoryControls = parseControls('mandatoryControls');
  const advisoryControls = parseControls('advisoryControls');

  const environmentRules: Record<string, PolicyControl[]> = {};
  const er = get('environmentRules');
  if (er && er.kind === 'map') {
    for (const [env, list] of er.entries) {
      if (list.kind !== 'list') {
        problems.push({
          code: 'bad-type',
          message: `environmentRules.${env} must be a list`,
          path: `environmentRules.${env}`,
        });
        continue;
      }
      const controls: PolicyControl[] = [];
      list.items.forEach((item, i) => {
        const c = controlFromNode(item, `environmentRules.${env}[${i}]`, problems);
        if (c) controls.push(c);
      });
      environmentRules[env] = controls;
    }
  } else if (er && er.kind !== 'scalar') {
    problems.push({
      code: 'bad-type',
      message: 'environmentRules must be a mapping',
      path: 'environmentRules',
    });
  }

  let exceptionProcess: PolicyExceptionProcess | null = null;
  const ep = get('exceptionProcess');
  if (ep && ep.kind === 'map') {
    const epPlain = toPlain(ep) as Record<string, unknown>;
    if (
      typeof epPlain.maxDurationDays !== 'number' ||
      epPlain.requiredEvidence !== true ||
      !Array.isArray(epPlain.approverRoles)
    )
      problems.push({
        code: 'bad-value',
        message:
          'exceptionProcess requires maxDurationDays, requiredEvidence: true and approverRoles',
        path: 'exceptionProcess',
      });
    else
      exceptionProcess = {
        maxDurationDays: epPlain.maxDurationDays,
        requiredEvidence: true,
        approverRoles: epPlain.approverRoles as string[],
      };
  } else if (ep && ep.kind !== 'scalar') {
    problems.push({
      code: 'bad-type',
      message: 'exceptionProcess must be a mapping or null',
      path: 'exceptionProcess',
    });
  }

  if (problems.length > 0 || !name || !version) return { ok: false, errors: problems };
  return {
    ok: true,
    policy: {
      apiVersion: POLICY_API_VERSION,
      name,
      version,
      mandatoryControls,
      advisoryControls,
      environmentRules,
      exceptionProcess,
    },
  };
}

/** Policy digest; bound into evidence so policy revisions invalidate it (POL-002). */
export function policyDigest(policy: PlatformPolicy): string {
  const canonical = JSON.stringify({
    name: policy.name,
    version: policy.version,
    mandatoryControls: policy.mandatoryControls,
    advisoryControls: policy.advisoryControls,
    environmentRules: policy.environmentRules,
    exceptionProcess: policy.exceptionProcess,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

// --- exceptions (spec-k8s/05 §Exceptions) ------------------------------------

export interface PolicyException {
  id: string;
  /** The named requirement (control id) the exception is limited to. */
  controlId: string;
  /** The named resources it is limited to, e.g. `Deployment/example-lab`. */
  resources: string[];
  environment: string;
  approver: string;
  role: string;
  /** ISO 8601. */
  approvedAt: string;
  /** ISO 8601; exceptions are time-bounded. */
  expiresAt: string;
  /** The revision the exception is bound to. */
  revision: string;
  evidenceRef: string;
}

/**
 * Structural and validity check on an exception. An expired or
 * revision-mismatched exception is invalid (spec-k8s/05 §Exceptions).
 */
export function validateException(
  x: PolicyException,
  policy: PlatformPolicy,
  now: string,
  revision: string,
): string[] {
  const problems: string[] = [];
  if (!policy.exceptionProcess) {
    problems.push('policy does not permit exceptions (exceptionProcess is null)');
    return problems;
  }
  if (!x.approver) problems.push('exception must name an approver');
  if (!policy.exceptionProcess.approverRoles.includes(x.role))
    problems.push(`approver role "${x.role}" is not authorized by policy`);
  if (x.resources.length === 0) problems.push('exception must be limited to named resources');
  if (!x.evidenceRef) problems.push('exception must link to evidence');
  const approved = Date.parse(x.approvedAt);
  const expires = Date.parse(x.expiresAt);
  const nowMs = Date.parse(now);
  if (Number.isNaN(approved) || Number.isNaN(expires) || Number.isNaN(nowMs))
    problems.push('exception timestamps must be ISO 8601');
  else {
    if (expires <= approved)
      problems.push('exception must be time-bounded (expiresAt after approvedAt)');
    if (expires - approved > policy.exceptionProcess.maxDurationDays * 86400000)
      problems.push(
        `exception exceeds the policy maximum duration (${policy.exceptionProcess.maxDurationDays} days)`,
      );
    if (nowMs > expires) problems.push('exception is expired');
  }
  if (x.revision !== revision)
    problems.push(`exception is bound to a different revision (${x.revision} != ${revision})`);
  if (!x.controlId) problems.push('exception must name the requirement (controlId)');
  return problems;
}

/** Exceptions that pass validation now. */
export function activeExceptions(
  exceptions: PolicyException[],
  policy: PlatformPolicy,
  now: string,
  revision: string,
): PolicyException[] {
  return exceptions.filter((x) => validateException(x, policy, now, revision).length === 0);
}

// --- evaluation ---------------------------------------------------------------

/** A runtime observation of a workload (from the cluster API / fake). */
export interface RuntimeObservation {
  kind: string;
  name: string;
  namespace?: string;
  clusterScoped?: boolean;
  /** Observed spec/status, plain objects. */
  observed: Record<string, unknown>;
}

interface EvaluableResource {
  kind: string;
  name: string;
  clusterScoped: boolean;
  data: Record<string, unknown>;
  source: 'static' | 'runtime';
}

/**
 * Evaluate the policy's controls (plus environment-scoped rules) against
 * static manifest documents and/or runtime observations.
 */
export function evaluatePolicy(
  policy: PlatformPolicy,
  environment: string,
  manifests: YNode[],
  observations: RuntimeObservation[] = [],
  now = new Date().toISOString(),
  exceptions: PolicyException[] = [],
): { findings: PolicyFinding[]; mandatoryViolations: PolicyFinding[] } {
  const controls = [
    ...policy.mandatoryControls,
    ...policy.advisoryControls,
    ...(policy.environmentRules[environment] ?? []),
  ];
  const active = activeExceptions(exceptions, policy, now, manifestsDigestKey(manifests));
  const resources: EvaluableResource[] = [
    ...manifests.map((doc) => {
      const plain = toPlain(doc) as Record<string, unknown>;
      const meta = (plain.metadata ?? {}) as Record<string, unknown>;
      return {
        kind: String(plain.kind ?? ''),
        name: String(meta.name ?? ''),
        clusterScoped: !meta.namespace,
        data: plain,
        source: 'static' as const,
      };
    }),
    ...observations.map((o) => ({
      kind: o.kind,
      name: o.name,
      clusterScoped: o.clusterScoped ?? false,
      data: o.observed,
      source: 'runtime' as const,
    })),
  ];

  const findings: PolicyFinding[] = [];
  for (const control of controls) {
    for (const res of resources) {
      if (res.kind !== control.rule.resource.kind) continue;
      if (res.clusterScoped && !control.rule.resource.includeClusterScoped) continue;
      if (control.appliesTo === 'static' && res.source !== 'static') continue;
      if (control.appliesTo === 'runtime' && res.source !== 'runtime') continue;

      const finding = evaluateRule(control, res);
      if (!finding) continue;
      const label = res.clusterScoped ? control.rule.resource.kind : `${res.kind}/${res.name}`;
      const exception = active.find(
        (x) =>
          x.controlId === control.id &&
          x.environment === environment &&
          x.resources.includes(label),
      );
      findings.push({
        ...finding,
        resource: label,
        policyRevision: policy.version,
        severity: exception ? 'advisory' : finding.severity,
        exceptionRef: exception?.id,
      });
    }
  }
  const mandatoryViolations = findings.filter((f) => f.severity === 'mandatory');
  return { findings, mandatoryViolations };
}

function evaluateRule(control: PolicyControl, res: EvaluableResource) {
  const rule = control.rule;
  const resourceLabel = `${res.kind}/${res.name}`;
  switch (rule.type) {
    case 'field-required': {
      const { found, value } = fieldPath(res.data, rule.field);
      if (found && value !== null && value !== undefined && value !== '') return null;
      return {
        id: control.id,
        severity: control.severity,
        expected: `${rule.field} is set`,
        observed: found
          ? `observed ${JSON.stringify(valueOf(res.data, rule.field))}`
          : 'field absent',
        source: res.source,
      };
    }
    case 'field-forbidden': {
      const { found, value } = fieldPath(res.data, rule.field);
      if (!found || value === null || value === undefined || value === false) return null;
      return {
        id: control.id,
        severity: control.severity,
        expected: `${rule.field} is absent or false`,
        observed: `observed ${JSON.stringify(valueOf(res.data, rule.field))}`,
        source: res.source,
      };
    }
    case 'field-allowed': {
      const { found, value } = fieldPath(res.data, rule.field);
      if (!found) {
        // Missing values are only a violation when the field is required to be present.
        return {
          id: control.id,
          severity: control.severity,
          expected: `${rule.field} in [${rule.values.join(', ')}]`,
          observed: 'field absent',
          source: res.source,
        };
      }
      if (rule.values.includes(String(value))) return null;
      return {
        id: control.id,
        severity: control.severity,
        expected: `${rule.field} in [${rule.values.join(', ')}]`,
        observed: `observed ${JSON.stringify(value)}`,
        source: res.source,
      };
    }
    case 'field-max': {
      const { found, value } = fieldPath(res.data, rule.field);
      if (!found || typeof value !== 'number') return null;
      if (value <= rule.value) return null;
      return {
        id: control.id,
        severity: control.severity,
        expected: `${rule.field} <= ${rule.value}`,
        observed: `observed ${value}`,
        source: res.source,
      };
    }
    case 'annotation-required': {
      const annotations = (((res.data.metadata ?? {}) as Record<string, unknown>).annotations ??
        {}) as Record<string, unknown>;
      if (rule.key in annotations) return null;
      return {
        id: control.id,
        severity: control.severity,
        expected: `annotation ${rule.key} is present`,
        observed: 'annotation absent',
        source: res.source,
      };
    }
    default:
      return null;
  }
  void resourceLabel;
}

function valueOf(data: Record<string, unknown>, path: string): unknown {
  return fieldPath(data, path).value;
}

/** Stable key identifying the manifest set a revision-bound evaluation ran on. */
function manifestsDigestKey(manifests: YNode[]): string {
  return createHash('sha256')
    .update(manifests.map((m) => JSON.stringify(toPlain(m))).join('|'))
    .digest('hex')
    .slice(0, 16);
}
