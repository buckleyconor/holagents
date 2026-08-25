import { test } from 'node:test';
import assert from 'node:assert/strict';
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
