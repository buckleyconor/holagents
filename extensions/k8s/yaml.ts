/**
 * Canonical YAML emission and content digests for the k8s extension
 * (spec-k8s/03 ADP-002: identical inputs MUST produce identical output;
 * spec-k8s/04 GAP-003: manifest and policy digests ride on promotion).
 *
 * The emitter renders the same strict subset the profile parser accepts
 * (ADR-004 house style). Rendering preserves source key order; digests are
 * computed over a canonical form (keys sorted) so that semantically equal
 * documents digest equal regardless of field order.
 */
import { createHash } from 'node:crypto';
import type { MapNode, ListNode, ScalarNode, YNode } from './profile.ts';

const PLAIN_SAFE_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const LOOKS_TYPED_RE = /^(true|false|null|~|yes|no|on|off|-?\d+(?:\.\d+)?)$/i;

function emitScalar(value: string | number | boolean | null, indent: string): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number') return String(value);
  if (value === '') return '""';
  if (PLAIN_SAFE_RE.test(value) && !LOOKS_TYPED_RE.test(value) && !value.includes(' #')) {
    return value;
  }
  // Double-quoted with escapes.
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')
    .replace(/\r/g, '\\r');
  return `"${escaped}"`;
}

/** Render a parsed document as block-style YAML (source key order). */
export function emitYaml(node: YNode): string {
  if (node.kind === 'scalar') return emitScalar(node.value, '');
  return renderNode(node, 0);
}

function renderNode(node: MapNode | ListNode, indent: number): string {
  const pad = '  '.repeat(indent);
  if (node.kind === 'list') {
    if (node.items.length === 0) return '[]';
    const out: string[] = [];
    for (const item of node.items) {
      if (item.kind === 'scalar') {
        out.push(`${pad}- ${emitScalar(item.value, pad)}`);
        continue;
      }
      // Mapping/list item: first line on the dash, rest at the item indent.
      const inner = renderNode(item, indent + 1);
      const [first, ...rest] = inner.split('\n');
      out.push(`${pad}- ${first!.slice(pad.length + 2)}`);
      out.push(...rest);
    }
    return out.join('\n');
  }
  const out: string[] = [];
  for (const [key, value] of node.entries) {
    if (value.kind === 'scalar') {
      out.push(`${pad}${key}: ${emitScalar(value.value, pad)}`);
    } else if (value.kind === 'list' && value.items.length === 0) {
      out.push(`${pad}${key}: []`);
    } else {
      out.push(`${pad}${key}:`);
      out.push(renderNode(value, indent + 1));
    }
  }
  return out.join('\n');
}

/** Convert the tree to plain JS objects (for field-path evaluation). */
export function toPlain(node: YNode): unknown {
  if (node.kind === 'scalar') return node.value;
  if (node.kind === 'list') return node.items.map(toPlain);
  const out: Record<string, unknown> = {};
  for (const [k, v] of node.entries) out[k] = toPlain(v);
  return out;
}

/** Canonical form: maps with sorted keys (lists keep order). */
export function canonicalize(node: YNode): YNode {
  if (node.kind === 'scalar') return node;
  if (node.kind === 'list') return { kind: 'list', items: node.items.map(canonicalize) };
  const entries = [...node.entries].sort(([a], [b]) => a.localeCompare(b));
  return { kind: 'map', entries: entries.map(([k, v]) => [k, canonicalize(v)]), duplicates: [] };
}

/** Canonical string form of a document (sorted keys, rendered YAML). */
export function canonicalString(node: YNode): string {
  return emitYaml(canonicalize(node));
}

/** SHA-256 hex digest of the canonical form. */
export function canonicalDigest(node: YNode): string {
  return createHash('sha256').update(canonicalString(node)).digest('hex');
}

/** Read a dotted field path out of a plain object (policy rule evaluation). */
export function fieldPath(obj: unknown, path: string): { found: boolean; value: unknown } {
  let cur: unknown = obj;
  for (const segment of path.split('.')) {
    if (cur === null || typeof cur !== 'object' || Array.isArray(cur))
      return { found: false, value: undefined };
    cur = (cur as Record<string, unknown>)[segment];
    if (cur === undefined) return { found: false, value: undefined };
  }
  return { found: true, value: cur };
}
