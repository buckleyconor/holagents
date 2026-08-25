/**
 * W001 callout variants · W002 long section · W003 summary ordering.
 */
import { registerRule, type RuleContext } from '../registry.ts';
import type { Finding } from '../types.ts';
import { moduleSections } from './l010.ts';
import { bareHeading } from './util.ts';

registerRule('W001', ({ scan, config }) => {
  const findings: Finding[] = [];
  const nonStandard = new Set(config.callouts.nonStandard);
  const byLine = new Map<number, string[]>();
  for (const callout of scan.calloutLines) {
    if (!nonStandard.has(callout.variant)) continue;
    const arr = byLine.get(callout.line) ?? [];
    arr.push(callout.variant);
    byLine.set(callout.line, arr);
  }
  for (const [line, variants] of [...byLine.entries()].sort((a, b) => a[0] - b[0])) {
    findings.push({
      rule: 'W001',
      severity: 'warning',
      line,
      message: `Non-standard callout variant(s) ${variants.join(', ')} — use the standard forms (Tip: / Note: / Important: / Use Case:).`,
    });
  }
  return findings;
});

registerRule('W002', ({ scan, config }) => {
  const findings: Finding[] = [];
  const limit = config.limits.sectionMaxLinesWithoutSubheading;
  for (const section of scan.sections) {
    const span = section.endLine - section.startLine;
    if (span > limit && section.subheadings.length === 0) {
      findings.push({
        rule: 'W002',
        severity: 'warning',
        line: section.startLine,
        message: `Section "## ${section.heading.text}" spans ${span} lines with no subheading (pacing risk).`,
      });
    }
  }
  return findings;
});

registerRule('W003', ({ scan, config }) => {
  const findings: Finding[] = [];
  const summary = scan.headings.find(
    (h) => h.level === 2 && h.text === bareHeading(config.blocks.summary.heading),
  );
  if (!summary) return findings; // L010 covers the missing case
  const mod = moduleSections({ scan, config }).find((m) => m.section.startLine > summary.line);
  if (mod) {
    findings.push({
      rule: 'W003',
      severity: 'warning',
      line: summary.line,
      message: `"## Summary" appears before "## Module ${mod.n}: ${mod.section.heading.text}" — move it after the final module.`,
    });
  }
  return findings;
});
