import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseFrontmatter } from '../extensions/frontmatter.ts';

const PLAN = `---
id: HOL-1345-01
title: "NVIDIA Enterprise RAG 2.3 Blueprint"
slug: nvidia-enterprise-rag-2-3
audience:
  - Dell field technical specialists
  - AI solution architects
prerequisites:
  - Knowledge of NVIDIA Enterprise AI Suite
duration_minutes: 60
objectives:
  - Configure a RAG collection
  - Ingest documents
environment:
  baseline: "Dev sandbox container, Ubuntu 22.04"
  urls: ["https://localhost:8090"]
  preloaded:
    - /mnt/cache/RAG_Files/Manufacturing/
modules:
  - { n: 1, slug: create-collections, title: "Create Collections", goal: "Create a collection", est_minutes: 10 }
  - { n: 2, slug: upload-documents, title: "Upload Documents", goal: "Ingest", est_minutes: 15 }
depends: [1, 2]
flag: true
---
# Guide Plan: narrative body here
`;

test('plan frontmatter: full schema parse', () => {
  const fm = parseFrontmatter(PLAN);
  assert.ok(fm);
  const d = fm.data;
  assert.equal(d.id, 'HOL-1345-01');
  assert.equal(d.title, 'NVIDIA Enterprise RAG 2.3 Blueprint');
  assert.equal(d.duration_minutes, 60);
  assert.equal(d.flag, true);
  assert.deepEqual(d.audience, ['Dell field technical specialists', 'AI solution architects']);
  assert.deepEqual(d.depends, [1, 2]);
  const env = d.environment as Record<string, unknown>;
  assert.equal(env.baseline, 'Dev sandbox container, Ubuntu 22.04');
  assert.deepEqual(env.urls, ['https://localhost:8090']);
  assert.deepEqual(env.preloaded, ['/mnt/cache/RAG_Files/Manufacturing/']);
  const mods = d.modules as Record<string, unknown>[];
  assert.equal(mods.length, 2);
  assert.equal(mods[0]!.n, 1);
  assert.equal(mods[0]!.slug, 'create-collections');
  assert.equal(mods[0]!.title, 'Create Collections');
  assert.equal(mods[1]!.est_minutes, 15);
  assert.match(fm.body, /^# Guide Plan: narrative body here/);
});

test('no frontmatter → null', () => {
  assert.equal(parseFrontmatter('# Just a heading\nbody\n'), null);
});

test('empty value → empty string (null-ish key)', () => {
  const fm = parseFrontmatter('---\nkey:\nother: 1\n---\n');
  assert.equal(fm?.data.key, '');
  assert.equal(fm?.data.other, 1);
});

test('malformed shape → throws', () => {
  assert.throws(() => parseFrontmatter('---\nkey value no colon\n---\n'));
});

test('CRLF frontmatter', () => {
  const fm = parseFrontmatter('---\r\nid: HOL-1-01\r\n---\r\nbody');
  assert.equal(fm?.data.id, 'HOL-1-01');
});

// T-65: multi-line flow objects — the shape the planner agent emits
// (valid YAML flow style spread over lines; the live guide's plan.md uses it).
test('T-65a: multi-line flow map list items parse', () => {
  const fm = parseFrontmatter(`---
modules:
  - {
      n: 1,
      slug: launch-qdrant,
      title: 'Launch the vector database',
      goal: 'Qdrant is running, and curl returns 200, proving readiness.',
      est_minutes: 10,
    }
  - {
      n: 2,
      slug: ingest-corpus,
      title: 'Ingest the corpus',
      goal: 'Point count matches the corpus size.',
      est_minutes: 20,
    }
---
body
`);
  assert.ok(fm);
  const mods = fm.data.modules as Record<string, unknown>[];
  assert.equal(mods.length, 2);
  assert.equal(mods[0]!.n, 1);
  assert.equal(mods[0]!.slug, 'launch-qdrant');
  assert.equal(mods[0]!.est_minutes, 10);
  assert.equal(mods[1]!.n, 2);
  assert.equal(mods[1]!.slug, 'ingest-corpus');
  assert.match(fm.body, /^body/);
});

test('T-65b: multi-line flow map as a key value parses', () => {
  const fm = parseFrontmatter(`---
config: {
  size: 64,
  distance: 'Cosine',
}
nested:
  inner:
    - a
---
x
`);
  assert.ok(fm);
  assert.deepEqual(fm.data.config, { size: 64, distance: 'Cosine' });
  const nested = fm.data.nested as Record<string, unknown>;
  assert.deepEqual(nested.inner, ['a']);
});

test('T-65c: unbalanced multi-line flow throws', () => {
  assert.throws(
    () =>
      parseFrontmatter(`---
modules:
  - {
      n: 1,
---
body
`),
    /unbalanced flow/,
  );
});

test('T-65d: live guide plan.md (agent-emitted flow style) parses', () => {
  const text = fs.readFileSync('guides/vector-corpus-search/.holagent/plan.md', 'utf8');
  const fm = parseFrontmatter(text);
  assert.ok(fm, 'live plan.md must have parseable frontmatter');
  assert.equal(fm.data.id, 'HOL-2000-01');
  const mods = fm.data.modules as Record<string, unknown>[];
  assert.equal(mods.length, 3);
  assert.equal(mods[0]!.n, 1);
  assert.equal(mods[0]!.slug, 'launch-qdrant');
  assert.equal(mods[2]!.est_minutes, 15);
  const env = fm.data.environment as Record<string, unknown>;
  assert.ok(Array.isArray(env.preloaded));
});
