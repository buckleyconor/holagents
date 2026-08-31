<!-- Worked example, lightly redacted: two references to the upstream project's
     name were generalised so this file passes the package's own no-third-party-
     branding check (scripts/package-smoke.mjs). The verbatim original is in git
     history as spec_builder_prompt.md. Provenance is recorded in the README. -->

You are a senior software architect producing a development specification for an
application that will be built by an autonomous coding agent. The agent will rely
on this spec as its primary source of truth, so it must be precise, unambiguous,
and self-contained.Based on what you know already about this project and the details below:

What it does: A Pi.dev agent package (holagent) that produces production-quality hands-on lab guides end-to-end: researches vendor/product context, plans the guide interactively (ID, audience, objectives, module roadmap, environment), generates the guide Markdown module-by-module, and validates + scores it against a house format/style standard derived from the four sample guides.

- Primary users: Lab-guide authors / technical content engineers (primary); field technical specialists & AI solution architects who consume the guides (indirect).
- Core features (priority order):

1. /hol-plan guided planning incl. lab-prep spec
2. format-conformant module-by-module generation
3. /hol-validate deterministic linter + shellcheck on inline commands
4. rubric scoring (checklist / analytic / holistic) with parent-owned fix loops
5. vendor & product research (site scraping, style corpus from the 4 samples)
6. state tracking + idempotent /hol-generate-all resume + /hol-status

- Out of scope (do NOT build): lab environment provisioning (VM images, K8s/Helm, sample data), screenshot capture & image upload, publishing/upload to the lab platform, automated end-to-end lab execution (upstream-style track test), standalone scripts beyond guide-embedded commands, i18n
- Stack / language preferences: Pi-native: TypeScript extension (linter + status tools), Markdown prompts/skills/agents, Node for the linter; shipped as one pi package, no other constraints
- Runtime & deployment target: Dev: this workstation (Ubuntu 24.04.4, x86_64 — RTX PRO 6000). The plugin has no production deployment (local agent package).  
  Generated content targets: dev sandbox containers (browser + embedded terminal) and production = Charmed Kubernetes, x86, NVIDIA RTX PRO 6000 (Blackwell, sm_120) — guides must reference these accurately
- Data handled & sensitivity: demo lab credentials (deliberately weak, non-sensitive), scraped vendor product content, internal style corpus; no PII. ~/.holagent/ cache holds scraped vendor content — internal use only
- Expected scale: single team, local; roughly 5–20 guides/yr, 3–9 modules each, 10–25 KB Markdown per guide; no concurrency; plain-file state
- External services / APIs / integrations: public web (site scraping via bundled scraper binary), local binaries (shellcheck), pi model API (via pi config); GitHub hosting for the scraper release (re-host under your org later); platform ImageProxy API not in v1
- Hard constraints: zero upstream vendor branding in shipped files; single installable pi package; writes confined to project dir + ~/.holagent/; must work with installed pi-subagents; format spec must validate the four existing samples (accept with known-warn list, reject the drift classes: broken TOC, stale anchors, Phase headings); research cache stays plain files (VCS-checkable, shareable)

## Your task

Produce the specification as multiple Markdown (.md) files. Use clear headings, tables where they
aid comparison, and fenced code blocks for any schemas, config, or interfaces.
Scale the depth of each section to the context above — a small internal tool does
not need the same security posture as a public payments app. State your reasoning
for non-obvious choices.

Output the following spec documents in markdown, in this order:

1. **Overview** — Problem, goals, success criteria, and the non-goals restated.

2. **Architecture**
   - Major components and their responsibilities.
   - Data flow (describe, and include a simple text/Mermaid diagram).
   - Data model: key entities, fields, and relationships.
   - Key interfaces / API contracts (endpoints, inputs, outputs, errors).

3. **Build decisions**
   - Chosen language, framework, and primary libraries — with a one-line rationale
     and a noted alternative for each significant choice.
   - Project/folder structure.
   - Tooling: package manager, linter, formatter, CI approach.
   - Each dependency justified (why it earns its place); prefer the standard
     library or well-maintained, widely-used packages.

4. **Security**
   - Threat model: who/what are we protecting against, given the data above.
   - Authentication & authorization approach.
   - Input validation and output encoding strategy.
   - Secrets management (no hard-coded credentials, ever).
   - Data handling: encryption at rest/in transit where warranted, what to log
     and what must never be logged.
   - Dependency and supply-chain hygiene.
   - Map the most relevant risks (e.g. OWASP Top 10 categories that apply) to a
     concrete mitigation in this design.

5. **Test strategy**
   - Test levels to use (unit / integration / end-to-end) and the rough split.
   - A table of concrete test cases: ID, what it covers, input, expected result.
     Include happy paths, edge cases, error/failure paths, and at least a few
     security/abuse cases.
   - How tests run locally and in CI; target for meaningful coverage.

6. **Documentation plan**
   - What the README must contain (setup, run, config, troubleshooting).
   - API / interface documentation approach.
   - Inline-comment and docstring expectations.
   - Any architecture decision records (ADRs) worth keeping.

7. **Build sequence** — An ordered list of implementation milestones an agent can
   tackle one at a time, each independently testable.

8. **Open questions & assumptions** — Every assumption you made to fill a gap, and
   every decision you'd want a human to confirm before building. Be explicit; do
   not silently guess on anything that affects security or data.

## Rules

- If a requirement is ambiguous, make a reasonable assumption AND list it in
  section 8 rather than inventing unstated requirements.
- Prefer simple, proven solutions over clever ones.
- Do not write application code yet — this is the spec only.
- If you recommend a stack where I gave none, justify it briefly.
