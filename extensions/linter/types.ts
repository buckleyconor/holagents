/** Linter core types. Spec: §02 §4. */

export type Severity = 'error' | 'warning';

export interface Finding {
  /** Rule ID, e.g. "L004" or "W007". */
  rule: string;
  severity: Severity;
  /** 1-based line in guide.md (when applicable). */
  line?: number;
  message: string;
}

export interface LintReport {
  /** true when there are no error-severity findings (warnings do not block). */
  ok: boolean;
  guideDir: string;
  /** All findings (errors + warnings), sorted by (rule, line). */
  findings: Finding[];
  summary: { errors: number; warnings: number };
  /** Per-command shellcheck findings, or the skip note when the binary is absent. */
  shellcheck: Finding[] | 'skipped (shellcheck not installed)';
}

export interface Heading {
  level: number;
  text: string;
  /** 1-based line number. */
  line: number;
  /** GitHub-style anchor (duplicates get -1, -2 suffixes). */
  anchor: string;
}

export interface TocEntry {
  /** Display number parsed from the TOC entry, null when unnumbered. */
  num: number | null;
  title: string;
  /** Raw link target, e.g. "#module-1-…". */
  anchor: string;
  /** 1-based line number. */
  line: number;
}

export interface ImageLine {
  line: number;
  raw: string;
  kind: 'proxy' | 'placeholder' | 'invalid';
}

export interface CommandCandidate {
  line: number;
  command: string;
}

/**
 * A command-shaped line (single-backtick span, command first token) that is
 * indented with 1–3 spaces instead of the house form (tab or 4 spaces).
 * Such lines escape command extraction — L015.
 */
export interface MisindentedCommand {
  line: number;
  command: string;
  /** Space count of the indent (1–3). */
  indent: number;
}

export interface Section {
  /** The level-2 heading that starts this section. */
  heading: Heading;
  /** 1-based line of the heading. */
  startLine: number;
  /** 1-based last line belonging to the section. */
  endLine: number;
  /** Level 3-6 headings inside the section (after its own heading). */
  subheadings: Heading[];
  /** Section body contains the back-to-top link. */
  hasBackToTop: boolean;
}

export interface ScanResult {
  lines: string[];
  lineCount: number;
  firstNonEmptyLine: { line: number; text: string } | null;
  /** First 3 non-empty line texts (platform-notice window). */
  firstNonEmptyLines: { line: number; text: string }[];
  headings: Heading[];
  /** The "## Table of Contents" heading, when present. */
  tocHeading: Heading | null;
  tocEntries: TocEntry[];
  /** Line range of the TOC list (exclusive of the heading line). */
  tocRange: { startLine: number; endLine: number } | null;
  images: ImageLine[];
  commands: CommandCandidate[];
  /** Command-shaped lines indented with 1–3 spaces (L015); not extracted. */
  misindentedCommands: MisindentedCommand[];
  /** Level-2 sections in document order (includes the TOC section). */
  sections: Section[];
  /** Lines matching standard or non-standard callout variants. */
  calloutLines: { line: number; variant: string }[];
  /** Lines containing TODO/TBD/FIXME (placeholder lines excluded). */
  tokenLines: { line: number; token: string }[];
  /** Lines containing forbidden raw-HTML patterns. */
  htmlLines: { line: number; pattern: string }[];
}
