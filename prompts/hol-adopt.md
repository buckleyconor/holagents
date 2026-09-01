---
description: Adopt an existing lab into the lifecycle at stage 4 — lab-surveyor reverse-engineers lab-prep.md + sizing.md from the repo and the running dev environment, you confirm them, and lab-ref.json records what was inherited rather than authored.
argument-hint: '<slug> --repo <path> [--env <name>=<endpoint>]'
---

Adopt an existing lab. Arguments: $@

Most HOL environments already exist and have no spec documents. Adoption works
backwards from what is really there: the deployment artifacts, and — where you
have one — the running dev instance. Stages 1–3 are marked **inherited**, not
fabricated. Follow the steps in order. Stop and report at the first hard
failure.

## 1. Prerequisites

- **pi-subagents**: the `subagent` tool must be available. If it is not, stop:
  "pi-subagents is not loaded — install/enable it and retry."
- **Locate the package skills**: `guide-scaffolds`, `lab-sizing`,
  `load-context`. Read `guide-scaffolds/SKILL.md` (templates + the mini-YAML
  rule) now.
- Parse the arguments: `<slug>` (kebab-case), `--repo <path>` (required),
  `--env <name>=<endpoint>` (optional, repeatable). Ask for anything missing.

## 2. State check

- If `guides/<slug>/.holagent/` already exists, run `hol_status` on it and
  show what is there. An already-adopted lab is a **re-survey**: warn that it
  overwrites the confirmed `lab-prep.md` and ask the user to confirm.
- If the lab has a `plan.md` or a `guide.md`, say so plainly: re-surveying
  changes the contract the guide was written against, and the guide will need
  re-validating afterwards.

## 3. Confirm the repo

- Expand `--repo` to an absolute path; confirm it exists and is a directory.
  If it is not, stop and report.
- Report what is actually there: `git -C <path> rev-parse` (is it a repo, on
  what branch, is the tree clean), the top-level listing, and which deployment
  artifacts exist (compose files, `k8s/`, `helm/`, `Dockerfile*`, `Makefile`,
  `scripts/`, inventory or README docs).
- **This path is outside the project root.** State that, and ask the user to
  confirm it before anything is written. Nothing in this package reaches
  outside the project root without that confirmation (ADR-008).
- If the repo has no deployment artifacts at all, say so and ask whether to
  continue on the environment alone — a survey with no artifacts and no
  environment has nothing to read.

## 4. Confirm the environments

Ask for each environment this lab has — name, `kind` (`dev` or `prod`), and
endpoint. Be explicit about what `kind` means, because it is a safety boundary
and not a label: **`dev` environments can be executed against; `prod`
environments never are** (ADR-012). If the user is unsure, `prod` is the safe
answer.

The surveyor probes **only** a `dev` environment, and only with read-only
commands. A lab with no dev environment can still be adopted — the survey then
reads artifacts alone, and every row of the contract comes back `declared` or
`inferred` rather than `observed`. Say which case you are in before dispatching.

## 5. Create the lab root

```bash
mkdir -p guides/<slug>/.holagent
```

Do **not** write `lab-ref.json` yet. Registration is what marks stages as
inherited, and nothing is inherited until the human has seen what the survey
reconstructed (step 8).

## 6. Dispatch the lab-surveyor (blocking)

`subagent` tool — `agent: "holagent.lab-surveyor"`, `async: false`. Task
payload (self-contained):

- **Paths**: absolute lab repo; absolute lab dir; write `lab-prep.md` in the
  lab dir and `.holagent/sizing.md` under it. Nothing inside the lab repo.
- The artifact inventory from step 3, so it starts where the evidence is.
- The **dev** environment name and endpoint, when there is one — or an explicit
  "no environment to observe; survey the artifacts alone."
- **Templates**: `lab-prep.md` and `sizing.md` from `guide-scaffolds` (paths).
- Reminders: read-only everywhere, and never inside the lab repo;
  non-interactive commands only; artifacts beat documentation and the running
  environment beats both — report conflicts rather than picking a winner; use
  the version the lab actually uses, including a floating tag; every
  frontmatter row cited in the Evidence table with a confidence; the Unverified
  section is the point; no `<< FILL: ... >>` left behind.

## 7. Deterministic gate

- Run the `hol_prep_check` tool (`guideDir: guides/<slug>`). Require `ok: true`.
  It fails on a missing key, an incomplete row, a leftover marker, frontmatter
  outside the mini-YAML subset, and on a `verify` check that could not run
  unattended.
- On failure, re-dispatch the surveyor **once** with the specific failures
  listed. Still failing → stop and report what is outstanding.
- Verify `.holagent/sizing.md` exists and is non-empty.

## 8. Confirmation — the step this command exists for

A reverse-engineered contract is a **proposal**. It will get versions and paths
wrong, and the person who knows the lab is the only one who can say where.
Present, for confirmation:

1. The **frontmatter**, row by row, each with its evidence and confidence —
   `observed` / `declared` / `inferred`. Lead with the `inferred` rows; they
   are where the mistakes are.
2. Every **conflict** the surveyor found (artifact vs document), with both
   values and their sources.
3. The **Unverified** list in full.
4. The **`verify` checks**: which ones were actually run against the dev
   environment and passed, and which are only proposed.
5. The observed footprint, and what is unknowable from the evidence.

Ask the user to correct anything wrong. Apply corrections by editing
`lab-prep.md` (and `sizing.md`) directly — this is bookkeeping, not authoring —
then re-run `hol_prep_check`. Repeat until the user confirms the contract.

Do not skip this because the survey looks tidy. A confident wrong version is
exactly what this step is here to catch.

## 9. Register the lab (this is the adoption)

Write `guides/<slug>/.holagent/lab-ref.json`:

```json
{
  "repo": "<absolute path>",
  "origin": "adopted",
  "adopted_stages": ["concept", "spec", "build"],
  "spec_dir": "spec",
  "platforms": ["k8s"],
  "environments": [{ "name": "dev-gb10", "kind": "dev", "endpoint": "https://…" }]
}
```

- `adopted_stages` defaults to `concept`, `spec`, `build` — the stages that
  genuinely were not done here. **Leave `sizing` out**: the surveyor wrote a
  real, observed `sizing.md`, and it has not passed a scoring gate, so
  `drafted` is the honest state. Add it only if the user says the footprint is
  already trusted.
- `spec_dir` points at an existing spec directory if the repo has one; keep the
  default otherwise (nothing is written there by adoption).
- `platforms` — `vcd`, `k8s`, or both. This is what `/hol-platform-check` reads.

Then run `hol_status` and show the result. Expect
`concept: adopted · sizing: drafted · spec: adopted · build: adopted`, the lab
repo and its environments on the lab-repo line, and `next: /hol-plan`. Confirm
the environment kinds read back the way the user intended — this is the last
easy moment to catch a mislabelled production environment.

## 10. Report, and offer the two follow-ons

- **The guide**: `/hol-plan` is now unblocked and consumes the confirmed
  `lab-prep.md` exactly as it would a generated one.
- **Platform fit**: `/hol-platform-check <platform>` reviews this lab against
  the team's platform requirements. If `~/.holagent/platforms/<name>/` does not
  exist yet, run `/hol-platform-init <platform>` first.
- **Optionally, a concept**: an adopted lab has no business-value source, which
  is what stage-5 launch collateral is written from. Offer `/hol-concept` —
  it detects the adopted lab and asks before writing a story retroactively.
  Offer it; never run it unasked, and never let it be inferred from the code.

## Note on what adoption does not do

Adoption gives the lab a contract and a footprint. It does not give it a story
or a spec, and it must not pretend to. `concept: adopted` and `spec: adopted`
mean "never written", not "written elsewhere" — anything downstream that needs
them should ask for them, not reconstruct them.
