# 03 — Build decisions

## 1. Language, framework, libraries

| Choice                             | Decision                                                               | Rationale (one line)                                                                                                       | Alternative considered                                                                                   |
| ---------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Extension + linter language        | **TypeScript 5.x, erasable-syntax-only**                               | pi loads extensions via jiti (no build step), and Node 22 type-stripping runs the linter CLI and tests without compilation | Plain JS (rejected: the schema-heavy linter/tool code benefits from types; zero runtime cost)            |
| Runtime                            | **Node 22** (the Node pi bundles: 22.22.3)                             | `--experimental-strip-types` + `node:test` cover tooling with no extra installs                                            | A build step (esbuild/tsc emit) — rejected: nothing consumes compiled output                             |
| Prompt templates / skills / agents | **Markdown**                                                           | These _are_ the product surface; pi's native formats                                                                       | n/a                                                                                                      |
| Markdown parsing (linter)          | **Hand-rolled line scanner, stdlib only**                              | We own the format; line-based rules are trivially debuggable and keep the dependency graph empty                           | `markdown-it` / `marked` (kept as fallback if line-based rules prove insufficient for nested structures) |
| Process invocation (shellcheck)    | **`child_process.execFile`**                                           | No shell interpolation, arg-array safe                                                                                     | `exec` with string building (rejected: injection surface)                                                |
| JSON/atomic writes                 | **`fs` stdlib (write temp + `rename`)**                                | Same-directory rename is atomic on POSIX                                                                                   | `fs-extra` (rejected: stdlib suffices)                                                                   |
| Schemas for tool params            | **TypeBox** (`Type.Object`, `StringEnum` from `@earendil-works/pi-ai`) | pi's own tool-registration API is TypeBox-shaped; bundled by pi                                                            | zod (rejected: type mismatch with pi's API)                                                              |
| Package manager                    | **npm**                                                                | pi's package installer runs `npm install --omit=dev`; team default                                                         | pnpm/yarn (rejected: would conflict with pi's install flow)                                              |

**Dependency policy: zero runtime dependencies.** The extension imports only Node
stdlib + pi core (peer, bundled). The linter imports only Node stdlib. Dev
dependencies only: `typescript`, `@types/node`, `prettier`.

| Dependency                        | Where                   | Why it earns its place                                           |
| --------------------------------- | ----------------------- | ---------------------------------------------------------------- |
| `typebox`                         | peer `"*"`              | Required by pi's `registerTool` parameter schemas; pi bundles it |
| `@earendil-works/pi-ai`           | peer `"*"`              | `StringEnum` helper + pi type surface; pi bundles it             |
| `@earendil-works/pi-coding-agent` | peer `"*"` (types only) | `ExtensionAPI` types for the extension                           |
| `typescript` (dev)                | dev                     | `tsc --noEmit` typecheck                                         |
| `@types/node` (dev)               | dev                     | stdlib typings                                                   |
| `prettier` (dev)                  | dev                     | single formatter, deterministic diffs                            |

## 2. Project / folder structure

Repo root = package root (one `package.json`). The team's working sample guides live
at `lab-guides/` (excluded from the tarball); the package carries its own committed
copies under `skills/style-corpus/`.

```
holagent-lab-guides/
├── package.json                  # name, pi manifest, keywords ["pi-package"], files[]
├── README.md                     # see 06-documentation-plan.md
├── prompts/                      # 10 prompt templates (hol-plan.md, …)
├── agents/                       # 6 agent files (frontmatter + system prompt)
├── skills/
│   ├── load-context/SKILL.md
│   ├── scrape-website/SKILL.md, cli.md
│   ├── research-company/SKILL.md
│   ├── research-product/SKILL.md
│   ├── analyze-writing-style/SKILL.md
│   ├── match-writing-style/SKILL.md
│   ├── guide-format/SKILL.md, format.json
│   ├── evaluation/SKILL.md, scoring-guide.md, scorer-prompts.md,
│   │   ├── checklist/{plan,module-plan,module,guide}/*.md
│   │   ├── analytic/{plan,module-plan,module,guide}/*.md
│   │   └── holistic/{plan,guide}/*.md
│   ├── style-corpus/SKILL.md, samples/*.md      # the 4 reference guides (committed)
│   ├── lab-anti-patterns/SKILL.md
│   ├── design-modules/SKILL.md
│   ├── write-guides/SKILL.md
│   └── guide-scaffolds/SKILL.md, templates/*.md
├── extensions/
│   ├── hol.ts                    # registers 3 tools + 2 commands (thin glue)
│   └── linter/
│       ├── cli.ts                # CLI entry (JSON report, exit codes)
│       ├── scan.ts               # line scanner: headings/TOC/links/images/callouts/commands
│       ├── rules/                # L0xx.ts per rule group, each registered by rule ID
│       ├── shellcheck.ts         # extraction + execFile wrapper
│       └── index.ts              # runLint(guideDir) → LintReport
├── test/
│   ├── linter/*.test.ts          # unit tests (fixtures in test/fixtures/)
│   ├── extension/*.test.ts       # validation/IO unit tests
│   ├── corpus/expected/*.json    # expected linter reports for style-corpus samples
│   └── smoke.mjs                 # package smoke: manifest integrity, frontmatter, branding grep
├── scripts/
│   └── sync-corpus.mjs           # copies lab-guides/*.md → skills/style-corpus/samples/ (manual, versioned)
├── docs/
│   ├── linter-rules.md           # generated from format.json (scripts/gen-rule-docs.mjs)
│   └── adr/*.md                  # ADR-001 … ADR-006
├── lab-guides/                   # team working copies (NOT in tarball)
└── .github/workflows/ci.yml
```

`package.json` essentials:

```jsonc
{
  "name": "holagent-lab-guides",
  "version": "0.1.0",
  "keywords": ["pi-package"],
  "files": ["prompts", "agents", "skills", "extensions", "test", "docs", "README.md"],
  "peerDependencies": {
    "@earendil-works/pi-coding-agent": "*",
    "@earendil-works/pi-ai": "*",
    "typebox": "*",
  },
  "devDependencies": { "typescript": "^5", "@types/node": "^22", "prettier": "^3" },
  "pi": {
    "extensions": ["./extensions/hol.ts"],
    "skills": ["./skills"],
    "prompts": ["./prompts"],
  },
  "pi-subagents": { "agents": ["./agents"] },
}
```

(`pi-subagents.agents` and `pi.subagents.agents` are both accepted by
pi-subagents; we use the `pi-subagents` key. Scripts: `test`, `typecheck`,
`lint:corpus`, `docs:rules`, `corpus:sync`.)

## 3. Tooling

| Concern       | Choice                                                                               | Notes                                                                                     |
| ------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Typecheck     | `tsc --noEmit` (strict)                                                              | Also the guardrail keeping the linter erasable-TS (no enums/param properties)             |
| Formatter     | Prettier (single config, `prettier --check` in CI)                                   | Applies to TS + MD                                                                        |
| Linter (code) | none in v1                                                                           | ~1–2k lines of TS; tsc + review is proportionate. Revisit if the linter grows rule groups |
| Tests         | `node --experimental-strip-types --test test/**/*.test.ts` (node:test, no framework) | Same approach pi-subagents uses; no transpilation                                         |
| CI            | GitHub Actions, `ubuntu-latest`, Node 22                                             | No Docker, no matrix (single target arch)                                                 |
| Release       | git tags; `npm pack` in CI for tarball validation                                    | npm publish is a later decision (open question Q3)                                        |

### CI jobs (`ci.yml`)

1. **test** — `npm ci` → `npm run typecheck` → `npm test` → `prettier --check .`
2. **corpus** — run the linter CLI over `skills/style-corpus/samples/` and diff each
   report against `test/corpus/expected/*.json` (exact rule-ID + line match).
   This job is the executable form of the "validate the four samples with a known
   drift list" constraint.
3. **package-smoke** — `npm pack` → unpack to temp → assert: every `pi.*` manifest
   path exists; every `SKILL.md`/agent file has valid frontmatter (name, description);
   `grep -ri instruqt <pkg>` returns nothing; `test/smoke.mjs` passes.

## 4. Non-obvious decisions (reasoning)

- **No build step, ever.** jiti (pi) and Node type-stripping (CLI/tests) make
  compiled artifacts unnecessary; "erasable TypeScript only" is the single constraint
  that keeps this true, and `tsc` enforces it.
- **Rule config in `format.json`, rule logic in TS.** Config (headings, regexes, the
  exact platform-notice string) changes as the standard is refined; logic rarely does.
  Separating them means format tweaks are config edits, reviewable as data.
- **Extension commands (not templates) for `/hol-validate` and `/hol-status`.**
  Deterministic output must not depend on model behavior; extension commands run
  before template expansion and bypass the LLM entirely.
- **One extension module.** Three tools + two commands in ~400 lines of glue;
  splitting into packages/extensions adds install surface for no benefit at this
  scale.
- **`scripts/sync-corpus.mjs` instead of symlinks.** Tarballs must not follow
  symlinks out of the package; committed copies + a documented sync script keep the
  style corpus versioned and portable.
