/**
 * GitHub-style heading anchor (lenient variant, corpus-matched):
 *   - lowercase
 *   - drop characters that are not letters (any script), digits, space, "_", "-"
 *     (emoji/symbols dropped; accented letters kept)
 *   - whitespace runs → single "-"; consecutive hyphens collapsed
 *     ("Phase 1 - Create Collections" → "phase-1-create-collections",
 *      matching the anchors used in the style-corpus TOCs)
 *   - duplicate headings get -1, -2, … suffixes (second occurrence → -1)
 */
export function githubAnchor(headingText: string): string {
  return headingText
    .toLowerCase()
    .replace(/[^\p{L}\p{N} _-]/gu, '')
    .replace(/ +/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Assign duplicate-safe anchors in document order. Returns anchors aligned with `texts`. */
export function assignAnchors(texts: string[]): string[] {
  const seen = new Map<string, number>();
  return texts.map((text) => {
    const base = githubAnchor(text);
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base}-${count - 1}`;
  });
}
