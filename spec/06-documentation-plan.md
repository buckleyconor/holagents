# 06 — Documentation plan

## 1. README (repo root = package README)

Required sections (in order):

1. **What it is** — 3 sentences: pi package, lab-guide pipeline, one-install.
2. **Prerequisites** — pi with pi-subagents installed; optional: `shellcheck`
   (apt), Node 22 (bundled with pi). What degrades without each (W-SH; no scoring
   fanout without pi-subagents).
3. **Install** — `pi install git:<repo>@v0.1.0` (and `-l` for project scope); verify
   with `/hol-status` in any guide dir.
4. **Quickstart** — the 6-command happy path (`/hol-research-company` →
   `/hol-research-product` → `/hol-plan` → `/hol-plan-module` →
   `/hol-generate-module` → `/hol-review-guide`), one line each.
5. **Command reference** — the §02 §1.1 table + the 2 extension commands, with
   prerequisites column (mirrors the reference plugin's UX).
6. **Workflow notes** — stage separation via `/clear` (state is in files, not
   conversation); the test flow after each module (verify-only / manual lab run /
   skip); the screenshot placeholder convention and how authors replace them with
   real `/ImageProxy` links after upload.
7. **Configuration** — `HOLAGENT_DATA_DIR` (default `~/.holagent`); model
   assignments (inherit parent by default; how to pin scorers to a cheaper model via
   agent frontmatter or `subagents.agentOverrides`).
8. **Data layout** — the §02 §3.1 tree, short.
9. **Troubleshooting** — table: symptom → cause → fix (scraper missing; shellcheck
   missing; `E-PATH`; scorer JSON parse retry; pi-subagents not loaded; `grep -ri
   instruqt`-style confusion about provenance).
10. **Provenance & license** — architecture derived from an existing Claude Code
    plugin (credit line), content/format standard is the team's own; license of the
    package.

## 2. Interface documentation approach

- **Extension tools:** the authoritative contracts are §02 §4.1–4.3 of this spec;
  each tool's `description` (visible to the LLM) is a condensed version of its
  contract. The TypeBox parameter schemas are the executable contract — tests
  (T-33…T-41) assert behavior against them.
- **Linter rules:** `docs/linter-rules.md` is **generated** from
  `skills/guide-format/format.json` by `scripts/gen-rule-docs.mjs`
  (`npm run docs:rules`; CI job checks it's in sync — drift fails the build).
  Rule ID, severity, one-line description, example fix. No hand-maintained rule
  docs.
- **Commands:** self-documenting — the prompt template body *is* the command doc
  (argument table, workflow, error handling table), consistent with how pi prompt
  templates are consumed. The README command table links to each template.
- **Scoring contract:** `skills/evaluation/scorer-prompts.md` (task templates +
  JSON contract) is the single source; §02 §4.4 mirrors it.

## 3. Inline comment / docstring expectations

- **TS (linter + extension):** every exported function gets a doc comment with
  input/output/error semantics matching the spec section it implements
  (`@spec §02 §4.1`-style references). Rule modules start with the rule ID,
  severity, and a link to the `format.json` entry. No narrative comments
  explaining the obvious.
- **Prompts:** structured with `## Arguments`, `## Workflow` (numbered steps),
  `## Error Handling` (table), `## Important Notes` — the same skeleton across all
  10 templates for muscle memory.
- **Skills:** `# <name>` + one-paragraph purpose + `## When to use` + numbered
  workflow + `## References` (relative paths). Keep SKILL.md < 150 lines; push
  detail into sibling files (the evaluation skill's rubrics are separate files by
  design).
- **Agents:** frontmatter (tools, skills, model default) + role statement + numbered
  flow matching the reference plugin's style; no tools/behavior beyond the
  frontmatter allowlist.

## 4. Architecture Decision Records (kept in `docs/adr/`)

| ADR | Decision | One-line why |
|---|---|---|
| 001 | Parent session owns scorer fanout and fix loops (children don't spawn children) | pi-subagents policy; parallel `runs.all` with stable keys + read-only scorers beats grandchild dispatch |
| 002 | Knowledge (format spec, rubrics, templates, style corpus) bundled inside skill directories | Pi resolves skill-relative paths; a package's install path varies, so skill dirs are the only stable base |
| 003 | No lifecycle-script layer (setup/check/solve/cleanup); inline commands only | holagent lab environments are pre-provisioned; the deliverable is the guide document, not sandbox state |
| 004 | Line-based linter, no Markdown AST dependency, erasable-TS only, no build step | We own the format; stdlib-only keeps supply chain empty and Node strip-types runs everything |
| 005 | `guide.md` is canonical during the pipeline; rename to `<ID>-<Title>.md` only after a passing `/hol-review-guide`, user-confirmed | Keeps tooling paths stable; final name is an authoring decision, not a tooling one |
| 006 | Scorer output = single trailing fenced JSON block (no per-workflow-item `outputSchema` reliance) | `workflowScript` item options don't guarantee structured-output schemas; trailing-block + parse-retry is robust and testable |
| 007 | `/hol-validate` and `/hol-status` are extension commands (LLM-bypass), all other commands are prompt templates | Determinism for deterministic ops; model orchestration for judgment ops |

ADRs are short (context / decision / consequences), immutable once accepted —
superseded by a new ADR that references the old one.

## 5. Other docs

- `docs/manual-e2e.md` — the milestone-gate runbook (§05).
- `docs/linter-rules.md` — generated (§2).
- No wiki/portal in v1: README + spec + ADRs are the full surface for a single-team
  tool.
