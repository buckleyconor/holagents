/**
 * Secret redaction for evidence, reports, merge-request descriptions and
 * bundles (spec-k8s/01 §Evidence contract: evidence MUST contain no secret,
 * token, cookie value, kubeconfig or private key; spec-k8s/06 §Security).
 *
 * Redaction is a safety net on top of discipline: producers should never
 * place raw secrets in these structures in the first place.
 */

const PATTERN_RULES: { pattern: RegExp; replacement: string | ((m: string) => string) }[] = [
  // private key blocks
  {
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
    replacement: '[REDACTED:private-key]',
  },
  // URL userinfo (scheme://user:pass@host)
  {
    pattern: /([a-z][a-z0-9+.-]*:\/\/)[^\s/:@]+:[^\s/@]+(@)/g,
    replacement: '$1[REDACTED]$2',
  },
  // known token prefixes
  {
    pattern:
      /\b(sk-[A-Za-z0-9]{8,}|gh[pousr]_[A-Za-z0-9]{8,}|xox[baprs]-[A-Za-z0-9-]{4,}|AKIA[A-Z0-9]{16})\b/g,
    replacement: '[REDACTED:token]',
  },
  // assignment-shaped secrets: token=..., "password": "...", Bearer <...>
  {
    pattern:
      /\b(launchtoken|token|password|passwd|secret|api[-_]?key|authorization|bearer)\s*[:=]\s*\S{8,}/gi,
    replacement: (m: string) => {
      const key = (m.split(/\s|[:=]/)[0] ?? '').toLowerCase();
      return `${key}=[REDACTED]`;
    },
  },
];

/** Replace secret-shaped material with redaction markers. */
export function redactText(text: string): string {
  let out = text;
  for (const rule of PATTERN_RULES) {
    out =
      typeof rule.replacement === 'string'
        ? out.replace(rule.pattern, rule.replacement)
        : out.replace(rule.pattern, rule.replacement);
  }
  return out;
}

/**
 * One-way digest for correlating expected and observed secrets without
 * echoing them (spec-k8s/06: "a one-way digest MAY be used to correlate
 * expected and observed tokens").
 */
import { createHash } from 'node:crypto';

export function secretDigest(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}
