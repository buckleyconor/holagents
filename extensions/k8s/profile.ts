/**
 * Deployment profile contract (spec-k8s/02): parser and validator for the
 * `deployment-profile.yaml` that each lab repository MUST contain.
 *
 * The profile is a closed, fixed-shape YAML document. Following the house
 * style (ADR-004) it is parsed line-based with a strict subset rather than
 * a YAML dependency:
 *   - block mappings and block sequences (of scalars, or of mappings)
 *   - flow lists `[a, b]` and flow maps `{ k: v }`, single- or multi-line
 *   - quoted or bare scalars; `null` / `~` / booleans / numbers
 *   - full-line comments
 * Tabs, anchors, multi-line block scalars and inline comments are outside
 * the subset and produce a parse error. The schema is closed: unknown keys
 * are rejected, which also prevents smuggled secret material in freeform
 * fields (PRO-004).
 */

// --- raw tree -------------------------------------------------------------

export interface ScalarNode {
  kind: 'scalar';
  value: string | number | boolean | null;
}
export interface MapNode {
  kind: 'map';
  entries: [string, YNode][];
  /** Duplicate keys found in this mapping (all occurrences after the first). */
  duplicates: string[];
}
export interface ListNode {
  kind: 'list';
  items: YNode[];
}
export type YNode = ScalarNode | MapNode | ListNode;

function scalarNode(value: string | number | boolean | null): ScalarNode {
  return { kind: 'scalar', value };
}

// --- errors ----------------------------------------------------------------

export type ProfileErrorCode =
  | 'yaml-error'
  | 'bad-root'
  | 'unknown-key'
  | 'missing-key'
  | 'duplicate-key'
  | 'bad-api-version'
  | 'bad-kind'
  | 'unsupported-profile-version'
  | 'bad-platform'
  | 'missing-field'
  | 'bad-type'
  | 'bad-value'
  | 'duplicate-environment'
  | 'duplicate-branch'
  | 'promotion-order-entry'
  | 'promotion-order-coverage'
  | 'kustomize-or-helm'
  | 'secret-material';

export interface ProfileError {
  code: ProfileErrorCode;
  message: string;
  /** Dotted path into the profile, e.g. `spec.environments[1].branch`. */
  path: string;
}

export type ProfileResult =
  { ok: true; profile: KubernetesDeploymentProfile } | { ok: false; errors: ProfileError[] };

function err(code: ProfileErrorCode, message: string, path: string): ProfileError {
  return { code, message, path };
}

// --- schema constants (spec-k8s/02 §Profile schema) -------------------------

export const PROFILE_API_VERSION = 'holagents.io/v1alpha1'; // provisional per spec-k8s/02
export const PROFILE_KIND = 'KubernetesDeploymentProfile';
export const PROFILE_PLATFORM = 'charmed-kubernetes';
export const SUPPORTED_PROFILE_VERSIONS = ['1'] as const;

export interface KubernetesEnvironment {
  name: string;
  branch: string;
  manifestsPath: string;
  argoApplication: string;
  consequential: boolean;
}
export interface ProfilePolicy {
  required: boolean;
  schemaVersion: string | null;
  reference: string | null;
}
export interface ProfileTests {
  infrastructure: string;
  acceptance: string;
  virtualServer: string;
}
export interface ProfileCredentials {
  runtimeReference: string | null;
}
export interface KubernetesDeploymentProfile {
  apiVersion: string;
  kind: string;
  labId: string;
  profileVersion: string;
  platform: string;
  namespace: string;
  environments: KubernetesEnvironment[];
  promotionOrder: string[];
  policy: ProfilePolicy;
  tests: ProfileTests;
  credentials: ProfileCredentials;
}

// --- line-based subset parser ----------------------------------------------

const KEY_RE = /^([A-Za-z][A-Za-z0-9_-]*):(?:[ \t]+(.*))?$/;

interface Line {
  indent: number;
  text: string;
  raw: string;
  number: number;
}
interface Pos {
  i: number;
}

class YamlSubsetError extends Error {}

function prepareLines(text: string): Line[] {
  const lines: Line[] = [];
  for (const [idx, raw] of text.split(/\r?\n/).entries()) {
    if (raw.trim() === '') continue;
    const trimmed = raw.trim();
    if (trimmed.startsWith('#')) continue;
    const spaces = raw.match(/^ */)?.[0].length ?? 0;
    if (raw[spaces] === '\t') throw new YamlSubsetError(`tab indentation (line ${idx + 1})`);
    lines.push({ indent: spaces, text: trimmed, raw, number: idx + 1 });
  }
  return lines;
}

/** Net bracket depth of flow collections outside quotes. */
function flowDelta(s: string): number {
  let depth = 0;
  let quote: string | null = null;
  for (const ch of s) {
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '[' || ch === '{') depth += 1;
    else if (ch === ']' || ch === '}') depth -= 1;
  }
  return depth;
}

/** Split on top-level commas (ignoring commas inside quotes/brackets). */
function splitFlow(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let cur = '';
  for (const ch of s) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '[' || ch === '{') depth += 1;
    else if (ch === ']' || ch === '}') depth -= 1;
    else if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim() !== '') out.push(cur);
  return out;
}

function parseInlineValue(value: string, lineNo: number): YNode {
  const v = value.trim();
  if (v === '') return scalarNode(null);
  if (v.startsWith('[')) {
    if (!v.endsWith(']') || flowDelta(v) !== 0)
      throw new YamlSubsetError(`unbalanced flow list (line ${lineNo})`);
    return {
      kind: 'list',
      items: splitFlow(v.slice(1, -1)).map((p) => parseInlineValue(p, lineNo)),
    };
  }
  if (v.startsWith('{')) {
    if (!v.endsWith('}') || flowDelta(v) !== 0)
      throw new YamlSubsetError(`unbalanced flow map (line ${lineNo})`);
    const entries: [string, YNode][] = [];
    const seen = new Set<string>();
    for (const part of splitFlow(v.slice(1, -1))) {
      const idx = part.indexOf(':');
      if (idx === -1) throw new YamlSubsetError(`bad flow map entry: ${part.trim()}`);
      const k = part
        .slice(0, idx)
        .trim()
        .replace(/^["']|["']$/g, '');
      if (k === '') throw new YamlSubsetError(`empty flow map key (line ${lineNo})`);
      if (seen.has(k)) throw new YamlSubsetError(`duplicate key "${k}" (line ${lineNo})`);
      seen.add(k);
      entries.push([k, parseInlineValue(part.slice(idx + 1), lineNo)]);
    }
    return { kind: 'map', entries, duplicates: [] };
  }
  if (v.length >= 2 && v.startsWith('"') && v.endsWith('"'))
    return scalarNode(v.slice(1, -1).replace(/""/g, '"'));
  if (v.length >= 2 && v.startsWith("'") && v.endsWith("'"))
    return scalarNode(v.slice(1, -1).replace(/''/g, "'"));
  if (v === 'null' || v === '~') return scalarNode(null);
  if (v === 'true') return scalarNode(true);
  if (v === 'false') return scalarNode(false);
  if (/^-?\d+$/.test(v)) return scalarNode(Number(v));
  if (/^-?\d+\.\d+$/.test(v)) return scalarNode(Number(v));
  return scalarNode(v);
}

function parseNodeAt(lines: Line[], pos: Pos, minIndent: number): YNode {
  const line = lines[pos.i]!;
  if (line.indent < minIndent) throw new YamlSubsetError(`unexpected dedent (line ${line.number})`);
  if (line.text === '-' || line.text.startsWith('- ')) return parseListAt(lines, pos, line.indent);
  if (KEY_RE.test(line.text)) return parseMapAt(lines, pos, line.indent);
  // A bare scalar line; only legal as document root or list-item content.
  pos.i += 1;
  return parseInlineValue(line.text, line.number);
}

function parseMapAt(lines: Line[], pos: Pos, indent: number): MapNode {
  const entries: [string, YNode][] = [];
  const duplicates: string[] = [];
  const seen = new Set<string>();
  while (pos.i < lines.length) {
    const line = lines[pos.i]!;
    if (line.indent < indent) break;
    if (line.indent > indent)
      throw new YamlSubsetError(`unexpected indentation (line ${line.number})`);
    const m = line.text.match(KEY_RE);
    if (!m) {
      throw new YamlSubsetError(`expected "key: value" (line ${line.number})`);
    }
    const key = m[1]!;
    const rest = (m[2] ?? '').trim();
    pos.i += 1;
    if (seen.has(key)) duplicates.push(key);
    seen.add(key);

    if (rest !== '') {
      let value = rest;
      let open = flowDelta(rest);
      while (open > 0 && pos.i < lines.length) {
        const cont = lines[pos.i]!;
        pos.i += 1;
        value += ' ' + cont.text;
        open += flowDelta(cont.text);
      }
      if (open !== 0) throw new YamlSubsetError(`unbalanced flow collection (line ${line.number})`);
      entries.push([key, parseInlineValue(value, line.number)]);
    } else if (pos.i < lines.length && lines[pos.i]!.indent > indent) {
      entries.push([key, parseNodeAt(lines, pos, indent + 1)]);
    } else {
      entries.push([key, scalarNode(null)]);
    }
  }
  return { kind: 'map', entries, duplicates };
}

function parseListAt(lines: Line[], pos: Pos, indent: number): ListNode {
  const items: YNode[] = [];
  while (pos.i < lines.length) {
    const line = lines[pos.i]!;
    if (line.indent < indent) break;
    if (line.indent > indent)
      throw new YamlSubsetError(`unexpected indentation in list (line ${line.number})`);
    if (line.text !== '-' && !line.text.startsWith('- ')) break;
    const rest = line.text === '-' ? '' : line.text.slice(2).trim();

    // A mapping item: rewrite the dash line as a mapping line whose entries
    // sit at the column where the item content starts.
    if (rest !== '' && KEY_RE.test(rest)) {
      const pad = (line.raw.slice(line.indent + 1).match(/^ */)?.[0].length ?? 0) || 1;
      const contentCol = line.indent + 1 + pad;
      lines[pos.i] = { ...line, indent: contentCol, text: rest };
      items.push(parseMapAt(lines, pos, contentCol));
      continue;
    }

    pos.i += 1;
    if (rest === '') {
      if (pos.i < lines.length && lines[pos.i]!.indent > indent) {
        items.push(parseNodeAt(lines, pos, indent + 1));
      } else {
        items.push(scalarNode(null));
      }
    } else {
      let value = rest;
      let open = flowDelta(rest);
      while (open > 0 && pos.i < lines.length) {
        const cont = lines[pos.i]!;
        pos.i += 1;
        value += ' ' + cont.text;
        open += flowDelta(cont.text);
      }
      if (open !== 0) throw new YamlSubsetError(`unbalanced flow collection (line ${line.number})`);
      items.push(parseInlineValue(value, line.number));
    }
  }
  return { kind: 'list', items };
}

export interface ParseOutput {
  node: YNode | null;
  errors: ProfileError[];
}

/** Parse the strict YAML subset used by deployment profiles. */
export function parseProfileYaml(text: string): ParseOutput {
  try {
    const lines = prepareLines(text);
    if (lines.length === 0)
      return {
        node: null,
        errors: [err('yaml-error', 'empty document', '')],
      };
    if (lines[0]!.indent !== 0)
      return {
        node: null,
        errors: [
          err('yaml-error', `document root must start at column 0 (line ${lines[0]!.number})`, ''),
        ],
      };
    const pos: Pos = { i: 0 };
    const node = parseNodeAt(lines, pos, 0);
    if (pos.i !== lines.length)
      return {
        node: null,
        errors: [err('yaml-error', `content after document (line ${lines[pos.i]!.number})`, '')],
      };
    return { node, errors: [] };
  } catch (e) {
    return {
      node: null,
      errors: [err('yaml-error', e instanceof Error ? e.message : String(e), '')],
    };
  }
}

// --- validation (PRO-001 … PRO-005, profile level) --------------------------

const TOP_KEYS = ['apiVersion', 'kind', 'metadata', 'spec'] as const;
const META_KEYS = ['labId', 'profileVersion'] as const;
const SPEC_KEYS = [
  'platform',
  'namespace',
  'environments',
  'promotionOrder',
  'policy',
  'tests',
  'credentials',
] as const;
const ENV_KEYS = ['name', 'branch', 'manifestsPath', 'argoApplication', 'consequential'] as const;
const POLICY_KEYS = ['required', 'schemaVersion', 'reference'] as const;
const TESTS_KEYS = ['infrastructure', 'acceptance', 'virtualServer'] as const;
const CREDENTIALS_KEYS = ['runtimeReference'] as const;

const NAMESPACE_RE = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
const KUSTOMIZE_HELM_SEGMENTS = new Set([
  'kustomization.yaml',
  'kustomization.yml',
  'Chart.yaml',
  'charts',
  'helm',
]);

/** Closed mapping accessor: unknown/duplicate/missing keys become errors. */
function childMap(
  node: YNode | undefined,
  path: string,
  allowed: readonly string[],
  errors: ProfileError[],
): Map<string, YNode> | null {
  if (node === undefined) return null;
  if (node.kind !== 'map') {
    errors.push(err('bad-type', `must be a mapping`, path));
    return null;
  }
  const map = new Map<string, YNode>();
  for (const [key, value] of node.entries) {
    if (!map.has(key)) map.set(key, value);
  }
  for (const key of node.duplicates) {
    errors.push(err('duplicate-key', `duplicate key "${key}"`, path || key));
  }
  for (const key of map.keys()) {
    if (!(allowed as readonly string[]).includes(key))
      errors.push(err('unknown-key', `unknown key "${key}"`, path ? `${path}.${key}` : key));
  }
  for (const key of allowed) {
    if (!map.has(key))
      errors.push(err('missing-key', `missing key "${key}"`, path ? `${path}.${key}` : key));
  }
  return map;
}

/** A non-empty string scalar at `map[key]`. */
function requireString(
  map: Map<string, YNode>,
  key: string,
  path: string,
  errors: ProfileError[],
): string | null {
  const node = map.get(key);
  if (node === undefined) return null; // missing-key already recorded
  if (node.kind !== 'scalar' || typeof node.value !== 'string' || node.value === '') {
    errors.push(err('bad-value', `"${key}" must be a non-empty string`, `${path}.${key}`));
    return null;
  }
  return node.value;
}

/** A boolean scalar at `map[key]`. */
function requireBool(map: Map<string, YNode>, key: string, path: string, errors: ProfileError[]) {
  const node = map.get(key);
  if (node !== undefined && (node.kind !== 'scalar' || typeof node.value !== 'boolean'))
    errors.push(err('bad-type', `"${key}" must be a boolean`, `${path}.${key}`));
  return node?.kind === 'scalar' ? node.value : undefined;
}

/** A string or null scalar (the nullable reference fields). */
function nullableString(
  map: Map<string, YNode>,
  key: string,
  path: string,
  errors: ProfileError[],
): string | null {
  const node = map.get(key);
  if (node === undefined) return null; // missing-key already recorded
  if (node.kind !== 'scalar') {
    errors.push(err('bad-type', `"${key}" must be a string or null`, `${path}.${key}`));
    return null;
  }
  const v = node.value;
  if (v === null) return null;
  if (typeof v !== 'string' || v === '') {
    errors.push(err('bad-type', `"${key}" must be a string or null`, `${path}.${key}`));
    return null;
  }
  return v;
}

// --- secret screening (PRO-004: literal credentials or secret values) -------

const SENSITIVE_KEY_RE =
  /(secret|token|password|passwd|credential|kubeconfig|api[-_]?key|private[-_]?key|access[-_]?key)/i;
const URL_USERINFO_RE = /^[a-z][a-z0-9+.-]*:\/\/[^\s/]+:[^\s@/]+@/i;
const RAW_SECRET_PREFIX_RE =
  /^(sk-[A-Za-z0-9]{8,}|gh[pousr]_[A-Za-z0-9]{8,}|xox[baprs]-[A-Za-z0-9-]{4,}|AKIA[A-Z0-9]{16}|-----BEGIN [A-Z ]*PRIVATE KEY)/;
const B64_CANDIDATE_RE = /^[A-Za-z0-9+/]{40,}={0,2}$/;

/**
 * Conservative heuristic over every scalar in the document. The closed
 * schema means most smuggled material already fails as `unknown-key`; this
 * catches raw material placed in reference fields, e.g. a kubeconfig pasted
 * into `credentials.runtimeReference`.
 */
function scanSecrets(node: YNode, key: string, path: string, errors: ProfileError[]) {
  if (node.kind === 'scalar') {
    if (typeof node.value === 'string') {
      const value = node.value;
      const looksRaw =
        B64_CANDIDATE_RE.test(value) &&
        /[a-z]/.test(value) &&
        /[A-Z]/.test(value) &&
        /[0-9]/.test(value);
      if (SENSITIVE_KEY_RE.test(key) || URL_USERINFO_RE.test(value) || looksRaw) {
        errors.push(
          err(
            'secret-material',
            'literal credential or secret material is not allowed in the profile',
            path || key,
          ),
        );
      }
    }
    return;
  }
  if (node.kind === 'map') {
    for (const [k, v] of node.entries) scanSecrets(v, k, path ? `${path}.${k}` : k, errors);
    return;
  }
  node.items.forEach((item, i) => scanSecrets(item, key, `${path}[${i}]`, errors));
}

/**
 * Parse and validate a `deployment-profile.yaml` document
 * (spec-k8s/02 PRO-001 … PRO-005, profile level). Returns every error found;
 * a valid document yields the typed profile.
 */
export function validateProfile(text: string): ProfileResult {
  const { node, errors } = parseProfileYaml(text);
  if (node === null) return { ok: false, errors };
  const problems = [...errors];

  if (node.kind !== 'map') {
    problems.push(err('bad-root', 'document root must be a mapping', ''));
    return { ok: false, errors: problems };
  }

  const top = childMap(node, '', TOP_KEYS, problems);
  if (top === null) return { ok: false, errors: problems };

  const apiVersion = requireString(top, 'apiVersion', '', problems);
  if (apiVersion !== null && apiVersion !== PROFILE_API_VERSION)
    problems.push(
      err(
        'bad-api-version',
        `apiVersion must be ${PROFILE_API_VERSION} (provisional, spec-k8s/02)`,
        'apiVersion',
      ),
    );
  const kind = requireString(top, 'kind', '', problems);
  if (kind !== null && kind !== PROFILE_KIND)
    problems.push(err('bad-kind', `kind must be ${PROFILE_KIND}`, 'kind'));

  // metadata
  const meta = childMap(top.get('metadata'), 'metadata', META_KEYS, problems);
  let labId: string | null = null;
  let profileVersion: string | null = null;
  if (meta !== null) {
    labId = requireString(meta, 'labId', 'metadata', problems);
    const pv = meta.get('profileVersion');
    if (pv !== undefined && pv.kind === 'scalar') {
      if (pv.value === 1) profileVersion = '1';
      else if (
        typeof pv.value === 'string' &&
        (SUPPORTED_PROFILE_VERSIONS as readonly string[]).includes(pv.value)
      )
        profileVersion = pv.value;
      else if (pv.value === null) {
        problems.push(
          err('missing-field', 'profileVersion must not be null', 'metadata.profileVersion'),
        );
      } else {
        problems.push(
          err(
            'unsupported-profile-version',
            `unsupported profileVersion ${JSON.stringify(pv.value)}; supported: ${[
              ...SUPPORTED_PROFILE_VERSIONS,
            ].join(', ')}`,
            'metadata.profileVersion',
          ),
        );
      }
    } else if (pv !== undefined) {
      problems.push(err('bad-type', 'profileVersion must be a string', 'metadata.profileVersion'));
    }
  }

  // spec
  const spec = childMap(top.get('spec'), 'spec', SPEC_KEYS, problems);
  let platform: string | null = null;
  let namespace: string | null = null;
  const environments: KubernetesEnvironment[] = [];
  let promotionOrder: string[] | null = null;
  let policy: ProfilePolicy | null = null;
  let tests: ProfileTests | null = null;
  let credentials: ProfileCredentials | null = null;

  if (spec !== null) {
    platform = requireString(spec, 'platform', 'spec', problems);
    if (platform !== null && platform !== PROFILE_PLATFORM)
      problems.push(
        err('bad-platform', `platform must be ${PROFILE_PLATFORM} (ADR-K8S-009)`, 'spec.platform'),
      );

    namespace = requireString(spec, 'namespace', 'spec', problems);
    if (namespace !== null && (!NAMESPACE_RE.test(namespace) || namespace.length > 63))
      problems.push(
        err(
          'bad-value',
          'namespace must be a DNS-1123 subdomain (lowercase alphanumeric, max 63)',
          'spec.namespace',
        ),
      );

    // environments
    const envNode = spec.get('environments');
    if (envNode !== undefined) {
      if (envNode.kind !== 'list') {
        problems.push(err('bad-type', 'environments must be a list', 'spec.environments'));
      } else {
        if (envNode.items.length === 0)
          problems.push(err('bad-value', 'environments must not be empty', 'spec.environments'));
        const names = new Map<string, number>();
        const branches = new Map<string, number>();
        envNode.items.forEach((item, i) => {
          const p = `spec.environments[${i}]`;
          const env = childMap(item, p, ENV_KEYS, problems);
          if (env === null) return;
          const name = requireString(env, 'name', p, problems);
          const branch = requireString(env, 'branch', p, problems);
          const manifestsPath = requireString(env, 'manifestsPath', p, problems);
          const argoApplication = requireString(env, 'argoApplication', p, problems);
          const consequential = requireBool(env, 'consequential', p, problems);
          if (name !== null && names.has(name))
            problems.push(err('duplicate-environment', `duplicate environment name "${name}"`, p));
          if (name !== null) names.set(name, (names.get(name) ?? 0) + 1);
          if (branch !== null && branches.has(branch))
            problems.push(err('duplicate-branch', `duplicate environment branch "${branch}"`, p));
          if (branch !== null) {
            branches.set(branch, (branches.get(branch) ?? 0) + 1);
            if (/\s/.test(branch))
              problems.push(err('bad-value', 'branch must not contain whitespace', `${p}.branch`));
          }
          if (manifestsPath !== null) {
            const segments = manifestsPath.split('/');
            if (segments.some((seg) => KUSTOMIZE_HELM_SEGMENTS.has(seg)))
              problems.push(
                err(
                  'kustomize-or-helm',
                  'manifestsPath must not reference Kustomize or Helm (ADR-K8S-001)',
                  `${p}.manifestsPath`,
                ),
              );
            else if (manifestsPath.startsWith('/') || segments.includes('..'))
              problems.push(
                err('bad-value', 'manifestsPath must be repository-relative', `${p}.manifestsPath`),
              );
          }
          if (
            name !== null &&
            branch !== null &&
            manifestsPath !== null &&
            argoApplication !== null &&
            typeof consequential === 'boolean'
          ) {
            environments.push({ name, branch, manifestsPath, argoApplication, consequential });
          }
        });
      }
    }

    // promotionOrder: every entry names exactly one environment, and every
    // environment appears exactly once (GAP-002: names and order come from
    // promotionOrder — an environment outside it can never be promoted).
    const poNode = spec.get('promotionOrder');
    if (poNode !== undefined) {
      if (poNode.kind !== 'list') {
        problems.push(
          err(
            'bad-type',
            'promotionOrder must be a list of environment names',
            'spec.promotionOrder',
          ),
        );
      } else {
        const order: string[] = [];
        poNode.items.forEach((item, i) => {
          if (item.kind === 'scalar' && typeof item.value === 'string') order.push(item.value);
          else
            problems.push(
              err(
                'bad-type',
                `promotionOrder[${i}] must be an environment name`,
                `spec.promotionOrder[${i}]`,
              ),
            );
        });
        const namesOfEnvs = new Set(environments.map((e) => e.name));
        const seen = new Set<string>();
        order.forEach((entry, i) => {
          if (seen.has(entry))
            problems.push(
              err(
                'promotion-order-entry',
                `promotionOrder[${i}] repeats environment "${entry}"`,
                `spec.promotionOrder[${i}]`,
              ),
            );
          seen.add(entry);
          if (namesOfEnvs.size > 0 && !namesOfEnvs.has(entry))
            problems.push(
              err(
                'promotion-order-entry',
                `promotionOrder[${i}] references unknown environment "${entry}"`,
                `spec.promotionOrder[${i}]`,
              ),
            );
        });
        for (const name of namesOfEnvs) {
          if (!order.includes(name))
            problems.push(
              err(
                'promotion-order-coverage',
                `environment "${name}" is not in promotionOrder`,
                'spec.promotionOrder',
              ),
            );
        }
        promotionOrder = order;
      }
    }

    // policy
    const pol = childMap(spec.get('policy'), 'spec.policy', POLICY_KEYS, problems);
    if (pol !== null) {
      const required = requireBool(pol, 'required', 'spec.policy', problems);
      const schemaVersion = nullableString(pol, 'schemaVersion', 'spec.policy', problems);
      const reference = nullableString(pol, 'reference', 'spec.policy', problems);
      if (typeof required === 'boolean') policy = { required, schemaVersion, reference };
    }

    // tests
    const tst = childMap(spec.get('tests'), 'spec.tests', TESTS_KEYS, problems);
    if (tst !== null) {
      const infrastructure = requireString(tst, 'infrastructure', 'spec.tests', problems);
      const acceptance = requireString(tst, 'acceptance', 'spec.tests', problems);
      const virtualServer = requireString(tst, 'virtualServer', 'spec.tests', problems);
      if (infrastructure && acceptance && virtualServer)
        tests = { infrastructure, acceptance, virtualServer };
    }

    // credentials
    const cred = childMap(spec.get('credentials'), 'spec.credentials', CREDENTIALS_KEYS, problems);
    if (cred !== null) {
      const runtimeReference = nullableString(
        cred,
        'runtimeReference',
        'spec.credentials',
        problems,
      );
      credentials = { runtimeReference };
    }
  }

  // Secret screening runs over the whole document, valid or not.
  scanSecrets(node, '', '', problems);

  if (
    problems.length === 0 &&
    labId !== null &&
    profileVersion !== null &&
    platform !== null &&
    namespace !== null &&
    promotionOrder !== null &&
    policy !== null &&
    tests !== null &&
    credentials !== null
  ) {
    return {
      ok: true,
      profile: {
        apiVersion: PROFILE_API_VERSION,
        kind: PROFILE_KIND,
        labId,
        profileVersion,
        platform: PROFILE_PLATFORM,
        namespace,
        environments,
        promotionOrder,
        policy,
        tests,
        credentials,
      },
    };
  }
  return { ok: false, errors: problems };
}
