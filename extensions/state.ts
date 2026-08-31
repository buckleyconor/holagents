/**
 * Lab-root and guide-root resolution (spec §02 §4.1). Shared by the linter
 * CLI and the extension tools (M4).
 *
 * Two predicates, because the lifecycle starts before `guide.md` exists
 * (ADR-009): stages 1–3 (concept, spec, build) run in a dir that has only
 * `.holagent/`. `guide.md` appears when `/hol-plan` scaffolds it.
 *
 * - `isLabDir`   — `.holagent/` present. The lifecycle root; what `hol_status`
 *                  and `hol_scores` operate on.
 * - `isGuideDir` — a lab dir that also has `guide.md`. What the linter needs,
 *                  since there is nothing to lint without it.
 */
import { existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/** `.holagent/` is present — the lifecycle root, guide.md not required. */
export function isLabDir(dir: string): boolean {
  return statSync(join(dir, '.holagent'), { throwIfNoEntry: false })?.isDirectory() ?? false;
}

/** A lab dir that has reached the guide stage (guide.md + .holagent/). */
export function isGuideDir(dir: string): boolean {
  return isLabDir(dir) && existsSync(join(dir, 'guide.md'));
}

/** Nearest ancestor of `cwd` (up to `maxAncestors`) satisfying `predicate`. */
function resolveRoot(
  cwd: string,
  predicate: (dir: string) => boolean,
  maxAncestors: number,
): string | null {
  let dir = resolve(cwd);
  for (let i = 0; i <= maxAncestors; i += 1) {
    if (predicate(dir)) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * Nearest ancestor (up to `maxAncestors`) of `cwd` that is a lab dir
 * (contains `.holagent/`). Null when none.
 */
export function resolveLabRoot(cwd: string, maxAncestors = 3): string | null {
  return resolveRoot(cwd, isLabDir, maxAncestors);
}

/**
 * Nearest ancestor (up to `maxAncestors`) of `cwd` that is a guide dir
 * (contains guide.md + .holagent/). Null when none.
 */
export function resolveGuideRoot(cwd: string, maxAncestors = 3): string | null {
  return resolveRoot(cwd, isGuideDir, maxAncestors);
}
