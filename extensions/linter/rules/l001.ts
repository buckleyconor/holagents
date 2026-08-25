/**
 * L001 H1 with guide ID · L002 platform notice.
 */
import { registerRule, type RuleContext } from '../registry.ts';
import type { Finding } from '../types.ts';

registerRule('L001', ({ scan, config }) => {
  const findings: Finding[] = [];
  const first = scan.firstNonEmptyLine;
  if (!first) {
    findings.push({
      rule: 'L001',
      severity: 'error',
      line: 1,
      message: 'Guide is empty — missing H1 with guide ID.',
    });
    return findings;
  }
  const m = first.text.match(config.h1Pattern);
  if (!m) {
    findings.push({
      rule: 'L001',
      severity: 'error',
      line: first.line,
      message: `First line must be "# <ID> <Title>" (ID matches ${config.idPattern}); got: "${truncate(first.text)}".`,
    });
  }
  return findings;
});

registerRule('L002', ({ scan, config }) => {
  const findings: Finding[] = [];
  const window = scan.firstNonEmptyLines.slice(0, config.platformNoticeWithinFirstNonEmptyLines);
  const hit = window.find((l) => l.text.trim() === config.platformNotice);
  if (!hit) {
    findings.push({
      rule: 'L002',
      severity: 'error',
      line: window[0]?.line ?? 1,
      message: `Platform notice missing (or not verbatim) within the first ${config.platformNoticeWithinFirstNonEmptyLines} non-empty lines.`,
    });
  }
  return findings;
});

function truncate(s: string, n = 60): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
