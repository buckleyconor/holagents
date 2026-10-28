# GitLab CI Template Generator

Status: **Dropped** (was Draft 0.3). Removed from scope on 2026-09-28 — a lab
runs its own declared milestone tests through `/hol-build` and the CI generator
is not needed. Retained for the record only; do not implement.

Derived from the build sequence only, and it consumes nothing back. Unchanged
in direction from Draft 0.2; the amendments here answer the review questions
(job naming, drift detection, overwrite safety, and the one place GitLab can
make this consequential against our intention).

## Purpose

Generate a committed `.gitlab-ci.yml` for each lab repository so a lab repo
runs its own declared milestone tests on every push. The payoff is
**developer-facing regression feedback**: a red pipeline on push catches a
regression before the author runs `/hol-build`.

The package does **not** consume CI results. A green pipeline authorizes
nothing and a red pipeline blocks nothing inside the lifecycle; the consumer is
the developer reading the pipeline in GitLab. CI results are not referenced by
GAP-003 promotion evidence or the UAT evidence bundle (spec-k8s/07).

## Source of truth

### CIG-001 Derive, never invent

The generated pipeline MUST be derived from, and only from:

- The build sequence milestones in
  `<lab-repo>/<spec_dir>/07-build-sequence.md`, each declaring a `test` command
  and an `image` (ADR-015, ADR-023).
- `lab-ref.json` for environment names.

No new test definition MAY be introduced by the generator.

### CIG-002 Non-consequential scope

The generated pipeline MUST run only local, non-environment-executing checks —
the milestone `test` commands, which are local lab-repo code (the
`hol_build_test` posture).

`lab-prep.md` verify checks MUST NOT be generated as jobs. They are
environment-executing and cannot be dev-gated from a generated file (ADR-012
enforcement is `resolveDevEnvironment()`, which CI never calls). The generator
MUST instead emit a comment pointing at `hol_parity` (dev) and `hol_qa_script`
(prod) as the verification path.

## Output contract

### CIG-003 Deterministic, generated file

Identical inputs MUST produce byte-identical `.gitlab-ci.yml`. The file MUST
carry a header marking it generated ("do not edit; regenerate instead"), and
regeneration MUST overwrite a file that carries that header, so a hand-edit is
detectable.

A file that exists **without** the generated header is not ours: an adopted lab
may already run a real pipeline someone wrote. The tool MUST then return
`BLOCKED` and name the path rather than overwrite it — explicit user
confirmation is the only way past, mirroring how registration confirms a lab
repo (ADR-008). The same rule applies to `handoff/` files (spec-k8s/09).

The generated config MUST stay inside the line-based YAML subset
`parseProfileYaml` accepts — no anchors, aliases, `extends`, `!reference`,
block scalars, or tabs — so `hol_ci_check` can parse it with the same
line-based subset parser (ADR-004). Two consequences of that subset are binding
on the generator, not advisory:

- Keys and scalars MUST be emitted through the canonical emitter
  (`extensions/k8s/yaml.ts`), never string-templated, so a value containing `:`
  or `#` is quoted the way the parser expects.
- Comments MUST be full-line. `# …` at the end of a value line is outside the
  subset. Quoted keys are also outside it.

### CIG-004 Stage mapping

Each build milestone MUST become one job. Order and dependencies use two
distinct mechanisms:

- `stages:` — one stage per milestone in build-sequence order, so sequential
  order is preserved.
- `needs:` — a milestone's `depends_on` entries become `needs:` references (a
  DAG; order is not implied by `needs`, only dependency).

**Job names.** `slug` verbatim is not always legal under the subset parser:
`KEY_RE` requires a letter-initial key while `SLUG_RE` admits a leading digit,
and quoted keys (`"2gpu-prep":`) are outside the subset — so a milestone named
that way would generate a file `hol_ci_check` cannot parse. Default applied:
jobs are named `m<NN>-<slug>` (letter-initial and collision-free by
construction), and the slug→job mapping is what the gate uses to prove one job
per milestone. The alternative — relaxing `KEY_RE` — is OQ-10-1. The same
prefix settles a slug that collides with a reserved top-level key (`stages`,
`types`, `workflow`, `include`, `default`), where a bare slug would emit two
values for one key.

**Forward dependencies.** `readBuildSequence` only _warns_ when `depends_on`
cites a later milestone (ADR-015). GitLab rejects a `needs:` on a later-stage
job, so the generator MUST treat a forward dependency as an error rather than
emit a pipeline that fails to validate — `hol_ci_check` parses YAML, not DAG
legality.

A milestone with no `test` command MUST be reported as an error, never skipped
silently — a milestone that cannot be tested on its own is a phase, not a
milestone (ADR-015).

### CIG-005 Runner and image contract

Each milestone MUST declare an `image` — the toolchain container its `test`
command runs in — as a new `image` field in `07-build-sequence.md` (ADR-015
amendment). A milestone with a `test` but no `image` MUST fail generation with
`BLOCKED`, never produce a job with no image targeting (a pipeline no runner
can execute is the silent-green-empty failure mode).

`tags:` is optional and deferred. The GitLab runner fleet does not exist yet
(DEP-005); until it does, the generator renders a correct, image-targeted file
that nothing executes. The generator MUST NOT invent tags.

The image MUST be pinned to a tag or, better, a digest; `:latest` MUST fail
generation — the same rule `spec-completeness/dependencies-pinned` applies to
the spec, and unpinned is how a milestone goes red for a reason nobody changed.
Whether an internal registry mirror is required is a platform rule, so it
belongs in `~/.holagent/platforms/<name>/requirements.md` rather than here
(OQ-10-2).

### CIG-006 Evidence and artifacts

Jobs MUST capture their output in GitLab's job log. Archiving files as
`artifacts:` is **off by default**: the generator cannot learn an evidence path
from a shell string, and archiving a path makes lab output downloadable through
the instance. A milestone MAY declare an output path explicitly; only then is it
emitted, with an `expire_in` the spec states.

### CIG-007 Secret-free

The generated config MUST NOT inline any credential, token or kubeconfig.
Secret material MUST be referenced by CI/CD variable name only.

### CIG-008 Deterministic check

A deterministic tool (`hol_ci_check`) MUST verify the generated config is
present, parses under `parseProfileYaml`, has one job per milestone in
build-sequence order (via the slug→job mapping, CIG-004), declares a pinned
`image` per job, is secret-free, and agrees with the build sequence on
milestone count and order — the CI analogue of `hol_launch_check`.

Drift is detected by **re-rendering in memory and diffing against the committed
file**: no record file and no stored digest to go stale, which keeps stage state
derived rather than stored (ADR-009). The tool needs the renderer either way,
so re-rendering is the cheaper contract.

Results follow the ARC-004 taxonomy (spec-k8s/01): `PASS`,
`PASS_WITH_WARNINGS`, `FAIL`, `BLOCKED` (no parseable build sequence, or a
non-generated file in the way).

## Interaction with GitLab merge checks

CIG-002 makes this pipeline non-consequential _inside_ the lifecycle. GitLab
decides what happens _outside_ it, and a committed `.gitlab-ci.yml` is not
inert: with DEP-005 unresolved, every push — including each promotion commit to
a `uat` or `prod` branch — creates a pipeline whose jobs sit `pending` because
nothing picks them up. If the live project settings (DEP-004) include "merge
request pipelines must succeed" or merge trains, holagent's own evidence-
bearing MRs stall on a pipeline that can never finish.

So the non-consequence claim needs one of two things, and that is OQ-10-3:

- Confirm with the GitLab admins that lab projects do **not** gate merges on
  pipeline status — cheapest, adds a question to DEP-004, and true today by the
  accident that no runner exists; **or**
- Emit a `workflow:`/`rules:` block scoping pipelines to branch pushes with a
  `when: manual` fallback, so a lab pipeline can never hold an MR — at the cost
  of the "runs on every push" premise this module exists for.

If nobody can answer it, it becomes `DEP-006` and the lifecycle position below
stays `BLOCKED` rather than guessed.

## Proposed command surface

New proposals, not existing commands:

- `hol_ci_render` — generate `.gitlab-ci.yml` into the lab repo (ADR-021).
- `hol_ci_check` — the deterministic gate above.

When the render runs is a lifecycle question, not an implementation detail: the
stated payoff is regression feedback _during_ the build, so rendering at ship
stage is four stages too late. Default applied: render at the end of
`/hol-spec`, once the build sequence validates, and re-render when `hol_ci_check`
reports drift or the sequence changes. The alternative is a step in
`/hol-build`. Either way it needs an LLM-bypass command per ADR-007
(`/hol-ci-render`) and a `ci` substate in `hol_status` — OQ-10-4.

## Acceptance criteria

- A lab with N tested milestones yields N CI jobs in build-sequence order.
- A milestone with no test command fails generation rather than being dropped.
- A milestone with a test but no `image` fails generation with `BLOCKED`.
- A milestone whose slug starts with a digit still yields a file `hol_ci_check`
  can parse (CIG-004's job naming rule, whichever way OQ-10-1 settles).
- A pre-existing hand-authored `.gitlab-ci.yml` is never overwritten silently.
- No verify check is scheduled as a job; the generated file points at
  `hol_parity` instead.
- Identical inputs produce identical config.
- A hand-edit to the generated file is detectable (regeneration overwrites;
  `hol_ci_check` flags drift).
- No secret value appears in the generated config.
- `hol_ci_check` parses the generated file with the same line-based subset
  parser the profile uses.

## Open questions

- **OQ-10-1 — job naming**: prefixed names (`m<NN>-<slug>`, default) or relax
  `KEY_RE` to admit digit-initial keys?
- **OQ-10-2 — image provenance**: may a milestone name a public image
  (`python:3.12-slim`), or must it come from the internal registry? A platform
  rule, so the answer belongs in the platform knowledge base (ADR-014).
- **OQ-10-3 — GitLab merge checks**: does a lab project gate merges on pipeline
  status? Decides whether CIG-002's non-consequence claim holds, or whether we
  need a `workflow:` block — and possibly a DEP-006.
- **OQ-10-4 — lifecycle position**: render at the end of `/hol-spec` (default),
  or inside `/hol-build`? Either way it needs a command surface (ADR-007) and a
  `ci` substate in `hol_status`.
- **OQ-10-5 — one command, two contexts**: `hol_build_test` runs the milestone
  `test` on the host with `bash -c`; CI runs the same string inside `image`. If
  ADR-023 means the build gate to honour the image, that is a containerization
  change to the one place this package executes commands; if not, the ADR should
  say so, so nobody reads the two paths as identical.
