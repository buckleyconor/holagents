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

function shellcheckOnce(
  bin: string,
  file: string,
  timeoutMs: number,
): Promise<{ out: string; timedOut: boolean }> {
  return new Promise((resolveP) => {
    execFile(bin, ['-f', 'gcc', file], { timeout: timeoutMs }, (err, stdout) => {
      // A killed process (execFile timeout) is not a clean "no findings" —
      // surface it so the caller can report the skipped check instead of
      // silently treating the command as clean.
      const timedOut = err !== null && (err as { killed?: boolean }).killed === true;
      resolveP({
        out: (err ? (err.stdout ?? '') : '') + (stdout ?? ''),
        timedOut,
      });
    });
  });
}

export interface RunShellcheckOptions {
  /** Per-command timeout in milliseconds (default 10_000). */
  timeoutMs?: number;
}

/**
 * Shellcheck all extracted commands. Returns findings (guide line numbers),
 * or the skip note when the binary is unavailable. A per-command timeout is
 * reported as a `W-SH` warning — never silently treated as a clean command.
 */
export async function runShellcheck(
  scan: ScanResult,
  binOverride?: string | null,
  opts: RunShellcheckOptions = {},
): Promise<Finding[] | 'skipped (shellcheck not installed)'> {
  const bin = binOverride !== undefined ? binOverride : findShellcheckBin();
  if (!bin) return 'skipped (shellcheck not installed)';
  const timeoutMs = opts.timeoutMs ?? 10_000;

  const findings: Finding[] = [];
  const dir = mkdtempSync(join(tmpdir(), 'holagent-sh-'));
  try {
    for (let i = 0; i < scan.commands.length; i += 1) {
      const cmd = scan.commands[i]!;
      const file = join(dir, `cmd-${i}.sh`);
      writeFileSync(file, `#!/usr/bin/env bash\n${cmd.command}\n`);
      const { out, timedOut } = await shellcheckOnce(bin, file, timeoutMs);
      if (timedOut) {
        findings.push({
          rule: 'W-SH',
          severity: 'warning',
          line: cmd.line,
          message: `shellcheck timed out after ${timeoutMs}ms — command not checked: \`${cmd.command.length > 80 ? `${cmd.command.slice(0, 77)}…` : cmd.command}\``,
        });
        continue;
      }
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
