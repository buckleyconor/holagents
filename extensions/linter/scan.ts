/**
 * Line-based Markdown scanner. Spec: §02 §1.5 (ADR-004: no Markdown AST).
 * Owns the format → structural facts (headings, TOC, images, commands, callouts,
 * sections); rules interpret the facts.
 */
import type { GuideFormatConfig } from './config.ts';
import { assignAnchors } from './anchors.ts';
import type {
  CommandCandidate,
  Heading,
  ImageLine,
  ScanResult,
  Section,
  TocEntry,
} from './types.ts';

const FENCE_RE = /^\s*(```|~~~)/;
const HEADING_RE = /^(#{1,6})\s+(.+?)\s*(?:\s#+\s*)?$/;
const PLACEHOLDER_RE = /^<<\s*INSERT SCREENSHOT/;

export function scanMarkdown(lines: string[], config: GuideFormatConfig): ScanResult {
  const lineCount = lines.length;

  // Pass 1: headings (with code-fence awareness) and raw text bookkeeping.
  const rawHeadings: { level: number; text: string; line: number }[] = [];
  let inFence = false;
  let fenceChar = '';
  const fenced: boolean[] = new Array(lineCount).fill(false);

  for (let i = 0; i < lineCount; i += 1) {
    const line = lines[i] ?? '';
    const fence = line.match(FENCE_RE);
    if (fence) {
      const marker = fence[1]!.charAt(0);
      if (!inFence) {
        inFence = true;
        fenceChar = marker;
      } else if (marker === fenceChar) {
        inFence = false;
      }
      fenced[i] = true;
      continue;
    }
    if (inFence) {
      fenced[i] = true;
      continue;
    }
    const heading = line.match(HEADING_RE);
    if (heading) {
      rawHeadings.push({
        level: heading[1]!.length,
        text: heading[2] ?? '',
        line: i + 1,
      });
    }
  }

  // Anchors (duplicate-safe, document order).
  const anchors = assignAnchors(rawHeadings.map((h) => h.text));
  const headings: Heading[] = rawHeadings.map((h, i) => ({ ...h, anchor: anchors[i] ?? '' }));

  // First non-empty lines.
  const firstNonEmpty: { line: number; text: string }[] = [];
  for (let i = 0; i < lineCount && firstNonEmpty.length < 3; i += 1) {
    const text = (lines[i] ?? '').trim();
    if (text.length > 0) firstNonEmpty.push({ line: i + 1, text });
  }

  // TOC section.
  const tocTitle = config.toc.heading.replace(/^#+\s*/u, '').trim();
  const tocHeading =
    headings.find((h) => h.level === 2 && h.text.replace(/[:\s]+$/u, '').trim() === tocTitle) ??
    null;
  let tocRange: ScanResult['tocRange'] = null;
  let tocEntries: TocEntry[] = [];
  if (tocHeading) {
    const nextL2 = headings.find((h) => h.line > tocHeading.line && h.level <= 2);
    const endLine = nextL2 ? nextL2.line - 1 : lineCount;
    tocRange = { startLine: tocHeading.line + 1, endLine };
    for (let i = tocRange.startLine - 1; i < endLine; i += 1) {
      const m = (lines[i] ?? '').match(config.toc.entryPattern);
      if (m) {
        tocEntries.push({
          num: m[1] !== undefined && /^\d+$/.test(m[1]) ? Number(m[1]) : null,
          title: m[2] ?? '',
          anchor: m[3] ?? '',
          line: i + 1,
        });
      }
    }
  }

  // Images.
  const images: ImageLine[] = [];
  for (let i = 0; i < lineCount; i += 1) {
    if (fenced[i]) continue;
    const line = (lines[i] ?? '').trim();
    if (!line.startsWith('![')) continue;
    const kind = config.images.imageProxyPattern.test(line)
      ? 'proxy'
      : config.images.placeholderPattern.test(line)
        ? 'placeholder'
        : 'invalid';
    images.push({ line: i + 1, raw: line, kind });
  }

  // Command candidates (§02 §4.7).
  const commands: CommandCandidate[] = [];
  for (let i = 0; i < lineCount; i += 1) {
    if (fenced[i]) continue;
    const raw = lines[i] ?? '';
    const indent = raw.match(/^( +|\t+)/)?.[1] ?? '';
    if (!(indent === '\t' || indent.startsWith('    '))) continue;
    const content = raw.trim();
    if (!/^`[^`]+`$/.test(content)) continue;
    const command = content.slice(1, -1).trim();
    if (command.length === 0 || command.length > config.commandExtraction.maxCommandLength)
      continue;
    const firstToken = command.split(/\s+/)[0] ?? '';
    if (!config.commandExtraction.firstTokenPattern.test(firstToken)) continue;
    commands.push({ line: i + 1, command });
  }

  // Level-2 sections (single forward pass over the sorted headings list — O(H+S)).
  const l2Idx: number[] = [];
  headings.forEach((h, i) => {
    if (h.level === 2) l2Idx.push(i);
  });
  const sections: Section[] = [];
  let cursor = 0;
  for (let si = 0; si < l2Idx.length; si += 1) {
    const h = headings[l2Idx[si]!]!;
    const endLine = si + 1 < l2Idx.length ? headings[l2Idx[si + 1]!]!.line - 1 : lineCount;
    while (cursor < headings.length && headings[cursor]!.line <= h.line) cursor += 1;
    const subheadings: Heading[] = [];
    while (cursor < headings.length && headings[cursor]!.line <= endLine) {
      if (headings[cursor]!.level > 2) subheadings.push(headings[cursor]!);
      cursor += 1;
    }
    sections.push({
      heading: h,
      startLine: h.line,
      endLine,
      subheadings,
      hasBackToTop: false, // filled below (needs raw lines)
    });
  }
  for (const section of sections) {
    let has = false;
    for (let i = section.startLine; i < section.endLine; i += 1) {
      if ((lines[i] ?? '').includes(config.backToTop.text)) {
        has = true;
        break;
      }
    }
    section.hasBackToTop = has;
  }

  // Callouts (standard + non-standard variants).
  const calloutLines: { line: number; variant: string }[] = [];
  const allCallouts = [...config.callouts.standard, ...config.callouts.nonStandard];
  for (let i = 0; i < lineCount; i += 1) {
    if (fenced[i]) continue;
    const line = lines[i] ?? '';
    for (const variant of allCallouts) {
      if (line.includes(variant)) calloutLines.push({ line: i + 1, variant });
    }
  }

  // Forbidden tokens (TODO/TBD/FIXME), excluding image-placeholder lines.
  const tokenLines: { line: number; token: string }[] = [];
  for (let i = 0; i < lineCount; i += 1) {
    if (fenced[i]) continue;
    const line = (lines[i] ?? '').trim();
    if (PLACEHOLDER_RE.test(line)) continue;
    for (const tokenRe of config.forbiddenTokens) {
      const m = line.match(tokenRe);
      if (m) {
        tokenLines.push({ line: i + 1, token: m[0] });
        break;
      }
    }
  }

  // Forbidden raw HTML.
  const htmlLines: { line: number; pattern: string }[] = [];
  for (let i = 0; i < lineCount; i += 1) {
    if (fenced[i]) continue;
    const line = (lines[i] ?? '').toLowerCase();
    for (const pattern of config.forbiddenHtmlPatterns) {
      if (line.includes(pattern.toLowerCase())) {
        htmlLines.push({ line: i + 1, pattern });
        break;
      }
    }
  }

  return {
    lines,
    lineCount,
    firstNonEmptyLine: firstNonEmpty[0] ?? null,
    firstNonEmptyLines: firstNonEmpty,
    headings,
    tocHeading,
    tocEntries,
    tocRange,
    images,
    commands,
    sections,
    calloutLines,
    tokenLines,
    htmlLines,
  };
}
