/**
 * Minimal structural surface of the pi ExtensionAPI used by holagent.
 *
 * holagent deliberately does NOT value-import `@earendil-works/pi-coding-agent`
 * (or `@earendil-works/pi-ai`): those packages are peers provided by the pi
 * runtime, and a package extension's bare imports only resolve against the
 * shared `~/.pi/agent/npm/node_modules` tree (where `typebox` lives). pi
 * validates the real shapes at load/call time; the structural types here keep
 * dev typechecking dependency-free (spec §03: zero runtime deps).
 */

export interface PiTextContent {
  type: 'text';
  text: string;
}

export interface PiToolResult {
  content: PiTextContent[];
  details?: unknown;
}

export interface PiUI {
  notify(message: string, kind?: 'info' | 'warning' | 'error' | 'debug'): void;
  setStatus(key: string, text: string | null): void;
  setWidget(key: string, lines: string[] | null): void;
  confirm(title: string, message: string): Promise<boolean>;
}

export interface PiToolContext {
  cwd: string;
  ui: PiUI;
}

export interface PiCommandContext {
  cwd: string;
  ui: PiUI;
}

export interface PiToolDefinition<P = Record<string, unknown>> {
  name: string;
  label: string;
  description: string;
  promptSnippet?: string;
  promptGuidelines?: string[];
  parameters: unknown; // JSON Schema (TypeBox output)
  execute(
    toolCallId: string,
    params: P,
    signal: AbortSignal | undefined,
    onUpdate: ((partial: PiToolResult) => void) | undefined,
    ctx: PiToolContext,
  ): Promise<PiToolResult> | PiToolResult;
}

export interface PiExtensionAPI {
  on(
    event: string,
    handler: (event: unknown, ctx: PiCommandContext & PiToolContext) => unknown,
  ): void;
  registerTool(definition: PiToolDefinition<Record<string, unknown>>): void;
  registerCommand(
    name: string,
    options: {
      description?: string;
      handler: (args: string, ctx: PiCommandContext) => Promise<void> | void;
    },
  ): void;
  getAllTools(): Array<{ name: string; description?: string }>;
}
