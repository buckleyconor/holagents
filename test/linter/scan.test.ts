import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFormatConfig } from '../../extensions/linter/config.ts';
import { scanMarkdown } from '../../extensions/linter/scan.ts';

const config = loadFormatConfig();
const scan = (text: string) => scanMarkdown(text.split('\n'), config);

/** Scanner structural facts (rule interpretation lands in M3). */

test('headings: levels, text, fences, trailing hashes', () => {
  const s = scan(
    [
      '# H1 Title',
      '```',
      '## not a heading (fenced)',
      '```',
      '## Module 1: Setup ##',
      '### Sub',
      '#### Deeper',
    ].join('\n'),
  );
  assert.deepEqual(
    s.headings.map((h) => [h.level, h.text]),
    [
      [1, 'H1 Title'],
      [2, 'Module 1: Setup'],
      [3, 'Sub'],
      [4, 'Deeper'],
    ],
  );
  assert.equal(s.headings[1]?.line, 5);
});

test('first non-empty lines window', () => {
  const s = scan('\n\n   \n# Title\nnotice line\nmore');
  assert.deepEqual(
    s.firstNonEmptyLines.map((l) => l.text),
    ['# Title', 'notice line', 'more'],
  );
  assert.equal(s.firstNonEmptyLine?.line, 4);
});

test('TOC: entries parsed with numbers, range stops at next heading', () => {
  const s = scan(
    [
      '## Table of Contents',
      '- [1. Intro](#intro)',
      '- [2. Module A](#module-a)',
      '',
      '### Lab Credentials:',
      '- x / y',
      '## Introduction',
      'body',
    ].join('\n'),
  );
  assert.ok(s.tocHeading);
  assert.equal(s.tocEntries.length, 2);
  assert.deepEqual(s.tocEntries[0], { num: 1, title: 'Intro', anchor: '#intro', line: 2 });
  assert.deepEqual(s.tocEntries[1], { num: 2, title: 'Module A', anchor: '#module-a', line: 3 });
  // range must not swallow the credentials list
  assert.equal(s.tocRange?.startLine, 2);
  assert.equal(s.tocRange?.endLine, 6); // line before "## Introduction" (line 7)
});

test('TOC: unnumbered entries → num null', () => {
  const s = scan('## Table of Contents\n- [Intro](#intro)\n');
  assert.equal(s.tocEntries[0]?.num, null);
  assert.equal(s.tocEntries[0]?.title, 'Intro');
});

test('images: ImageProxy core required (quote style & data-modal optional); other images invalid', () => {
  const s = scan(
    [
      '![Image](/ImageProxy?filename=34433ee9-ab2e-4913-a39d-eb3c00ef29d4/arch_diagram.png "Click to enlarge"){data-modal=true}',
      "![Image](/ImageProxy?filename=34433ee9-ab2e-4913-a39d-eb3c00ef29d4/x.png 'Click to enlarge')",
      '![](img.png)',
      'plain text',
    ].join('\n'),
  );
  assert.deepEqual(
    s.images.map((i) => [i.line, i.kind]),
    [
      [1, 'proxy'],
      [2, 'proxy'],
      [3, 'invalid'],
    ],
  );
});

test('commands: tab-indented backticked shell lines extracted; prose not', () => {
  const s = scan(
    [
      '\t`curl -s http://triton:8000/v2/health`',
      '    `python training/extract_landmarks.py --src datasets/isl_frames`',
      '    `/usr/src/tensorrt/bin/trtexec --onnx=model.onnx`',
      '    `Note that this is prose in backticks`',
      '    `ls languages` and more prose (not a pure command span)',
      '\t`kubectl` is inspection-only here (see docs).',
      '`ls unindented`',
      '```',
      '\t`fenced cmd not extracted`',
      '```',
    ].join('\n'),
  );
  assert.deepEqual(
    s.commands.map((c) => c.command),
    [
      'curl -s http://triton:8000/v2/health',
      'python training/extract_landmarks.py --src datasets/isl_frames',
      '/usr/src/tensorrt/bin/trtexec --onnx=model.onnx',
    ],
  );
  assert.deepEqual(
    s.commands.map((c) => c.line),
    [1, 2, 3],
  );
});

test('sections: level-2 spans, subheadings, back-to-top detection', () => {
  const s = scan(
    [
      '## Table of Contents',
      '- [1. Introduction](#introduction)',
      '',
      '[Back to top](#table-of-contents)',
      '',
      '## Module 1: Setup',
      '### Step detail',
      'step text',
      '## Module 2: More',
      'no back-to-top here',
    ].join('\n'),
  );
  assert.equal(s.sections.length, 3);
  const [toc, m1, m2] = s.sections;
  assert.equal(toc?.heading.text, 'Table of Contents');
  assert.equal(toc?.hasBackToTop, true);
  assert.equal(toc?.endLine, 5);
  assert.equal(m1?.startLine, 6);
  assert.equal(m1?.endLine, 8);
  assert.deepEqual(
    m1?.subheadings.map((h) => h.text),
    ['Step detail'],
  );
  assert.equal(m1?.hasBackToTop, false);
  assert.equal(m2?.endLine, 10);
  assert.equal(m2?.hasBackToTop, false);
});

test('callouts: standard and non-standard variants recorded', () => {
  const s = scan(
    ['**Tip:** watch out', '**Tip!** watch out', '> ✅ **Checkpoint:** done'].join('\n'),
  );
  const variants = s.calloutLines.map((c) => c.variant).sort();
  assert.ok(variants.includes('**Tip:**'));
  assert.ok(variants.includes('**Tip!**'));
  assert.ok(variants.includes('> ✅ **Checkpoint:**'));
});

test('tokens: TODO detected, placeholder lines excluded', () => {
  const s = scan(
    ['This is TODO for later', '<< INSERT SCREENSHOT: TBD state >>', 'fixme here'].join('\n'),
  );
  assert.deepEqual(
    s.tokenLines.map((t) => t.token.toUpperCase()),
    ['TODO', 'FIXME'],
  );
});

test('raw HTML: forbidden patterns detected case-insensitively', () => {
  const s = scan(['<SCRIPT>alert(1)</SCRIPT>', 'fine text', '<img src="x">'].join('\n'));
  assert.deepEqual(
    s.htmlLines.map((h) => h.line),
    [1, 3],
  );
});

// T-71 (M8 gate): command-shaped lines indented with 1–3 spaces escape
// extraction and are surfaced for L015 instead of polluting `commands`.
test('T-71a: 1–3 space command-shaped lines → misindentedCommands, not commands', () => {
  const s = scan(
    [
      '   `ls -la`',
      '\t`curl -s http://x/health`',
      '    `pwd`',
      '   `Save the file`',
      '   `ls languages` and more prose',
      '`echo unindented`',
      '   plain prose line',
    ].join('\n'),
  );
  assert.deepEqual(s.misindentedCommands, [{ line: 1, command: 'ls -la', indent: 3 }]);
  assert.deepEqual(
    s.commands.map((c) => c.command),
    ['curl -s http://x/health', 'pwd'],
  );
});

test('T-71b: misindented detection respects fences, length, and first-token', () => {
  const s = scan(
    [
      '```',
      '   `fenced cmd not flagged`',
      '```',
      '   `./relative script.sh --flag`',
      '   `  `',
    ].join('\n'),
  );
  assert.deepEqual(
    s.misindentedCommands.map((m) => m.command),
    ['./relative script.sh --flag'],
  );
  assert.equal(s.misindentedCommands[0]?.indent, 3);
});
