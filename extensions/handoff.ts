/**
 * Platform handoff (spec-k8s/09) — the platform-neutral core.
 *
 * A deterministic renderer (`renderHandoff`) plus a deterministic gate
 * (`checkHandoff`). No agent and no rubric: handoff quality is exactly
 * source-artifact completeness (coverage warnings) and digest agreement (the
 * gate). The shared model below carries the fields every dialect reads; a
 * dialect fills the components/edges/quota it can derive and leaves the rest
 * as coverage gaps (HND-001, HND-002, ADR-022).
 *
 * Dialects:
 *   - Kubernetes — `extensions/k8s/handoff-k8s.ts` (in scope).
 *   - vCD        — deferred (ADR-022); a lab declaring only `vcd` is BLOCKED.
 *
 * Fail-closed taxonomy (HND-009, ARC-004): PASS, PASS_WITH_WARNINGS
 * (coverage only), FAIL (an executed check disagreed), BLOCKED (an input
 * absent or unparseable). The render timestamp lives only in
 * `.holagent/handoff/render.json` (HND-003); the artifact is byte-identical
 * for identical inputs.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseFrontmatter, type FmMap } from './frontmatter.ts';
import {
  atomicWriteJson,
  readLabRef,
  readPlan,
  readQaSummary,
  type LabRef,
} from './hol-core.ts';
import { renderK8sDialect } from './k8s/handoff-k8s.ts';
import { redactText } from './k8s/redact.ts';

// ---------------------------------------------------------------- taxonomy

export type HandoffClassification = 'PASS' | 'PASS_WITH_WARNINGS' | 'FAIL' | 'BLOCKED';

const SUBCODE_RE = /^BLOCKED_[A-Z0-9_]+$/;

export function isHandoffSubcode(v: string): boolean {
  return SUBCODE_RE.test(v);
}

// ------------------------------------------------------------- Mermaid check

export interface MermaidCheck {
  ok: boolean;
  problems: string[];
  warnings: string[];
}

const MERMAID_DIRECTIONS = new Set(['TD', 'TB', 'LR', 'RL', 'BT']);
const EDGE_ARROWS = ['-.->', '-->', '==>', '---'] as const;

/** First index of an edge arrow not inside a quoted string, or -1. */
function arrowIndexOutsideQuotes(t: string): number {
  let quote: string | null = null;
  for (let i = 0; i < t.length; i += 1) {
    const ch = t[i]!;
    if (quote !== null) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '-' || ch === '=') {
      for (const a of EDGE_ARROWS) {
        if (t.startsWith(a, i)) return i;
      }
    }
  }
  return -1;
}

interface EdgeParse {
  ok: boolean;
  nodes?: string[];
  problem?: string;
}

/**
 * Parse one edge line against the supported subset: a chain of
 * `id (-->|--->|---|-.->|==>) ("|"label"|")? id`. Labels must follow the
 * arrow (`A -->|x| B`); the label-before-arrow form (`A -- x --> B`) is
 * outside the subset.
 */
function parseEdgeLine(t: string): EdgeParse {
  const tokens: { type: 'id' | 'arrow' | 'label'; value: string }[] = [];
  let i = 0;
  const n = t.length;
  while (i < n) {
    const ch = t[i]!;
    if (ch === '|') {
      const close = t.indexOf('|', i + 1);
      if (close === -1) return { ok: false, problem: 'unclosed |label|' };
      tokens.push({ type: 'label', value: t.slice(i + 1, close) });
      i = close + 1;
      continue;
    }
    const arrow = EDGE_ARROWS.find((a) => t.startsWith(a, i));
    if (arrow !== undefined) {
      tokens.push({ type: 'arrow', value: arrow });
      i += arrow.length;
      continue;
    }
    const idm = t.slice(i).match(/^[A-Za-z][A-Za-z0-9_-]*/);
    if (idm) {
      tokens.push({ type: 'id', value: idm[0]! });
      i += idm[0]!.length;
      continue;
    }
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    return { ok: false, problem: `unexpected character "${ch}" in edge line` };
  }

  let idx = 0;
  const nodes: string[] = [];
  if (idx >= tokens.length || tokens[idx]!.type !== 'id') {
    return { ok: false, problem: 'edge must start with a node id' };
  }
  nodes.push(tokens[idx]!.value);
  idx += 1;
  let sawArrow = false;
  while (idx < tokens.length) {
    const tok = tokens[idx]!;
    if (tok.type !== 'arrow') {
      if (tok.type === 'id') {
        return {
          ok: false,
          problem: 'label-before-arrow form is outside the supported subset — use -->|label|',
        };
      }
      return { ok: false, problem: `expected an edge arrow, got "${tok.value}"` };
    }
    sawArrow = true;
    idx += 1;
    while (idx < tokens.length && tokens[idx]!.type === 'label') idx += 1;
    if (idx >= tokens.length || tokens[idx]!.type !== 'id') {
      return { ok: false, problem: 'edge arrow must be followed by a node id (after optional |label|)' };
    }
    nodes.push(tokens[idx]!.value);
    idx += 1;
  }
  if (!sawArrow) return { ok: false, problem: 'no edge arrow found' };
  return { ok: true, nodes };
}

/**
 * Line-based Mermaid subset check (HND-007): deterministic, no grammar
 * dependency. Rejects unbalanced `subgraph`/`end`, undeclared node/class
 * references and malformed edge syntax. Constructs outside the subset are
 * coverage warnings, not parse failures.
 */
export function checkMermaid(text: string): MermaidCheck {
  const lines = text.split(/\r?\n/);
  const problems: string[] = [];
  const warnings: string[] = [];
  const nodes = new Set<string>();
  const classes = new Set<string>();
  let subgraphDepth = 0;
  let headerSeen = false;

  for (let i = 0; i < lines.length; i += 1) {
    const t = (lines[i] ?? '').trim();
    if (t === '' || t.startsWith('%%')) continue;

    if (!headerSeen) {
      const h = t.match(/^(graph|flowchart)\s+([A-Za-z]+)/i);
      if (!h) {
        problems.push(`L${i + 1}: expected a graph/flowchart header`);
        continue;
      }
      headerSeen = true;
      if (!MERMAID_DIRECTIONS.has(h[2]!.toUpperCase())) {
        warnings.push(`L${i + 1}: direction "${h[2]}" is outside the supported subset`);
      }
      continue;
    }

    if (/^subgraph\b/.test(t)) {
      subgraphDepth += 1;
      const m = t.match(/^subgraph\s+([A-Za-z][A-Za-z0-9_-]*)/);
      if (m) nodes.add(m[1]!);
      continue;
    }
    if (t === 'end') {
      subgraphDepth -= 1;
      if (subgraphDepth < 0) {
        problems.push(`L${i + 1}: "end" without a matching "subgraph"`);
        subgraphDepth = 0;
      }
      continue;
    }
    if (/^classDef\b/.test(t)) {
      const m = t.match(/^classDef\s+([A-Za-z][A-Za-z0-9_-]*)\b/);
      if (!m) problems.push(`L${i + 1}: cannot parse classDef`);
      else classes.add(m[1]!);
      continue;
    }
    if (/^class\b/.test(t)) {
      const m = t.match(/^class\s+([^\s]+)\s+([A-Za-z][A-Za-z0-9_-]*)\s*$/);
      if (!m) {
        warnings.push(`L${i + 1}: class line outside the supported subset`);
        continue;
      }
      if (!classes.has(m[2]!)) {
        problems.push(`L${i + 1}: class references undeclared class "${m[2]}"`);
      }
      for (const id of m[1]!.split(',').map((s) => s.trim()).filter((s) => s !== '')) {
        if (!nodes.has(id)) problems.push(`L${i + 1}: class references undeclared node "${id}"`);
      }
      continue;
    }
    const ai = arrowIndexOutsideQuotes(t);
    if (ai !== -1) {
      const edge = parseEdgeLine(t);
      if (!edge.ok) problems.push(`L${i + 1}: ${edge.problem}`);
      else (edge.nodes ?? []).forEach((id) => nodes.add(id));
      continue;
    }
    const nm = t.match(/^([A-Za-z][A-Za-z0-9_-]*)(.*)$/);
    if (!nm) {
      warnings.push(`L${i + 1}: line outside the supported subset (ignored)`);
      continue;
    }
    nodes.add(nm[1]!);
    const rest = (nm[2] ?? '').trim();
    if (rest !== '' && !/^(\[.*\]|\[\[.*\]\]|\(.*\)|\(\(.*\)\)|\{.*\}|>.*\])$/.test(rest)) {
      warnings.push(`L${i + 1}: node shape outside the supported subset (ignored)`);
    }
  }

  if (subgraphDepth !== 0) {
    problems.push(`unbalanced subgraph/end: ${subgraphDepth} unclosed`);
  }
  return { ok: problems.length === 0, problems, warnings };
}

// ---------------------------------------------------------------- model

export interface HandoffCoverageGap {
  what: string;
  why: string;
}

export interface HandoffComponentPort {
  containerPort?: number;
  servicePort?: number;
  protocol?: string;
}

export interface HandoffComponent {
  name: string;
  image: string;
  ports: HandoffComponentPort[];
  probePath?: string;
  resources?: string;
}

export interface HandoffEdge {
  from: string;
  to: string;
  protocol: string;
  port: number;
  direction: string;
  requirement: string;
}

export interface HandoffEnvironment {
  name: string;
  branch: string;
  argoApplication: string;
  manifestsPath: string;
  digest: string;
}

export interface HandoffQa {
  parity: { ok: boolean; env: string; at: string; passed: number; failed: number } | null;
  smoke: { ok: boolean; env: string; at: string } | null;
  prod: { ok: boolean; env: string; at: string } | null;
}

export interface HandoffModel {
  labId: string | null;
  catalogueId: string | null;
  namespace: string | null;
  platform: 'k8s' | 'vcd' | null;
  baseline: string;
  network: string;
  deploymentTarget: string | null;
  concurrencyTarget: number | null;
  footprint: {
    gpu: string;
    vramGb: number;
    vcpu: number;
    ramGb: number;
    storageGb: number;
  } | null;
  software: { name: string; version: string; where: string }[];
  endpoints: { url: string; purpose: string }[];
  artifacts: { path: string; purpose: string }[];
  components: HandoffComponent[];
  edges: HandoffEdge[];
  environments: HandoffEnvironment[];
  blockers: string[];
  coverageGaps: HandoffCoverageGap[];
  qa: HandoffQa;
}

const LAB_ID_RE = /^hol-\d{4}-\d{2}$/;
const CATALOGUE_ID_RE = /^HOL-\d{4}-\d{2}$/;

export { LAB_ID_RE, CATALOGUE_ID_RE };

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/** Digest of a file, or null when absent/unreadable. */
function fileDigest(path: string): string | null {
  try {
    return sha256(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/** Secret material in `text`, detected by whether redaction changes it. */
export function detectSecrets(text: string): boolean {
  return redactText(text) !== text;
}

/** Parse `scheme://host[:port]`; null when not a URL, port 0 when no scheme default. */
export function parseEndpointUrl(url: string): { host: string; port: number; protocol: string } | null {
  const m = url.trim().match(/^([a-z][a-z0-9+.-]*):\/\/([^/:]+)(?::(\d+))?/i);
  if (!m) return null;
  const protocol = m[1]!.toLowerCase();
  const host = m[2]!;
  const port = m[3] ? Number(m[3]) : protocol === 'https' ? 443 : protocol === 'http' ? 80 : 0;
  return { host, port, protocol };
}

function rowStrings(data: FmMap, key: string): Record<string, string>[] {
  const v = data[key];
  if (!Array.isArray(v)) return [];
  return v
    .filter((r): r is FmMap => typeof r === 'object' && r !== null && !Array.isArray(r))
    .map((r) => {
      const out: Record<string, string> = {};
      for (const [k, val] of Object.entries(r)) {
        if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
          out[k] = String(val);
        }
      }
      return out;
    });
}

function readLabPrep(guideDir: string): Pick<HandoffModel, 'baseline' | 'network' | 'software' | 'endpoints' | 'artifacts'> {
  const out = { baseline: '', network: '', software: [], endpoints: [], artifacts: [] } as Pick<
    HandoffModel,
    'baseline' | 'network' | 'software' | 'endpoints' | 'artifacts'
  >;
  let fm;
  try {
    fm = parseFrontmatter(readFileSync(join(guideDir, 'lab-prep.md'), 'utf8'));
  } catch {
    return out;
  }
  if (!fm) return out;
  const d = fm.data;
  out.baseline = typeof d.baseline === 'string' ? d.baseline : '';
  out.network = typeof d.network === 'string' ? d.network : '';
  out.software = rowStrings(d, 'software').map((r) => ({
    name: r.name ?? '',
    version: r.version ?? '',
    where: r.where ?? '',
  }));
  out.endpoints = rowStrings(d, 'endpoints').map((r) => ({ url: r.url ?? '', purpose: r.purpose ?? '' }));
  out.artifacts = rowStrings(d, 'artifacts').map((r) => ({ path: r.path ?? '', purpose: r.purpose ?? '' }));
  return out;
}

function readSizing(
  guideDir: string,
): { deploymentTarget: string | null; concurrencyTarget: number | null; footprint: NonNullable<HandoffModel['footprint']> } | null {
  let fm;
  try {
    fm = parseFrontmatter(readFileSync(join(guideDir, '.holagent', 'sizing.md'), 'utf8'));
  } catch {
    return null;
  }
  if (!fm) return null;
  const d = fm.data;
  const fp =
    typeof d.demo_footprint === 'object' && d.demo_footprint !== null && !Array.isArray(d.demo_footprint)
      ? (d.demo_footprint as FmMap)
      : {};
  const num = (v: unknown): number =>
    typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) || 0 : 0;
  const concurrency =
    typeof d.concurrency_target === 'number'
      ? d.concurrency_target
      : typeof d.concurrency_target === 'string' && d.concurrency_target.trim() !== ''
        ? Number(d.concurrency_target) || null
        : null;
  return {
    deploymentTarget: typeof d.deployment_target === 'string' ? d.deployment_target : null,
    concurrencyTarget: concurrency,
    footprint: {
      gpu: typeof fp.gpu === 'string' ? fp.gpu : fp.gpu === undefined ? '' : String(fp.gpu),
      vramGb: num(fp.vram_gb),
      vcpu: num(fp.vcpu),
      ramGb: num(fp.ram_gb),
      storageGb: num(fp.storage_gb),
    },
  };
}

/** Open `them`-owned blockers from `.holagent/platform/<name>.json`. */
function readThemBlockers(guideDir: string, platform: string): string[] {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(join(guideDir, '.holagent', 'platform', `${platform}.json`), 'utf8'));
  } catch {
    return [];
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return [];
  const findings = (raw as Record<string, unknown>).findings;
  if (!Array.isArray(findings)) return [];
  return findings
    .filter(
      (f): f is Record<string, unknown> =>
        typeof f === 'object' && f !== null && f.owner === 'them' && f.severity === 'blocker',
    )
    .map((f) => `${String(f.id ?? '?' )}: ${String(f.action ?? '')}`);
}

/** Resolve the lab repo through `lab-ref.json` (ADR-021); null when absent/invalid. */
function resolveRepo(repo: string): string | null {
  let real: string;
  try {
    real = realpathSync(repo);
  } catch {
    return null;
  }
  try {
    if (!statSync(real).isDirectory()) return null;
  } catch {
    return null;
  }
  return real;
}

/** Build the shared model (HND-001): derived, never re-interviewed. */
export function buildHandoffModel(guideDir: string, labRef: LabRef): HandoffModel {
  const prep = readLabPrep(guideDir);
  const sizing = readSizing(guideDir);
  const plan = readPlan(guideDir);
  const platform: HandoffModel['platform'] =
    labRef.platforms.length === 1
      ? labRef.platforms[0] === 'k8s'
        ? 'k8s'
        : labRef.platforms[0] === 'vcd'
          ? 'vcd'
          : null
      : null;
  const blockers = platform ? readThemBlockers(guideDir, platform) : [];
  return {
    labId: null,
    catalogueId: plan.id ?? null,
    namespace: null,
    platform,
    baseline: prep.baseline,
    network: prep.network,
    deploymentTarget: sizing?.deploymentTarget ?? null,
    concurrencyTarget: sizing?.concurrencyTarget ?? null,
    footprint: sizing?.footprint ?? null,
    software: prep.software,
    endpoints: prep.endpoints,
    artifacts: prep.artifacts,
    components: [],
    edges: [],
    environments: [],
    blockers,
    coverageGaps: [],
    qa: readQaSummary(guideDir),
  };
}

// ---------------------------------------------------------------- render

export interface HandoffRenderResult {
  classification: HandoffClassification;
  subcode?: string;
  message: string;
  /** Output files written, relative to the repo root. */
  outputFiles: string[];
  deferred: string[];
  coverageWarnings: string[];
  renderJsonPath: string | null;
}

/** Write `content` only when safe (ADR-021: never overwrite what we didn't generate). */
function writeGenerated(
  outPath: string,
  content: string,
  lastDigest: string | null,
  overwrite: boolean,
): { ok: boolean; wrote: boolean; reason?: string } {
  if (existsSync(outPath)) {
    const existing = readFileSync(outPath, 'utf8');
    if (existing === content) return { ok: true, wrote: false };
    if (!overwrite && existing !== content && sha256(existing) !== lastDigest) {
      return {
        ok: false,
        wrote: false,
        reason: 'existing file was not generated by this tool (hand-authored?) — pass overwrite=true to replace it',
      };
    }
  }
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, content);
  return { ok: true, wrote: true };
}

/**
 * Render the handoff into the lab repo (ADR-021). Reads local files only and
 * never contacts a cluster, GitLab, Argo or the platform team (HND-003).
 */
export function renderHandoff(guideDir: string, overwrite = false): HandoffRenderResult {
  const labRef = readLabRef(guideDir);
  if (!labRef) {
    return blocked('BLOCKED_LAB_REF', 'no .holagent/lab-ref.json — register the lab repo first');
  }
  const platforms = labRef.platforms;
  if (platforms.length === 0) {
    return blocked('BLOCKED_NO_PLATFORM', 'lab-ref.platforms is empty — nothing shippable to render');
  }

  const repo = resolveRepo(labRef.repo);
  if (repo === null) {
    return blocked('BLOCKED_REPO', `lab repo is not a readable directory: ${labRef.repo}`);
  }

  // lab-prep.md is a hard input (HND-009): missing → BLOCKED.
  const labPrepPath = join(guideDir, 'lab-prep.md');
  if (!existsSync(labPrepPath)) {
    return blocked('BLOCKED_LAB_PREP', 'lab-prep.md is missing — the environment contract is a hard input');
  }

  const model = buildHandoffModel(guideDir, labRef);
  const coverageWarnings: string[] = [];
  if (platforms.length > 1) {
    coverageWarnings.push(`more than one platform declared (${platforms.join(', ')}) — HND-002b expects exactly one`);
  }

  // lab-prep.md legitimately carries credentials (that is its purpose); the
  // renderer never echoes them. Secret-free is enforced on the rendered
  // output (HND-010), the profile and the manifests — not on lab-prep itself.
  const renderJsonPath = join(guideDir, '.holagent', 'handoff', 'render.json');
  const lastDigests = readRenderDigests(renderJsonPath);

  const outputFiles: string[] = [];
  const deferred: string[] = [];
  const records: { dialect: string; file: string; digest: string }[] = [];

  for (const platform of platforms) {
    if (platform === 'k8s') {
      const rendered = renderK8sDialect(repo, model);
      if (rendered.classification === 'BLOCKED') {
        return blocked(rendered.subcode ?? 'BLOCKED_MANIFESTS', rendered.message);
      }
      if (rendered.classification === 'FAIL') {
        return { classification: 'FAIL', message: rendered.message, outputFiles, deferred, coverageWarnings, renderJsonPath: null };
      }
      coverageWarnings.push(...rendered.coverageWarnings);
      model.components = rendered.components;
      model.edges = rendered.edges;
      model.environments = rendered.environments;
      model.labId = rendered.labId;
      model.namespace = rendered.namespace;
      model.coverageGaps.push(...rendered.coverageGaps);

      if (detectSecrets(rendered.markdown)) {
        return {
          classification: 'FAIL',
          message: 'secret material detected in the rendered handoff (derived from manifests or profile)',
          outputFiles,
          deferred,
          coverageWarnings,
          renderJsonPath: null,
        };
      }

      const outPath = join(repo, 'handoff', 'k8s.md');
      const write = writeGenerated(outPath, rendered.markdown, lastDigests['handoff/k8s.md'] ?? null, overwrite);
      if (!write.ok) {
        return blocked('BLOCKED_OVERWRITE', write.reason ?? 'refusing to overwrite a non-generated handoff');
      }
      outputFiles.push('handoff/k8s.md');
      records.push({ dialect: 'k8s', file: 'handoff/k8s.md', digest: sha256(rendered.markdown) });
    } else if (platform === 'vcd') {
      deferred.push('vcd');
    } else {
      coverageWarnings.push(`unknown platform "${platform}" — no dialect`);
    }
  }

  if (outputFiles.length === 0) {
    return blocked('BLOCKED_DEFERRED_DIALECT', `nothing to render — deferred dialects: ${deferred.join(', ') || 'none'}`);
  }

  atomicWriteJson(renderJsonPath, {
    at: new Date().toISOString(),
    labId: model.labId,
    inputDigests: {
      'lab-ref.json': fileDigest(join(guideDir, '.holagent', 'lab-ref.json')),
      'lab-prep.md': fileDigest(join(guideDir, 'lab-prep.md')),
      'sizing.md': fileDigest(join(guideDir, '.holagent', 'sizing.md')),
      'plan.md': fileDigest(join(guideDir, '.holagent', 'plan.md')),
      'deployment-profile.yaml': fileDigest(join(repo, 'deployment-profile.yaml')),
    },
    dialects: records,
    coverageWarnings,
    deferred,
  });

  const classification: HandoffClassification =
    coverageWarnings.length > 0 || deferred.length > 0 ? 'PASS_WITH_WARNINGS' : 'PASS';
  return {
    classification,
    message: `rendered ${outputFiles.join(', ')}${deferred.length ? `; deferred: ${deferred.join(', ')}` : ''}`,
    outputFiles,
    deferred,
    coverageWarnings,
    renderJsonPath,
  };
}

function blocked(subcode: string, message: string): HandoffRenderResult {
  return { classification: 'BLOCKED', subcode, message, outputFiles: [], deferred: [], coverageWarnings: [], renderJsonPath: null };
}

function readRenderDigests(renderJsonPath: string): Record<string, string> {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(renderJsonPath, 'utf8'));
  } catch {
    return {};
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const dialects = (raw as Record<string, unknown>).dialects;
  if (!Array.isArray(dialects)) return {};
  const out: Record<string, string> = {};
  for (const d of dialects) {
    if (typeof d === 'object' && d !== null && !Array.isArray(d)) {
      const rec = d as Record<string, unknown>;
      if (typeof rec.file === 'string' && typeof rec.digest === 'string') out[rec.file] = rec.digest;
    }
  }
  return out;
}

// ---------------------------------------------------------------- gate

export interface HandoffCheckResult {
  classification: HandoffClassification;
  subcode?: string;
  checks: { name: string; ok: boolean; detail: string }[];
  coverageWarnings: string[];
  deferred: string[];
}

/** Extract fenced ```mermaid blocks (deterministic, no Markdown AST). */
export function extractMermaidBlocks(markdown: string): string[] {
  const out: string[] = [];
  const lines = markdown.split(/\r?\n/);
  let inBlock = false;
  let buf: string[] = [];
  for (const line of lines) {
    const m = line.trim().match(/^```mermaid\b/i);
    if (!inBlock && m) {
      inBlock = true;
      buf = [];
      continue;
    }
    if (inBlock && line.trim() === '```') {
      inBlock = false;
      out.push(buf.join('\n'));
      continue;
    }
    if (inBlock) buf.push(line);
  }
  return out;
}

/**
 * The deterministic gate (HND-011): the handoff analogue of `hol_launch_check`.
 * Verifies the rendered artifact is complete, consistent and secret-free, and
 * that its cited manifest digests still match the committed manifests.
 */
export function checkHandoff(guideDir: string): HandoffCheckResult {
  const checks: { name: string; ok: boolean; detail: string }[] = [];
  const coverageWarnings: string[] = [];
  const deferred: string[] = [];
  const labRef = readLabRef(guideDir);
  if (!labRef) {
    return { classification: 'BLOCKED', subcode: 'BLOCKED_LAB_REF', checks, coverageWarnings, deferred };
  }
  const platforms = labRef.platforms;
  if (platforms.length === 0) {
    return { classification: 'BLOCKED', subcode: 'BLOCKED_NO_PLATFORM', checks, coverageWarnings, deferred };
  }
  const repo = resolveRepo(labRef.repo);
  if (repo === null) {
    return { classification: 'BLOCKED', subcode: 'BLOCKED_REPO', checks, coverageWarnings, deferred };
  }

  let implemented = 0;
  for (const platform of platforms) {
    if (platform === 'vcd') {
      deferred.push('vcd');
    } else if (platform === 'k8s') {
      implemented += 1;
    } else {
      coverageWarnings.push(`unknown platform "${platform}"`);
    }
  }
  if (implemented === 0) {
    return { classification: 'BLOCKED', subcode: 'BLOCKED_DEFERRED_DIALECT', checks, coverageWarnings, deferred };
  }

  const handoffPath = join(repo, 'handoff', 'k8s.md');
  if (!existsSync(handoffPath)) {
    checks.push({ name: 'dialect-present', ok: false, detail: 'handoff/k8s.md is missing — run hol_handoff_render' });
    return { classification: 'FAIL', checks, coverageWarnings, deferred };
  }
  const markdown = readFileSync(handoffPath, 'utf8');

  // FILL markers.
  const unfilled = markdown.split(/\r?\n/).filter((l) => l.includes('<< FILL: '));
  checks.push({ name: 'no-fill-markers', ok: unfilled.length === 0, detail: unfilled.length === 0 ? 'none' : `${unfilled.length} unfilled marker(s)` });

  // Mermaid: exactly two blocks, both parse.
  const blocks = extractMermaidBlocks(markdown);
  const mermaidOk = blocks.length === 2 && blocks.every((b) => checkMermaid(b).ok);
  checks.push({
    name: 'mermaid',
    ok: mermaidOk,
    detail:
      blocks.length !== 2
        ? `expected 2 mermaid blocks, found ${blocks.length}`
        : blocks.map((b, i) => `${i + 1}: ${checkMermaid(b).ok ? 'ok' : checkMermaid(b).problems.join('; ')}`).join(' | '),
  });

  // Identifiers (HND-012).
  const ident = checkIdentifiers(markdown);
  checks.push({ name: 'identifiers', ok: ident.ok, detail: ident.detail });

  // Secret-free (HND-010).
  const secrets = detectSecrets(markdown);
  checks.push({ name: 'secret-free', ok: !secrets, detail: secrets ? 'secret material present' : 'none' });

  // Digest agreement (k8s annex).
  const digest = checkDigestAgreement(markdown, repo);
  checks.push({ name: 'manifest-digest', ok: digest.ok, detail: digest.detail });

  // Minimum content (HND-011a).
  const minimum = checkMinimumContent(markdown);
  checks.push({ name: 'minimum-content', ok: minimum.ok, detail: minimum.detail });

  // Coverage: every declared endpoint appears in the artifact.
  const coverage = checkEndpointCoverage(guideDir, markdown);
  checks.push({ name: 'endpoint-coverage', ok: coverage.ok, detail: coverage.detail });
  coverageWarnings.push(...coverage.gaps);

  const failed = checks.filter((c) => !c.ok);
  const classification: HandoffClassification =
    failed.length > 0 ? 'FAIL' : coverageWarnings.length > 0 || deferred.length > 0 ? 'PASS_WITH_WARNINGS' : 'PASS';
  return { classification, checks, coverageWarnings, deferred };
}

function checkIdentifiers(markdown: string): { ok: boolean; detail: string } {
  const labId = markdown.match(/Operational \(namespace, GitLab project\):\s*`([^`]+)`/);
  const catalogueId = markdown.match(/Catalogue \(plan\.md id\):\s*`([^`]+)`/);
  const problems: string[] = [];
  if (!labId) problems.push('operational identifier not rendered');
  else if (!LAB_ID_RE.test(labId[1]!)) problems.push(`labId "${labId[1]}" does not match ^hol-\\d{4}-\\d{2}$`);
  if (!catalogueId) problems.push('catalogue identifier not rendered');
  else if (!CATALOGUE_ID_RE.test(catalogueId[1]!)) problems.push(`catalogue id "${catalogueId[1]}" does not match ^HOL-\\d{4}-\\d{2}$`);
  return { ok: problems.length === 0, detail: problems.join('; ') || 'both identifiers present and well-formed' };
}

function checkDigestAgreement(markdown: string, repo: string): { ok: boolean; detail: string } {
  const rows = tableRows(markdown, '## Environments');
  if (rows.length === 0) return { ok: false, detail: 'no environment digest rows rendered' };
  return checkK8sDigestAgreement(rows, repo);
}

function checkMinimumContent(markdown: string): { ok: boolean; detail: string } {
  // Component table rows: lines under "## Components" starting with "| " and not a header/separator.
  const componentRows = tableRows(markdown, '## Components');
  const edgeRows = tableRows(markdown, '## Comms matrix');
  const ok = componentRows.length >= 1 && (edgeRows.length >= 1 || componentRows.length === 1);
  return {
    ok,
    detail: `${componentRows.length} component row(s), ${edgeRows.length} comms edge(s)`,
  };
}

function tableRows(markdown: string, heading: string): string[] {
  const lines = markdown.split(/\r?\n/);
  let inSection = false;
  let sawHeader = false;
  const rows: string[] = [];
  for (const line of lines) {
    if (line.trim() === heading) {
      inSection = true;
      sawHeader = false;
      continue;
    }
    if (inSection && line.startsWith('## ')) break;
    if (!inSection || !/^\| /.test(line)) continue;
    if (!sawHeader) {
      sawHeader = true;
      continue; // header row
    }
    if (/^\|[\s:|-]+\|$/.test(line)) continue; // separator row
    rows.push(line);
  }
  return rows;
}

function checkEndpointCoverage(guideDir: string, markdown: string): { ok: boolean; detail: string; gaps: string[] } {
  const prep = readLabPrep(guideDir);
  const gaps: string[] = [];
  for (const ep of prep.endpoints) {
    if (ep.url !== '' && !markdown.includes(ep.url)) {
      gaps.push(`endpoint ${ep.url} not rendered`);
    }
  }
  return { ok: gaps.length === 0, detail: gaps.length === 0 ? `${prep.endpoints.length} endpoint(s) covered` : gaps.join('; '), gaps };
}

// Imported lazily to keep the neutral module importable before the k8s dialect.
import { checkK8sDigestAgreement } from './k8s/handoff-k8s.ts';
