#!/usr/bin/env node
/**
 * sync-corpus.mjs — copies the team's working sample guides (lab-guides/)
 * into the package style corpus (skills/style-corpus/samples/).
 * Run: npm run corpus:sync   (then commit both the samples and any
 * changed test/corpus/expected/*.json baselines)
 */
import { cpSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'lab-guides');
const dst = join(root, 'skills', 'style-corpus', 'samples');
mkdirSync(dst, { recursive: true });
let n = 0;
for (const f of readdirSync(src)
  .filter((f) => f.endsWith('.md'))
  .sort()) {
  cpSync(join(src, f), join(dst, f), { force: true });
  n += 1;
}
console.log(`synced ${n} sample guide(s) → skills/style-corpus/samples/`);
