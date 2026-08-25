/**
 * Inline-command shellcheck. Spec: §02 §1.5, §4.5 (L014/W014), §4.7.
 * Runs the shellcheck binary (never a shell string) on each extracted command.
 */
import { execFile, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Finding, ScanResult } from './types.ts';

/** Rule IDs emitted by the shellcheck pass (not registry rules — see T-50). */
export const SHELLCHECK_RULE_IDS = ['L014', 'W014', 'W-SH'] as const;

const GCC_RE = /^([^:]+):(\d+):(\d+):\s+(\w+):\s+(.*?)\s+\[(SC\d+)\]\s*$/;

/** SHELLCHECK_BIN override, else `which shellcheck`, else null. */
export function findShellcheckBin(): string | null {
  const env = process.env.SHELLCHECK_BIN;
  if (env && env.length > 0) return env;
  try {
    const out = execFileSync('which', ['shellcheck'], {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

function shellcheckOnce(bin: string, file: string): Promise<string> {
  return new Promise((resolveP) => {
    execFile(bin, ['-f', 'gcc', file], { timeout: 10_000 }, (err, stdout) =>
      resolveP(err ? (err.stdout ?? '') + (stdout ?? '') : (stdout ?? '')),
    );
  });
}

/**
 * Shellcheck all extracted commands. Returns findings (guide line numbers),
 * or the skip note when the binary is unavailable.
 */
export async function runShellcheck(
  scan: ScanResult,
  binOverride?: string | null,
): Promise<Finding[] | 'skipped (shellcheck not installed)'> {
  const bin = binOverride !== undefined ? binOverride : findShellcheckBin();
  if (!bin) return 'skipped (shellcheck not installed)';

  const findings: Finding[] = [];
  const dir = mkdtempSync(join(tmpdir(), 'holagent-sh-'));
  try {
    for (let i = 0; i < scan.commands.length; i += 1) {
      const cmd = scan.commands[i]!;
      const file = join(dir, `cmd-${i}.sh`);
      writeFileSync(file, `#!/usr/bin/env bash\n${cmd.command}\n`);
      const out = await shellcheckOnce(bin, file);
      for (const line of out.split('\n')) {
        const m = line.match(GCC_RE);
        if (!m) continue;
        const level = m[4];
        const code = m[6];
        const message = m[5];
        const isError = level === 'error';
        findings.push({
          rule: isError ? 'L014' : 'W014',
          severity: isError ? 'error' : 'warning',
          line: cmd.line,
          message: `${code}: ${message} — command: \`${cmd.command.length > 80 ? `${cmd.command.slice(0, 77)}…` : cmd.command}\``,
        });
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return findings;
}
