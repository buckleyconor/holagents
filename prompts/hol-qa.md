---
description: Verify the built lab on its dev environment — hol_parity executes lab-prep.md's verify checks, qa-runner brings the lab up and exercises it end to end, and the result is recorded as the smoke record plus dry-run material for the guide.
argument-hint: '--env <dev-environment>'
---

QA the lab at/above the current directory against a dev environment (stage 3).
Arguments: $@

Two questions, answered by two different things: **does the environment match
the contract** (deterministic — `hol_parity`) and **does the lab actually work**
(judgment — `qa-runner`). Follow the steps in order. Stop and report at the
first hard failure.

## 1. Prerequisites

- **pi-subagents**: the `subagent` tool must be available. If it is not, stop:
  "pi-subagents is not loaded — install/enable it and retry." (`hol_parity`
  alone still works, and step 4 is worth running on its own.)
- **Locate the package skills**: `spec-authoring`, `load-context`,
  `lab-anti-patterns`.

## 2. State check

- Run `hol_status`. Report the build stage and the milestone states. If any
  milestone is not `scored-passed`, say which and ask whether to QA anyway —
  QA against a half-built lab produces failures that belong to `/hol-build`.
- Resolve `--env`. If it is missing, list the environments from
  `lab-ref.json` with their kinds and ask. **A `prod` environment is not an
  option here** — `hol_parity` refuses it and so should the question. Point at
  `/hol-qa-prod` instead.
- Run `hol_prep_check`. If the contract does not pass, stop: parity runs the
  `verify` entries verbatim, and a contract with an unfilled row or an
  unrunnable check cannot be verified. Fix it first (`/hol-spec` for a
  generated lab, `/hol-adopt` for an adopted one).

## 3. Say what is about to run

Before executing anything, show the user the `verify` checks from
`lab-prep.md`, verbatim, and the environment they will run against. These are
commands from a file, executed on this machine — the user should see the list
before it runs, not after.

## 4. Parity (deterministic)

- Run the `hol_parity` tool (`env: <name>`). It executes every `verify` entry
  against the dev environment and records `.holagent/qa/parity.json`.
- Report per check: pass/fail, the declared `expect`, and the actual output for
  anything that failed. **`expect` is recorded, not judged** — comparing what
  the command printed against what the contract expected is your job, and a
  check that exits 0 while printing the wrong thing is a finding parity cannot
  see.
- Report the **coverage warnings**: declared endpoints, artifacts and software
  that no `verify` check exercises. These are not failures; they are the parts
  of the contract nothing proves, and they go to the qa-runner to check by
  hand. A contract with many of them is a contract that verifies little.

## 5. Dispatch the qa-runner (blocking)

`subagent` tool — `agent: "holagent.qa-runner"`, `async: false`. Task payload
(self-contained):

- **The dev environment name and endpoint**, and an explicit "this is the only
  environment you may touch."
- **The parity record** — checks, results, and the coverage warnings it must
  close by hand.
- `lab-prep.md` in full, §5 test strategy, §7 build sequence, §9 environment.
- The plan's module list when `plan.md` exists, so the dry-run material comes
  back grouped by the module that will use it.
- Reminders: dev only; do not fix the lab; do not edit `lab-prep.md` — a
  disagreement with reality is the output, not a thing to reconcile; leave the
  environment as found; capture output verbatim including the noisy lines;
  redact secrets.

## 6. Record the outcome

- Run `hol_qa_record` (`kind: "smoke"`, `env: <name>`, `ok:`, `checks:`,
  `notes:`) with the qa-runner's verdict and its per-flow results. The
  environment's kind must be `dev` or the tool refuses the record.
- `ok: true` moves the build stage to `smoke-passed`. Record `true` only if the
  lab came up **and** did what the spec says. Parity passing on its own is not
  a smoke pass — it means the environment matches a contract, which is a
  weaker claim than the lab working.

## 7. Report

- Parity: pass/fail per check, and the coverage warnings.
- The qa-runner's verdict, bring-up time, and the flows it exercised.
- **Contract disagreements** — declared vs observed, with evidence. These are
  the most valuable output of this command: each one is either a `lab-prep.md`
  fix (`/hol-spec`) or a lab fix (`/hol-build`), and saying which is the point.
- **Dry-run material**, grouped by module. This is what `/hol-generate-module`
  currently asks you to capture by hand; from here it comes from a real,
  parity-verified environment.
- Next: `/hol-plan` or `/hol-generate-module` for the guide (the dry-run
  material is now available), and `/hol-qa-prod --env <prod>` when the lab
  reaches production.

## Note on what QA must not do

Do not make a failing check pass by editing `lab-prep.md`. The contract is what
the guide is written against and what the platform review reads; changing it to
match a broken environment moves the failure somewhere it will not be found
until a learner hits it.
