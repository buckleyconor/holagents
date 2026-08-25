#!/usr/bin/env node
/**
 * package-smoke.mjs — T-47/T-48/T-49.
 * Unpacks the built tarball and verifies:
 *  1. every `pi.*` manifest path exists in the package,
 *  2. every SKILL.md and agent file has valid frontmatter (name + description),
 *  3. zero provenance branding: no case-insensitive "instruqt" or "claude" in
 *     shipped prompts/skills/agents,
 *  4. no non-peer runtime dependencies (T-49).
 *
 * Usage: node scripts/package-smoke.mjs <path-to-tgz>
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const tgz = process.argv[2];
if (!tgz) {
  console.error('usage: node scripts/package-smoke.mjs <path-to-tgz>');
  process.exit(3);
}

// Unpack to a temp dir and inspect the real contents.
const dir = mkdtempSync(join(tmpdir(), 'holagent-smoke-'));
try {
  execFileSync('tar', ['xzf', tgz, '-C', dir], { stdio: 'pipe' });
  const root = join(dir, 'package');
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

  let failures = 0;
  const fail = (msg) => {
    failures += 1;
    console.error(`FAIL: ${msg}`);
  };

  // 1. pi manifest paths exist
  for (const key of ['extensions', 'skills', 'prompts']) {
    for (const entry of manifest.pi?.[key] ?? []) {
      const p = resolve(root, entry.replace(/^\.\//, ''));
      if (!statSync(p, { throwIfNoEntry: false })) fail(`pi.${key} path missing: ${entry}`);
    }
  }

  // 2. frontmatter validity for SKILL.md and agent files
  const walk = (p) =>
    readdirSync(p, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(p, e.name)) : [join(p, e.name)],
    );
  const skillDirs = walk(join(root, 'skills'))
    .filter((f) => f.endsWith('SKILL.md'))
    .map((f) => join(f, '..'));
  for (const dirName of skillDirs) {
    const text = readFileSync(join(dirName, 'SKILL.md'), 'utf8');
    const fm = frontmatter(text);
    if (!fm?.name || !fm?.description) fail(`bad skill frontmatter: ${dirName}`);
    if (fm?.name && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(fm.name)) fail(`bad skill name: ${fm.name}`);
  }
  for (const f of walk(join(root, 'agents')).filter((f) => f.endsWith('.md'))) {
    const fm = frontmatter(readFileSync(f, 'utf8'));
    if (!fm?.name || !fm?.description) fail(`bad agent frontmatter: ${f}`);
  }

  // 3. zero provenance branding in shipped content
  const branded = [];
  for (const sub of ['prompts', 'skills', 'agents']) {
    for (const f of walk(join(root, sub)).filter((f) => f.endsWith('.md'))) {
      const text = readFileSync(f, 'utf8').toLowerCase();
      for (const term of ['instruqt', 'claude']) {
        if (text.includes(term)) branded.push(`${f} (contains "${term}")`);
      }
    }
  }
  if (branded.length) fail(`provenance branding found: ${branded.join('; ')}`);

  // 4. dependency hygiene
  if (Object.keys(manifest.dependencies ?? {}).length > 0) {
    fail(`runtime dependencies present: ${Object.keys(manifest.dependencies).join(', ')}`);
  }

  if (failures > 0) {
    console.error(`package-smoke: ${failures} failure(s)`);
    process.exit(1);
  }
  console.log('package-smoke: OK');
} finally {
  rmSync(dir, { recursive: true, force: true });
}

function frontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  // Minimal YAML: top-level `key: value` pairs only (sufficient for name/description).
  const out = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([a-zA-Z][a-zA-Z0-9_-]*):\s*(.*)$/);
    if (kv) out[kv[1]] = kv[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
