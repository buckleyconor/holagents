# Spec template — the eight sections

The section contract every holagent lab spec must satisfy. `spec-author`
fills it from `concept.md` + `sizing.md`; `checklist/spec-completeness`
scores against it. Sections 9 and 10 are holagent additions to the generic
template — a lab spec has to describe the environment it will be verified
against and the platform it will be deployed to.

---

You are a senior software architect producing a development specification for an
application that will be built by an autonomous coding agent. The agent will rely
on this spec as its primary source of truth, so it must be precise, unambiguous,
and self-contained.

## Application context

- What it does: {{ONE_LINE_DESCRIPTION}}
- Primary users: {{WHO_USES_IT}}
- Core features (priority order): {{FEATURE_LIST}}
- Out of scope (do NOT build): {{NON_GOALS}}
- Stack / language preferences: {{TECH_PREFERENCES_OR_"no preference, recommend one"}}
- Runtime & deployment target: {{WHERE_IT_RUNS}}
- Data handled & sensitivity: {{DATA_TYPES_AND_SENSITIVITY}}
- Expected scale: {{USERS_REQUESTS_DATA_VOLUME}}
- External services / APIs / integrations: {{INTEGRATIONS}}
- Hard constraints: {{BUDGET_TIMELINE_COMPLIANCE_EXISTING_CODE}}

## Your task

Produce the specification as Markdown (.md). Use clear headings, tables where they
aid comparison, and fenced code blocks for any schemas, config, or interfaces.
Scale the depth of each section to the context above — a small internal tool does
not need the same security posture as a public payments app. State your reasoning
for non-obvious choices.

Output the following sections, in this order:

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

```

---

9. **Environment & footprint** — the per-instance footprint from `sizing.md`,
   the concurrency target and binding constraint, shared vs per-tenant
   resources, and the exact images/versions. This section is what
   `lab-prep.md` is derived from, so every endpoint, credential, artifact
   path and readiness check named here must be concrete and observable.

10. **Platform-target constraints** — the target platform (vCD / Kubernetes),
    the requirements already known from `~/.holagent/platforms/<name>/`
    (when one exists), and any known non-compliance called out rather than
    deferred. `/hol-platform-check` is the real gate; this is the first pass.

---

## Pre-flight checklist

Answer these before filling the template. Skipping one usually shows up later as a wrong assumption in the spec.

### Purpose & scope
- [ ] In one sentence, what does the app do?
- [ ] Who are the users, and how technical are they?
- [ ] What are the 3–5 core features, in priority order?
- [ ] What is explicitly *out of scope* for the first build?
- [ ] What does "done and working" look like (success criteria)?

### Technical
- [ ] Do you have a required language/framework, or should the model recommend one?
- [ ] Where does it run — local CLI, web app, mobile, container, cloud, edge device?
- [ ] Any existing code, systems, or APIs it must fit into?
- [ ] What external services or third-party APIs are involved?

### Data
- [ ] What kinds of data does it store or process?
- [ ] Is any of it sensitive (personal data/PII, credentials, payment, health)?
- [ ] Are there compliance rules to honour (e.g. GDPR)?
- [ ] How long must data be kept, and can it be deleted?

### Scale & operations
- [ ] Rough expected number of users / requests / data volume?
- [ ] Single user, small team, or public internet?
- [ ] How will it be deployed and updated?

### Security
- [ ] Does it need user accounts / login? Multiple permission levels?
- [ ] Is it internet-facing or behind a trusted network?
- [ ] What's the worst outcome if it's compromised? (This sets the security bar.)

### Constraints
- [ ] Budget, timeline, or hard deadlines?
- [ ] Team's existing skills/preferences to stay within?
- [ ] Anything the previous attempt (if any) got wrong that you want avoided?

---

### A note on quality, since you're newer to this

The single most valuable section in the output is **Open Questions & Assumptions**. A good spec doesn't just answer — it surfaces what it *didn't* know. If that section is empty, the model probably hid guesses inside the design. Push back and ask it what it assumed.
```
