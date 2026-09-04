---
name: guide-scaffolds
description: Authoring templates for holagent guides and research profiles. Use when starting a new guide, module plan, lab-prep handoff, company/product research output, or style guide — copy the template into place, fill the "<< FILL: ... >>" markers, and validate.
---

# Guide Scaffolds

Templates for every holagent artifact. Each template is **copy-then-fill**: copy
the file to its target location, replace every `<< FILL: ... >>` marker with
real content, and validate before proceeding to the next stage.

| Template                          | Copies to                                                       | Purpose                                                                                  |
| --------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `concept.md`                      | `<guide-root>/.holagent/concept.md`                              | Lab concept — business problem, personas, story beats, aha moment                        |
| `sizing.md`                       | `<guide-root>/.holagent/sizing.md`                               | Footprint — production vs minimal demo, reduction decisions, density                     |
| `guide-plan.md`                   | `<guide-root>/.holagent/plan.md`                                 | Guide plan — frontmatter is the machine-readable source of truth                         |
| `module-plan.md`                  | `<guide-root>/.holagent/<NN-slug>/plan.md`                       | Per-module plan — steps, environment delta, image checklist, success criteria            |
| `lab-prep.md`                     | `<guide-root>/lab-prep.md`                                       | Environment **contract**: machine-readable frontmatter + human tables                    |
| `company.md`                      | `~/.holagent/companies/<company-slug>/company.md`               | Company research output                                                                  |
| `product.md`                      | `~/.holagent/products/<company-slug>/<product-slug>/product.md` | Product research output                                                                  |
| `style-guide.md`                  | `~/.holagent/companies/<company-slug>/style-guide.md`           | Writing style distilled from scraped documentation                                       |
| `platform-requirements.md`        | `~/.holagent/platforms/<name>/requirements.md`                  | What a platform team requires of a lab — grown by interview, appended after every review |
| `launch-exec-summary.md`          | `<guide-root>/launch/exec-summary.md`                            | Stage 5 — the business case, one page                                                    |
| `launch-catalogue-description.md` | `<guide-root>/launch/catalogue-description.md`                   | Stage 5 — catalogue entry; frontmatter is machine-checked against `plan.md`              |
| `launch-social.md`                | `<guide-root>/launch/social.md`                                  | Stage 5 — internal announcement posts, three lengths                                     |
| `launch-enablement-brief.md`      | `<guide-root>/launch/enablement-brief.md`                        | Stage 5 (optional) — the SE talk track                                                   |
| `guide-scaffold.md`               | `<guide-root>/guide.md`                                          | Minimal valid guide body                                                                 |

`<guide-root>` is the directory holding `guide.md` + `.holagent/`. For a lab
that is the **lab's own repo** (the guide lives at the repo root, next to the
build code); the tooling is path-agnostic and finds the guide root by walking
up from the working directory.

## Frontmatter subset rule

`plan.md` and module plans are parsed by the holagent frontmatter parser, which
implements a **minimal YAML subset** (`extensions/frontmatter.ts`). Stay inside
it or the file is "unparseable":

- top-level `key: value` scalars — quote strings with special characters
  (`title: "Setup the Cluster"`); keep numbers bare (`n: 1`)
- block lists — `key:` followed by indented `  - item` lines
- flow lists — `depends_on: [1]`
- flow maps, **one line each** —
  `  - { n: 1, slug: create-collections, title: "Create Collections", goal: "...", est_minutes: 10 }`
- one level of nested maps (e.g. `environment:` with indented keys)

Do **not** use: multi-line flow collections (a `{ ... }` or `[ ... ]` split
across lines), trailing inline comments after a value, anchors/aliases, or any
other YAML feature. If a value needs more than one line, use a block list or
keep the value on one line.

## Golden rule

1. A filled `plan.md` or module plan must **parse** with the holagent
   frontmatter parser (no "unparseable frontmatter" from the tools).
2. A filled `guide-scaffold` must pass `hol_validate` with **zero errors**.
   After filling the `## Module 1:` title, regenerate its TOC anchor from the
   new heading text (GitHub rules: lowercase, punctuation stripped, spaces to
   hyphens) — L004 catches stale anchors.
3. Markers are `<< FILL: ... >>` — never unfinished-marker tokens in any
   template or in a filled guide (W008 forbids the three standard ones).

## Fill order for a new lab

0. `concept.md` → `.holagent/concept.md` and `sizing.md` → `.holagent/sizing.md`
   (stage 1, `/hol-concept`) — the story and the footprint. Everything below
   inherits from them; `lab-prep.md` is derived from the sizing at `/hol-spec`.
1. `guide-plan.md` → `.holagent/plan.md` (id, title, slug, modules)
2. `lab-prep.md` → `lab-prep.md` (environment contract)
3. `module-plan.md` → `.holagent/<NN-slug>/plan.md`, one per module
4. `guide-scaffold.md` → `guide.md`, then expand Module 1 and add the rest
5. Run `/hol-validate` — errors block, warnings advise
6. `launch-*.md` → `launch/` (stage 5, `/hol-launch`) — written last, from the
   finished guide. The catalogue frontmatter must match `plan.md` exactly;
   `hol_launch_check` compares them.
