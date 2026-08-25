/**
 * Guide-root resolution (spec §02 §4.1). Shared by the linter CLI and the
 * extension tools (M4).
 */
import { existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export function isGuideDir(dir: string): boolean {
  const guide = join(dir, 'guide.md');
  const state = join(dir, '.holagent');
  return existsSync(guide) && (statSync(state, { throwIfNoEntry: false })?.isDirectory() ?? false);
}

/**
 * Nearest ancestor (up to `maxAncestors`) of `cwd` that is a guide dir
 * (contains guide.md + .holagent/). Null when none.
 */
export function resolveGuideRoot(cwd: string, maxAncestors = 3): string | null {
  let dir = resolve(cwd);
  for (let i = 0; i <= maxAncestors; i += 1) {
    if (isGuideDir(dir)) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
