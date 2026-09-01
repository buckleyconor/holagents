/**
 * holagent core logic — pure (no pi imports), directly unit-testable.
 * `extensions/hol.ts` is the thin pi registration layer on top of this.
 *
 * Contracts: spec §02 §4.1–4.3 (tools), §3.6 (state machine), §04 §3 (path
 * validation), §05 T-33…T-41.
 */
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
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
import { parseFrontmatter, type FmMap, type Frontmatter } from './frontmatter.ts';
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

// ------------------------------------------------------- build sequence

/**
 * One milestone of `<lab-repo>/<spec-dir>/07-build-sequence.md`.
 *
 * The build sequence carries mini-YAML frontmatter for the same reason
 * `plan.md` does: `/hol-build` consumes it one unit at a time, and "each
 * milestone is independently testable" is only true if each milestone says
 * how it is tested. `test` is that command (ADR-015).
 */
export interface BuildMilestone {
  n: number;
  slug: string;
  title: string;
  deliverable: string;
  exit: string;
  /** The milestone's own test command, run in the lab repo. */
  test: string;
  dependsOn: number[];
}

export interface BuildSequence {
  /** Absolute path to the build-sequence file, or null when unresolvable. */
  path: string | null;
  exists: boolean;
  milestones: BuildMilestone[];
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const MILESTONE_FIELDS = ['title', 'deliverable', 'exit', 'test'] as const;

/**
 * Read + validate the build sequence from the registered lab repo (ADR-008).
 *
 * Errors are machine-contract violations: they block `/hol-build`, exactly as
 * plan errors block the guide pipeline. A build sequence with no frontmatter
 * is not an error condition to crash on — it is an older or hand-written spec,
 * reported as invalid with the reason, so the command can say what to fix.
 */
export function readBuildSequence(labDir: string): BuildSequence {
  const empty = (over: Partial<BuildSequence> = {}): BuildSequence => ({
    path: null,
    exists: false,
    milestones: [],
    valid: false,
    errors: [],
    warnings: [],
    ...over,
  });
  const labRef = readLabRef(labDir);
  if (!labRef) {
    return empty({ errors: ['no lab-ref.json — run /hol-lab-register or /hol-adopt'] });
  }
  const specDir = join(labRef.repo, labRef.specDir);
  const file = listFiles(specDir).find((f) => f.startsWith('07-') && f.endsWith('.md'));
  if (!file) {
    return empty({
      path: null,
      errors: [`no 07-*.md build sequence in ${specDir} — run /hol-spec`],
    });
  }
  const path = join(specDir, file);
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (e) {
    return empty({ path, errors: [`cannot read ${file}: ${(e as Error).message}`] });
  }

  let fm: Frontmatter | null;
  try {
    fm = parseFrontmatter(text);
  } catch (e) {
    return empty({
      path,
      exists: true,
      errors: [`frontmatter parse error: ${(e as Error).message}`],
    });
  }
  if (!fm || !Array.isArray(fm.data.milestones)) {
    return empty({
      path,
      exists: true,
      errors: [
        `${file} has no machine-readable \`milestones\` frontmatter — /hol-build needs one entry ` +
          'per milestone with n, slug, title, deliverable, exit and test (ADR-015)',
      ],
    });
  }

  const errors: string[] = [];
  const warnings: string[] = [];
  const milestones: BuildMilestone[] = [];
  const seenN = new Set<number>();
  const seenSlug = new Set<string>();

  (fm.data.milestones as unknown[]).forEach((raw, i) => {
    const where = `milestones[${i}]`;
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      errors.push(`${where}: not a flow map — write one \`{ … }\` per milestone`);
      return;
    }
    const m = raw as FmMap;
    const n = Number(m.n);
    if (!Number.isInteger(n) || n < 1) {
      errors.push(`${where}: n must be an integer >= 1 (got ${JSON.stringify(m.n ?? null)})`);
      return;
    }
    if (seenN.has(n)) errors.push(`${where}: duplicate n ${n}`);
    seenN.add(n);
    const slug = typeof m.slug === 'string' ? m.slug.trim() : '';
    if (!SLUG_RE.test(slug)) {
      errors.push(`${where}: slug must be kebab-case (got ${JSON.stringify(m.slug ?? null)})`);
      return;
    }
    if (seenSlug.has(slug)) errors.push(`${where}: duplicate slug "${slug}"`);
    seenSlug.add(slug);
    const values: Record<string, string> = {};
    for (const field of MILESTONE_FIELDS) {
      const v = m[field];
      if (typeof v !== 'string' || v.trim() === '') {
        errors.push(`${where} (${slug}): ${field} is required`);
        values[field] = '';
      } else {
        values[field] = v.trim();
      }
    }
    const dependsOn = (Array.isArray(m.depends_on) ? m.depends_on : [])
      .map((d) => Number(d))
      .filter((d) => Number.isInteger(d) && d >= 1);
    milestones.push({
      n,
      slug,
      title: values.title ?? '',
      deliverable: values.deliverable ?? '',
      exit: values.exit ?? '',
      test: values.test ?? '',
      dependsOn,
    });
  });

  if (milestones.length === 0 && errors.length === 0) {
    errors.push('milestones is empty — a build sequence with no milestones cannot be built');
  }
  const numbers = new Set(milestones.map((m) => m.n));
  for (const m of milestones) {
    for (const d of m.dependsOn) {
      if (!numbers.has(d)) errors.push(`${m.slug}: depends_on ${d}, which is not a milestone`);
      if (d >= m.n) warnings.push(`${m.slug}: depends_on ${d} is not earlier in the sequence`);
    }
  }

  return {
    path,
    exists: true,
    milestones: milestones.sort((a, b) => a.n - b.n),
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function milestoneList(milestones: BuildMilestone[]): string {
  return milestones.map((m) => `${String(m.n).padStart(2, '0')}-${m.slug} (${m.title})`).join(', ');
}

/**
 * Resolve a `<milestone>` selector — `2`, `02-core-services`, or an
 * unambiguous case-insensitive title fragment. Mirrors the module selector so
 * `/hol-build` and `/hol-generate-module` accept the same shapes.
 */
export function resolveMilestoneSelector(
  milestones: BuildMilestone[] | null,
  arg: string,
): BuildMilestone {
  const selector = (arg ?? '').trim();
  if (!milestones || milestones.length === 0) {
    throw new HolError('E-ARG', 'E-ARG: no build milestones — run /hol-spec first');
  }
  const available = `available milestones: ${milestoneList(milestones)}`;
  if (NN_RE.test(selector)) {
    const n = Number(selector);
    const hit = milestones.find((m) => m.n === n);
    if (!hit) throw new HolError('E-ARG', `E-ARG: no milestone ${n} — ${available}`);
    return hit;
  }
  if (NN_SLUG_RE.test(selector)) {
    const m = selector.match(/^(\d{2})-(.+)$/)!;
    const n = Number(m[1]);
    const hit = milestones.find((x) => x.n === n && x.slug === m[2]);
    if (!hit) throw new HolError('E-ARG', `E-ARG: no milestone "${selector}" — ${available}`);
    return hit;
  }
  const frag = selector.toLowerCase();
  const hits = milestones.filter((m) => m.title.toLowerCase().includes(frag));
  if (hits.length === 1) return hits[0]!;
  throw new HolError('E-ARG', `E-ARG: ambiguous or unknown milestone "${arg}" — ${available}`);
}

// -------------------------------------------------------- shell execution

export interface ShellResult {
  command: string;
  cwd: string;
  /** Process exit code; null when it was killed (timeout or signal). */
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  /** Tail of the stream, truncated to `MAX_CAPTURE` characters. */
  stdout: string;
  stderr: string;
  truncated: boolean;
  ok: boolean;
}

const MAX_CAPTURE = 4000;
export const DEFAULT_EXEC_TIMEOUT_MS = 120_000;
export const MAX_EXEC_TIMEOUT_MS = 900_000;

function tail(s: string): { text: string; truncated: boolean } {
  const text = s ?? '';
  return text.length <= MAX_CAPTURE
    ? { text, truncated: false }
    : { text: text.slice(text.length - MAX_CAPTURE), truncated: true };
}

/**
 * Run one command through `bash -c` and capture it. The single place this
 * package executes anything, so the timeout, the capture limit and the
 * "killed counts as failure" rule are decided once.
 */
export function runShell(command: string, opts: { cwd: string; timeoutMs?: number }): ShellResult {
  const timeoutMs = Math.min(
    Math.max(Number(opts.timeoutMs) || DEFAULT_EXEC_TIMEOUT_MS, 1_000),
    MAX_EXEC_TIMEOUT_MS,
  );
  const started = Date.now();
  const res = spawnSync('bash', ['-c', command], {
    cwd: opts.cwd,
    timeout: timeoutMs,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    killSignal: 'SIGKILL',
  });
  const out = tail(res.stdout ?? '');
  const err = tail(res.stderr ?? (res.error ? String(res.error.message) : ''));
  const timedOut = res.error !== undefined && /ETIMEDOUT|timed? ?out/i.test(String(res.error));
  return {
    command,
    cwd: opts.cwd,
    exitCode: typeof res.status === 'number' ? res.status : null,
    timedOut: timedOut || (res.status === null && res.signal !== null),
    durationMs: Date.now() - started,
    stdout: out.text,
    stderr: err.text,
    truncated: out.truncated || err.truncated,
    ok: res.status === 0,
  };
}

// ------------------------------------------------------------ build test

export interface BuildTestRecord {
  version: 1;
  milestone: string;
  n: number;
  title: string;
  at: string;
  repo: string;
  test: string;
  ok: boolean;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  stdout: string;
  stderr: string;
}

/** `.holagent/build/<slug>.json` — the last recorded test run for a milestone. */
export function readBuildRecord(labDir: string, slug: string): BuildTestRecord | null {
  try {
    const raw: unknown = JSON.parse(
      readFileSync(join(labDir, '.holagent', 'build', `${slug}.json`), 'utf8'),
    );
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
    return raw as BuildTestRecord;
  } catch {
    return null;
  }
}

/**
 * Run one milestone's declared `test` command in the lab repo and record the
 * result to `.holagent/build/<slug>.json` — the deterministic stage-3 gate
 * (ADR-007/ADR-015), the build track's equivalent of `hol_validate`.
 *
 * The lab repo is local code the user registered and confirmed (ADR-008); this
 * is not an environment execution, so ADR-012 does not apply. It runs the
 * command the spec declared, and nothing it composed itself.
 */
export function runBuildTest(
  labDir: string,
  milestone: BuildMilestone,
  timeoutMs?: number,
): BuildTestRecord {
  const labRef = readLabRef(labDir);
  if (!labRef) {
    throw new HolError('E-ARG', 'E-ARG: no lab-ref.json — register the lab repo first');
  }
  if (!statSync(labRef.repo, { throwIfNoEntry: false })?.isDirectory()) {
    throw new HolError('E-PATH', `E-PATH: lab repo is not a directory: ${labRef.repo}`);
  }
  if (!milestone.test) {
    throw new HolError(
      'E-ARG',
      `E-ARG: milestone "${milestone.slug}" declares no test command — a milestone that ` +
        'cannot be tested on its own is a phase, not a milestone (ADR-015)',
    );
  }
  const result = runShell(milestone.test, { cwd: labRef.repo, timeoutMs });
  const record: BuildTestRecord = {
    version: 1,
    milestone: milestone.slug,
    n: milestone.n,
    title: milestone.title,
    at: new Date().toISOString(),
    repo: labRef.repo,
    test: milestone.test,
    ok: result.ok,
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    durationMs: result.durationMs,
    stdout: result.stdout,
    stderr: result.stderr,
  };
  atomicWriteJson(join(labDir, '.holagent', 'build', `${milestone.slug}.json`), record);
  return record;
}

// ----------------------------------------------------- lab-prep check

/**
 * The seven `lab-prep.md` frontmatter keys (ADR-011). `baseline` and
 * `network` are scalars; the rest are lists of one-line flow maps.
 */
const PREP_LIST_FIELDS: Record<string, readonly string[]> = {
  software: ['name', 'version', 'where'],
  credentials: ['user', 'secret', 'applies_to'],
  endpoints: ['url', 'purpose'],
  artifacts: ['path', 'purpose'],
  verify: ['check', 'expect'],
};

const PREP_SCALARS = ['baseline', 'network'] as const;

/**
 * Keys that may not be empty. A lab with no credentials, no endpoints or no
 * preloaded artifacts is a real lab; a lab with no software or nothing to
 * verify is an unfinished contract.
 */
const PREP_REQUIRED_NONEMPTY = new Set(['baseline', 'network', 'software', 'verify']);

/**
 * `verify` entries `hol_parity` could not run unattended. This is a
 * runnability check, not a prose detector: whether the command *says*
 * something useful is a rubric's job (`checklist/spec-completeness`,
 * criterion `verify-entries-executable`); whether it would hang a
 * non-interactive run is decidable here, so it is decided here (ADR-007).
 */
const UNRUNNABLE: ReadonlyArray<{ re: RegExp; why: string }> = [
  { re: /(^|[;|&]\s*)sudo\b(?![^;|&]*\s-n\b)/, why: 'sudo without -n prompts for a password' },
  {
    re: /(^|[;|&]\s*)ssh\b(?![^;|&]*BatchMode=yes)/,
    why: 'ssh without -o BatchMode=yes can block on a prompt',
  },
  { re: /(^|[;|&\s])(vi|vim|nano|emacs|less|more|top|htop|watch)\b/, why: 'interactive program' },
  { re: /\btail\b[^;|&]*\s-f\b/, why: 'tail -f never exits' },
  { re: /(^|[;|&]\s*)read\b/, why: 'read waits for input' },
  { re: /\bapt(-get)?\s+install\b(?![^;|&]*\s-y\b)/, why: 'apt install without -y prompts' },
  {
    re: /\bdocker\s+(run|exec)\b[^;|&]*(\s-[a-zA-Z]*t[a-zA-Z]*\b|--tty\b)/,
    why: 'docker with a TTY (-t) needs a terminal',
  },
  { re: /\?\s*$/, why: 'reads as a question, not a command' },
];

export interface LabPrepCheck {
  /** Absolute path to `lab-prep.md`, whether or not it exists. */
  path: string;
  exists: boolean;
  /** Frontmatter present and inside the mini-YAML subset. */
  parsed: boolean;
  parseError: string | null;
  /** Required keys with no entry at all. */
  missing: string[];
  /** Required keys present but empty (no rows, or a blank scalar). */
  empty: string[];
  /** Rows missing a required field, e.g. `software[1]: missing version`. */
  incomplete: string[];
  /** Lines still carrying an unfilled `<< FILL: … >>` marker (first 10). */
  unfilled: string[];
  /** `verify` entries `hol_parity` could not run unattended. */
  unrunnable: string[];
  counts: Record<string, number>;
  ok: boolean;
}

/**
 * Deterministic check on the environment contract (ADR-011): does
 * `lab-prep.md` carry frontmatter that parses, name all seven keys, fill
 * every field of every row, and declare `verify` checks a machine can
 * actually run?
 *
 * The gate for `/hol-adopt`, where the whole file is reverse-engineered
 * guesswork until a human confirms it, and a re-usable check for `/hol-spec`,
 * which derives the same file from the sizing.
 */
export function checkLabPrep(labDir: string): LabPrepCheck {
  const path = join(labDir, 'lab-prep.md');
  const base: LabPrepCheck = {
    path,
    exists: false,
    parsed: false,
    parseError: null,
    missing: [...PREP_SCALARS, ...Object.keys(PREP_LIST_FIELDS)],
    empty: [],
    incomplete: [],
    unfilled: [],
    unrunnable: [],
    counts: {},
    ok: false,
  };
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return base;
  }

  const unfilled = text
    .split(/\r?\n/)
    .filter((l) => l.includes('<< FILL: '))
    .map((l) => l.trim())
    .slice(0, 10);

  let fm: Frontmatter | null;
  try {
    fm = parseFrontmatter(text);
  } catch (e) {
    return {
      ...base,
      exists: true,
      unfilled,
      parseError: `frontmatter outside the mini-YAML subset: ${(e as Error).message}`,
    };
  }
  if (!fm) {
    return { ...base, exists: true, unfilled, parseError: 'no frontmatter block' };
  }

  const data = fm.data;
  const missing: string[] = [];
  const empty: string[] = [];
  const incomplete: string[] = [];
  const unrunnable: string[] = [];
  const counts: Record<string, number> = {};

  for (const key of PREP_SCALARS) {
    const v = data[key];
    if (v === undefined) missing.push(key);
    else if (typeof v !== 'string' || v.trim() === '') empty.push(key);
  }

  for (const [key, fields] of Object.entries(PREP_LIST_FIELDS)) {
    const v = data[key];
    if (v === undefined) {
      missing.push(key);
      continue;
    }
    // `key:` with nothing under it parses as the empty string, not a list.
    const rows = Array.isArray(v) ? v : [];
    counts[key] = rows.length;
    if (rows.length === 0) {
      empty.push(key);
      continue;
    }
    rows.forEach((row, i) => {
      const where = `${key}[${i}]`;
      if (typeof row !== 'object' || row === null || Array.isArray(row)) {
        incomplete.push(`${where}: not a flow map — write one \`{ … }\` per entry`);
        return;
      }
      const map = row as FmMap;
      for (const field of fields) {
        const value = map[field];
        if (value === undefined) incomplete.push(`${where}: missing ${field}`);
        else if (typeof value === 'string' && value.trim() === '')
          incomplete.push(`${where}: empty ${field}`);
      }
      if (key === 'verify') {
        const check = typeof map.check === 'string' ? map.check.trim() : '';
        if (check !== '') {
          for (const { re, why } of UNRUNNABLE) {
            if (re.test(check)) {
              unrunnable.push(`${where}: ${why} — \`${check}\``);
              break;
            }
          }
        }
      }
    });
  }

  const requiredEmpty = empty.filter((k) => PREP_REQUIRED_NONEMPTY.has(k));
  return {
    path,
    exists: true,
    parsed: true,
    parseError: null,
    missing,
    empty,
    incomplete,
    unfilled,
    unrunnable,
    counts,
    ok:
      missing.length === 0 &&
      requiredEmpty.length === 0 &&
      incomplete.length === 0 &&
      unfilled.length === 0 &&
      unrunnable.length === 0,
  };
}

// ---------------------------------------------- platform findings check

export type FindingSeverity = 'blocker' | 'should-fix' | 'note';

const SEVERITIES: readonly FindingSeverity[] = ['blocker', 'should-fix', 'note'];
const FINDING_FIELDS = [
  'id',
  'category',
  'requirement',
  'observation',
  'impact',
  'action',
] as const;
const OWNERS = ['us', 'them'] as const;

export interface PlatformFindingsCheck {
  /** Absolute path to the findings file, whether or not it exists. */
  path: string;
  platform: string;
  exists: boolean;
  parsed: boolean;
  parseError: string | null;
  /** Shape problems, located by finding index. */
  problems: string[];
  /** Findings per severity; a compliant lab legitimately has none. */
  counts: Record<FindingSeverity, number>;
  /** Blocking findings, `id: action` — what stops this lab landing. */
  blockers: string[];
  /** What we need from the platform team. */
  asks: string[];
  /** What the requirements file does not cover. */
  unknowns: string[];
  ok: boolean;
}

/** Platform names with a findings file under `.holagent/platform/`. */
export function listPlatformFindings(labDir: string): string[] {
  return listFiles(join(labDir, '.holagent', 'platform'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''));
}

/**
 * Deterministic check on `.holagent/platform/<name>.json` (ADR-007/ADR-014):
 * is every finding severity-tagged, traced to a requirement, evidenced against
 * the lab, and closed with an action someone can take?
 *
 * A finding without an action is a complaint, and a finding without a
 * requirement is an opinion. Neither survives a meeting, so neither passes
 * the gate. An empty findings list is a pass: full compliance is a real
 * result, and `unknowns` is where an under-informed review says so.
 */
export function checkPlatformFindings(labDir: string, platform: string): PlatformFindingsCheck {
  const name = String(platform ?? '').trim();
  const path = join(labDir, '.holagent', 'platform', `${name}.json`);
  const base: PlatformFindingsCheck = {
    path,
    platform: name,
    exists: false,
    parsed: false,
    parseError: null,
    problems: [],
    counts: { blocker: 0, 'should-fix': 0, note: 0 },
    blockers: [],
    asks: [],
    unknowns: [],
    ok: false,
  };
  if (!name || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
    return { ...base, parseError: `not a platform slug: ${JSON.stringify(platform)}` };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    return existsSync(path)
      ? { ...base, exists: true, parseError: `unreadable JSON: ${(e as Error).message}` }
      : base;
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ...base, exists: true, parseError: 'top level must be a JSON object' };
  }
  const doc = raw as Record<string, unknown>;
  const problems: string[] = [];
  const strings = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [];

  if (doc.platform !== name) {
    problems.push(`platform: file is ${name}.json but declares ${JSON.stringify(doc.platform)}`);
  }
  if (typeof doc.requirements_source !== 'string' || doc.requirements_source.trim() === '') {
    problems.push('requirements_source: missing — a review must name what it reviewed against');
  }
  if (!Array.isArray(doc.findings)) {
    return {
      ...base,
      exists: true,
      parsed: true,
      problems: [...problems, 'findings: missing or not an array'],
    };
  }

  const counts: Record<FindingSeverity, number> = { blocker: 0, 'should-fix': 0, note: 0 };
  const blockers: string[] = [];
  const seen = new Set<string>();
  doc.findings.forEach((f, i) => {
    const where = `findings[${i}]`;
    if (typeof f !== 'object' || f === null || Array.isArray(f)) {
      problems.push(`${where}: not an object`);
      return;
    }
    const finding = f as Record<string, unknown>;
    for (const field of FINDING_FIELDS) {
      const v = finding[field];
      if (typeof v !== 'string' || v.trim() === '') problems.push(`${where}: missing ${field}`);
    }
    const id = typeof finding.id === 'string' ? finding.id.trim() : '';
    if (id !== '') {
      if (seen.has(id)) problems.push(`${where}: duplicate id "${id}"`);
      seen.add(id);
    }
    const severity = finding.severity;
    if (!SEVERITIES.includes(severity as FindingSeverity)) {
      problems.push(
        `${where}: severity must be ${SEVERITIES.join(' | ')}, got ${String(severity)}`,
      );
    } else {
      counts[severity as FindingSeverity] += 1;
      if (severity === 'blocker') {
        blockers.push(
          `${id || where}: ${typeof finding.action === 'string' ? finding.action : ''}`,
        );
      }
    }
    if (!OWNERS.includes(finding.owner as (typeof OWNERS)[number])) {
      problems.push(`${where}: owner must be ${OWNERS.join(' | ')}, got ${String(finding.owner)}`);
    }
  });

  return {
    path,
    platform: name,
    exists: true,
    parsed: true,
    parseError: null,
    problems,
    counts,
    blockers,
    asks: strings(doc.asks),
    unknowns: strings(doc.unknowns),
    ok: problems.length === 0,
  };
}

// ------------------------------------------------------------------- QA

export interface ParityCheck {
  n: number;
  check: string;
  expect: string;
  ok: boolean;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  stdout: string;
  stderr: string;
}

/** Declared contract items no `verify` check so much as mentions. */
export interface ParityCoverage {
  endpoints: string[];
  artifacts: string[];
  software: string[];
}

export interface ParityRecord {
  version: 1;
  env: string;
  endpoint: string | null;
  at: string;
  checks: ParityCheck[];
  coverage: ParityCoverage;
  summary: { total: number; passed: number; failed: number };
  /** Every declared check passed. Coverage gaps warn; they do not fail. */
  ok: boolean;
}

/** `lab-prep.md` rows, as the QA side needs them. */
interface PrepRows {
  verify: Array<{ check: string; expect: string }>;
  endpoints: Array<{ url: string; purpose: string }>;
  artifacts: Array<{ path: string; purpose: string }>;
  software: Array<{ name: string; version: string; where: string }>;
  baseline: string;
}

function rowStrings(data: FmMap, key: string, fields: readonly string[]): Record<string, string>[] {
  const raw = data[key];
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is FmMap => typeof r === 'object' && r !== null && !Array.isArray(r))
    .map((r) => {
      const out: Record<string, string> = {};
      for (const f of fields) out[f] = typeof r[f] === 'string' ? String(r[f]).trim() : '';
      return out;
    });
}

/**
 * The single reader both QA paths go through. `hol_parity` executes what it
 * returns against a dev environment; `hol_qa_script` renders the same list as
 * a script for a human to run elsewhere. One reader means the executed checks
 * and the production checklist cannot drift apart (ADR-016).
 */
function readPrepRows(labDir: string): PrepRows {
  const text = readFileSync(join(labDir, 'lab-prep.md'), 'utf8');
  const fm = parseFrontmatter(text);
  const data = fm?.data ?? {};
  return {
    baseline: typeof data.baseline === 'string' ? data.baseline : '',
    verify: rowStrings(data, 'verify', ['check', 'expect']) as PrepRows['verify'],
    endpoints: rowStrings(data, 'endpoints', ['url', 'purpose']) as PrepRows['endpoints'],
    artifacts: rowStrings(data, 'artifacts', ['path', 'purpose']) as PrepRows['artifacts'],
    software: rowStrings(data, 'software', ['name', 'version', 'where']) as PrepRows['software'],
  };
}

/** Tokens that would count as "this check exercises that declared item". */
function coverageTokens(kind: keyof ParityCoverage, row: Record<string, string>): string[] {
  if (kind === 'endpoints') {
    const url = row.url ?? '';
    const noScheme = url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
    const port = url.match(/:(\d{2,5})(?:\/|$)/)?.[1] ?? '';
    return [url, noScheme, port].filter((t) => t.length >= 2);
  }
  if (kind === 'artifacts') {
    const path = row.path ?? '';
    return [path, path.split('/').filter(Boolean).pop() ?? ''].filter((t) => t.length >= 2);
  }
  return [row.name ?? '', row.version ?? ''].filter((t) => t.length >= 2);
}

/**
 * What the contract declares but nothing checks. Reported as a warning, never
 * as a synthesized check: `hol_parity` runs the checks the author wrote and
 * nothing it composed itself, because only the author knows whether the QA
 * host can reach a given path or port (ADR-016).
 */
function parityCoverage(rows: PrepRows): ParityCoverage {
  const commands = rows.verify.map((v) => v.check.toLowerCase());
  const uncovered = (kind: keyof ParityCoverage, list: Record<string, string>[], label: string) =>
    list
      .filter(
        (row) =>
          !coverageTokens(kind, row).some((t) => commands.some((c) => c.includes(t.toLowerCase()))),
      )
      .map((row) => row[label] ?? '')
      .filter((s) => s !== '');
  return {
    endpoints: uncovered('endpoints', rows.endpoints, 'url'),
    artifacts: uncovered('artifacts', rows.artifacts, 'path'),
    software: uncovered('software', rows.software, 'name'),
  };
}

/** Shared precondition: the contract must be readable and runnable. */
function parityRows(labDir: string): PrepRows {
  const prep = checkLabPrep(labDir);
  if (!prep.exists) {
    throw new HolError('E-READ', `E-READ: no lab-prep.md at ${prep.path} — nothing to verify`);
  }
  if (!prep.parsed) {
    throw new HolError('E-READ', `E-READ: lab-prep.md ${prep.parseError}`);
  }
  const rows = readPrepRows(labDir);
  if (rows.verify.length === 0) {
    throw new HolError(
      'E-ARG',
      'E-ARG: lab-prep.md declares no verify checks — there is nothing to prove about this lab',
    );
  }
  const blank = rows.verify
    .map((v, i) => (v.check === '' || v.expect === '' ? `verify[${i}]` : null))
    .filter((x): x is string => x !== null);
  if (blank.length > 0) {
    throw new HolError(
      'E-ARG',
      `E-ARG: lab-prep.md has verify entries with an empty check or expect (${blank.join(', ')}) — ` +
        'run hol_prep_check and fix the contract before verifying against it',
    );
  }
  if (prep.unrunnable.length > 0) {
    throw new HolError(
      'E-ARG',
      `E-ARG: lab-prep.md has verify checks that cannot run unattended — ${prep.unrunnable.join('; ')}`,
    );
  }
  return rows;
}

/**
 * Execute the environment contract against a **dev** environment and record
 * `.holagent/qa/parity.json` (ADR-011/ADR-012).
 *
 * Resolves the environment through `resolveDevEnvironment`, which refuses
 * anything not marked `dev`. There is no override parameter, because a guard
 * with an override is a guard a prompt can be talked past.
 */
export function runParity(labDir: string, envName: string, timeoutMs?: number): ParityRecord {
  const env = resolveDevEnvironment(readLabRef(labDir), envName);
  const rows = parityRows(labDir);
  const checks: ParityCheck[] = rows.verify.map((v, i) => {
    const res = runShell(v.check, { cwd: labDir, timeoutMs });
    return {
      n: i,
      check: v.check,
      expect: v.expect,
      ok: res.ok,
      exitCode: res.exitCode,
      timedOut: res.timedOut,
      durationMs: res.durationMs,
      stdout: res.stdout,
      stderr: res.stderr,
    };
  });
  const passed = checks.filter((c) => c.ok).length;
  const record: ParityRecord = {
    version: 1,
    env: env.name,
    endpoint: env.endpoint ?? null,
    at: new Date().toISOString(),
    checks,
    coverage: parityCoverage(rows),
    summary: { total: checks.length, passed, failed: checks.length - passed },
    ok: passed === checks.length,
  };
  atomicWriteJson(join(labDir, '.holagent', 'qa', 'parity.json'), record);
  return record;
}

export interface QaScript {
  env: string;
  kind: 'dev' | 'prod';
  /** Absolute path the script was written to. */
  path: string;
  script: string;
  /** Items no check covers — the human checklist. */
  checklist: string[];
}

function shQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/**
 * Render the same `verify` checks as a self-contained script plus a human
 * checklist, for **any** environment. Executes nothing (ADR-012): this is the
 * production path, and production verification is a human act.
 */
export function renderQaScript(labDir: string, envName: string): QaScript {
  const labRef = readLabRef(labDir);
  if (!labRef) {
    throw new HolError('E-ARG', 'E-ARG: no lab-ref.json — register the lab repo first');
  }
  const env = labRef.environments.find((e) => e.name === envName);
  if (!env) {
    const known = labRef.environments.map((e) => `${e.name} (${e.kind})`).join(', ') || 'none';
    throw new HolError('E-ARG', `E-ARG: unknown environment "${envName}" — known: ${known}`);
  }
  const rows = parityRows(labDir);
  const coverage = parityCoverage(rows);

  const lines: string[] = [
    '#!/usr/bin/env bash',
    '# Generated by holagent /hol-qa-prod — do not edit; regenerate instead.',
    `# Lab: ${basename(labDir)}   Environment: ${env.name} (${env.kind})`,
    env.endpoint ? `# Endpoint: ${env.endpoint}` : '# Endpoint: not recorded',
    `# Baseline: ${rows.baseline || 'not recorded'}`,
    '#',
    '# Every check below is read-only and comes verbatim from lab-prep.md.',
    '# Run it yourself against the environment above; nothing here is executed',
    '# by an agent (ADR-012). Report the summary line back to /hol-qa-prod.',
    '',
    'set -uo pipefail  # deliberately not -e: every check runs, then we total up',
    'pass=0; fail=0',
    '',
    'check() {  # check <n> <expected> <command…>',
    '  local n="$1"; local expected="$2"; shift 2',
    '  printf "\\n[%s] %s\\n" "$n" "$*"',
    '  printf "    expect: %s\\n" "$expected"',
    '  if "$@"; then pass=$((pass+1)); printf "    RESULT: pass\\n"',
    '  else fail=$((fail+1)); printf "    RESULT: FAIL (exit %s)\\n" "$?"; fi',
    '}',
    '',
  ];
  rows.verify.forEach((v, i) => {
    lines.push(`check ${i} ${shQuote(v.expect)} bash -c ${shQuote(v.check)}`);
  });
  lines.push(
    '',
    'printf "\\n=== %s: %s passed, %s failed ===\\n" ' + shQuote(env.name) + ' "$pass" "$fail"',
    '[ "$fail" -eq 0 ]',
    '',
  );
  const script = lines.join('\n');

  const checklist: string[] = [
    ...coverage.endpoints.map((u) => `Endpoint declared but no check covers it: ${u}`),
    ...coverage.artifacts.map((p) => `Artifact declared but no check covers it: ${p}`),
    ...coverage.software.map((s) => `Software declared but no check covers it: ${s}`),
  ];

  const path = join(labDir, '.holagent', 'qa', `verify-${env.name}.sh`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, script, { mode: 0o755 });
  chmodSync(path, 0o755);
  return { env: env.name, kind: env.kind, path, script, checklist };
}

export type QaRecordKind = 'smoke' | 'e2e-prod';

export interface QaResultRecord {
  version: 1;
  kind: QaRecordKind;
  env: string;
  at: string;
  ok: boolean;
  checks: Array<{ name: string; ok: boolean; note?: string }>;
  notes: string;
}

/**
 * Validated, atomic write of an asserted QA outcome —
 * `.holagent/qa/smoke.json` (an agent's dev bring-up result) or
 * `.holagent/qa/e2e-prod.json` (what a human reports after running the
 * script). `smoke.json` is what moves the build stage to `smoke-passed`, so
 * it goes through one checked path rather than an ad-hoc write.
 *
 * The environment's `kind` must match the record's: a production end-to-end
 * result cannot be filed against a dev environment, or the reverse.
 */
export function recordQaResult(
  labDir: string,
  kind: QaRecordKind,
  input: {
    env: string;
    ok: boolean;
    checks?: Array<{ name: string; ok: boolean; note?: string }>;
    notes?: string;
  },
): QaResultRecord {
  if (kind !== 'smoke' && kind !== 'e2e-prod') {
    throw new HolError('E-ARG', `E-ARG: kind must be "smoke" or "e2e-prod", got ${String(kind)}`);
  }
  const labRef = readLabRef(labDir);
  if (!labRef) {
    throw new HolError('E-ARG', 'E-ARG: no lab-ref.json — register the lab repo first');
  }
  const env = labRef.environments.find((e) => e.name === input?.env);
  if (!env) {
    const known = labRef.environments.map((e) => `${e.name} (${e.kind})`).join(', ') || 'none';
    throw new HolError('E-ARG', `E-ARG: unknown environment "${input?.env}" — known: ${known}`);
  }
  const expected = kind === 'e2e-prod' ? 'prod' : 'dev';
  if (env.kind !== expected) {
    throw new HolError(
      'E-ARG',
      `E-ARG: a "${kind}" result belongs to a ${expected} environment, but "${env.name}" is ` +
        `${env.kind} — recording it here would misstate what was verified`,
    );
  }
  if (typeof input?.ok !== 'boolean') {
    throw new HolError('E-ARG', 'E-ARG: ok must be true or false — an unstated outcome is not one');
  }
  const checks = (Array.isArray(input.checks) ? input.checks : [])
    .filter((c): c is { name: string; ok: boolean; note?: string } => {
      return (
        typeof c === 'object' &&
        c !== null &&
        typeof (c as { name?: unknown }).name === 'string' &&
        String((c as { name: string }).name).trim() !== '' &&
        typeof (c as { ok?: unknown }).ok === 'boolean'
      );
    })
    .map((c) => ({
      name: c.name.trim(),
      ok: c.ok,
      ...(typeof c.note === 'string' && c.note.trim() ? { note: c.note.trim() } : {}),
    }));
  if (input.ok && checks.some((c) => !c.ok)) {
    throw new HolError(
      'E-ARG',
      'E-ARG: ok is true but a listed check failed — record the outcome the checks show',
    );
  }
  const record: QaResultRecord = {
    version: 1,
    kind,
    env: env.name,
    at: new Date().toISOString(),
    ok: input.ok,
    checks,
    notes: typeof input.notes === 'string' ? input.notes : '',
  };
  atomicWriteJson(join(labDir, '.holagent', 'qa', `${kind}.json`), record);
  return record;
}

/** Last recorded QA outcomes, for `hol_status`. Corrupt files read as absent. */
function readQaSummary(labDir: string): GuideStatus['qa'] {
  const read = (file: string): Record<string, unknown> | null => {
    try {
      const raw: unknown = JSON.parse(readFileSync(join(labDir, '.holagent', 'qa', file), 'utf8'));
      return typeof raw === 'object' && raw !== null && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  };
  const outcome = (file: string) => {
    const d = read(file);
    if (!d) return null;
    return {
      ok: d.ok === true,
      env: typeof d.env === 'string' ? d.env : '',
      at: typeof d.at === 'string' ? d.at : '',
    };
  };
  const p = read('parity.json');
  const summary = (p?.summary ?? {}) as { passed?: unknown; failed?: unknown };
  return {
    parity: p
      ? {
          ok: p.ok === true,
          env: typeof p.env === 'string' ? p.env : '',
          at: typeof p.at === 'string' ? p.at : '',
          passed: Number(summary.passed) || 0,
          failed: Number(summary.failed) || 0,
        }
      : null,
    smoke: outcome('smoke.json'),
    prod: outcome('e2e-prod.json'),
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
 * Milestone state (stage 3), derived exactly as module state is — from the
 * recorded test run and `scores.json`, never from the model's word for it.
 * `pending` covers "not started" and "started but never tested"; whether code
 * exists in the lab repo is not this package's to assert.
 */
export type MilestoneState =
  'pending' | 'test-failed' | 'tested' | 'scored-passed' | 'scored-escalated';

export interface MilestoneStatus {
  n: number;
  slug: string;
  title: string;
  /** Zero-padded NN (for commands: /hol-build NN-slug). */
  nn: string;
  state: MilestoneState;
  test: string;
  lastTest: { ok: boolean; at: string; exitCode: number | null; timedOut: boolean } | null;
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
  /** Stage-3 milestones from the spec's build sequence (empty when there is none). */
  milestones: MilestoneStatus[];
  build: { valid: boolean; errors: string[]; warnings: string[] };
  /** Last recorded QA outcomes (stage 3 / stage 5). */
  qa: {
    parity: { ok: boolean; env: string; at: string; passed: number; failed: number } | null;
    smoke: { ok: boolean; env: string; at: string } | null;
    prod: { ok: boolean; env: string; at: string } | null;
  };
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

  // ---- milestones (stage 3, ADR-015) ------------------------------------
  const buildSeq = readBuildSequence(guideDir);
  const milestones: MilestoneStatus[] = buildSeq.milestones.map((m) => {
    const scope = `build-${m.slug}`;
    const entries = scores.filter((e) => e.scope === scope);
    const record = readBuildRecord(guideDir, m.slug);
    const anyEscalated = entries.some((e) => e.status === 'escalated');
    const allPassed = entries.length > 0 && entries.every((e) => e.status === 'passed');

    let state: MilestoneState;
    if (anyEscalated) state = 'scored-escalated';
    else if (allPassed && record?.ok === true) state = 'scored-passed';
    else if (record === null) state = 'pending';
    else state = record.ok ? 'tested' : 'test-failed';

    const status: MilestoneStatus = {
      n: m.n,
      slug: m.slug,
      title: m.title,
      nn: String(m.n).padStart(2, '0'),
      state,
      test: m.test,
      lastTest: record
        ? {
            ok: Boolean(record.ok),
            at: typeof record.at === 'string' ? record.at : '',
            exitCode: typeof record.exitCode === 'number' ? record.exitCode : null,
            timedOut: Boolean(record.timedOut),
          }
        : null,
    };
    const scoresOut: { checklist?: number; analyticMean?: number } = {};
    const checklist = entries.filter((e) => e.kind === 'checklist');
    if (checklist.length > 0) {
      scoresOut.checklist = [...checklist].sort((a, b) =>
        (b.updated_at ?? '').localeCompare(a.updated_at ?? ''),
      )[0]!.score;
    }
    const analytic = entries.filter((e) => e.kind === 'analytic');
    if (analytic.length > 0) {
      scoresOut.analyticMean = analytic.reduce((sum, e) => sum + e.score, 0) / analytic.length;
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

  const qa = readQaSummary(guideDir);

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
    const started =
      milestones.some((m) => m.state !== 'pending') ||
      scores.some((e) => e.scope.startsWith('build-'));
    if (qa.smoke?.ok === true) build = 'smoke-passed';
    else if (started) build = 'in-progress';
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

  const platformFindings = listPlatformFindings(guideDir);

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
    milestones,
    build: { valid: buildSeq.valid, errors: buildSeq.errors, warnings: buildSeq.warnings },
    qa,
    lifecycle,
    labRef,
    lastValidation,
    next,
  };
}
