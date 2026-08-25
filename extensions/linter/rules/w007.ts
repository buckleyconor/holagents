/**
 * W007 raw HTML · W008 TODO/TBD/FIXME tokens.
 */
import { registerRule, type RuleContext } from '../registry.ts';
import type { Finding } from '../types.ts';

registerRule('W007', ({ scan }) => {
  const findings: Finding[] = [];
  for (const hit of scan.htmlLines) {
    findings.push({
      rule: 'W007',
      severity: 'warning',
      line: hit.line,
      message: `Raw HTML pattern "${hit.pattern}" found — use the guide image syntax instead.`,
    });
  }
  return findings;
});

registerRule('W008', ({ scan }) => {
  const findings: Finding[] = [];
  for (const hit of scan.tokenLines) {
    findings.push({
      rule: 'W008',
      severity: 'warning',
      line: hit.line,
      message: `Unfinished marker "${hit.token.toUpperCase()}" — resolve before publishing.`,
    });
  }
  return findings;
});
