# ADR-013: adoption reconstructs a proposal, and inherits what it cannot know

- **Status**: Accepted (2026-09-01)
- **References**: ADR-008, ADR-009, ADR-011, ADR-012; `prompts/hol-adopt.md`,
  `agents/lab-surveyor.md`

## Context

The lifecycle (ADR-009) runs concept → sizing → spec → build → guide → ship.
Almost no lab in the existing catalogue entered at the top: the environments
already exist, the code already runs, and — with one exception — there are no
spec documents at all. A pipeline that only serves labs built from scratch
serves almost nothing the team currently owns.

Two things stand in the way. First, there is no contract to work from: the
environment's real shape lives in compose files, manifests, a Makefile, and
somebody's memory. Second, three stages of the lifecycle have no artifacts and
never will, because the work they represent was never done in this form.

## Decision

`/hol-adopt` enters the lifecycle at stage 4 (guide), and does two things.

**It reverse-engineers the contract, and treats the result as a proposal.**
`lab-surveyor` reads the lab repo's deployment artifacts and, where a `dev`
environment exists, observes the running instance, then writes `lab-prep.md`
and an observed `.holagent/sizing.md`. Precedence is fixed: **artifacts beat
documentation, the running environment beats both**, and a disagreement between
them is reported rather than silently resolved. Every frontmatter row carries
its evidence and a confidence — `observed`, `declared`, or `inferred` — and the
command presents the `inferred` rows first for confirmation. `hol_prep_check`
gates the shape; the human gates the facts. Nothing is registered until they
confirm it.

**It marks the stages it cannot know as inherited, and writes nothing for
them.** `lab-ref.json` records `origin: "adopted"` with `adopted_stages`
defaulting to `concept`, `spec`, `build`. No `concept.md` and no spec set are
generated. `sizing` is deliberately _not_ inherited: the surveyor produced a
real file from evidence, it has not passed a scoring gate, and `drafted` is the
honest state for it.

## Consequences

- The shortest path to value on the existing catalogue is A0 + adoption +
  platform fit: guide authoring and platform review against labs like the ones
  the team already runs, with no stage 1–3 work at all.
- `adopted` means "never written", not "written elsewhere". Anything downstream
  that needs a story — stage-5 launch collateral above all — has to ask for one
  (`/hol-adopt` offers `/hol-concept` retroactively) rather than infer it from
  the code. A fabricated business case is worse than a missing one.
- Adoption is only as good as the confirmation step, so the command is built
  around it: the survey is dispatched, gated, and then handed over. A tidy-
  looking reconstruction with a confidently wrong version is the exact failure
  mode, and review is the only thing that catches it.
- The surveyor is read-only in the lab repo and read-only against `dev` only,
  so adopting a lab can never change it.
