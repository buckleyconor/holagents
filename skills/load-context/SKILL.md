---
name: load-context
description: Path conventions, two-phase discovery, and per-command context matrix for holagent lab guides. Use when a /hol-* command must decide which research, plan, module, and guide files to load before doing work.
---

# Load Context

Discover available context cheaply, then read only what the current command needs.
All cross-command knowledge lives in files, never in conversation history, so every
command re-discovers state from disk.

## Paths

Data dir: `~/.holagent/` (override with `HOLAGENT_DATA_DIR`).

- Companies: `~/.holagent/companies/<company-slug>/`
- Products: `~/.holagent/products/<company-slug>/<product-slug>/`

Per-guide state under `guides/<slug>/`:

- `guide.md` — the guide being built (canonical working file)
- `lab-prep.md` — environment manifest for builders
- `.holagent/plan.md` — guide plan (frontmatter + sections)
- `.holagent/<NN-slug>/plan.md` — per-module plan
- `.holagent/scores.json` — scoring checkpoints
- `.holagent/last-validation.json` — latest linter report

## Two-phase: discover, then read

### Phase 1: Discovery (always run, cheap)

`ls` / file-exists checks only — no file contents:

- **Company**: does `companies/<company-slug>/company.md` exist? `style-guide.md`?
- **Products**: which directories exist under `products/<company-slug>/`?
- **Guide**: does `guides/<slug>/.holagent/plan.md` exist?
- **Module plans**: which `.holagent/<NN-slug>/plan.md` exist?
- **Guide state**: do `guides/<slug>/guide.md`, `lab-prep.md`, `scores.json`,
  `last-validation.json` exist?

Report discovery results to the calling command. Every command runs discovery so it
knows what is available.

### Phase 2: Selective reading (only what the task needs)

**`-` means do not read it even if it exists — it is not useful for this task.**
"relevant only" = only the products the guide covers (see Product filtering).

| Command                   | Company           | Style             | Products          | Plan              | Module plans | Guide.md          | Scores/State |
| ------------------------- | ----------------- | ----------------- | ----------------- | ----------------- | ------------ | ----------------- | ------------ |
| `/hol-research-company`   | existing (update) | existing (update) | -                 | -                 | -            | -                 | -            |
| `/hol-research-product`   | for extra sources | -                 | existing (update) | -                 | -            | -                 | -            |
| `/hol-plan`               | yes               | yes               | relevant only     | existing (extend) | -            | existing (extend) | -            |
| `/hol-plan-module`        | -                 | -                 | relevant only     | yes               | prior        | -                 | -            |
| `/hol-generate-module`    | yes               | yes               | relevant only     | yes               | this + prior | this + prior      | -            |
| `/hol-generate-all`       | yes               | yes               | relevant only     | yes               | all          | all               | -            |
| `/hol-review-plan`        | yes               | yes               | relevant only     | yes               | -            | -                 | yes          |
| `/hol-review-module-plan` | -                 | -                 | relevant only     | yes               | this         | -                 | yes          |
| `/hol-review-module`      | yes               | yes               | relevant only     | yes               | this         | this              | yes          |
| `/hol-review-guide`       | yes               | yes               | relevant only     | yes               | all          | all               | yes          |

"Scores/State" covers `scores.json` and `last-validation.json`.

## Product filtering

Load only the product files the guide actually covers.

| Stage                                                  | How to find relevant products                                                                 |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `/hol-plan`                                            | Command args or topic. Match against available product dirs. If ambiguous, list them and ask. |
| `/hol-plan-module`, `/hol-generate-*`, `/hol-review-*` | The plan's covered products. Load only those.                                                 |

**Hard rule:** never load all product files. A user may have 15+ products — loading
all wastes context and drags in irrelevant terminology.

## Using context

- Company name: use the exact capitalization from `company.md`.
- Terminology: substitute generic terms with company-preferred terms from `style-guide.md`.
- Product references: use accurate feature names and descriptions from `product.md`.
- Tone: match the formality documented in `style-guide.md`.
- Existing content: stay consistent with what is already in the guide.

## Fallback behavior

Every context type is optional. When context is missing:

- No `company.md`: neutral professional tone, no company-specific branding.
- No `style-guide.md`: neutral professional tone.
- No product files: rely on topic research and user input for technical accuracy.
- No plan: the calling command handles it (may start planning interactively).
- No existing guide: generate from scratch.

If company or product context would significantly improve quality, suggest the
relevant research command — but do not block.
