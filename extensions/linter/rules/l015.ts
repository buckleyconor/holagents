/**
 * L015 command with non-standard indent.
 *
 * House form for a shell command is a tab-indented (or 4-space) single-
 * backtick span — that is exactly the shape the scanner extracts for L014
 * (shellcheck) and W004 (checkpoint counting). A line with the same command
 * shape (whole line is one backtick span, command-like first token, within
 * length) indented with 1–3 spaces escapes extraction, so the section's
 * commands are silently unchecked. This rule makes that drift an error.
 */
import { registerRule, type RuleContext } from '../registry.ts';
import type { Finding } from '../types.ts';

function truncate(s: string, n = 60): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

registerRule('L015', ({ scan }: RuleContext) => {
  const findings: Finding[] = [];
  for (const m of scan.misindentedCommands) {
    findings.push({
      rule: 'L015',
      severity: 'error',
      line: m.line,
      message:
        `Command line is indented with ${m.indent} space(s); house form is tab-indented ` +
        `(or 4 spaces). As written it is not extracted as a command, so L014 ` +
        `(shellcheck) and W004 (checkpoint count) skip it: \`${truncate(m.command)}\``,
    });
  }
  return findings;
});
