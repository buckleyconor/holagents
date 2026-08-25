import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFormatConfig } from '../../extensions/linter/config.ts';
import { scanMarkdown } from '../../extensions/linter/scan.ts';

const config = loadFormatConfig();

/** T-53: 10 MB guide scans fast (O(n), no AST). */
test('T-53: 10 MB document scans well under 5 s', () => {
  const chunk = [
    '## Module 1: Setup',
    'step one with `inline` text',
    '    `curl -s http://example.test/health`',
    'more prose line to pad the file',
    'prose line two with some length',
    '',
  ].join('\n');
  const target = 10 * 1024 * 1024;
  const repeated = [
    '# HOL-9999-01 Perf Fixture',
    'ℹ️ You can resize or hide the lab guide anytime by sliding it left or right.',
    '## Table of Contents',
    '- [1. Introduction](#introduction)',
    '## Introduction',
    '**Duration:** 1',
    '**Objective:** x',
    ...Array.from({ length: Math.ceil(target / chunk.length) }, () => chunk),
    '## Summary',
    'done',
  ].join('\n');
  const start = process.hrtime.bigint();
  const scan = scanMarkdown(repeated.split('\n'), config);
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  assert.ok(ms < 5000, `scan took ${ms.toFixed(0)} ms`);
  assert.ok(scan.headings.length > 1000);
});

/** T-54: hostile input does not crash and does not silently clean. */
test('T-54: hostile headings/tokens parse without crash', () => {
  const longHeading = 'x'.repeat(10_000);
  const text = [
    `# ${longHeading}`,
    'heading with \0 null byte',
    '### weird "quotes" and (parens) [brackets]',
    '## Module 1: OK',
    'step',
  ].join('\r\n'); // CRLF throughout
  const scan = scanMarkdown(text.split(/\r?\n/), config);
  assert.equal(scan.headings.length, 3);
  const first = scan.headings[0];
  assert.ok(first && first.anchor.length > 0);
  assert.ok(scan.commands.length === 0);
});
