# ADR-023: build milestones declare a CI runner image (amends ADR-015)

- **Status**: **Dropped** (was Draft 2026-09-28). Retired with module 10
  (GitLab CI generator); the `image` field has no consumer and is out of scope.
- **References**: ADR-015; `spec-k8s/10-gitlab-ci-generator.md` (dropped)

## Context

The CI generator (spec-k8s/10) turns each milestone's `test` command into a
GitLab job. Milestone tests are arbitrary repo-root commands, so the toolchain
differs per lab; a job with no `image` falls back to the runner's default and
fails as a silently-green-empty pipeline, or fails for the wrong reason. ADR-015
defined the milestone schema as `n`, `slug`, `title`, `deliverable`, `exit`,
`test`, optional `depends_on` — no toolchain target.

## Decision

`07-build-sequence.md` milestone frontmatter gains an `image` field: the
toolchain container the milestone's `test` runs in. The generator emits it
verbatim as the job's `image`; a milestone with a `test` but no `image` fails
generation with `BLOCKED`, never silently. `tags` is optional and deferred —
the runner fleet does not exist yet (DEP-005), and the generator MUST NOT invent
tags.

## Consequences

- The build sequence now says _what runs the test_, not just _what command
  proves it_; the CI generator derives everything from the spec and invents
  nothing.
- `readBuildSequence`/`hol_build_test` and the spec-authoring template gain the
  `image` field (backwards-compatible: specs without it fail CI generation, not
  the existing build gate).
- CI generation stays offline and deterministic; execution is deferred until a
  runner fleet exists (DEP-005).
- The **build gate does not honour `image`**: `runBuildTest` executes the
  milestone's `test` on the host with `bash -c`, while CI runs the same string
  inside the declared image. Same command, two toolchains — an intentionally
  unverified equivalence, recorded here so nobody reads a green
  `build-<slug>` as proof the image works (spec-k8s/10 OQ-10-5).
- A milestone whose `image` is missing or `:latest` fails **CI generation**.
  `readBuildSequence` ignores unknown keys, so a mistyped `runner-image` is
  silently "no image"; putting `image` in the spec-stage rubric is what makes
  this fail early instead of at ship.
