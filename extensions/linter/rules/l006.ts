/**
 * L006 Lab Credentials · L007 Target Audience · L008 Introduction heading ·
 * L009 Introduction markers.
 */
import { registerRule, type RuleContext } from '../registry.ts';
import { bareHeading } from './util.ts';
import type { Finding } from '../types.ts';

function findHeading(
  ctx: RuleContext,
  level: number,
  exactText?: string,
): { line: number; text: string } | null {
  for (const h of ctx.scan.headings) {
    if (h.level !== level) continue;
    if (exactText ? h.text === exactText : true) return { line: h.line, text: h.text };
  }
  return null;
}

registerRule('L006', ({ scan, config }) => {
  const findings: Finding[] = [];
  const c = config.blocks.credentials;
  const intro = scan.headings.find(
    (h) => h.level === 2 && h.text === bareHeading(config.blocks.introduction.heading),
  );
  const cred = scan.headings.find((h) => h.text === bareHeading(c.heading));
  if (!cred) {
    findings.push({
      rule: 'L006',
      severity: 'error',
      line: intro?.line ?? 1,
      message: `Missing "${c.heading}" section before the Introduction.`,
    });
    return findings;
  }
  if (cred.level !== c.level) {
    findings.push({
      rule: 'L006',
      severity: 'error',
      line: cred.line,
      message: `"${cred.text}" must be a level-${c.level} heading ("${c.heading}"), got level-${cred.level}.`,
    });
  }
  if (intro && cred.line > intro.line) {
    findings.push({
      rule: 'L006',
      severity: 'error',
      line: cred.line,
      message: 'Lab Credentials must appear before the Introduction.',
    });
  }
  // At least one credential line within the section.
  const nextHeading = scan.headings.find((h) => h.line > cred.line && h.level <= cred.level);
  const end = nextHeading ? nextHeading.line - 1 : scan.lineCount;
  let hasCredential = false;
  for (let i = cred.line; i < end; i += 1) {
    if (c.credentialLinePattern.test(scan.lines[i] ?? '')) {
      hasCredential = true;
      break;
    }
  }
  if (!hasCredential) {
    findings.push({
      rule: 'L006',
      severity: 'error',
      line: cred.line,
      message: 'Lab Credentials section has no credential line (Username/Password/FQDN/IP).',
    });
  }
  return findings;
});

registerRule('L007', ({ scan, config }) => {
  const findings: Finding[] = [];
  const a = config.blocks.audience;
  const hit = scan.headings.find((h) => h.text === bareHeading(a.heading) && h.level === a.level);
  if (!hit) {
    findings.push({
      rule: 'L007',
      severity: 'error',
      line: 1,
      message: `Missing "${a.heading}" (level-${a.level}) section before the Introduction.`,
    });
  }
  return findings;
});

registerRule('L008', ({ scan, config }) => {
  const findings: Finding[] = [];
  const intro = config.blocks.introduction;
  const hit = scan.headings.find((h) => h.level === 2 && h.text === bareHeading(intro.heading));
  if (!hit) {
    const variant = scan.headings.find(
      (h) => h.level === 2 && intro.forbiddenVariantHeadings.map(bareHeading).includes(h.text),
    );
    findings.push({
      rule: 'L008',
      severity: 'error',
      line: variant?.line ?? 1,
      message: variant
        ? `"## ${variant.text}" is a drift variant — rename to "${intro.heading}".`
        : `Missing "${intro.heading}" section.`,
    });
  }
  return findings;
});

registerRule('L009', ({ scan, config }) => {
  const findings: Finding[] = [];
  const intro = config.blocks.introduction;
  const hit = scan.headings.find((h) => h.level === 2 && h.text === bareHeading(intro.heading));
  if (!hit) return findings; // L008 already reports the missing section
  const next = scan.headings.find((h) => h.level === 2 && h.line > hit.line);
  const end = next ? next.line - 1 : scan.lineCount;
  const body = scan.lines.slice(hit.line, end).join('\n');
  for (const marker of intro.requiredMarkers) {
    if (!body.includes(marker)) {
      findings.push({
        rule: 'L009',
        severity: 'error',
        line: hit.line,
        message: `Introduction must contain ${marker}.`,
      });
    }
  }
  return findings;
});
