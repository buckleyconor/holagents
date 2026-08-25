import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignAnchors, githubAnchor } from '../../extensions/linter/anchors.ts';

/** T-32 + T-55: GitHub anchor algorithm. */

test('T-32a: standard headings', () => {
  assert.equal(githubAnchor('Module 1: Explore the VSS UI'), 'module-1-explore-the-vss-ui');
  assert.equal(githubAnchor('Appendix I: Sample questions'), 'appendix-i-sample-questions');
  assert.equal(githubAnchor('Table of Contents'), 'table-of-contents');
  assert.equal(githubAnchor('Industry Use-cases:'), 'industry-use-cases');
  assert.equal(
    githubAnchor('Module 1: Explore Cluster and Configure Quotas'),
    'module-1-explore-cluster-and-configure-quotas',
  );
});

test('T-55: unicode — accents kept, emoji/symbols dropped', () => {
  assert.equal(githubAnchor('Module 2: Café ☕ Setup'), 'module-2-café-setup');
  assert.equal(githubAnchor('Phase 1 - Create Collections'), 'phase-1-create-collections');
});

test('T-32b: duplicate headings get -1, -2 suffixes', () => {
  assert.deepEqual(assignAnchors(['Notes', 'Notes', 'Notes', 'Module 1: A']), [
    'notes',
    'notes-1',
    'notes-2',
    'module-1-a',
  ]);
});

test('edge: punctuation-only heading → empty anchor; duplicates still suffixed', () => {
  assert.equal(githubAnchor('!!!'), '');
  assert.deepEqual(assignAnchors(['!!!', '!!!']), ['', '-1']);
});
