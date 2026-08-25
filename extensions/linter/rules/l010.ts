/**
 * L010 Summary present · L011 module headings · L012 back-to-top · L013 images.
 */
import { registerRule, type RuleContext } from '../registry.ts';
import type { Finding } from '../types.ts';
import { bareHeading } from './util.ts';

export function moduleSections(ctx: Pick<RuleContext, 'scan' | 'config'>) {
  const { scan, config } = ctx;
  const out: { section: (typeof scan.sections)[number]; n: number }[] = [];
  for (const section of scan.sections) {
    const m = `## ${section.heading.text}`.match(config.blocks.module.headingPattern);
    if (m) out.push({ section, n: Number(m[1]) });
  }
  return out;
}

registerRule('L010', ({ scan, config }) => {
  const findings: Finding[] = [];
  const summary = scan.headings.find(
    (h) => h.level === 2 && h.text === bareHeading(config.blocks.summary.heading),
  );
  if (!summary) {
    findings.push({
      rule: 'L010',
      severity: 'error',
      line: 1,
      message: `Missing standalone "${config.blocks.summary.heading}" section after the last module.`,
    });
  }
  return findings;
});

registerRule('L011', ({ scan, config }) => {
  const findings: Finding[] = [];
  const mods = moduleSections({ scan, config });

  for (const section of scan.sections) {
    const text = section.heading.text;
    if (`## ${text}`.match(config.blocks.module.headingPattern)) continue;
    const forbidden = config.blocks.module.forbiddenHeadingPatterns.find((re) => re.test(text));
    if (forbidden) {
      findings.push({
        rule: 'L011',
        severity: 'error',
        line: section.startLine,
        message: `"## ${text}" is a drift heading — body sections must be "## Module <N>: <Title>".`,
      });
      continue;
    }
    if (/^Module \d/.test(text)) {
      findings.push({
        rule: 'L011',
        severity: 'error',
        line: section.startLine,
        message: `"## ${text}" must use the exact form "## Module <N>: <Title>" (number + colon).`,
      });
    }
  }

  // Sequential numbering from startAt.
  const startAt = config.blocks.module.startAt;
  mods.forEach((mod, i) => {
    if (mod.n !== startAt + i) {
      findings.push({
        rule: 'L011',
        severity: 'error',
        line: mod.section.startLine,
        message: `Module number ${mod.n} out of sequence (expected ${startAt + i}).`,
      });
    }
  });
  return findings;
});

registerRule('L012', ({ scan, config }) => {
  const findings: Finding[] = [];
  const tocTitle = bareHeading(config.toc.heading);
  for (const section of scan.sections) {
    // The TOC section is followed by the credentials/audience preamble, not a
    // back-to-top (matches the style-corpus samples) — exempt it.
    if (section.heading.text.trim() === tocTitle) continue;
    if (!section.hasBackToTop) {
      findings.push({
        rule: 'L012',
        severity: 'error',
        line: section.endLine,
        message: `Section "## ${section.heading.text}" does not end with ${config.backToTop.text}.`,
      });
    }
  }
  return findings;
});

registerRule('L013', ({ scan }) => {
  const findings: Finding[] = [];
  for (const image of scan.images) {
    if (image.kind !== 'invalid') continue;
    findings.push({
      rule: 'L013',
      severity: 'error',
      line: image.line,
      message: `Image must use the ImageProxy form or "<< INSERT SCREENSHOT: <desc> >>"; got: "${truncate(image.raw)}".`,
    });
  }
  return findings;
});

function truncate(s: string, n = 80): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
