# ADR-016: parity executes only the declared contract, and one reader serves both QA paths

- **Status**: Accepted (2026-09-01)
- **References**: ADR-007, ADR-011, ADR-012;
  `extensions/hol-core.ts` (`runParity`, `renderQaScript`, `recordQaResult`),
  `prompts/hol-qa.md`, `prompts/hol-qa-prod.md`

## Context

`lab-prep.md` declares a baseline, software with versions, credentials,
endpoints, artifacts, and `verify` checks (ADR-011). Stage 3 has to turn that
into evidence that the running lab matches it.

The tempting move is to synthesize checks from the declarations: curl every
endpoint, `test -e` every artifact path, query every version. It fails on the
first real lab. The QA host is not the lab environment — an artifact path is
inside a container, an endpoint may be reachable from the cluster and not from
here, and a version query differs per component. Every synthesized check is a
guess about topology, and a guess that fails produces a false negative that
teaches people to ignore parity.

Production adds a second problem. `/hol-qa-prod` renders the same checks for a
human to run (ADR-012). If the renderer and the executor read `lab-prep.md`
separately, they drift, and the production checklist quietly stops being the
thing dev was verified against.

## Decision

**`hol_parity` runs the `verify` entries the author declared, verbatim, and
nothing it composed itself.** `verify` is therefore the single place an author
says how you know this lab is ready, which is what ADR-011 already intended.

What the contract declares but no check exercises is reported as a **coverage
warning** — per endpoint, artifact and software entry, matched by literal token
containment against the check commands. Warnings never fail parity. They say
"nothing proves this", which is true and actionable, rather than "this is
broken", which would often be false. Closing them is the `qa-runner`'s job by
hand, and a contract with many of them is visibly a contract that verifies
little.

**One reader serves both paths.** `runParity` and `renderQaScript` read
`lab-prep.md` through the same function, apply the same preconditions (parses,
non-empty `verify`, no blank entries, nothing that would hang), and compute
coverage the same way. Execution is the only difference: `runParity` resolves
its environment through `resolveDevEnvironment` and refuses anything else with
no override parameter; `renderQaScript` executes nothing and accepts any
environment.

Asserted outcomes go through `recordQaResult`, which requires the environment's
`kind` to match the record: an `e2e-prod` result cannot be filed against a dev
environment, or the reverse, and `ok: true` is refused when a listed check
failed.

## Consequences

- Parity is trustworthy in the narrow sense that matters: a failure means a
  declared check failed, not that this package guessed wrong about the network.
- The author's incentive is right — the way to get more coverage is to write
  more `verify` entries, which is also the way to make `/hol-qa-prod` more
  useful, because it is the same list.
- The dev run and the production checklist are the same checks by construction,
  not by discipline.
- Parity cannot tell you that a check exited 0 while printing the wrong thing.
  `expect` is recorded verbatim and compared by a human or the `qa-runner`;
  turning it into an assertion would require guessing what "HTTP 200" should
  match in the output of a command that prints nothing on success.
- `smoke.json` means "the lab came up and did what the spec says", a strictly
  stronger claim than parity passing — and it is what moves the build stage to
  `smoke-passed`.
