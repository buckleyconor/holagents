/**
 * format.json loader + compiled rule config. Spec: §02 §4.5, ADR-004.
 * format.json (in skills/guide-format/) is the single source of truth for
 * rule *configuration*; rule *logic* lives in extensions/linter/rules/.
 */
import { readFileSync } from 'node:fs';

export interface CompiledRule {
  id: string;
  severity: 'error' | 'warning';
  title: string;
  description: string;
  fixHint: string;
}

export interface GuideFormatConfig {
  version: number;
  idPattern: RegExp;
  h1Pattern: RegExp;
  platformNotice: string;
  platformNoticeWithinFirstNonEmptyLines: number;
  toc: { heading: string; entryPattern: RegExp };
  blocks: {
    credentials: { heading: string; level: number; credentialLinePattern: RegExp };
    audience: { heading: string; level: number };
    introduction: {
      heading: string;
      requiredMarkers: string[];
      forbiddenVariantHeadings: string[];
    };
    summary: { heading: string; level: number };
    module: {
      headingPattern: RegExp;
      startAt: number;
      sequential: boolean;
      forbiddenHeadingPatterns: RegExp[];
    };
  };
  backToTop: { text: string; anchor: string };
  images: { imageProxyPattern: RegExp; placeholderPattern: RegExp };
  callouts: { standard: string[]; nonStandard: string[] };
  commandExtraction: { firstTokenPattern: RegExp; maxCommandLength: number };
  forbiddenTokens: RegExp[];
  forbiddenHtmlPatterns: string[];
  limits: {
    sectionMaxLinesWithoutSubheading: number;
    commandStepsBeforeCheckpoint: number;
    resolveGuideRootMaxAncestors: number;
  };
  rules: CompiledRule[];
}

/** JSON shape of format.json (strings, before compilation). */
interface RawBlocks {
  credentials: { heading: string; level: number; credentialLinePattern: string };
  audience: { heading: string; level: number };
  introduction: {
    heading: string;
    requiredMarkers: string[];
    forbiddenVariantHeadings: string[];
  };
  summary: { heading: string; level: number };
  module: {
    headingPattern: string;
    startAt: number;
    sequential: boolean;
    forbiddenHeadingPatterns: string[];
  };
}

/** Package-relative default: skills/guide-format/format.json next to the extension. */
export function defaultFormatPath(): string {
  return new URL('../../skills/guide-format/format.json', import.meta.url).pathname;
}

/**
 * Compile a format.json pattern to a JS RegExp.
 * Convention: patterns may carry Python-style inline flags as a leading
 * `(?i)` / `(?im)` group; the loader converts them to JS flags (JS RegExp
 * rejects inline `(?i)`). All patterns are Unicode-mode.
 */
export function compileRe(pattern: string): RegExp {
  let p = pattern;
  let flags = 'u';
  const m = p.match(/^\(\?([a-z]+)\)/);
  if (m) {
    for (const f of m[1] ?? '') {
      if (f === 'i' || f === 'm' || f === 's') flags += f;
    }
    p = p.slice(m[0].length);
  }
  return new RegExp(p, flags);
}

export function loadFormatConfig(path?: string): GuideFormatConfig {
  const raw = JSON.parse(readFileSync(path ?? defaultFormatPath(), 'utf8')) as Record<
    string,
    unknown
  >;

  const re = (s: string) => compileRe(s);
  const blocks = raw.blocks as RawBlocks;
  const moduleBlock = blocks.module;
  const commandExtraction = raw.commandExtraction as { firstTokenPattern?: string };
  const rawTokens = Array.isArray(raw.forbiddenTokens) ? (raw.forbiddenTokens as string[]) : [];
  const ce = (raw.commandExtraction ?? {}) as { maxCommandLength?: number };
  const limits = (raw.limits ?? {}) as {
    sectionMaxLinesWithoutSubheading?: number;
    commandStepsBeforeCheckpoint?: number;
    resolveGuideRootMaxAncestors?: number;
  };

  const config: GuideFormatConfig = {
    version: (raw.version as number) ?? 1,
    idPattern: re(String(raw.idPattern)),
    h1Pattern: re(String(raw.h1Pattern)),
    platformNotice: String(raw.platformNotice),
    platformNoticeWithinFirstNonEmptyLines: Number(raw.platformNoticeWithinFirstNonEmptyLines ?? 3),
    toc: {
      heading: String((raw.toc as { heading: string }).heading),
      entryPattern: re(String((raw.toc as { entryPattern: string }).entryPattern)),
    },
    blocks: {
      credentials: {
        heading: String(blocks.credentials.heading),
        level: Number(blocks.credentials.level),
        credentialLinePattern: re(String(blocks.credentials.credentialLinePattern)),
      },
      audience: {
        heading: String(blocks.audience.heading),
        level: Number(blocks.audience.level),
      },
      introduction: {
        heading: String(blocks.introduction.heading),
        requiredMarkers: [...(blocks.introduction.requiredMarkers ?? [])],
        forbiddenVariantHeadings: [...(blocks.introduction.forbiddenVariantHeadings ?? [])],
      },
      summary: {
        heading: String(blocks.summary.heading),
        level: Number(blocks.summary.level),
      },
      module: {
        headingPattern: re(String(moduleBlock.headingPattern)),
        startAt: Number(moduleBlock.startAt ?? 1),
        sequential: moduleBlock.sequential !== false,
        forbiddenHeadingPatterns: (moduleBlock.forbiddenHeadingPatterns ?? []).map(re),
      },
    },
    backToTop: {
      text: String((raw.backToTop as { text: string }).text),
      anchor: String((raw.backToTop as { anchor: string }).anchor),
    },
    images: {
      imageProxyPattern: re(
        String((raw.images as { imageProxyPattern: string }).imageProxyPattern),
      ),
      placeholderPattern: re(
        String((raw.images as { placeholderPattern: string }).placeholderPattern),
      ),
    },
    callouts: {
      standard: [...((raw.callouts as { standard: string[] }).standard ?? [])],
      nonStandard: [...((raw.callouts as { nonStandard: string[] }).nonStandard ?? [])],
    },
    commandExtraction: {
      firstTokenPattern: re(commandExtraction.firstTokenPattern ?? '^[a-z][a-z0-9_-]*$'),
      maxCommandLength: Number(ce.maxCommandLength) || 2000,
    },
    forbiddenTokens: rawTokens.map((t) => new RegExp(`\\b${t}\\b`, 'iu')),
    forbiddenHtmlPatterns: [...((raw.forbiddenHtmlPatterns as string[]) ?? [])],
    limits: {
      sectionMaxLinesWithoutSubheading: Number(limits.sectionMaxLinesWithoutSubheading ?? 400),
      commandStepsBeforeCheckpoint: Number(limits.commandStepsBeforeCheckpoint ?? 3),
      resolveGuideRootMaxAncestors: Number(limits.resolveGuideRootMaxAncestors ?? 3),
    },
    rules: (raw.rules as CompiledRule[]).map((r) => ({
      id: String(r.id),
      severity: r.severity === 'warning' ? 'warning' : 'error',
      title: String(r.title),
      description: String(r.description),
      fixHint: String(r.fixHint ?? ''),
    })),
  };
  if (config.rules.length === 0) throw new Error('format.json declares no rules');
  return config;
}
