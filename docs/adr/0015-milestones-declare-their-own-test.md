# ADR-015: the build sequence is machine-readable, and every milestone declares its own test

- **Status**: Accepted (2026-09-01)
- **References**: ADR-007, ADR-008, ADR-010, ADR-011; `skills/spec-authoring/template.md`,
  `extensions/hol-core.ts` (`readBuildSequence`, `runBuildTest`), `prompts/hol-build.md`

## Context

Stage 3 builds the lab one milestone at a time, and `/hol-build-all` resumes a
partially built sequence. Both need to know what the milestones _are_ — and
`07-build-sequence.md` was prose. Parsing an ordered list out of prose is
guesswork, and guesswork about which unit of work to dispatch next is the kind
that silently builds the wrong thing twice.

The deeper problem is the phrase the spec template already used: milestones
must be **independently testable**. Nothing checked it. A milestone could
declare itself testable and be a phase in disguise, and the failure would not
surface until the build had grown around it. The guide track does not have this
problem — a module either passes `hol_validate` or it does not — because its
unit of work has a deterministic gate.

## Decision

`07-build-sequence.md` carries mini-YAML frontmatter as its source of truth,
exactly as `plan.md` does for modules: one flow map per milestone with `n`,
`slug`, `title`, `deliverable`, `exit`, `test`, and optional `depends_on`. The
prose below it explains the milestones; the frontmatter is what the pipeline
reads. `readBuildSequence` parses and validates it; `slug` is the score scope
(`build-<slug>`) and the build-record filename, so it is stable once building
starts.

**`test` is the command that proves that milestone, run in the lab repo root.**
`hol_build_test` executes exactly that string and the exit code is the gate
(ADR-007) — the build track's `hol_validate`. A milestone that does not pass
its own test is never scored: a scorecard about code that does not work is an
opinion, and merging it would make `scored-passed` mean less everywhere else.

The lab repo is local code the user registered and confirmed (ADR-008), so
running its tests is not an environment execution and ADR-012 does not apply.
The distinction is exact: this runs a command the **spec declared**, in a
directory the **user registered**, against no environment at all.

## Consequences

- "Independently testable" becomes a property the pipeline checks rather than a
  phrase in a template. Writing the milestone forces naming its test, and a
  test that cannot be named is the signal to split the milestone.
- `/hol-build-all` gets a real resume table — milestone state derives from the
  recorded test run plus `scores.json`, never from the model's word for it. A
  failing test stops the run, because in an ordered sequence every failure
  after a red milestone is unattributable.
- Milestone state deliberately does not claim to know whether code exists in
  the lab repo. `pending` covers "not started" and "started, never tested"
  alike; asserting more than the records support is how a state machine starts
  lying.
- Specs written before this ADR have no `milestones` frontmatter. They are
  reported as unusable with the reason, and fixed through `/hol-spec` — not
  worked around by parsing prose, which is the thing this decision exists to
  stop.
- The package now executes commands from a file. The blast radius is one
  declared test, in one registered repo, with a timeout, and a killed test
  counts as a failure.
