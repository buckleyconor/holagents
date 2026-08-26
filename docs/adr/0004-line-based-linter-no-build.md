# ADR-004: Line-based linter — no Markdown AST, erasable TS only, no build

- **Status**: Accepted (2026-08-25, design lock)
- **References**: spec 02 §1.5; `extensions/linter/` (scan.ts, config.ts,
  registry.ts); `tsconfig.json`

## Context

The house format is owned by this team and the linter needs line-level
structural facts (headings, TOC items, images, callouts, command
candidates, mini-YAML frontmatter) plus shellcheck on extracted commands. A
Markdown AST would add runtime dependencies and a build step to a package
that targets Node 22 `--experimental-strip-types` with zero runtime
dependencies.

## Decision

The linter is a line-based scanner (`extensions/linter/scan.ts` — no
Markdown AST) that collects structural facts with line numbers; rules
(`L0xx` error / `W0xx` warning, defined in `skills/guide-format/
format.json` and implemented in `extensions/linter/rules/`) interpret the
facts. Frontmatter is parsed by a hand-written mini-YAML subset parser
(`extensions/frontmatter.ts`). Everything is erasable-syntax TypeScript
(`erasableSyntaxOnly`): no enum, no namespace, no decorator, no emit, no
bundler — `node --experimental-strip-types` runs the CLI, the extension, and
the tests directly.

## Consequences

- Empty supply chain: zero runtime dependencies; CI needs only Node 22.
- The format is frozen and owned: drift _is_ the thing we check for, and
  exotic Markdown outside the format surface is out of scope by design.
- Rule docs are generated, not hand-maintained:
  `docs/linter-rules.md` ← `scripts/gen-rule-docs.mjs` ← `format.json`
  (CI drift check).
