/**
 * holagent extension — the deterministic surface of the package
 * (spec §02 §1.4, ADR-007). Thin by design: all logic lives in
 * `hol-core.ts` (pure, unit-tested); this file only registers.
 *
 * Tools (LLM-callable — deterministic gates, no LLM judgment):
 *   hol_validate — run the guide linter; record .holagent/last-validation.json
 *   hol_status   — derive per-module state (files + scores + last validation)
 *   hol_scores   — read / atomically merge .holagent/scores.json
 *
 * Commands (user-invoked, LLM-bypass — checked by pi before template
 * expansion, so no prompt template may reuse these names):
 *   /hol-validate [guideDir]
 *   /hol-status [guideDir]
 *
 * Degradation: without pi-subagents the research/plan/generate/review
 * templates are inert; the tools above still work (notified at session start).
 */
import { Type } from 'typebox';
import {
  HolError,
  ensureHolagentDataDir,
  mergeScores,
  readGuideStatus,
  readScores,
  removeScoresByScope,
  resolveGuidePath,
  resolveLabPath,
  validateGuide,
} from './hol-core.ts';
import type { GuideStatus, ModuleStatus } from './hol-core.ts';
import type { PiExtensionAPI, PiToolResult } from './pi-types.ts';

/**
 * pi-ai's `StringEnum`, inlined: it is exactly `{ type: "string", enum: [...] }`
 * (Type.Unsafe). pi-ai stays a type-only peer; no runtime import needed.
 */
function StringEnum(values: readonly string[], opts?: { description?: string }) {
  return Type.Unsafe({
    type: 'string',
    enum: [...values],
    ...(opts?.description ? { description: opts.description } : {}),
  });
}

function optGuideDir(description: string) {
  return Type.Optional(Type.String({ description }));
}

const GUIDE_DIR_DESC =
  'Guide directory (contains guide.md + .holagent/). Relative paths resolve against the session cwd and must stay inside it. Default: nearest guide root at/above cwd.';

/** First whitespace-separated token of a command arg string. */
function firstArg(args: string): string | undefined {
  const t = (args ?? '').trim().split(/\s+/)[0];
  return t && t !== '' ? t : undefined;
}

function statusModuleLine(m: ModuleStatus): string {
  const scores = m.scores
    ? ` [checklist ${m.scores.checklist ?? '—'}${m.scores.analyticMean !== undefined ? `, analytic ${m.scores.analyticMean}` : ''}]`
    : '';
  return `  ${m.nn}-${m.slug}: ${m.state}${scores}`;
}

/** One-glyph summary per lifecycle stage, for the stage bar. */
const STAGE_GLYPH: Record<string, string> = {
  'n/a': '–',
  missing: '○',
  drafted: '◐',
  approved: '✓',
  adopted: '⊕',
  'in-progress': '◐',
  'smoke-passed': '✓',
  unplanned: '○',
  planned: '◐',
  generating: '◐',
  complete: '✓',
};

function stageBar(lc: GuideStatus['lifecycle']): string {
  const cell = (label: string, state: string) => `${STAGE_GLYPH[state] ?? '?'} ${label}`;
  const ship =
    lc.ship.platforms.length > 0 || lc.ship.launch
      ? `${lc.ship.launch ? '✓' : '◐'} ship`
      : '○ ship';
  return [
    cell('concept', lc.concept),
    cell('sizing', lc.sizing),
    cell('spec', lc.spec),
    cell('build', lc.build),
    cell('guide', lc.guide),
    ship,
  ].join('  ·  ');
}

function statusText(status: GuideStatus): string {
  const research = `companies=[${status.research.companies.join(', ') || '—'}] products=[${status.research.products.join(', ') || '—'}]`;
  const lastVal = status.lastValidation
    ? `${status.lastValidation.ok ? 'ok' : 'failed'} (${status.lastValidation.errors} errors, ${status.lastValidation.warnings} warnings) at ${status.lastValidation.at}`
    : 'never recorded (run /hol-validate)';
  const lines = [
    `Guide: ${status.guide.slug} (${status.guide.id ?? 'no id'})${status.guide.title ? ` — ${status.guide.title}` : ''}`,
  ];
  if (status.lifecycle.engaged) {
    lines.push(`Lifecycle: ${stageBar(status.lifecycle)}`);
    if (status.labRef) {
      const envs =
        status.labRef.environments.map((e) => `${e.name} (${e.kind})`).join(', ') || 'none';
      lines.push(`Lab repo: ${status.labRef.repo} [${status.labRef.origin}] — envs: ${envs}`);
    }
  }
  lines.push(
    `Plan: ${status.plan.exists ? `${status.plan.moduleCount} modules, ${status.plan.objectives} objectives` : 'missing (run /hol-plan)'}`,
    'Modules:',
    ...status.modules.map(statusModuleLine),
    `Last validation: ${lastVal}`,
    `Research: ${research}`,
    `Next: ${status.next}`,
  );
  return lines.join('\n');
}

export default function holagentExtension(pi: PiExtensionAPI): void {
  // ----------------------------------------------------------------- tools

  pi.registerTool({
    name: 'hol_validate',
    label: 'hol_validate',
    description:
      'Validate a holagent lab guide against the house format linter (deterministic; errors block, warnings advise). Runs the linter on guideDir (default: nearest guide root at/above cwd) and records the report to .holagent/last-validation.json.',
    promptSnippet: 'Run the deterministic lab-guide linter and record the validation report',
    parameters: Type.Object({
      guideDir: optGuideDir(GUIDE_DIR_DESC),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx): Promise<PiToolResult> {
      const guideDir = resolveGuidePath(
        ctx.cwd,
        typeof params.guideDir === 'string' ? params.guideDir : undefined,
      );
      const out = await validateGuide(guideDir);
      const { report } = out;
      const lines = [
        `Validation ${report.ok ? 'PASS' : 'FAIL'} — ${report.summary.errors} error(s), ${report.summary.warnings} warning(s) in ${report.guideDir}.`,
        ...report.findings
          .slice(0, 25)
          .map((f) => `${f.rule} [${f.severity}] L${f.line}: ${f.message}`),
      ];
      if (report.findings.length > 25)
        lines.push(`…and ${report.findings.length - 25} more finding(s)`);
      if (Array.isArray(report.shellcheck) && report.shellcheck.length > 0) {
        lines.push(
          ...report.shellcheck
            .slice(0, 10)
            .map((f) => `${f.rule} [${f.severity}] L${f.line}: ${f.message}`),
        );
      } else if (typeof report.shellcheck === 'string') {
        lines.push(`shellcheck: ${report.shellcheck}`);
      }
      lines.push(`Full report: ${out.reportFile} (relative to the guide dir).`);
      return {
        content: [{ type: 'text', text: lines.join('\n') }],
        details: { ...report, reportFile: out.reportFile },
      };
    },
  });

  pi.registerTool({
    name: 'hol_status',
    label: 'hol_status',
    description:
      'Determine holagent lab state (deterministic — files + scores only): lifecycle stages (concept, sizing, spec, build, guide, ship), plan, per-module state (unplanned → planned → generated → validated → scored-passed | scored-escalated), last linter validation, research profiles, and the next recommended command. Works before guide.md exists.',
    promptSnippet:
      'Read the lab-guide state machine (module states, last validation, next command)',
    parameters: Type.Object({
      guideDir: optGuideDir(GUIDE_DIR_DESC),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx): Promise<PiToolResult> {
      const guideDir = resolveLabPath(
        ctx.cwd,
        typeof params.guideDir === 'string' ? params.guideDir : undefined,
      );
      const status = readGuideStatus(guideDir);
      return { content: [{ type: 'text', text: statusText(status) }], details: status };
    },
  });

  pi.registerTool({
    name: 'hol_scores',
    label: 'hol_scores',
    description:
      'Read, merge, or clear lab-guide scoring results in .holagent/scores.json. merge is atomic (all entries validated first; temp+rename) and keyed by scope/rubric (latest wins); remove drops every entry for one scope (the --fresh path). Scopes: "plan" | "guide" | "concept" | "sizing" | "spec" | "launch" | "module-plan-<NN>" | "module-<NN-slug>" | "build-<slug>" | "platform-<slug>".',
    promptSnippet:
      'Read, atomically merge, or clear (remove by scope) lab-guide scoring results (scores.json)',
    parameters: Type.Object({
      guideDir: optGuideDir(GUIDE_DIR_DESC),
      action: StringEnum(['read', 'merge', 'remove'], {
        description:
          'read: return all entries; merge: validate + upsert entries; remove: drop all entries for one scope (requires scope; the --fresh path)',
      }),
      scope: Type.Optional(
        Type.String({
          description:
            'Required for action=remove: the canonical scope to clear, e.g. "module-01-launch-qdrant"',
        }),
      ),
      entries: Type.Optional(
        Type.Array(
          Type.Object({
            scope: Type.String({
              description:
                '"plan" | "guide" | "concept" | "sizing" | "spec" | "launch" | "module-plan-<NN>" | "module-<NN-slug>" | "build-<slug>" | "platform-<slug>"',
            }),
            rubric: Type.String({ description: 'Rubric name, e.g. "analytic/step-clarity"' }),
            kind: StringEnum(['checklist', 'analytic', 'holistic']),
            status: StringEnum(['passed', 'failed', 'escalated']),
            score: Type.Number({ description: 'checklist: 0–1 pass rate; analytic/holistic: 1–5' }),
            rounds: Type.Integer({ description: 'Fix rounds so far (>= 0)' }),
            findings: Type.Array(
              Type.Object({
                criterion: Type.String(),
                score: Type.Number(),
                finding: Type.Optional(Type.Union([Type.String(), Type.Null()])),
              }),
            ),
            updated_at: Type.String({ description: 'ISO timestamp' }),
          }),
        ),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx): Promise<PiToolResult> {
      const guideDir = resolveLabPath(
        ctx.cwd,
        typeof params.guideDir === 'string' ? params.guideDir : undefined,
      );
      const action = typeof params.action === 'string' ? params.action : 'read';
      if (action === 'remove') {
        const result = removeScoresByScope(
          guideDir,
          typeof params.scope === 'string' ? params.scope : '',
        );
        return {
          content: [
            {
              type: 'text',
              text:
                result.removed.length === 0
                  ? `No score entries for scope "${params.scope}" — .holagent/scores.json unchanged.`
                  : `Removed ${result.removed.length} score entr${result.removed.length === 1 ? 'y' : 'ies'} from .holagent/scores.json:\n${result.removed.map((k) => `  ${k}`).join('\n')}`,
            },
          ],
          details: result,
        };
      }
      if (action === 'merge') {
        const result = mergeScores(guideDir, params.entries);
        return {
          content: [
            {
              type: 'text',
              text: `Merged ${result.merged.length} score entr${result.merged.length === 1 ? 'y' : 'ies'} into .holagent/scores.json:\n${result.merged.map((k) => `  ${k}`).join('\n')}`,
            },
          ],
          details: result,
        };
      }
      const entries = readScores(guideDir);
      const text =
        entries.length === 0
          ? 'No scores recorded (.holagent/scores.json is empty or missing).'
          : `Scores (${entries.length}):\n${entries
              .map(
                (e) =>
                  `  ${e.scope}/${e.rubric}: ${e.status} ${e.score} (kind ${e.kind}, rounds ${e.rounds}, ${e.updated_at})`,
              )
              .join('\n')}`;
      return {
        content: [{ type: 'text', text }],
        details: { scoresPath: '.holagent/scores.json', entries },
      };
    },
  });

  // -------------------------------------------------------------- commands

  pi.registerCommand('hol-validate', {
    description: 'Run the lab-guide linter, no LLM (deterministic): /hol-validate [guideDir]',
    handler: async (args, ctx) => {
      try {
        const guideDir = resolveGuidePath(ctx.cwd, firstArg(args));
        const out = await validateGuide(guideDir);
        const { report } = out;
        ctx.ui.notify(
          `hol-validate ${report.ok ? 'PASS' : 'FAIL'}: ${report.summary.errors} error(s), ${report.summary.warnings} warning(s) — ${report.guideDir}`,
          report.ok ? 'info' : 'error',
        );
        const widget: string[] = [
          `[${report.guideDir}] ${report.ok ? 'PASS' : 'FAIL'} — ${report.summary.errors} errors, ${report.summary.warnings} warnings`,
          ...report.findings.slice(0, 14).map((f) => `${f.rule}:${f.line} ${f.message}`),
        ];
        if (report.findings.length > 14)
          widget.push(`…${report.findings.length - 14} more finding(s)`);
        if (typeof report.shellcheck === 'string') widget.push(`shellcheck: ${report.shellcheck}`);
        widget.push(`report: ${out.reportFile}`);
        ctx.ui.setWidget('holagent', widget);
      } catch (e) {
        ctx.ui.notify(
          `hol-validate: ${e instanceof HolError ? e.message : (e as Error).message}`,
          'error',
        );
      }
    },
  });

  pi.registerCommand('hol-status', {
    description:
      'Show lab state (lifecycle stages, plan, module states, validation, next step), no LLM: /hol-status [guideDir]',
    handler: async (args, ctx) => {
      try {
        const guideDir = resolveLabPath(ctx.cwd, firstArg(args));
        const status = readGuideStatus(guideDir);
        ctx.ui.setWidget('holagent', statusText(status).split('\n'));
        ctx.ui.notify(`hol-status: next → ${status.next}`, 'info');
      } catch (e) {
        ctx.ui.notify(
          `hol-status: ${e instanceof HolError ? e.message : (e as Error).message}`,
          'error',
        );
      }
    },
  });

  // ------------------------------------------------------------ lifecycle

  pi.on('session_start', async (_event, ctx) => {
    // Data dir hygiene (spec §04 §4): ~/.holagent at 0700, idempotent.
    try {
      ensureHolagentDataDir();
    } catch {
      /* non-fatal: research features will report on first use */
    }
    // Graceful degradation without pi-subagents (spec §04 §6): the
    // research/plan/generate/review templates need the `subagent` tool;
    // the deterministic surface above does not.
    try {
      const names = new Set(pi.getAllTools().map((t) => t.name));
      if (!names.has('subagent')) {
        ctx.ui.notify(
          'holagent: pi-subagents not detected — /hol-research-*, /hol-plan, /hol-generate-*, /hol-review-* need it (pi install npm:pi-subagents). /hol-validate and /hol-status still work.',
          'warning',
        );
      }
    } catch {
      /* non-fatal */
    }
  });
}
