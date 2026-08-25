/**
 * Minimal YAML-subset frontmatter parser (plan.md / module-plan.md).
 * Supports exactly what the holagent plan schemas need:
 *   - top-level `key: value` scalars (string/number/bool, quoted or bare)
 *   - block lists: `key:\n  - item`
 *   - inline (flow) lists: `[a, b]`
 *   - inline (flow) maps: `{ n: 1, slug: x, title: "y" }`
 *   - one level of nested maps (e.g. `environment:`)
 * Throws on shapes outside this subset — callers treat that as "unparseable".
 */

export type FmScalar = string | number | boolean;
export interface FmMap {
  [key: string]: FmValue;
}
/** Recursive value: scalar, map, or list (array breaks the alias cycle). */
export type FmValue = FmScalar | FmMap | FmValue[];

export interface Frontmatter {
  data: FmMap;
  /** Document text after the closing `---`. */
  body: string;
}

const KEY_RE = /^(\s*)([A-Za-z][A-Za-z0-9_-]*):(?:\s+(.*))?$/;
const ITEM_RE = /^(\s*)-\s+(.*)$/;

export function parseFrontmatter(text: string): Frontmatter | null {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!m) return null;
  const data = parseBlock(m[1]!.split(/\r?\n/));
  return { data, body: text.slice(m[0].length) };
}

function indentOf(line: string): number {
  return line.match(/^\s*/)?.[0].length ?? 0;
}

function parseBlock(lines: (string | undefined)[]): FmMap {
  const map: FmMap = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (line.trim() === '' || line.trim().startsWith('#')) {
      i += 1;
      continue;
    }
    const keyMatch = line.match(KEY_RE);
    if (!keyMatch) throw new Error(`frontmatter: expected "key: value", got: ${line.trim()}`);
    const indent = keyMatch[1]?.length ?? 0;
    const key = keyMatch[2]!;
    const rest = keyMatch[3]?.trim() ?? '';
    i += 1;

    if (rest === '') {
      // Nested block: list or map.
      const childLines: string[] = [];
      while (i < lines.length) {
        const next = lines[i] ?? '';
        if (next.trim() === '') {
          childLines.push(next);
          i += 1;
          continue;
        }
        if (indentOf(next) <= indent) break;
        childLines.push(next);
        i += 1;
      }
      const nonEmpty = childLines.filter((l) => l.trim() !== '');
      if (nonEmpty.length === 0) {
        map[key] = '';
        continue;
      }
      const allListItems = nonEmpty.every((l) => l.trim().startsWith('-'));
      if (allListItems) {
        map[key] = parseList(childLines);
      } else {
        map[key] = parseBlock(childLines);
      }
    } else {
      map[key] = parseInline(rest);
    }
  }
  return map;
}

function parseList(lines: string[]): FmValue[] {
  const out: FmValue[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (t === '') continue;
    const itemMatch = line.match(ITEM_RE);
    if (!itemMatch) throw new Error(`frontmatter: expected list item, got: ${t}`);
    out.push(parseInline(itemMatch[2]!.trim()));
  }
  return out;
}

function parseInline(value: string): FmValue {
  if (value.startsWith('[') && value.endsWith(']')) {
    return splitFlow(value.slice(1, -1)).map((v) => parseInline(v.trim()));
  }
  if (value.startsWith('{') && value.endsWith('}')) {
    const map: FmMap = {};
    for (const part of splitFlow(value.slice(1, -1))) {
      const idx = part.indexOf(':');
      if (idx === -1) throw new Error(`frontmatter: bad flow map entry: ${part.trim()}`);
      map[
        part
          .slice(0, idx)
          .trim()
          .replace(/^["']|["']$/g, '')
      ] = parseInline(part.slice(idx + 1).trim());
    }
    return map;
  }
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+$/.test(value)) return Number(value);
  if (/^-?\d+\.\d+$/.test(value)) return Number(value);
  return value;
}

/** Split on top-level commas (ignoring commas inside quotes/brackets). */
function splitFlow(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let cur = '';
  for (const ch of s) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === '[' || ch === '{') depth += 1;
    if (ch === ']' || ch === '}') depth -= 1;
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim() !== '') out.push(cur);
  return out;
}
