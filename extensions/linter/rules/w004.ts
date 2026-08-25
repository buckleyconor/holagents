/**
 * W004 missing checkpoint · W005 image-checklist mismatch · W006 credential drift.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseFrontmatter, type FmValue } from '../../frontmatter.ts';
import { registerRule, type RuleContext } from '../registry.ts';
import type { Finding } from '../types.ts';
import { moduleSections } from './l010.ts';
import { bareHeading } from './util.ts';

const URL_RE = /https?:\/\/[^\s)"']+/g;

registerRule('W004', ({ scan, config }) => {
  const findings: Finding[] = [];
  const limit = config.limits.commandStepsBeforeCheckpoint;
  for (const mod of moduleSections({ scan, config })) {
    const { section } = mod;
    const commandCount = scan.commands.filter(
      (c) => c.line > section.startLine && c.line <= section.endLine,
    ).length;
    if (commandCount < limit) continue;
    const hasCheckpoint = scan.lines
      .slice(section.startLine, section.endLine)
      .some((l) => l.includes('> ✅ **Checkpoint:**'));
    if (!hasCheckpoint) {
      findings.push({
        rule: 'W004',
        severity: 'warning',
        line: section.endLine,
        message: `Module ${section.heading.text} has ${commandCount} command steps but no "> ✅ **Checkpoint:**" block.`,
      });
    }
  }
  return findings;
});

/** Module plan image checklist for module n (null when absent/unparseable). */
function imageChecklist(guideDir: string, n: number): string[] | null {
  // Slug comes from the guide plan; fall back to scanning .holagent/<NN-*>/.
  const planText = safeRead(join(guideDir, '.holagent', 'plan.md'));
  const nn = String(n).padStart(2, '0');
  const slug = planSlugForModule(planText, n);
  if (!slug) return null;
  const modulePlan = safeRead(join(guideDir, '.holagent', `${nn}-${slug}`, 'plan.md'));
  if (!modulePlan) return null;
  const fm = parseFrontmatter(modulePlan);
  if (!fm) return null;
  const list = fm.data.image_checklist;
  if (Array.isArray(list)) return list.filter((x): x is string => typeof x === 'string');
  return null;
}

function planSlugForModule(planText: string | null, n: number): string | null {
  if (!planText) return null;
  const fm = parseFrontmatter(planText);
  if (!fm) return null;
  const modules = fm.data.modules;
  if (!Array.isArray(modules)) return null;
  for (const m of modules) {
    if (typeof m === 'object' && m !== null && (m as Record<string, FmValue>).n === n) {
      const slug = (m as Record<string, FmValue>).slug;
      return typeof slug === 'string' ? slug : null;
    }
  }
  return null;
}

function safeRead(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

registerRule('W005', ({ scan, config, guideDir }) => {
  const findings: Finding[] = [];
  for (const mod of moduleSections({ scan, config })) {
    const { section, n } = mod;
    const checklist = imageChecklist(guideDir, n);
    if (checklist === null) continue; // no plan data — skip cross-check
    const images = scan.images.filter(
      (img) =>
        img.kind !== 'invalid' && img.line > section.startLine && img.line <= section.endLine,
    );
    const missing = checklist.length - images.length;
    if (missing > 0) {
      findings.push({
        rule: 'W005',
        severity: 'warning',
        line: section.endLine,
        message: `Module ${n}: image checklist lists ${checklist.length} screenshots but the module has ${images.length} — ${missing} missing.`,
      });
    } else if (images.length > checklist.length) {
      findings.push({
        rule: 'W005',
        severity: 'warning',
        line: section.endLine,
        message: `Module ${n}: ${images.length} image(s) but the image checklist lists ${checklist.length} — reconcile the module plan.`,
      });
    }
  }
  return findings;
});
registerRule('W006', ({ scan, config }) => {
  const findings: Finding[] = [];
  const cred = scan.headings.find((h) => h.text === bareHeading(config.blocks.credentials.heading));
  if (!cred) return findings; // L006 covers
  const next = scan.headings.find((h) => h.line > cred.line && h.level <= cred.level);
  const end = next ? next.line - 1 : scan.lineCount;
  const known = new Set<string>();
  for (let i = cred.line; i < end; i += 1) {
    for (const m of (scan.lines[i] ?? '').matchAll(URL_RE)) {
      known.add(normalizeHost(m[0]));
    }
  }
  if (known.size === 0) return findings;
  for (const section of scan.sections) {
    const drift: string[] = [];
    for (let i = section.startLine; i < section.endLine; i += 1) {
      for (const m of (scan.lines[i] ?? '').matchAll(URL_RE)) {
        const host = normalizeHost(m[0]);
        if (!known.has(host) && !drift.includes(host)) drift.push(host);
      }
    }
    if (drift.length > 0) {
      findings.push({
        rule: 'W006',
        severity: 'warning',
        line: section.startLine,
        message: `Hosts not listed in Lab Credentials: ${drift.join(', ')}.`,
      });
    }
  }
  return findings;
});

function normalizeHost(url: string): string {
  return url
    .replace(/^[a-z]+:\/\//i, '')
    .replace(/[:/].*$/, '')
    .toLowerCase();
}
