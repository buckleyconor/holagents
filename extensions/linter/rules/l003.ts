/**
 * L003 TOC present + sequential numbering · L004 anchors resolve · L005 coverage.
 */
import { registerRule, type RuleContext } from '../registry.ts';
import type { Finding } from '../types.ts';

registerRule('L003', ({ scan, config }) => {
  const findings: Finding[] = [];
  if (!scan.tocHeading) {
    findings.push({
      rule: 'L003',
      severity: 'error',
      line: scan.firstNonEmptyLine?.line ?? 1,
      message: `Missing "${config.toc.heading}" before the first module.`,
    });
    return findings;
  }
  // Numbered entries must be 1..N in order.
  const numbered = scan.tocEntries.filter((e) => e.num !== null);
  if (numbered.length > 0) {
    for (let i = 0; i < numbered.length; i += 1) {
      const e = numbered[i]!;
      if (e.num !== i + 1) {
        findings.push({
          rule: 'L003',
          severity: 'error',
          line: e.line,
          message: `TOC entry number is ${e.num}, expected ${i + 1} (sequential 1..N).`,
        });
        break; // one finding per TOC is enough to force the fix
      }
    }
  } else if (scan.tocEntries.length > 0) {
    findings.push({
      rule: 'L003',
      severity: 'error',
      line: scan.tocHeading.line,
      message: 'TOC entries must be numbered "n. Title".',
    });
  }
  return findings;
});

registerRule('L004', ({ scan }) => {
  const findings: Finding[] = [];
  const anchors = new Set(scan.headings.map((h) => h.anchor).filter(Boolean));
  for (const entry of scan.tocEntries) {
    if (!entry.anchor.startsWith('#')) {
      findings.push({
        rule: 'L004',
        severity: 'error',
        line: entry.line,
        message: `TOC link must be a local anchor (#…); got "${entry.anchor}".`,
      });
      continue;
    }
    if (!anchors.has(entry.anchor.slice(1))) {
      findings.push({
        rule: 'L004',
        severity: 'error',
        line: entry.line,
        message: `TOC anchor ${entry.anchor} does not resolve to any heading (stale anchor).`,
      });
    }
  }
  return findings;
});

registerRule('L005', ({ scan, config }) => {
  const findings: Finding[] = [];
  const tocTitle = config.toc.heading.replace(/^#+\s*/u, '').trim();

  // Duplicate level-2 headings.
  const seen = new Map<string, number>();
  for (const h of scan.headings.filter((h) => h.level === 2)) {
    seen.set(h.text, (seen.get(h.text) ?? 0) + 1);
  }
  for (const [text, count] of seen) {
    if (count > 1) {
      const line = scan.headings.find((h) => h.level === 2 && h.text === text)?.line;
      findings.push({
        rule: 'L005',
        severity: 'error',
        line,
        message: `Duplicate "## ${text}" headings (${count}x) — anchors become ambiguous.`,
      });
    }
  }

  // Coverage (anchor-based): every non-TOC level-2 section's anchor must
  // appear in the TOC exactly once. House style allows short TOC display
  // titles (e.g. "Explore the VSS UI" for "## Module 1: Explore the VSS UI"),
  // so entry titles are deliberately NOT compared against heading text —
  // the anchor is the link of record (stale anchors are L004's job).
  const tocAnchors = new Map<string, number>();
  for (const e of scan.tocEntries) {
    if (!e.anchor.startsWith('#')) continue;
    tocAnchors.set(e.anchor.slice(1), (tocAnchors.get(e.anchor.slice(1)) ?? 0) + 1);
  }
  for (const section of scan.sections) {
    if (section.heading.text.trim() === tocTitle) continue; // TOC section itself
    const count = tocAnchors.get(section.heading.anchor) ?? 0;
    if (count === 0) {
      findings.push({
        rule: 'L005',
        severity: 'error',
        line: section.startLine,
        message: `Section "## ${section.heading.text}" is missing from the Table of Contents.`,
      });
    } else if (count > 1) {
      findings.push({
        rule: 'L005',
        severity: 'error',
        line: section.startLine,
        message: `Section "## ${section.heading.text}" appears ${count} times in the Table of Contents.`,
      });
    }
  }
  return findings;
});
