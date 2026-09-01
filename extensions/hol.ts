/**
 * holagent extension — the deterministic surface of the package
 * (spec §02 §1.4, ADR-007). Thin by design: all logic lives in
 * `hol-core.ts` (pure, unit-tested); this file only registers.
 *
 * Tools (LLM-callable — deterministic gates, no LLM judgment):
 *   hol_validate — run the guide linter; record .holagent/last-validation.json
 *   hol_status   — derive per-module state (files + scores + last validation)
 *   hol_scores   — read / atomically merge .holagent/scores.json
 *   hol_spec_check — stage-2 gate: the spec set is complete and owns its guesses
 *   hol_prep_check — the lab-prep.md environment contract is complete + runnable
 *   hol_platform_findings — platform review findings are shaped, traced, actionable
 *   hol_build_test — stage-3 gate: run one milestone's declared test in the lab repo
 *   hol_parity     — execute lab-prep.md's verify checks against a DEV environment
 *   hol_qa_script  — render the same checks as a script for a human (never executes)
 *   hol_qa_record  — validated write of an asserted smoke / prod-e2e outcome
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
  checkLabPrep,
  checkPlatformFindings,
  checkSpec,
  DEFAULT_EXEC_TIMEOUT_MS,
  ensureHolagentDataDir,
  listPlatformFindings,
  mergeScores,
  readBuildSequence,
  readGuideStatus,
  recordQaResult,
  renderQaScript,
  readScores,
  resolveMilestoneSelector,
  runBuildTest,
  runParity,
  removeScoresByScope,
  resolveGuidePath,
  resolveLabPath,
  validateGuide,
} from './hol-core.ts';
import type { GuideStatus, MilestoneStatus, ModuleStatus } from './hol-core.ts';
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

function statusMilestoneLine(m: MilestoneStatus): string {
  const scores = m.scores
    ? ` [checklist ${m.scores.checklist ?? '—'}${m.scores.analyticMean !== undefined ? `, analytic ${m.scores.analyticMean}` : ''}]`
    : '';
  const last = m.lastTest
    ? ` (last test ${m.lastTest.ok ? 'passed' : m.lastTest.timedOut ? 'timed out' : `exit ${m.lastTest.exitCode ?? '—'}`} at ${m.lastTest.at})`
    : '';
  return `  ${m.nn}-${m.slug}: ${m.state}${scores}${last}`;
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
  if (status.milestones.length > 0) {
    lines.push('Milestones:', ...status.milestones.map(statusMilestoneLine));
  } else if (status.lifecycle.engaged && status.build.errors.length > 0) {
    lines.push(`Milestones: none readable — ${status.build.errors[0]}`);
  }
  const qaLine = [
    status.qa.parity
      ? `parity ${status.qa.parity.ok ? 'ok' : 'FAILED'} on ${status.qa.parity.env} (${status.qa.parity.passed}/${status.qa.parity.passed + status.qa.parity.failed})`
      : null,
    status.qa.smoke
      ? `smoke ${status.qa.smoke.ok ? 'ok' : 'FAILED'} on ${status.qa.smoke.env}`
      : null,
    status.qa.prod
      ? `prod e2e ${status.qa.prod.ok ? 'ok' : 'FAILED'} on ${status.qa.prod.env}`
      : null,
  ].filter((x): x is string => x !== null);
  if (qaLine.length > 0) lines.push(`QA: ${qaLine.join(' · ')}`);
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

  pi.registerTool({
    name: 'hol_spec_check',
    label: 'hol_spec_check',
    description:
      'Deterministic stage-2 gate: verify the spec set in the registered lab repo (lab-ref.json) has all eight numbered sections, no unfilled << FILL: >> markers, and a populated Open Questions & Assumptions section. An empty open-questions section means the author hid guesses in the design — it fails the gate.',
    promptSnippet: 'Check the spec set for completeness and a populated open-questions section',
    parameters: Type.Object({
      guideDir: optGuideDir(GUIDE_DIR_DESC),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx): Promise<PiToolResult> {
      const labDir = resolveLabPath(
        ctx.cwd,
        typeof params.guideDir === 'string' ? params.guideDir : undefined,
      );
      const check = checkSpec(labDir);
      const lines: string[] = [];
      if (check.specDir === null) {
        lines.push(
          'No lab repo registered (.holagent/lab-ref.json missing) — run /hol-lab-register.',
        );
      } else {
        lines.push(`Spec check ${check.ok ? 'PASS' : 'FAIL'} — ${check.specDir}`);
        lines.push(`Files (${check.files.length}): ${check.files.join(', ') || 'none'}`);
        if (check.missing.length > 0) lines.push(`Missing sections: ${check.missing.join(', ')}`);
        if (check.unfilled.length > 0)
          lines.push(`Unfilled << FILL: >> markers in: ${check.unfilled.join(', ')}`);
        lines.push(
          check.openQuestions.file === null
            ? 'Open questions: section 08 missing'
            : `Open questions: ${check.openQuestions.file} — ${check.openQuestions.contentLines} content line(s)${
                check.openQuestions.substantive
                  ? ''
                  : ' — TOO THIN: the spec is hiding its assumptions'
              }`,
        );
      }
      return { content: [{ type: 'text', text: lines.join('\n') }], details: check };
    },
  });

  pi.registerTool({
    name: 'hol_prep_check',
    label: 'hol_prep_check',
    description:
      "Deterministic check on the lab's environment contract: does lab-prep.md carry frontmatter that parses, name all seven keys (baseline, software, credentials, endpoints, artifacts, network, verify), fill every field of every row, and declare verify checks a machine can run unattended? The gate for /hol-adopt, where the contract is reverse-engineered, and for the lab-prep.md /hol-spec derives from the sizing.",
    promptSnippet:
      'Check lab-prep.md — the environment contract — for a complete, runnable frontmatter',
    parameters: Type.Object({
      guideDir: optGuideDir(GUIDE_DIR_DESC),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx): Promise<PiToolResult> {
      const labDir = resolveLabPath(
        ctx.cwd,
        typeof params.guideDir === 'string' ? params.guideDir : undefined,
      );
      const check = checkLabPrep(labDir);
      const lines: string[] = [];
      if (!check.exists) {
        lines.push(`No lab-prep.md at ${check.path} — nothing to check.`);
      } else {
        lines.push(`Lab-prep check ${check.ok ? 'PASS' : 'FAIL'} — ${check.path}`);
        if (check.parseError) lines.push(`Frontmatter: ${check.parseError}`);
        else
          lines.push(
            `Rows: ${Object.entries(check.counts)
              .map(([k, n]) => `${k} ${n}`)
              .join(', ')}`,
          );
        if (check.missing.length > 0) lines.push(`Missing keys: ${check.missing.join(', ')}`);
        if (check.empty.length > 0) lines.push(`Empty keys: ${check.empty.join(', ')}`);
        for (const p of check.incomplete) lines.push(`Incomplete — ${p}`);
        for (const p of check.unrunnable) lines.push(`Not runnable unattended — ${p}`);
        for (const l of check.unfilled) lines.push(`Unfilled marker — ${l}`);
      }
      return { content: [{ type: 'text', text: lines.join('\n') }], details: check };
    },
  });

  pi.registerTool({
    name: 'hol_platform_findings',
    label: 'hol_platform_findings',
    description:
      'Read and deterministically check a platform review (.holagent/platform/<name>.json): every finding severity-tagged (blocker | should-fix | note), traced to a requirement, evidenced against the lab, owned (us | them) and closed with an action. Returns the severity rollup, the blockers, the asks and the unknowns — the pre-meeting brief in structured form. Omit `platform` to list the reviews this lab has.',
    promptSnippet: 'Check and summarise a platform review (severities, blockers, asks, unknowns)',
    parameters: Type.Object({
      guideDir: optGuideDir(GUIDE_DIR_DESC),
      platform: Type.Optional(
        Type.String({ description: 'Platform slug, e.g. "k8s" or "vcd". Omit to list reviews.' }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx): Promise<PiToolResult> {
      const labDir = resolveLabPath(
        ctx.cwd,
        typeof params.guideDir === 'string' ? params.guideDir : undefined,
      );
      const available = listPlatformFindings(labDir);
      if (typeof params.platform !== 'string' || params.platform.trim() === '') {
        return {
          content: [
            {
              type: 'text',
              text:
                available.length === 0
                  ? 'No platform reviews recorded (.holagent/platform/ is empty or missing) — run /hol-platform-check <platform>.'
                  : `Platform reviews: ${available.join(', ')}`,
            },
          ],
          details: { platforms: available },
        };
      }
      const check = checkPlatformFindings(labDir, params.platform);
      const lines: string[] = [];
      if (!check.exists) {
        lines.push(
          `No review for "${check.platform}" (${check.path}) — run /hol-platform-check ${check.platform}.`,
        );
        if (available.length > 0) lines.push(`Reviews on file: ${available.join(', ')}`);
      } else {
        lines.push(`Platform review ${check.ok ? 'PASS' : 'FAIL'} — ${check.path}`);
        if (check.parseError) lines.push(`File: ${check.parseError}`);
        lines.push(
          `Findings: ${check.counts.blocker} blocker, ${check.counts['should-fix']} should-fix, ${check.counts.note} note`,
        );
        for (const b of check.blockers) lines.push(`BLOCKER — ${b}`);
        for (const a of check.asks) lines.push(`Ask — ${a}`);
        for (const u of check.unknowns) lines.push(`Unknown — ${u}`);
        for (const p of check.problems) lines.push(`Malformed — ${p}`);
      }
      return { content: [{ type: 'text', text: lines.join('\n') }], details: check };
    },
  });

  pi.registerTool({
    name: 'hol_build_test',
    label: 'hol_build_test',
    description:
      "Deterministic stage-3 gate: run one build milestone's own declared test command in the registered lab repo and record the result to .holagent/build/<slug>.json. The build track's equivalent of hol_validate — the milestone either passes its test or it does not. Runs the command the spec's build sequence declares and nothing composed here; the lab repo is local code, so this is not an environment execution (ADR-012 governs those). Omit `milestone` to list the sequence and each milestone's state.",
    promptSnippet: "Run a build milestone's declared test in the lab repo and record the result",
    parameters: Type.Object({
      guideDir: optGuideDir(GUIDE_DIR_DESC),
      milestone: Type.Optional(
        Type.String({
          description:
            'Milestone selector: "2", "02-core-services", or an unambiguous title fragment. Omit to list the build sequence.',
        }),
      ),
      timeoutMs: Type.Optional(
        Type.Integer({
          description: `Per-test timeout in milliseconds (default ${DEFAULT_EXEC_TIMEOUT_MS}, capped at 900000). A killed test counts as a failure.`,
        }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx): Promise<PiToolResult> {
      const labDir = resolveLabPath(
        ctx.cwd,
        typeof params.guideDir === 'string' ? params.guideDir : undefined,
      );
      const seq = readBuildSequence(labDir);
      if (typeof params.milestone !== 'string' || params.milestone.trim() === '') {
        const status = readGuideStatus(labDir);
        const lines = [
          seq.valid
            ? `Build sequence: ${seq.milestones.length} milestone(s) — ${seq.path}`
            : `Build sequence unusable — ${seq.errors.join('; ')}`,
          ...status.milestones.map(statusMilestoneLine),
          ...seq.warnings.map((w) => `warning: ${w}`),
        ];
        return {
          content: [{ type: 'text', text: lines.join('\n') }],
          details: { sequence: seq, milestones: status.milestones },
        };
      }
      if (!seq.valid) {
        throw new HolError(
          'E-ARG',
          `E-ARG: build sequence is not usable — ${seq.errors.join('; ')}`,
        );
      }
      const milestone = resolveMilestoneSelector(seq.milestones, params.milestone);
      const record = runBuildTest(
        labDir,
        milestone,
        typeof params.timeoutMs === 'number' ? params.timeoutMs : undefined,
      );
      const lines = [
        `Milestone ${record.n}-${record.milestone} test ${record.ok ? 'PASS' : 'FAIL'} — \`${record.test}\` in ${record.repo}`,
        record.timedOut
          ? `Killed after ${record.durationMs}ms (timeout) — a test that does not return is a failed test.`
          : `exit ${record.exitCode ?? '—'} in ${record.durationMs}ms`,
      ];
      if (record.stdout.trim()) lines.push('--- stdout (tail) ---', record.stdout.trimEnd());
      if (record.stderr.trim()) lines.push('--- stderr (tail) ---', record.stderr.trimEnd());
      lines.push(`Recorded: .holagent/build/${record.milestone}.json`);
      return { content: [{ type: 'text', text: lines.join('\n') }], details: record };
    },
  });

  pi.registerTool({
    name: 'hol_parity',
    label: 'hol_parity',
    description:
      'Execute the environment contract: run every `verify` check in lab-prep.md against a named DEV environment and record .holagent/qa/parity.json (ADR-011). Refuses any environment whose kind is not dev — there is no override (ADR-012); use hol_qa_script for anything else. Runs the checks the author declared and nothing composed here: what the contract declares but no check covers is reported as a coverage warning, not invented into a check.',
    promptSnippet: "Run lab-prep.md's verify checks against a dev environment and record parity",
    parameters: Type.Object({
      guideDir: optGuideDir(GUIDE_DIR_DESC),
      env: Type.String({
        description: 'Environment name from lab-ref.json. Must be a dev environment (ADR-012).',
      }),
      timeoutMs: Type.Optional(
        Type.Integer({
          description: `Per-check timeout in milliseconds (default ${DEFAULT_EXEC_TIMEOUT_MS}, capped at 900000). A killed check counts as a failure.`,
        }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx): Promise<PiToolResult> {
      const labDir = resolveLabPath(
        ctx.cwd,
        typeof params.guideDir === 'string' ? params.guideDir : undefined,
      );
      const record = runParity(
        labDir,
        String(params.env ?? ''),
        typeof params.timeoutMs === 'number' ? params.timeoutMs : undefined,
      );
      const lines = [
        `Parity ${record.ok ? 'PASS' : 'FAIL'} — ${record.env}${record.endpoint ? ` (${record.endpoint})` : ''}: ${record.summary.passed}/${record.summary.total} checks passed.`,
      ];
      for (const c of record.checks) {
        lines.push(
          `[${c.n}] ${c.ok ? 'pass' : c.timedOut ? 'FAIL (timed out)' : `FAIL (exit ${c.exitCode ?? '—'})`} — \`${c.check}\` (expect: ${c.expect})`,
        );
        if (!c.ok) {
          if (c.stdout.trim())
            lines.push(`      stdout: ${c.stdout.trim().split('\n').slice(-3).join(' | ')}`);
          if (c.stderr.trim())
            lines.push(`      stderr: ${c.stderr.trim().split('\n').slice(-3).join(' | ')}`);
        }
      }
      const gaps = [
        ...record.coverage.endpoints.map((e) => `endpoint ${e}`),
        ...record.coverage.artifacts.map((a) => `artifact ${a}`),
        ...record.coverage.software.map((s) => `software ${s}`),
      ];
      for (const g of gaps) lines.push(`warning: declared but no verify check covers it — ${g}`);
      lines.push('Recorded: .holagent/qa/parity.json');
      return { content: [{ type: 'text', text: lines.join('\n') }], details: record };
    },
  });

  pi.registerTool({
    name: 'hol_qa_script',
    label: 'hol_qa_script',
    description:
      "Render lab-prep.md's verify checks as a self-contained read-only bash script plus a human checklist, and write it to .holagent/qa/verify-<env>.sh. Executes nothing — this is the production path, and production verification is a human act (ADR-012). Works for any environment in lab-ref.json, dev or prod, and reads the same checks hol_parity executes so the two cannot drift.",
    promptSnippet: 'Render the environment contract as a verification script for a human to run',
    parameters: Type.Object({
      guideDir: optGuideDir(GUIDE_DIR_DESC),
      env: Type.String({ description: 'Environment name from lab-ref.json (dev or prod).' }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx): Promise<PiToolResult> {
      const labDir = resolveLabPath(
        ctx.cwd,
        typeof params.guideDir === 'string' ? params.guideDir : undefined,
      );
      const out = renderQaScript(labDir, String(params.env ?? ''));
      const lines = [
        `Verification script for ${out.env} (${out.kind}) written to ${out.path}.`,
        'Nothing was executed. Run it yourself against that environment and report the summary line back.',
        ...(out.checklist.length > 0
          ? [
              'Manual checklist — declared in lab-prep.md but no verify check covers it:',
              ...out.checklist.map((c) => `  - ${c}`),
            ]
          : ['Every declared endpoint, artifact and software entry is covered by a verify check.']),
        '--- script ---',
        out.script,
      ];
      return { content: [{ type: 'text', text: lines.join('\n') }], details: out };
    },
  });

  pi.registerTool({
    name: 'hol_qa_record',
    label: 'hol_qa_record',
    description:
      'Record an asserted QA outcome to .holagent/qa/smoke.json (dev bring-up) or .holagent/qa/e2e-prod.json (what a human reports after running the rendered script). Validated and atomic: the environment must exist in lab-ref.json and its kind must match the record — a production end-to-end result cannot be filed against a dev environment, or the reverse. smoke.json with ok:true is what moves the build stage to smoke-passed.',
    promptSnippet: 'Record a smoke or production end-to-end QA outcome',
    parameters: Type.Object({
      guideDir: optGuideDir(GUIDE_DIR_DESC),
      kind: StringEnum(['smoke', 'e2e-prod'], {
        description:
          'smoke: the dev bring-up result. e2e-prod: the outcome a human reports after running the /hol-qa-prod script against production.',
      }),
      env: Type.String({ description: 'Environment name from lab-ref.json.' }),
      ok: Type.Boolean({ description: 'Did it pass? Must agree with the checks listed below.' }),
      checks: Type.Optional(
        Type.Array(
          Type.Object({
            name: Type.String(),
            ok: Type.Boolean(),
            note: Type.Optional(Type.String()),
          }),
        ),
      ),
      notes: Type.Optional(Type.String({ description: 'Anything the checks do not carry.' })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx): Promise<PiToolResult> {
      const labDir = resolveLabPath(
        ctx.cwd,
        typeof params.guideDir === 'string' ? params.guideDir : undefined,
      );
      const record = recordQaResult(labDir, params.kind as 'smoke' | 'e2e-prod', {
        env: String(params.env ?? ''),
        ok: params.ok as boolean,
        checks: params.checks as { name: string; ok: boolean; note?: string }[] | undefined,
        notes: typeof params.notes === 'string' ? params.notes : undefined,
      });
      const failed = record.checks.filter((c) => !c.ok);
      const lines = [
        `Recorded ${record.kind} ${record.ok ? 'PASS' : 'FAIL'} for ${record.env} at ${record.at} — .holagent/qa/${record.kind}.json`,
        `${record.checks.length} check(s) listed${failed.length > 0 ? `, ${failed.length} failed: ${failed.map((c) => c.name).join(', ')}` : ''}.`,
      ];
      return { content: [{ type: 'text', text: lines.join('\n') }], details: record };
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
