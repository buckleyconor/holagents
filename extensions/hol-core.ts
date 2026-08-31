/**
 * holagent core logic — pure (no pi imports), directly unit-testable.
 * `extensions/hol.ts` is the thin pi registration layer on top of this.
 *
 * Contracts: spec §02 §4.1–4.3 (tools), §3.6 (state machine), §04 §3 (path
 * validation), §05 T-33…T-41.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { parseFrontmatter, type Frontmatter } from './frontmatter.ts';
import { loadFormatConfig } from './linter/config.ts';
import { runLint, type RunLintOptions } from './linter/index.ts';
import { scanMarkdown } from './linter/scan.ts';
import { moduleSections } from './linter/rules/l010.ts';
import type { LintReport } from './linter/types.ts';
import { isGuideDir, isLabDir, resolveGuideRoot, resolveLabRoot } from './state.ts';

// ---------------------------------------------------------------- errors

export type HolErrorCode = 'E-PATH' | 'E-READ' | 'E-ARG';

export class HolError extends Error {
  readonly code: HolErrorCode;
  constructor(code: HolErrorCode, message: string) {
    super(message);
    this.name = 'HolError';
    this.code = code;
  }
}

// ------------------------------------------------------------- data dir

/** `~/.holagent/` (override: `HOLAGENT_DATA_DIR`). Spec §04 §4/§5. */
export function holagentDataDir(): string {
  const env = process.env.HOLAGENT_DATA_DIR;
  if (env && env.trim()) return resolve(env.trim());
  return join(homedir(), '.holagent');
}

/** Create the data dir with mode 0700 (idempotent; existing dirs untouched). */
export function ensureHolagentDataDir(): string {
  const dir = holagentDataDir();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

// ------------------------------------------------------------ path rules

function hasDotDotSegments(p: string): boolean {
  return p.split(/[\\/]+/).includes('..');
}

/**
 * Resolve a lab/guide dir from an optional user arg, confined to the session
 * project root (spec §04 §3).
 *
 * - arg: must not contain `..` segments; must exist, be a directory, and its
 *   realpath must stay inside realpath(cwd) (symlink escape → E-PATH, T-35);
 *   must satisfy `predicate`.
 * - no arg: nearest matching root at/above cwd (E-PATH when none, T-36).
 *
 * Write confinement to the project root is deliberate and stays (ADR-008):
 * an external lab repo is reached through `lab-ref.json`, never through this.
 */
function resolveConfinedRoot(
  cwd: string,
  arg: string | undefined,
  predicate: (dir: string) => boolean,
  finder: (cwd: string) => string | null,
  noun: string,
  requirement: string,
): string {
  if (arg !== undefined && arg !== '') {
    if (hasDotDotSegments(arg)) {
      throw new HolError('E-PATH', `E-PATH: guideDir must not contain ".." segments: ${arg}`);
    }
    const abs = resolve(cwd, arg);
    let real: string;
    try {
      real = realpathSync(abs);
    } catch {
      throw new HolError('E-PATH', `E-PATH: no such directory: ${arg}`);
    }
    if (!(statSync(real)?.isDirectory() ?? false)) {
      throw new HolError('E-PATH', `E-PATH: not a directory: ${arg}`);
    }
    const rootReal = realpathSync(cwd);
    if (real !== rootReal && !real.startsWith(rootReal + '/')) {
      throw new HolError(
        'E-PATH',
        `E-PATH: guide dir escapes the project root (realpath ${real} is outside ${rootReal})`,
      );
    }
    if (!predicate(real)) {
      throw new HolError('E-PATH', `E-PATH: not a ${noun} dir (needs ${requirement}): ${arg}`);
    }
    return real;
  }
  const root = finder(cwd);
  if (!root) {
    throw new HolError(
      'E-PATH',
      `E-PATH: no ${noun} root found from cwd — run inside a ${noun} dir or pass guideDir`,
    );
  }
  return root;
}

/**
 * Resolve a **guide** dir (guide.md + .holagent/) — for operations that need
 * the guide file itself, i.e. the linter (`hol_validate`).
 */
export function resolveGuidePath(cwd: string, arg?: string): string {
  return resolveConfinedRoot(
    cwd,
    arg,
    isGuideDir,
    resolveGuideRoot,
    'guide',
    'guide.md + .holagent/',
  );
}

/**
 * Resolve a **lab** dir (`.holagent/` only) — for operations that work across
 * the whole lifecycle, including stages 1–3 that run before `guide.md` exists
 * (`hol_status`, `hol_scores`). ADR-009.
 */
export function resolveLabPath(cwd: string, arg?: string): string {
  return resolveConfinedRoot(cwd, arg, isLabDir, resolveLabRoot, 'lab', '.holagent/');
}

// ------------------------------------------------------------ validation

export interface ValidationOutput {
  report: LintReport;
  /** Relative to the guide dir, per spec §02 §4.1. */
  reportFile: '.holagent/last-validation.json';
  /** Absolute path (for display). */
  reportPath: string;
  at: string;
}

/**
 * Run the linter and record the report at `.holagent/last-validation.json`
 * (atomic temp+rename). The recorded file carries an `at` timestamp; the
 * linter report itself stays timestamp-free (T-46).
 */
export async function validateGuide(
  guideDir: string,
  opts: RunLintOptions = {},
): Promise<ValidationOutput> {
  let report: LintReport;
  try {
    report = await runLint(guideDir, opts);
  } catch (e) {
    throw new HolError(
      'E-READ',
      `E-READ: cannot read guide at ${guideDir}: ${(e as Error).message}`,
    );
  }
  const at = new Date().toISOString();
  const reportFile = '.holagent/last-validation.json';
  const reportPath = join(guideDir, '.holagent', 'last-validation.json');
  atomicWriteJson(reportPath, { ...report, at });
  return { report, reportFile, reportPath, at };
}

// ------------------------------------------------------------- atomics

/** Atomic JSON write: same-dir temp file + rename. Never leaves partial state. */
export function atomicWriteJson(filePath: string, value: unknown): void {
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });
  const tmp = join(dir, `.${basename(filePath)}.tmp-${process.pid}-${Date.now()}`);
  try {
    writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n');
    renameSync(tmp, filePath);
  } catch (e) {
    try {
      if (existsSync(tmp)) rmSync(tmp, { force: true });
    } catch {
      /* best effort */
    }
    throw e;
  }
}

// ---------------------------------------------------------------- scores

export interface ScoreFinding {
  criterion: string;
  score: number;
  finding: string | null;
}

export interface ScoreEntry {
  /** "plan" | "module-plan-<NN>" | "module-<NN-slug>" | "guide" */
  scope: string;
  rubric: string;
  kind: 'checklist' | 'analytic' | 'holistic';
  status: 'passed' | 'failed' | 'escalated';
  /** checklist: pass rate 0–1; analytic/holistic: 1–5. */
  score: number;
  rounds: number;
  findings: ScoreFinding[];
  updated_at: string;
}

const SCOPE_SLUG = '[a-z0-9]+(?:-[a-z0-9]+)*';
/**
 * Score scopes. The guide-stage scopes (plan, guide, module-*) are the
 * originals; concept, sizing, spec, launch, `build-<slug>` and
 * `platform-<slug>` are the lifecycle stages added in ADR-009.
 */
const SCOPE_RE = new RegExp(
  `^(plan|guide|concept|sizing|spec|launch|module-plan-\\d{2}|module-\\d{2}-${SCOPE_SLUG}|build-${SCOPE_SLUG}|platform-${SCOPE_SLUG})$`,
);
const KINDS = ['checklist', 'analytic', 'holistic'] as const;
const STATUSES = ['passed', 'failed', 'escalated'] as const;

/** Validate one raw score entry; returns a problem list (empty = valid). */
export function validateScoreEntry(raw: unknown): string[] {
  const problems: string[] = [];
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return ['entry is not an object'];
  }
  const e = raw as Record<string, unknown>;
  const str = (k: string): string | undefined =>
    typeof e[k] === 'string' ? (e[k] as string) : undefined;

  const scope = str('scope');
  if (!scope) problems.push('scope: missing string');
  else if (!SCOPE_RE.test(scope))
    problems.push(
      `scope: "${scope}" must match plan | guide | concept | sizing | spec | launch | module-plan-NN | module-NN-slug | build-slug | platform-slug`,
    );

  const rubric = str('rubric');
  if (!rubric || !rubric.trim()) problems.push('rubric: missing non-empty string');

  const kind = e.kind;
  if (!KINDS.includes(kind as (typeof KINDS)[number]))
    problems.push(`kind: must be one of ${KINDS.join(', ')} (got ${JSON.stringify(kind)})`);

  const status = e.status;
  if (!STATUSES.includes(status as (typeof STATUSES)[number]))
    problems.push(`status: must be one of ${STATUSES.join(', ')} (got ${JSON.stringify(status)})`);

  if (typeof e.score !== 'number' || !Number.isFinite(e.score)) {
    problems.push('score: missing number');
  } else if (kind === 'checklist') {
    if (e.score < 0 || e.score > 1) problems.push('score: checklist must be 0..1');
  } else if (kind === 'analytic' || kind === 'holistic') {
    if (e.score < 1 || e.score > 5) problems.push('score: analytic/holistic must be 1..5');
  }

  if (typeof e.rounds !== 'number' || !Number.isInteger(e.rounds) || e.rounds < 0)
    problems.push('rounds: must be a non-negative integer');

  if (!Array.isArray(e.findings)) {
    problems.push('findings: must be an array');
  } else {
    (e.findings as unknown[]).forEach((f, i) => {
      if (typeof f !== 'object' || f === null)
        return void problems.push(`findings[${i}]: not an object`);
      const ff = f as Record<string, unknown>;
      if (typeof ff.criterion !== 'string' || !ff.criterion)
        problems.push(`findings[${i}].criterion: missing`);
      if (typeof ff.score !== 'number' || !Number.isFinite(ff.score))
        problems.push(`findings[${i}].score: missing number`);
      if (ff.finding !== null && typeof ff.finding !== 'string')
        problems.push(`findings[${i}].finding: must be string or null`);
    });
  }

  const updatedAt = str('updated_at');
  if (!updatedAt || Number.isNaN(Date.parse(updatedAt)))
    problems.push('updated_at: missing ISO timestamp');

  return problems;
}

function entryKey(e: ScoreEntry): string {
  return `${e.scope}/${e.rubric}`;
}

function normalizeEntry(raw: unknown): ScoreEntry {
  const e = raw as Record<string, unknown>;
  return {
    scope: e.scope as string,
    rubric: e.rubric as string,
    kind: e.kind as ScoreEntry['kind'],
    status: e.status as ScoreEntry['status'],
    score: e.score as number,
    rounds: e.rounds as number,
    findings: (e.findings as ScoreFinding[]).map((f) => ({
      criterion: f.criterion,
      score: f.score,
      finding: f.finding ?? null,
    })),
    updated_at: e.updated_at as string,
  };
}

interface ScoresFile {
  version: 1;
  entries: ScoreEntry[];
}

export function readScores(guideDir: string): ScoreEntry[] {
  const path = join(guideDir, '.holagent', 'scores.json');
  if (!existsSync(path)) return [];
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (e) {
    throw new HolError('E-READ', `E-READ: cannot read scores.json: ${(e as Error).message}`);
  }
  try {
    const parsed = JSON.parse(text) as ScoresFile;
    if (!parsed || !Array.isArray(parsed.entries)) return [];
    return parsed.entries;
  } catch (e) {
    throw new HolError('E-READ', `E-READ: scores.json is not valid JSON: ${(e as Error).message}`);
  }
}

export interface MergeResult {
  ok: true;
  scoresPath: '.holagent/scores.json';
  /** "scope/rubric" keys of the entries written. */
  merged: string[];
}

/**
 * Merge score entries into `.holagent/scores.json`.
 * Atomicity (T-39): ALL entries are validated before anything is written;
 * the file is rewritten via temp+rename, so a failure leaves it byte-identical.
 * Entries are keyed by scope/rubric (latest wins).
 */
export function mergeScores(guideDir: string, rawEntries: unknown): MergeResult {
  if (!Array.isArray(rawEntries) || rawEntries.length === 0) {
    throw new HolError('E-ARG', 'E-ARG: merge requires a non-empty "entries" array');
  }
  const problems: string[] = [];
  const entries: ScoreEntry[] = [];
  rawEntries.forEach((raw, i) => {
    const p = validateScoreEntry(raw);
    if (p.length > 0) problems.push(`entry ${i + 1}: ${p.join('; ')}`);
    else entries.push(normalizeEntry(raw));
  });
  if (problems.length > 0) {
    throw new HolError(
      'E-ARG',
      `E-ARG: invalid score entr${problems.length === 1 ? 'y' : 'ies'} — ${problems.join(' | ')}; nothing was written`,
    );
  }

  const path = join(guideDir, '.holagent', 'scores.json');
  const current = new Map(readScores(guideDir).map((e) => [entryKey(e), e]));
  for (const entry of entries) current.set(entryKey(entry), entry);
  atomicWriteJson(path, { version: 1, entries: [...current.values()] } satisfies ScoresFile);
  return { ok: true, scoresPath: '.holagent/scores.json', merged: entries.map(entryKey) };
}

export interface RemoveScoresResult {
  ok: boolean;
  scoresPath: string;
  /** "scope/rubric" keys that were removed (empty = nothing to remove). */
  removed: string[];
}

/**
 * Remove all score entries for one scope (spec 07 M9: the `--fresh` path —
 * a fresh scoring pass starts from a clean scope). Scope must match the
 * canonical pattern; a scope with no entries is a no-op (no write, file
 * byte-identical). Otherwise the remaining entries are rewritten atomically
 * (temp+rename).
 */
export function removeScoresByScope(guideDir: string, scope: string): RemoveScoresResult {
  if (typeof scope !== 'string' || !SCOPE_RE.test(scope)) {
    throw new HolError(
      'E-ARG',
      `E-ARG: remove requires a canonical scope ("plan" | "module-plan-<NN>" | "module-<NN>-<slug>" | "guide"), got: ${JSON.stringify(scope)}`,
    );
  }
  const path = join(guideDir, '.holagent', 'scores.json');
  const current = readScores(guideDir);
  const removed = current.filter((e) => e.scope === scope).map((e) => entryKey(e));
  if (removed.length === 0) {
    return { ok: true, scoresPath: '.holagent/scores.json', removed: [] };
  }
  const remaining = current.filter((e) => e.scope !== scope);
  atomicWriteJson(path, { version: 1, entries: remaining } satisfies ScoresFile);
  return { ok: true, scoresPath: '.holagent/scores.json', removed };
}

// ------------------------------------------------------------ plan read

export interface PlanModule {
  n: number;
  slug: string;
  title: string;
}

export interface PlanInfo {
  exists: boolean;
  id: string | null;
  title: string | null;
  slug: string | null;
  objectives: number;
  modules: PlanModule[];
  /** Frontmatter validation (M7): valid = no contract errors. */
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ------------------------------------------------- plan validation (M7)

const GUIDE_ID_RE = /^HOL-\d{4}-\d{2}$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface PlanValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

function stringList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => typeof x === 'string' && x.trim().length > 0) as string[];
}

/**
 * Validate plan.md frontmatter (spec §02 §3.3).
 *
 * Errors = machine-contract violations: they block the `planned` state and
 * force `next` back to `/hol-plan`. Warnings = plan-quality concerns for the
 * scorer/user, never blocking. Pure function over parsed frontmatter
 * (`null` = absent or unparseable).
 */
export function validatePlanFrontmatter(fm: Frontmatter | null): PlanValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!fm) {
    errors.push('plan.md has no parseable frontmatter (must use the mini-YAML subset)');
    return { valid: false, errors, warnings };
  }
  const data = fm.data;

  const id = data['id'];
  if (typeof id !== 'string' || !GUIDE_ID_RE.test(id)) {
    errors.push(`id must match ^HOL-\\d{4}-\\d{2}$ (got ${JSON.stringify(id ?? null)})`);
  }
  const title = data['title'];
  if (typeof title !== 'string' || title.trim().length === 0) {
    errors.push('title is required');
  }
  const slug = data['slug'];
  if (typeof slug !== 'string' || !SLUG_RE.test(slug)) {
    errors.push(`slug must be kebab-case a-z0-9- (got ${JSON.stringify(slug ?? null)})`);
  }
  const duration = data['duration_minutes'];
  if (typeof duration !== 'number' || !Number.isInteger(duration) || duration <= 0) {
    errors.push('duration_minutes must be a positive integer');
  }

  const rawModules = data['modules'];
  if (!Array.isArray(rawModules) || rawModules.length === 0) {
    errors.push('modules must be a non-empty list');
  } else {
    for (let i = 0; i < rawModules.length; i += 1) {
      const m = rawModules[i];
      if (typeof m !== 'object' || m === null || Array.isArray(m)) {
        errors.push(`modules[${i + 1}] must be a flow map { n, slug, title, goal, est_minutes }`);
        continue;
      }
      const rec = m as Record<string, unknown>;
      const n = rec['n'];
      if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) {
        errors.push(`modules[${i + 1}].n must be a positive integer`);
      }
      const ms = rec['slug'];
      if (typeof ms !== 'string' || !SLUG_RE.test(ms)) {
        errors.push(
          `modules[${i + 1}].slug must be kebab-case (got ${JSON.stringify(ms ?? null)})`,
        );
      }
      const goal = rec['goal'];
      if (typeof goal !== 'string' || goal.trim().length === 0) {
        warnings.push(`modules[${i + 1}].goal is missing or empty`);
      }
    }
    const ns = rawModules.map((m) =>
      typeof m === 'object' && m !== null && !Array.isArray(m)
        ? (m as Record<string, unknown>)['n']
        : undefined,
    );
    if (ns.every((n) => typeof n === 'number' && Number.isInteger(n) && n > 0)) {
      const sequential = ns.every((n, i) => n === i + 1);
      if (!sequential)
        errors.push('module n values must be sequential from 1 (got ' + ns.join(',') + ')');
    }
  }

  if (stringList(data['audience']).length === 0) warnings.push('audience is empty or missing');
  const objectives = stringList(data['objectives']);
  if (objectives.length === 0)
    warnings.push('objectives is empty or missing (3–5, action-verb led)');
  else if (objectives.length < 3 || objectives.length > 5) {
    warnings.push(`objectives count should be 3–5 (got ${objectives.length})`);
  }
  const env =
    typeof data['environment'] === 'object' &&
    data['environment'] !== null &&
    !Array.isArray(data['environment'])
      ? (data['environment'] as Record<string, unknown>)
      : null;
  if (!env) {
    warnings.push('environment block is missing');
  } else {
    const baseline = env['baseline'];
    if (typeof baseline !== 'string' || baseline.trim().length === 0)
      warnings.push('environment.baseline is missing');
    if (stringList(env['credentials']).length === 0)
      warnings.push('environment.credentials is empty');
  }

  return { valid: errors.length === 0, errors, warnings };
}

/** Parse `.holagent/plan.md` frontmatter (missing file → exists:false). */
export function readPlan(guideDir: string): PlanInfo {
  const path = join(guideDir, '.holagent', 'plan.md');
  if (!existsSync(path)) {
    return {
      exists: false,
      id: null,
      title: null,
      slug: null,
      objectives: 0,
      modules: [],
      valid: true,
      errors: [],
      warnings: [],
    };
  }
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (e) {
    throw new HolError('E-READ', `E-READ: cannot read plan.md: ${(e as Error).message}`);
  }
  let fm: Frontmatter | null;
  let parseError: string | null = null;
  try {
    fm = parseFrontmatter(text);
  } catch (e) {
    // Malformed frontmatter (e.g. unescaped apostrophe in a quoted scalar)
    // degrades to invalid + the parse error, never a crash (T-73).
    fm = null;
    parseError = `frontmatter parse error: ${(e as Error).message}`;
  }
  const validation = validatePlanFrontmatter(fm);
  if (parseError) validation.errors.unshift(parseError);
  const data = fm?.data ?? {};
  const modulesRaw = Array.isArray(data.modules) ? (data.modules as unknown[]) : [];
  const modules: PlanModule[] = [];
  for (const raw of modulesRaw) {
    if (typeof raw !== 'object' || raw === null) continue;
    const m = raw as Record<string, unknown>;
    const n = Number(m.n);
    if (!Number.isInteger(n) || n < 1) continue;
    const slug = typeof m.slug === 'string' ? m.slug : '';
    if (!slug) continue;
    modules.push({ n, slug, title: typeof m.title === 'string' ? m.title : slug });
  }
  const objectives = Array.isArray(data.objectives) ? (data.objectives as unknown[]).length : 0;
  return {
    exists: true,
    id: typeof data.id === 'string' ? data.id : null,
    title: typeof data.title === 'string' ? data.title : null,
    slug: typeof data.slug === 'string' ? data.slug : null,
    objectives,
    modules,
    valid: validation.valid,
    errors: validation.errors,
    warnings: validation.warnings,
  };
}

// ------------------------------------------------- module selector (T-37)

const NN_RE = /^\d{1,2}$/;
const NN_SLUG_RE = /^\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/;

function moduleList(modules: PlanModule[]): string {
  return modules.map((m) => `${String(m.n).padStart(2, '0')}-${m.slug} (${m.title})`).join(', ');
}

/**
 * Resolve a `<module>` selector (spec §02 §4.8): `2`, `02-upload-documents`,
 * or an unambiguous case-insensitive title fragment. Throws HolError E-ARG
 * with the available-module list on ambiguity/unknown.
 */
export function resolveModuleSelector(modules: PlanModule[] | null, arg: string): PlanModule {
  const selector = (arg ?? '').trim();
  if (!modules || modules.length === 0) {
    throw new HolError('E-ARG', 'E-ARG: no plan modules — run /hol-plan first');
  }
  const available = `available modules: ${moduleList(modules)}`;

  if (NN_RE.test(selector)) {
    const n = Number(selector);
    const hit = modules.find((m) => m.n === n);
    if (!hit) throw new HolError('E-ARG', `E-ARG: no module ${n} — ${available}`);
    return hit;
  }
  if (NN_SLUG_RE.test(selector)) {
    const m = selector.match(/^(\d{2})-(.+)$/)!;
    const n = Number(m[1]);
    const hit = modules.find((x) => x.n === n && x.slug === m[2]);
    if (!hit) throw new HolError('E-ARG', `E-ARG: no module "${selector}" — ${available}`);
    return hit;
  }
  const frag = selector.toLowerCase();
  const hits = modules.filter((m) => m.title.toLowerCase().includes(frag));
  if (hits.length === 1) return hits[0]!;
  throw new HolError('E-ARG', `E-ARG: ambiguous or unknown module "${arg}" — ${available}`);
}

// --------------------------------------------------------------- module plan

/**
 * Module plan (`.holagent/<NN-slug>/plan.md`) frontmatter validation.
 *
 * errors   = machine-contract violations that block module-plan scoring (the
 *            parent re-dispatches the module planner with the error list).
 * warnings = quality concerns (design-modules bands, empty/missing quality
 *            lists, missing body sections) — never block.
 */
export interface ModulePlanValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateModulePlanFrontmatter(
  fm: Frontmatter | null,
  expected: PlanModule,
): ModulePlanValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!fm) {
    errors.push('module plan has no parseable frontmatter (mini-YAML subset required)');
    return { valid: false, errors, warnings };
  }
  const data = fm.data;

  const n = data['module_n'];
  if (typeof n !== 'number' || !Number.isInteger(n) || n !== expected.n) {
    errors.push(`module_n must equal ${expected.n} (got ${JSON.stringify(n ?? null)})`);
  }
  const slug = data['slug'];
  if (slug !== expected.slug) {
    errors.push(`slug must be "${expected.slug}" (got ${JSON.stringify(slug ?? null)})`);
  }
  const title = data['title'];
  if (typeof title !== 'string' || title.trim().length === 0) {
    errors.push('title is required');
  }
  const est = data['est_minutes'];
  if (typeof est !== 'number' || !Number.isInteger(est) || est <= 0) {
    errors.push('est_minutes must be a positive integer');
  } else if (est < 5 || est > 30) {
    warnings.push(`est_minutes ${est} is outside the 5–30 band (design-modules budget)`);
  }

  const deps = data['depends_on'];
  if (!Array.isArray(deps)) {
    errors.push('depends_on must be a list ([] when the module has no dependencies)');
  } else {
    const nums: number[] = [];
    for (let i = 0; i < deps.length; i += 1) {
      const d = deps[i];
      if (typeof d !== 'number' || !Number.isInteger(d) || d < 1) {
        errors.push(
          `depends_on[${i + 1}] must be a positive module number (got ${JSON.stringify(d ?? null)})`,
        );
      } else {
        nums.push(d);
      }
    }
    if (nums.length > 0) {
      if (nums.includes(expected.n))
        errors.push(`depends_on must not reference module ${expected.n} itself`);
      if (nums.some((d) => d > expected.n))
        errors.push('depends_on may only reference earlier modules');
      if (new Set(nums).size !== nums.length) errors.push('depends_on contains duplicates');
    }
  }

  const images = data['image_checklist'];
  if (images === undefined || images === null) {
    warnings.push('image_checklist is missing (use [] when the module needs no screenshots)');
  } else if (
    !Array.isArray(images) ||
    images.some((s) => typeof s !== 'string' || s.trim().length === 0)
  ) {
    errors.push('image_checklist must be a list of non-empty screenshot descriptions');
  }

  const success = data['success_criteria'];
  if (
    !Array.isArray(success) ||
    success.length === 0 ||
    success.some((s) => typeof s !== 'string' || s.trim().length === 0)
  ) {
    warnings.push(
      'success_criteria is missing or empty (verifiable end states the checkpoints assert)',
    );
  }

  // Body sections (quality — the module-plan rubrics score these too).
  const body = fm.body ?? '';
  for (const heading of [
    '## Step outline',
    '## Environment delta',
    '## Commands used',
    '## Expected outputs',
  ]) {
    const found = body.split(/\r?\n/).some((l) => l.trimStart().startsWith(heading));
    if (!found) warnings.push(`body section missing: "${heading}"`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

export interface ModulePlanInfo extends ModulePlanValidation {
  exists: boolean;
  /** Absolute path (null when the file is missing). */
  path: string | null;
  title: string | null;
  dependsOn: number[];
  estMinutes: number | null;
  imageChecklist: string[];
  successCriteria: string[];
}

/** Read + validate the module plan for a plan module (missing → exists:false). */
export function readModulePlan(guideDir: string, module: PlanModule): ModulePlanInfo {
  const nn = String(module.n).padStart(2, '0');
  const path = join(guideDir, '.holagent', `${nn}-${module.slug}`, 'plan.md');
  const base: ModulePlanInfo = {
    exists: false,
    path: null,
    valid: true,
    errors: [],
    warnings: [],
    title: null,
    dependsOn: [],
    estMinutes: null,
    imageChecklist: [],
    successCriteria: [],
  };
  if (!existsSync(path)) return base;
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (e) {
    throw new HolError(
      'E-READ',
      `E-READ: cannot read ${nn}-${module.slug}/plan.md: ${(e as Error).message}`,
    );
  }
  let fm: Frontmatter | null;
  let parseError: string | null = null;
  try {
    fm = parseFrontmatter(text);
  } catch (e) {
    // Malformed frontmatter degrades to invalid + the parse error, never a
    // crash (T-73) — /hol-plan-module's re-dispatch path needs the error list.
    fm = null;
    parseError = `frontmatter parse error: ${(e as Error).message}`;
  }
  const validation = validateModulePlanFrontmatter(fm, module);
  if (parseError) validation.errors.unshift(parseError);
  const data = fm?.data ?? {};
  const strList = (v: unknown): string[] =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      : [];
  const deps = data['depends_on'];
  return {
    ...base,
    ...validation,
    exists: true,
    path,
    title: typeof data['title'] === 'string' ? data['title'] : null,
    dependsOn: Array.isArray(deps)
      ? deps.filter((d): d is number => typeof d === 'number' && Number.isInteger(d))
      : [],
    estMinutes: typeof data['est_minutes'] === 'number' ? data['est_minutes'] : null,
    imageChecklist: strList(data['image_checklist']),
    successCriteria: strList(data['success_criteria']),
  };
}

// -------------------------------------------------------------- lab ref

/** Lifecycle stages that can be inherited from an already-built lab. */
export type LifecycleStage = 'concept' | 'sizing' | 'spec' | 'build';

const LIFECYCLE_STAGES: readonly LifecycleStage[] = ['concept', 'sizing', 'spec', 'build'];

export interface LabEnvironment {
  name: string;
  /** `dev` is the only kind an executing tool may ever target (ADR-012). */
  kind: 'dev' | 'prod';
  endpoint?: string;
  notes?: string;
}

/**
 * `.holagent/lab-ref.json` — the pointer to the lab's own repository (ADR-008).
 *
 * hol-core only ever *reads* this. Write confinement to the project root is
 * unchanged: the builder/QA agents reach the lab repo through ordinary tools,
 * never through this module.
 */
export interface LabRef {
  repo: string;
  origin: 'generated' | 'adopted';
  /** Stages inherited from an existing lab rather than produced here. */
  adoptedStages: LifecycleStage[];
  /** Spec dir, relative to `repo`. */
  specDir: string;
  platforms: string[];
  environments: LabEnvironment[];
}

/**
 * Read `.holagent/lab-ref.json`, normalising missing/By-hand fields to
 * defaults. A corrupt or unreadable file degrades to `null` (same posture as
 * last-validation.json) — never a crash.
 */
export function readLabRef(guideDir: string): LabRef | null {
  const path = join(guideDir, '.holagent', 'lab-ref.json');
  if (!existsSync(path)) return null;
  let raw: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    raw = parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  const repo = typeof raw.repo === 'string' ? raw.repo : '';
  if (!repo) return null;
  const strings = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  const envs: LabEnvironment[] = (Array.isArray(raw.environments) ? raw.environments : [])
    .filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null)
    .map((e) => ({
      name: typeof e.name === 'string' ? e.name : '',
      kind: (e.kind === 'dev' ? 'dev' : 'prod') as LabEnvironment['kind'],
      ...(typeof e.endpoint === 'string' ? { endpoint: e.endpoint } : {}),
      ...(typeof e.notes === 'string' ? { notes: e.notes } : {}),
    }))
    .filter((e) => e.name !== '');
  return {
    repo,
    origin: raw.origin === 'adopted' ? 'adopted' : 'generated',
    adoptedStages: strings(raw.adopted_stages).filter((x): x is LifecycleStage =>
      (LIFECYCLE_STAGES as readonly string[]).includes(x),
    ),
    specDir: typeof raw.spec_dir === 'string' && raw.spec_dir.trim() ? raw.spec_dir : 'spec',
    platforms: strings(raw.platforms),
    environments: envs,
  };
}

/**
 * The one environment lookup every executing tool must go through (ADR-012):
 * resolves a name to an environment and refuses anything not marked `dev`.
 */
export function resolveDevEnvironment(labRef: LabRef | null, name: string): LabEnvironment {
  if (!labRef) {
    throw new HolError('E-ARG', 'E-ARG: no lab-ref.json — register the lab repo first');
  }
  const env = labRef.environments.find((e) => e.name === name);
  if (!env) {
    const known = labRef.environments.map((e) => `${e.name} (${e.kind})`).join(', ') || 'none';
    throw new HolError('E-ARG', `E-ARG: unknown environment "${name}" — known: ${known}`);
  }
  if (env.kind !== 'dev') {
    throw new HolError(
      'E-ARG',
      `E-ARG: refusing to execute against environment "${name}" (kind: ${env.kind}) — ` +
        'only dev environments may be targeted (ADR-012). Use /hol-qa-prod, which emits a ' +
        'script for a human to run, for anything else.',
    );
  }
  return env;
}

// ----------------------------------------------------------- spec check

export interface SpecCheck {
  /** Absolute spec dir, or null when no lab repo is registered. */
  specDir: string | null;
  /** Spec files found, sorted. */
  files: string[];
  /** Expected NN prefixes (01..08) with no matching file. */
  missing: string[];
  openQuestions: { file: string | null; contentLines: number; substantive: boolean };
  /** Unfilled `<< FILL: ... >>` markers, by file. */
  unfilled: string[];
  ok: boolean;
}

const SPEC_PREFIXES = ['01', '02', '03', '04', '05', '06', '07', '08'] as const;

/** Minimum content lines for section 8 to count as substantive. */
const MIN_OPEN_QUESTION_LINES = 3;

/**
 * Deterministic gate for stage 2 (ADR-007): does the spec set exist, is every
 * numbered section present, and — the check that matters — is the Open
 * Questions & Assumptions section actually populated?
 *
 * An empty open-questions section is the reliable signal that the author hid
 * guesses inside the design rather than surfacing them, which is precisely
 * what this stage exists to prevent.
 *
 * Reads the lab repo through `lab-ref.json` (ADR-008); never writes there.
 */
export function checkSpec(labDir: string): SpecCheck {
  const labRef = readLabRef(labDir);
  const empty: SpecCheck = {
    specDir: null,
    files: [],
    missing: [...SPEC_PREFIXES],
    openQuestions: { file: null, contentLines: 0, substantive: false },
    unfilled: [],
    ok: false,
  };
  if (!labRef) return empty;

  const specDir = join(labRef.repo, labRef.specDir);
  const files = listFiles(specDir).filter((f) => f.endsWith('.md'));
  if (files.length === 0) return { ...empty, specDir };

  const missing = SPEC_PREFIXES.filter((nn) => !files.some((f) => f.startsWith(`${nn}-`)));

  const unfilled: string[] = [];
  for (const f of files) {
    try {
      if (readFileSync(join(specDir, f), 'utf8').includes('<< FILL: ')) unfilled.push(f);
    } catch {
      /* unreadable file surfaces via `missing` instead */
    }
  }

  // Open questions: the 08- file. "Content" excludes blanks, headings, and
  // unfilled markers — a section containing only a heading is empty.
  const oqFile = files.find((f) => f.startsWith('08-')) ?? null;
  let contentLines = 0;
  if (oqFile) {
    try {
      contentLines = readFileSync(join(specDir, oqFile), 'utf8')
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l !== '' && !l.startsWith('#') && !l.includes('<< FILL: ')).length;
    } catch {
      contentLines = 0;
    }
  }
  // Three content lines, not one: "None." and a single hand-wave are the exact
  // failure this gate exists to catch, and both clear a bare non-empty test.
  const substantive = contentLines >= MIN_OPEN_QUESTION_LINES;

  return {
    specDir,
    files,
    missing,
    openQuestions: { file: oqFile, contentLines, substantive },
    unfilled,
    ok: missing.length === 0 && unfilled.length === 0 && substantive,
  };
}

// --------------------------------------------------------------- status

export type ModuleState =
  'unplanned' | 'planned' | 'generated' | 'validated' | 'scored-passed' | 'scored-escalated';

export interface ModuleStatus {
  n: number;
  slug: string;
  title: string;
  /** Zero-padded NN (for commands: /hol-generate-module NN-slug). */
  nn: string;
  state: ModuleState;
  /** Module plan (`.holagent/<NN-slug>/plan.md`) presence + validation. */
  plan: { exists: boolean; valid: boolean; errors: string[]; warnings: string[] };
  scores?: { checklist?: number; analyticMean?: number };
}

/**
 * Lifecycle stage state (ADR-009). `n/a` means the lab has not opted into the
 * lifecycle: it predates it, so stages 1-3 do not apply and `next` behaves
 * exactly as it did before.
 */
export type StageState = 'n/a' | 'missing' | 'drafted' | 'approved' | 'adopted';
export type BuildState = 'n/a' | 'missing' | 'adopted' | 'in-progress' | 'smoke-passed';
export type GuideStageState = 'unplanned' | 'planned' | 'generating' | 'complete';

export interface LifecycleStatus {
  /**
   * True once the lab has a concept, a sizing, or a registered lab repo.
   * Until then holagent behaves exactly as the guide-only package did.
   */
  engaged: boolean;
  concept: StageState;
  sizing: StageState;
  spec: StageState;
  build: BuildState;
  guide: GuideStageState;
  ship: { platforms: string[]; launch: boolean };
}

export interface GuideStatus {
  guide: {
    slug: string;
    id: string | null;
    title: string | null;
    /** The file status was read from: `guide.md`, the released name, or null. */
    file: string | null;
    /** True when the guide has been renamed and left the pipeline (ADR-005). */
    released: boolean;
  };
  research: { companies: string[]; products: string[] };
  plan: {
    exists: boolean;
    valid: boolean;
    errors: string[];
    warnings: string[];
    moduleCount: number;
    objectives: number;
  };
  modules: ModuleStatus[];
  lifecycle: LifecycleStatus;
  labRef: LabRef | null;
  lastValidation: { ok: boolean; errors: number; warnings: number; at: string } | null;
  next: string;
}

interface LastValidation {
  ok: boolean;
  at: string;
  summary?: { errors: number; warnings: number };
  findings?: Array<{ rule: string; severity: string; line: number; message: string }>;
}

/** File names directly inside `dir` (empty when the dir is absent). */
function listFiles(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isFile())
      .map((d) => d.name)
      .sort();
  } catch {
    return [];
  }
}

function listSubdirs(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
  } catch {
    return [];
  }
}

/**
 * Derive guide state from files + scores (spec §02 §3.6).
 * Per module: unplanned → planned → generated → validated →
 * scored-passed | scored-escalated. A failing fresh linter run drops a
 * previously scored module back to `generated` (scores are stale).
 */
export function readGuideStatus(guideDir: string): GuideStatus {
  const plan = readPlan(guideDir);

  // guide.md is absent in two very different situations, and conflating them
  // produces a misleading status:
  //   1. stages 1-3, before /hol-plan scaffolds it (ADR-009);
  //   2. the guide was released — renamed to `<ID>-<Title>.md` (ADR-005).
  // In case 2 the content still exists, so read it: module states stay
  // accurate after release instead of collapsing back to "planned".
  // Present-but-unreadable guide.md remains a hard error.
  const guidePath = join(guideDir, 'guide.md');
  let guideFile: string | null = null;
  let released = false;
  let guideText = '';
  if (existsSync(guidePath)) {
    guideFile = 'guide.md';
    try {
      guideText = readFileSync(guidePath, 'utf8');
    } catch (e) {
      throw new HolError('E-READ', `E-READ: cannot read guide.md: ${(e as Error).message}`);
    }
  } else {
    const releasedName = listFiles(guideDir).find((f) => /^HOL-\d{4}-\d{2}[-_ ].*\.md$/i.test(f));
    if (releasedName !== undefined) {
      try {
        guideText = readFileSync(join(guideDir, releasedName), 'utf8');
        guideFile = releasedName;
        released = true;
      } catch {
        guideText = '';
      }
    }
  }
  const config = loadFormatConfig();
  const scan = scanMarkdown(guideText.split(/\r?\n/), config);
  const moduleMap = new Map<number, { startLine: number; endLine: number }>();
  for (const { section, n } of moduleSections({ scan, config })) {
    moduleMap.set(n, { startLine: section.startLine, endLine: section.endLine });
  }

  // guide id/title: plan is authoritative; H1 is the fallback.
  const h1 = guideText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.startsWith('# '));
  const h1m = h1?.match(/^#\s+(HOL-\d{4}-\d{2})\s+(.+?)\s*$/);
  const id = plan.id ?? h1m?.[1] ?? null;
  const title = plan.title ?? h1m?.[2] ?? null;

  // last validation (recorded by hol_validate).
  let lastValidation: GuideStatus['lastValidation'] = null;
  let lastVal: LastValidation | null = null;
  const lvPath = join(guideDir, '.holagent', 'last-validation.json');
  if (existsSync(lvPath)) {
    try {
      lastVal = JSON.parse(readFileSync(lvPath, 'utf8')) as LastValidation;
      lastValidation = {
        ok: Boolean(lastVal?.ok),
        errors: lastVal?.summary?.errors ?? 0,
        warnings: lastVal?.summary?.warnings ?? 0,
        at: typeof lastVal?.at === 'string' ? lastVal.at : '',
      };
    } catch {
      lastVal = null; // corrupt state file: treat as "no validation recorded"
    }
  }

  const scores = readScores(guideDir);

  const modules: ModuleStatus[] = plan.modules.map((m) => {
    const nn = String(m.n).padStart(2, '0');
    const scope = `module-${nn}-${m.slug}`;
    const modulePlan = readModulePlan(guideDir, m);
    const hasModulePlan = modulePlan.exists;
    const section = moduleMap.get(m.n);
    // "Generated" = real content: the scaffold leaves `<< FILL: ... >>`
    // placeholders in the section; a planned-but-unwritten module must not
    // read as generated/validated.
    const sectionText =
      section !== undefined
        ? (guideText.split(/\r?\n/).slice(section.startLine - 1, section.endLine) as string[]).join(
            '\n',
          )
        : '';
    const hasRealContent = section !== undefined && !sectionText.includes('<< FILL: ');
    const entries = scores.filter((e) => e.scope === scope);
    const anyEscalated = entries.some((e) => e.status === 'escalated');
    const allPassed = entries.length > 0 && entries.every((e) => e.status === 'passed');
    const sectionErrors =
      lastVal && section
        ? (lastVal.findings ?? []).filter(
            (f) =>
              f.severity === 'error' && f.line >= section.startLine && f.line <= section.endLine,
          ).length
        : null;

    let state: ModuleState;
    if (anyEscalated) state = 'scored-escalated';
    else if (allPassed && hasRealContent && sectionErrors === 0) state = 'scored-passed';
    else if (!hasModulePlan) state = 'unplanned';
    else if (!hasRealContent) state = 'planned';
    else if (sectionErrors === 0) state = 'validated';
    else state = 'generated';

    const status: ModuleStatus = {
      n: m.n,
      slug: m.slug,
      title: m.title,
      nn,
      state,
      plan: {
        exists: modulePlan.exists,
        valid: modulePlan.valid,
        errors: modulePlan.errors,
        warnings: modulePlan.warnings,
      },
    };
    const scoresOut: { checklist?: number; analyticMean?: number } = {};
    const checklistEntries = entries.filter((e) => e.kind === 'checklist');
    if (checklistEntries.length > 0) {
      const latest = [...checklistEntries].sort((a, b) =>
        (b.updated_at ?? '').localeCompare(a.updated_at ?? ''),
      )[0]!;
      scoresOut.checklist = latest.score;
    }
    const analyticEntries = entries.filter((e) => e.kind === 'analytic');
    if (analyticEntries.length > 0) {
      scoresOut.analyticMean =
        analyticEntries.reduce((sum, e) => sum + e.score, 0) / analyticEntries.length;
    }
    if (scoresOut.checklist !== undefined || scoresOut.analyticMean !== undefined)
      status.scores = scoresOut;
    return status;
  });

  const dataDir = holagentDataDir();
  const companies = listSubdirs(join(dataDir, 'companies'));
  const products: string[] = [];
  for (const company of listSubdirs(join(dataDir, 'products'))) {
    for (const product of listSubdirs(join(dataDir, 'products', company))) {
      products.push(`${company}/${product}`);
    }
  }

  // ---- lifecycle (ADR-009) ----------------------------------------------
  const labRef = readLabRef(guideDir);
  const holDir = join(guideDir, '.holagent');
  const conceptExists = existsSync(join(holDir, 'concept.md'));
  const sizingExists = existsSync(join(holDir, 'sizing.md'));
  // A lab opts into the lifecycle by acquiring a concept, a sizing, or a
  // registered lab repo. Guides that predate it stay on the old behaviour.
  const engaged = conceptExists || sizingExists || labRef !== null;
  const adopted = new Set<LifecycleStage>(labRef?.adoptedStages ?? []);

  const stageState = (stage: LifecycleStage, exists: boolean): StageState => {
    if (!engaged) return 'n/a';
    if (adopted.has(stage)) return 'adopted';
    if (!exists) return 'missing';
    const entries = scores.filter((e) => e.scope === stage);
    return entries.length > 0 && entries.every((e) => e.status === 'passed')
      ? 'approved'
      : 'drafted';
  };

  // The spec lives in the lab's own repo; existence is the only thing read
  // across that boundary, and an unreadable path degrades to "missing".
  let specExists = false;
  if (labRef) {
    try {
      specExists =
        statSync(join(labRef.repo, labRef.specDir), { throwIfNoEntry: false })?.isDirectory() ??
        false;
    } catch {
      specExists = false;
    }
  }

  let build: BuildState;
  if (!engaged) build = 'n/a';
  else if (adopted.has('build')) build = 'adopted';
  else {
    let smokePassed = false;
    try {
      const smoke = JSON.parse(readFileSync(join(holDir, 'qa', 'smoke.json'), 'utf8')) as {
        ok?: unknown;
      };
      smokePassed = smoke?.ok === true;
    } catch {
      smokePassed = false;
    }
    if (smokePassed) build = 'smoke-passed';
    else if (scores.some((e) => e.scope.startsWith('build-'))) build = 'in-progress';
    else build = 'missing';
  }

  let guideStage: GuideStageState;
  if (released) guideStage = 'complete';
  else if (!plan.exists) guideStage = 'unplanned';
  else if (modules.length > 0 && modules.every((m) => m.state === 'scored-passed'))
    guideStage = 'complete';
  else if (modules.some((m) => m.state !== 'unplanned' && m.state !== 'planned'))
    guideStage = 'generating';
  else guideStage = 'planned';

  const platformFindings = listFiles(join(holDir, 'platform'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''));

  const lifecycle: LifecycleStatus = {
    engaged,
    concept: stageState('concept', conceptExists),
    sizing: stageState('sizing', sizingExists),
    spec: stageState('spec', specExists),
    build,
    guide: guideStage,
    ship: { platforms: platformFindings, launch: existsSync(join(guideDir, 'launch')) },
  };

  // ---- next ---------------------------------------------------------------
  const firstIncomplete = modules.find((m) => m.state !== 'scored-passed');
  const guideNext =
    !plan.exists || plan.errors.length > 0
      ? '/hol-plan'
      : firstIncomplete
        ? `/hol-generate-module ${firstIncomplete.nn}-${firstIncomplete.slug}`
        : '/hol-review-guide';

  // `next` never points backwards: once a plan exists the guide pipeline owns
  // it, exactly as before. Stages 1-3 only claim `next` for an engaged lab
  // that has not reached planning yet.
  let next = guideNext;
  if (released) {
    next = `none — guide released as ${guideFile} (restore guide.md to re-enter the pipeline, ADR-005)`;
  } else if (engaged && !plan.exists) {
    if (lifecycle.concept === 'missing' || lifecycle.sizing === 'missing') next = '/hol-concept';
    else if (lifecycle.spec === 'missing') next = '/hol-spec';
  }

  return {
    guide: { slug: basename(guideDir), id, title, file: guideFile, released },
    research: { companies, products: products.sort() },
    plan: {
      exists: plan.exists,
      valid: plan.valid,
      errors: plan.errors,
      warnings: plan.warnings,
      moduleCount: plan.modules.length,
      objectives: plan.objectives,
    },
    modules,
    lifecycle,
    labRef,
    lastValidation,
    next,
  };
}
