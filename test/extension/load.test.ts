import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import holagentExtension from '../../extensions/hol.ts';
import type {
  PiCommandContext,
  PiExtensionAPI,
  PiToolContext,
  PiToolDefinition,
} from '../../extensions/pi-types.ts';
import { BASE } from '../linter/harness.ts';

/**
 * M4 manual-gate stand-in: the extension module must load (type-stripped TS,
 * typebox import included) against a structurally-typed pi mock and register
 * exactly the deterministic surface — 3 tools, 2 commands, session_start
 * hook — with working execute/handler paths.
 */

interface Notifications {
  messages: string[];
}

interface MockPi {
  api: PiExtensionAPI;
  tools: PiToolDefinition[];
  commands: Record<
    string,
    { description?: string; handler: (args: string, ctx: PiCommandContext) => Promise<void> | void }
  >;
  onHandlers: Record<string, unknown>;
}

function makeMock(toolNames: string[] = ['subagent']): MockPi {
  const tools: PiToolDefinition[] = [];
  const commands: MockPi['commands'] = {};
  const onHandlers: Record<string, unknown> = {};
  const api: PiExtensionAPI = {
    on: (event, handler) => {
      onHandlers[event] = handler;
    },
    registerTool: (def) => {
      tools.push(def);
    },
    registerCommand: (name, opts) => {
      commands[name] = opts;
    },
    getAllTools: () => toolNames.map((name) => ({ name })),
  };
  return { api, tools, commands, onHandlers };
}

function makeToolCtx(cwd: string, notifications: Notifications): PiToolContext {
  return {
    cwd,
    ui: {
      notify: (m: string) => notifications.messages.push(m),
      setStatus: () => {},
      setWidget: () => {},
      confirm: async () => true,
    },
  };
}

test('extension loads and registers the deterministic surface', async () => {
  const notifications: Notifications = { messages: [] };
  const { api, tools, commands, onHandlers } = makeMock([]); // no subagent tool → degradation path
  holagentExtension(api);

  assert.deepEqual(tools.map((t) => t.name).sort(), ['hol_scores', 'hol_status', 'hol_validate']);
  assert.deepEqual(Object.keys(commands).sort(), ['hol-status', 'hol-validate']);
  assert.equal(typeof onHandlers.session_start, 'function');
  for (const t of tools) {
    assert.equal(
      (t.parameters as { type?: string }).type,
      'object',
      `${t.name} params are a JSON schema object`,
    );
  }

  // session_start: ensures the data dir (isolated via env) and degrades
  // gracefully without pi-subagents.
  const base = mkdtempSync(join(tmpdir(), 'holagent-ss-'));
  const prevDataDir = process.env.HOLAGENT_DATA_DIR;
  process.env.HOLAGENT_DATA_DIR = join(base, '.holagent');
  try {
    const sessionStart = onHandlers.session_start as (
      event: unknown,
      ctx: { ui: { notify: (m: string, k?: string) => void } },
    ) => Promise<void>;
    await sessionStart({}, { ui: { notify: (m) => notifications.messages.push(m) } });
    assert.ok(
      notifications.messages.some((m) => m.includes('holagent: pi-subagents not detected')),
      'degradation notice when the subagent tool is absent',
    );
  } finally {
    if (prevDataDir === undefined) delete process.env.HOLAGENT_DATA_DIR;
    else process.env.HOLAGENT_DATA_DIR = prevDataDir;
    rmSync(base, { recursive: true, force: true });
  }
});

test('tool executes end-to-end against a scratch guide', async () => {
  const notifications: Notifications = { messages: [] };
  const { api, tools } = makeMock();
  holagentExtension(api);

  const guideDir = mkdtempSync(join(tmpdir(), 'holagent-load-'));
  writeFileSync(join(guideDir, 'guide.md'), BASE);
  mkdirSync(join(guideDir, '.holagent'), { recursive: true });
  const ctx = makeToolCtx(guideDir, notifications);
  try {
    const byName = new Map(tools.map((t) => [t.name, t]));

    const validate = await byName
      .get('hol_validate')!
      .execute('tc1', {}, undefined, undefined, ctx);
    const details = validate.details as { ok: boolean; guideDir: string; reportFile: string };
    assert.equal(details.ok, true, 'BASE fixture is clean');
    assert.equal(details.guideDir, guideDir);
    assert.equal(details.reportFile, '.holagent/last-validation.json');
    assert.match(validate.content[0]!.text, /Validation PASS/);

    const status = await byName.get('hol_status')!.execute('tc2', {}, undefined, undefined, ctx);
    assert.match(status.content[0]!.text, /Next: \/hol-plan/, 'no plan yet → /hol-plan');

    const readEmpty = await byName
      .get('hol_scores')!
      .execute('tc3', { action: 'read' }, undefined, undefined, ctx);
    assert.match(readEmpty.content[0]!.text, /No scores recorded/);

    const merge = await byName.get('hol_scores')!.execute(
      'tc4',
      {
        action: 'merge',
        entries: [
          {
            scope: 'guide',
            rubric: 'holistic/guide-quality',
            kind: 'holistic',
            status: 'passed',
            score: 4,
            rounds: 1,
            findings: [],
            updated_at: new Date().toISOString(),
          },
        ],
      },
      undefined,
      undefined,
      ctx,
    );
    assert.match(merge.content[0]!.text, /Merged 1 score entry/);

    const readBack = await byName
      .get('hol_scores')!
      .execute('tc5', { action: 'read' }, undefined, undefined, ctx);
    assert.match(readBack.content[0]!.text, /guide\/holistic\/guide-quality/);

    // invalid merge → error (pi sets isError when execute throws)
    await assert.rejects(async () => {
      await byName
        .get('hol_scores')!
        .execute(
          'tc6',
          {
            action: 'merge',
            entries: [
              {
                scope: 'nope',
                rubric: 'x',
                kind: 'analytic',
                status: 'passed',
                score: 3,
                rounds: 0,
                findings: [],
                updated_at: new Date().toISOString(),
              },
            ],
          },
          undefined,
          undefined,
          ctx,
        );
    }, /E-ARG/);

    // path escape via the tool surface → E-PATH error
    await assert.rejects(async () => {
      await byName
        .get('hol_validate')!
        .execute('tc7', { guideDir: '../outside' }, undefined, undefined, ctx);
    }, /E-PATH/);
  } finally {
    rmSync(guideDir, { recursive: true, force: true });
  }
});

test('command handlers run the deterministic flow (LLM-bypass)', async () => {
  const notifications: Notifications = { messages: [] };
  const { api, commands } = makeMock();
  holagentExtension(api);

  const guideDir = mkdtempSync(join(tmpdir(), 'holagent-cmd-'));
  writeFileSync(join(guideDir, 'guide.md'), BASE);
  mkdirSync(join(guideDir, '.holagent'), { recursive: true });
  const ctx = { ...makeToolCtx(guideDir, notifications) } as PiCommandContext;
  try {
    await commands['hol-validate']!.handler('', ctx);
    assert.ok(notifications.messages.some((m) => m.startsWith('hol-validate PASS')));

    await commands['hol-status']!.handler('', ctx);
    assert.ok(notifications.messages.some((m) => m.startsWith('hol-status: next → /hol-plan')));

    // error path: bad dir → E-PATH surfaced as a notify (no throw to pi)
    await commands['hol-validate']!.handler('../outside', ctx);
    assert.ok(notifications.messages.some((m) => m.includes('E-PATH')));
  } finally {
    rmSync(guideDir, { recursive: true, force: true });
  }
});
