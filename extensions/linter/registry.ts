/**
 * Rule registry. Spec: §02 §4.5, ADR-004.
 * Rule logic files (rules/*.ts) register themselves by rule ID; T-50 asserts
 * parity between format.json rule IDs and the registry.
 */
import type { GuideFormatConfig } from './config.ts';
import type { Finding, ScanResult } from './types.ts';

export interface RuleContext {
  scan: ScanResult;
  config: GuideFormatConfig;
  /** Absolute guide dir (for reading plan files, e.g. W005). */
  guideDir: string;
}

export type RuleFn = (ctx: RuleContext) => Finding[] | Promise<Finding[]>;

const rules = new Map<string, RuleFn>();

export function registerRule(id: string, fn: RuleFn): void {
  if (rules.has(id)) throw new Error(`rule ${id} registered twice`);
  rules.set(id, fn);
}

export function registeredRuleIds(): string[] {
  return [...rules.keys()].sort();
}

export async function runAllRules(ctx: RuleContext): Promise<Finding[]> {
  const results = await Promise.all([...rules.values()].map((fn) => fn(ctx)));
  return results.flat();
}
