/**
 * Platform handoff — Kubernetes dialect (spec-k8s/09-annex-kubernetes.md).
 *
 * Binds to the committed manifests for every environment in
 * `deployment-profile.yaml spec.environments[]` — identified by manifest-set
 * digest — and never re-renders them (HND-K8S-001). The component model
 * (image, container port, probe path, resources) and the in-cluster half of
 * the comms matrix (Service/VirtualService edges) are derived from those
 * committed manifests. External endpoints are VirtualServices, never Ingress
 * (HND-K8S-003).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type {
  HandoffClassification,
  HandoffComponent,
  HandoffComponentPort,
  HandoffCoverageGap,
  HandoffEdge,
  HandoffEnvironment,
  HandoffModel,
} from '../handoff.ts';
import { parseEndpointUrl } from '../handoff.ts';
import { manifestSetDigest, parseManifestDocuments } from './manifests.ts';
import {
  validateProfile,
  type KubernetesDeploymentProfile,
  type YNode,
} from './profile.ts';
import { redactText } from './redact.ts';
import { canonicalDigest, toPlain } from './yaml.ts';

const LAB_ID_RE = /^hol-\d{4}-\d{2}$/;
const CATALOGUE_ID_RE = /^HOL-\d{4}-\d{2}$/;

export interface K8sDialectRender {
  classification: HandoffClassification;
  subcode?: string;
  message: string;
  markdown: string;
  labId: string | null;
  namespace: string | null;
  components: HandoffComponent[];
  edges: HandoffEdge[];
  environments: HandoffEnvironment[];
  coverageWarnings: string[];
  coverageGaps: HandoffCoverageGap[];
}

function blocked(subcode: string, message: string): K8sDialectRender {
  return {
    classification: 'BLOCKED',
    subcode,
    message,
    markdown: '',
    labId: null,
    namespace: null,
    components: [],
    edges: [],
    environments: [],
    coverageWarnings: [],
    coverageGaps: [],
  };
}

function listYaml(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isFile() && /\.(ya?ml)$/i.test(d.name))
      .map((d) => d.name)
      .sort();
  } catch {
    return [];
  }
}

function readProfile(repo: string): KubernetesDeploymentProfile {
  const path = join(repo, 'deployment-profile.yaml');
  if (!existsSync(path)) throw new Error(`deployment-profile.yaml is missing at ${path}`);
  const text = readFileSync(path, 'utf8');
  if (redactText(text) !== text) throw new Error('secret material in deployment-profile.yaml');
  const result = validateProfile(text);
  if (!result.ok) {
    throw new Error(`invalid deployment-profile.yaml: ${result.errors.map((e) => e.message).join('; ')}`);
  }
  return result.profile;
}

/** Compute the manifest-set digest for one environment, or null when empty. */
function computeEnvDigest(repo: string, manifestsPath: string): string | null {
  const dir = join(repo, manifestsPath);
  const files = listYaml(dir);
  if (files.length === 0) return null;
  const docs: YNode[] = [];
  for (const f of files) {
    const text = readFileSync(join(dir, f), 'utf8');
    if (redactText(text) !== text) {
      throw new Error(`secret material in manifest ${f}`);
    }
    const parsed = parseManifestDocuments(text);
    if (parsed.errors.length > 0) {
      throw new Error(`manifest ${f}: ${parsed.errors.map((e) => e.message).join('; ')}`);
    }
    docs.push(...parsed.docs);
  }
  return manifestSetDigest(
    docs.map((d) => {
      const plain = toPlain(d) as Record<string, unknown>;
      const meta = (plain.metadata ?? {}) as Record<string, unknown>;
      return {
        kind: typeof plain.kind === 'string' ? plain.kind : '?',
        name: typeof meta.name === 'string' ? meta.name : '?',
        digest: canonicalDigest(d),
      };
    }),
  );
}

// ---------------------------------------------------------------- derivation

interface Derived {
  components: HandoffComponent[];
  edges: HandoffEdge[];
  endpoints: { endpoint: string; service: string; port: number; external: boolean }[];
  coverageGaps: HandoffCoverageGap[];
}

function componentFromDeployment(plain: Record<string, unknown>): HandoffComponent | null {
  const name = ((plain.metadata ?? {}) as Record<string, unknown>).name;
  const spec = (plain.spec ?? {}) as Record<string, unknown>;
  const template = (spec.template ?? {}) as Record<string, unknown>;
  const podSpec = (template.spec ?? {}) as Record<string, unknown>;
  const containers = Array.isArray(podSpec.containers) ? (podSpec.containers as unknown[]) : [];
  const images: string[] = [];
  const ports: HandoffComponentPort[] = [];
  let probePath: string | undefined;
  let resources: string | undefined;
  for (const raw of containers) {
    const c = (raw ?? {}) as Record<string, unknown>;
    if (typeof c.image === 'string' && c.image !== '') images.push(c.image);
    for (const p of Array.isArray(c.ports) ? (c.ports as unknown[]) : []) {
      const pc = (p ?? {}) as Record<string, unknown>;
      ports.push({
        containerPort: typeof pc.containerPort === 'number' ? pc.containerPort : undefined,
        protocol: typeof pc.protocol === 'string' ? pc.protocol : 'TCP',
      });
    }
    if (probePath === undefined) {
      const probe = (c.readinessProbe ?? c.livenessProbe ?? {}) as Record<string, unknown>;
      const httpGet = (probe.httpGet ?? {}) as Record<string, unknown>;
      if (typeof httpGet.path === 'string') probePath = httpGet.path;
    }
    if (resources === undefined) {
      resources = compactResources(c.resources as Record<string, unknown> | undefined);
    }
  }
  if (images.length === 0 || ports.length === 0) return null;
  return {
    name: String(name ?? '?'),
    image: [...new Set(images)].join(', '),
    ports,
    ...(probePath !== undefined ? { probePath } : {}),
    ...(resources !== undefined ? { resources } : {}),
  };
}

function compactResources(r: Record<string, unknown> | undefined): string | undefined {
  if (!r) return undefined;
  const part: string[] = [];
  const requests = (r.requests ?? {}) as Record<string, unknown>;
  const limits = (r.limits ?? {}) as Record<string, unknown>;
  const fmt = (k: string) => {
    const req = typeof requests[k] === 'string' ? requests[k] : '';
    const lim = typeof limits[k] === 'string' ? limits[k] : '';
    return `${k} ${req}/${lim}`;
  };
  if (requests.cpu || limits.cpu) part.push(fmt('cpu'));
  if (requests.memory || limits.memory) part.push(fmt('mem'));
  return part.length > 0 ? part.join(', ') : undefined;
}

function deriveFromDocs(docs: YNode[]): Derived {
  const components: HandoffComponent[] = [];
  const edges: HandoffEdge[] = [];
  const endpoints: Derived['endpoints'] = [];
  const gaps: HandoffCoverageGap[] = [];
  const deployments = new Map<string, Record<string, unknown>>();
  const services: { name: string; selectorApp?: string; ports: { port: number; protocol: string }[] }[] = [];
  const virtualServices: { host: string; service: string; port: number }[] = [];

  for (const doc of docs) {
    const plain = toPlain(doc) as Record<string, unknown>;
    const kind = plain.kind;
    const name = ((plain.metadata ?? {}) as Record<string, unknown>).name;
    if (kind === 'Deployment') {
      deployments.set(String(name ?? '?'), plain);
      const c = componentFromDeployment(plain);
      if (c) components.push(c);
      else gaps.push({ what: `Deployment ${String(name ?? '?')}`, why: 'no container image or port derivable' });
    } else if (kind === 'Service') {
      const spec = (plain.spec ?? {}) as Record<string, unknown>;
      const selector = (spec.selector ?? {}) as Record<string, unknown>;
      services.push({
        name: String(name ?? '?'),
        selectorApp: typeof selector.app === 'string' ? selector.app : undefined,
        ports: (Array.isArray(spec.ports) ? (spec.ports as unknown[]) : []).map((p) => {
          const pc = (p ?? {}) as Record<string, unknown>;
          return {
            port: typeof pc.port === 'number' ? pc.port : 0,
            protocol: typeof pc.protocol === 'string' ? pc.protocol : 'TCP',
          };
        }),
      });
    } else if (kind === 'VirtualService') {
      const vs = virtualServiceFrom(plain);
      if (vs) virtualServices.push(vs);
    }
  }

  for (const vs of virtualServices) {
    edges.push({
      from: 'ingress',
      to: vs.service,
      protocol: 'HTTP',
      port: vs.port,
      direction: 'inbound',
      requirement: `VirtualService ${vs.host}`,
    });
    endpoints.push({ endpoint: `https://${vs.host}`, service: vs.service, port: vs.port, external: true });
  }

  for (const svc of services) {
    if (!svc.selectorApp) {
      gaps.push({ what: `Service ${svc.name}`, why: 'no selector.app to derive an upstream' });
      continue;
    }
    if (!deployments.has(svc.selectorApp)) {
      gaps.push({ what: `Service ${svc.name}`, why: `selector app=${svc.selectorApp} matches no Deployment` });
      continue;
    }
    for (const p of svc.ports) {
      edges.push({
        from: svc.name,
        to: svc.selectorApp,
        protocol: p.protocol,
        port: p.port,
        direction: 'internal',
        requirement: `Service ${svc.name} selector app=${svc.selectorApp}`,
      });
    }
  }

  return { components, edges, endpoints, coverageGaps: gaps };
}

function virtualServiceFrom(plain: Record<string, unknown>): { host: string; service: string; port: number } | null {
  const spec = (plain.spec ?? {}) as Record<string, unknown>;
  const hosts = Array.isArray(spec.hosts) ? (spec.hosts as unknown[]) : [];
  const host = typeof hosts[0] === 'string' ? hosts[0] : '';
  let service = '';
  let port = 0;
  for (const r of Array.isArray(spec.http) ? (spec.http as unknown[]) : []) {
    const routes = Array.isArray((r as Record<string, unknown>).route)
      ? ((r as Record<string, unknown>).route as unknown[])
      : [];
    for (const rt of routes) {
      const dest = ((rt as Record<string, unknown>).destination ?? {}) as Record<string, unknown>;
      const dh = typeof dest.host === 'string' ? dest.host : '';
      const portObj = (dest.port ?? {}) as Record<string, unknown>;
      if (dh) service = dh.split('.')[0] ?? dh;
      if (typeof portObj.number === 'number') port = portObj.number;
      break;
    }
    if (service) break;
  }
  return service ? { host: host || service, service, port } : null;
}

function gpuCount(gpu: string): number | null {
  const t = gpu.trim();
  if (t === '' || /^(none|no|0)$/i.test(t)) return 0;
  const m = t.match(/^(\d+)/);
  return m ? Number(m[1]) : null;
}

function quotaRows(model: HandoffModel): { rows: { resource: string; value: string; basis: string }[]; gap: string | null } {
  const fp = model.footprint;
  const n = model.concurrencyTarget;
  if (!fp || n === null || n <= 0) {
    return { rows: [], gap: 'sizing.md missing or incomplete — namespace quota not derivable' };
  }
  const rows: { resource: string; value: string; basis: string }[] = [];
  if (fp.vcpu > 0) rows.push({ resource: 'vcpu', value: String(fp.vcpu * n), basis: `demo_footprint.vcpu × ${n}` });
  if (fp.ramGb > 0) rows.push({ resource: 'ram_gb', value: String(fp.ramGb * n), basis: `demo_footprint.ram_gb × ${n}` });
  if (fp.storageGb > 0) rows.push({ resource: 'storage_gb', value: String(fp.storageGb * n), basis: `demo_footprint.storage_gb × ${n}` });
  const gpu = gpuCount(fp.gpu);
  if (gpu !== null && gpu > 0) rows.push({ resource: 'nvidia.com/gpu', value: String(gpu * n), basis: `demo_footprint.gpu × ${n}` });
  if (fp.vramGb > 0) rows.push({ resource: 'vram_gb (informational)', value: String(fp.vramGb * n), basis: `demo_footprint.vram_gb × ${n}` });
  return { rows, gap: null };
}

// ---------------------------------------------------------------- rendering

function nodeId(prefix: string, name: string): string {
  return `${prefix}${name.replace(/[^A-Za-z0-9_-]/g, '_')}`;
}

function mermaidLabel(text: string): string {
  return text.replace(/"/g, "'");
}

function renderMarkdown(model: HandoffModel, ctx: {
  labId: string;
  namespace: string;
  environments: HandoffEnvironment[];
  components: HandoffComponent[];
  edges: HandoffEdge[];
  endpoints: { endpoint: string; service: string; port: number; external: boolean }[];
  quota: { rows: { resource: string; value: string; basis: string }[]; gap: string | null };
  coverageGaps: HandoffCoverageGap[];
}): string {
  const lines: string[] = [];
  lines.push('# Platform Handoff — Kubernetes (Charmed Kubernetes)');
  lines.push('');
  lines.push('<!-- generated by hol_handoff_render — do not edit; drift fails hol_handoff_check -->');
  lines.push('');
  lines.push('## Identifiers');
  lines.push('');
  lines.push(`- Operational (namespace, GitLab project): \`${ctx.labId}\``);
  lines.push(`- Catalogue (plan.md id): \`${model.catalogueId ?? ''}\``);
  lines.push('');
  lines.push('## Baseline');
  lines.push('');
  lines.push(model.baseline || '(none)');
  lines.push('');
  lines.push('## Environments');
  lines.push('');
  lines.push('| Environment | Branch | Argo application | Manifests path | Manifest digest |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const e of ctx.environments) {
    lines.push(`| ${e.name} | ${e.branch} | ${e.argoApplication} | ${e.manifestsPath} | ${e.digest} |`);
  }
  lines.push('');
  lines.push('## Software');
  lines.push('');
  lines.push('| Name | Version | Where |');
  lines.push('| --- | --- | --- |');
  if (model.software.length === 0) lines.push('| (none) | | |');
  for (const s of model.software) lines.push(`| ${s.name} | ${s.version} | ${s.where} |`);
  lines.push('');
  lines.push('## Components');
  lines.push('');
  lines.push('| Name | Image | Container port | Protocol | Probe path | Resources |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  if (ctx.components.length === 0) lines.push('| (none) | | | | | |');
  for (const c of ctx.components) {
    const ports = c.ports.map((p) => (p.containerPort !== undefined ? String(p.containerPort) : '?')).join(', ');
    const protocols = [...new Set(c.ports.map((p) => p.protocol ?? 'TCP'))].join(', ');
    lines.push(`| ${c.name} | ${c.image} | ${ports} | ${protocols} | ${c.probePath ?? ''} | ${c.resources ?? ''} |`);
  }
  lines.push('');
  lines.push('## Endpoints');
  lines.push('');
  lines.push('| Endpoint | Service | Port | External |');
  lines.push('| --- | --- | --- | --- |');
  if (ctx.endpoints.length === 0) lines.push('| (none) | | | |');
  for (const ep of ctx.endpoints) {
    lines.push(`| ${ep.endpoint} | ${ep.service} | ${ep.port || ''} | ${ep.external ? 'yes' : 'no'} |`);
  }
  lines.push('');
  lines.push('## Comms matrix');
  lines.push('');
  lines.push('| From | To | Protocol | Port | Direction | Requirement |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  if (ctx.edges.length === 0) lines.push('| (none) | | | | | |');
  for (const e of ctx.edges) {
    lines.push(`| ${e.from} | ${e.to} | ${e.protocol} | ${e.port || ''} | ${e.direction} | ${e.requirement} |`);
  }
  lines.push('');
  lines.push('## Quota (namespace totals)');
  lines.push('');
  if (ctx.quota.gap) {
    lines.push(ctx.quota.gap);
  } else {
    lines.push('| Resource | Value | Basis |');
    lines.push('| --- | --- | --- |');
    for (const r of ctx.quota.rows) lines.push(`| ${r.resource} | ${r.value} | ${r.basis} |`);
  }
  lines.push('');
  lines.push('## Network');
  lines.push('');
  lines.push(model.network || '(none)');
  lines.push('');
  lines.push('## Artifacts & storage');
  lines.push('');
  lines.push('| Path | Purpose |');
  lines.push('| --- | --- |');
  if (model.artifacts.length === 0) lines.push('| (none) | |');
  for (const a of model.artifacts) lines.push(`| ${a.path} | ${a.purpose} |`);
  lines.push('');
  lines.push('## Open blockers (platform team)');
  lines.push('');
  if (model.blockers.length === 0) lines.push('None — no open them-owned blockers.');
  for (const b of model.blockers) lines.push(`- ${b}`);
  lines.push('');
  lines.push('## Coverage gaps');
  lines.push('');
  if (ctx.coverageGaps.length === 0) lines.push('None.');
  for (const g of ctx.coverageGaps) lines.push(`- ${g.what}: ${g.why}`);
  lines.push('');
  lines.push('## Verification');
  lines.push('');
  const qa = model.qa;
  const qaRows: string[] = [];
  if (qa.parity) qaRows.push(`| parity | ${qa.parity.env} | ${qa.parity.ok ? 'ok' : 'FAILED'} | ${qa.parity.at} |`);
  if (qa.smoke) qaRows.push(`| smoke | ${qa.smoke.env} | ${qa.smoke.ok ? 'ok' : 'FAILED'} | ${qa.smoke.at} |`);
  if (qa.prod) qaRows.push(`| prod e2e | ${qa.prod.env} | ${qa.prod.ok ? 'ok' : 'FAILED'} | ${qa.prod.at} |`);
  if (qaRows.length === 0) {
    lines.push('None recorded.');
  } else {
    lines.push('| Check | Environment | Result | When |');
    lines.push('| --- | --- | --- | --- |');
    lines.push(...qaRows);
  }
  lines.push('');
  lines.push('## Topology');
  lines.push('');
  lines.push('```mermaid');
  lines.push('graph TD');
  for (const c of ctx.components) {
    lines.push(`  ${nodeId('d_', c.name)}["${mermaidLabel(c.name)}<br/>${mermaidLabel(c.image)}"]`);
  }
  for (const e of ctx.edges) {
    if (e.from !== 'ingress') {
      lines.push(`  ${nodeId('s_', e.from)} --> ${nodeId('d_', e.to)}`);
    }
  }
  lines.push('```');
  lines.push('');
  lines.push('## Comms flow');
  lines.push('');
  lines.push('```mermaid');
  lines.push('flowchart LR');
  for (const e of ctx.edges) {
    const from = e.from === 'ingress' ? 'ingress' : nodeId('s_', e.from);
    const to = e.to === e.from ? nodeId('d_', e.to) : nodeId(e.from === 'ingress' ? 's_' : 'd_', e.to);
    lines.push(`  ${from} -->|${e.port}| ${to}`);
  }
  lines.push('```');
  return lines.join('\n');
}

// ---------------------------------------------------------------- public API

/** Render the Kubernetes dialect from the committed manifests. */
export function renderK8sDialect(repo: string, model: HandoffModel): K8sDialectRender {
  let profile: KubernetesDeploymentProfile;
  try {
    profile = readProfile(repo);
  } catch (e) {
    return blocked('BLOCKED_DEPLOYMENT_PROFILE', (e as Error).message);
  }

  const coverageWarnings: string[] = [];
  const coverageGaps: HandoffCoverageGap[] = [];
  const environments: HandoffEnvironment[] = [];
  const components: HandoffComponent[] = [];
  const edges: HandoffEdge[] = [];
  const endpoints: { endpoint: string; service: string; port: number; external: boolean }[] = [];
  const seenComponents = new Set<string>();
  const seenEdges = new Set<string>();

  for (const env of profile.environments) {
    const dir = join(repo, env.manifestsPath);
    const files = listYaml(dir);
    if (files.length === 0) {
      return blocked('BLOCKED_MANIFESTS', `no committed manifests at ${env.manifestsPath}`);
    }
    let digest: string | null;
    try {
      digest = computeEnvDigest(repo, env.manifestsPath);
    } catch (e) {
      return blocked('BLOCKED_MANIFESTS', (e as Error).message);
    }
    if (digest === null) {
      return blocked('BLOCKED_MANIFESTS', `no committed manifests at ${env.manifestsPath}`);
    }
    environments.push({
      name: env.name,
      branch: env.branch,
      argoApplication: env.argoApplication,
      manifestsPath: env.manifestsPath,
      digest,
    });

    const docs: YNode[] = [];
    for (const f of files) {
      const parsed = parseManifestDocuments(readFileSync(join(dir, f), 'utf8'));
      if (parsed.errors.length > 0) {
        return blocked('BLOCKED_MANIFESTS', `${f}: ${parsed.errors.map((e) => e.message).join('; ')}`);
      }
      docs.push(...parsed.docs);
    }
    const derived = deriveFromDocs(docs);
    for (const c of derived.components) {
      if (!seenComponents.has(c.name)) {
        seenComponents.add(c.name);
        components.push(c);
      }
    }
    for (const e of derived.edges) {
      const key = `${e.from}->${e.to}:${e.port}`;
      if (!seenEdges.has(key)) {
        seenEdges.add(key);
        edges.push(e);
      }
    }
    for (const ep of derived.endpoints) {
      if (!endpoints.some((x) => x.endpoint === ep.endpoint)) endpoints.push(ep);
    }
    coverageGaps.push(...derived.coverageGaps);
  }

  // Lab-prep endpoints the manifests did not already cover: derive host/port,
  // or record a coverage gap.
  for (const ep of model.endpoints) {
    if (ep.url === '' || endpoints.some((x) => x.endpoint === ep.url)) continue;
    const parsed = parseEndpointUrl(ep.url);
    if (parsed === null || parsed.port === 0) {
      coverageGaps.push({ what: `endpoint ${ep.url}`, why: 'no derivable host:port from the URL' });
    } else {
      endpoints.push({ endpoint: ep.url, service: parsed.host, port: parsed.port, external: true });
    }
  }

  const labId = profile.labId;
  const namespace = profile.namespace;
  if (!LAB_ID_RE.test(labId)) {
    coverageWarnings.push(`labId "${labId}" does not match ^hol-\\d{4}-\\d{2}$`);
  }
  if (namespace !== labId) {
    coverageWarnings.push(`namespace "${namespace}" does not equal labId "${labId}"`);
  }
  if (model.catalogueId !== null && !CATALOGUE_ID_RE.test(model.catalogueId)) {
    coverageWarnings.push(`catalogue id "${model.catalogueId}" does not match ^HOL-\\d{4}-\\d{2}$`);
  }

  const quota = quotaRows(model);
  if (quota.gap) coverageGaps.push({ what: 'namespace quota', why: quota.gap });

  const markdown = renderMarkdown(model, {
    labId,
    namespace,
    environments,
    components,
    edges,
    endpoints,
    quota,
    coverageGaps,
  });

  return {
    classification: 'PASS',
    message: 'rendered',
    markdown,
    labId,
    namespace,
    components,
    edges,
    environments,
    coverageWarnings,
    coverageGaps,
  };
}

/** Recomputed manifest digests vs the cited environment-table digests (HND-011). */
export function checkK8sDigestAgreement(rows: string[], repo: string): { ok: boolean; detail: string } {
  let profile: KubernetesDeploymentProfile;
  try {
    profile = readProfile(repo);
  } catch (e) {
    return { ok: false, detail: (e as Error).message };
  }
  const mismatches: string[] = [];
  for (const row of rows) {
    const cells = row.split('|').map((c) => c.trim()).filter((c) => c !== '');
    const envName = cells[0] ?? '';
    const cited = cells[cells.length - 1] ?? '';
    const env = profile.environments.find((e) => e.name === envName);
    if (!env) {
      mismatches.push(`environment ${envName} not in profile`);
      continue;
    }
    let computed: string | null;
    try {
      computed = computeEnvDigest(repo, env.manifestsPath);
    } catch (e) {
      return { ok: false, detail: (e as Error).message };
    }
    if (computed === null) {
      mismatches.push(`environment ${envName}: no committed manifests`);
    } else if (computed !== cited) {
      mismatches.push(`environment ${envName}: cited ${cited.slice(0, 12)}… != computed ${computed.slice(0, 12)}…`);
    }
  }
  return {
    ok: mismatches.length === 0,
    detail: mismatches.length === 0 ? `${rows.length} environment digest(s) match` : mismatches.join('; '),
  };
}
