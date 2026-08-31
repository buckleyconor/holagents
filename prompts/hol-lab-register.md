---
description: Register the lab's own repository and its environments in .holagent/lab-ref.json — the pointer stage 2 and 3 build against (ADR-008).
argument-hint: '<repo-path> [platforms:<a,b>]'
---

Register a lab repository for the current lab. Arguments: $@

The lab's code lives in its own repository, outside this project (ADR-008).
This command records the pointer; nothing else in the package may reach outside
the project root without it.

## 1. Locate the lab dir

- Run the `hol_status` tool to resolve the current lab dir. If it fails with
  `E-PATH`, stop: "not inside a lab dir — run inside `guides/<slug>/` or start
  one with `/hol-concept`."
- If `.holagent/lab-ref.json` already exists, show it and ask whether to
  **update** or **abort**. Never overwrite silently.

## 2. Resolve and confirm the repo path

- Expand the given path to an absolute path and confirm it exists and is a
  directory. If it is not, stop and report.
- Report what is actually there: is it a git repo (`git -C <path> rev-parse`),
  what is at the top level (`ls`), and does a spec dir already exist?
- **This path is outside the project root.** State that plainly and ask the
  user to confirm it before writing anything. Registration is the one
  deliberate, confirmed act that binds a lab to an external directory.

## 3. Collect the environments

Ask for each environment this lab has, and for each one:

- **name** — short, e.g. `dev-gb10`, `prod-k8s`
- **kind** — `dev` or `prod`
- **endpoint** — URL or host:port, if there is one

Be explicit about what `kind` means, because it is a safety boundary and not a
label: **`dev` environments can be executed against by `/hol-qa`; `prod`
environments never are** (ADR-012). If the user is unsure, `prod` is the safe
answer — a mislabelled prod environment is the one mistake this field exists to
prevent.

A lab with no `dev` environment simply cannot run automated QA. That is a
legitimate state; say so rather than inventing one.

## 4. Collect the rest

- **platforms** — `vcd`, `k8s`, or both (from the `platforms:` argument if
  given).
- **spec_dir** — relative to the repo, default `spec`. If the repo already has
  spec files under a different layout (e.g. flat `spec_01_*.md` at the root),
  ask whether to point at that directory instead of creating a new one.
- **origin** — `generated` if the spec and code will be produced by this
  pipeline; `adopted` if the lab already exists. For `adopted`, ask which
  stages to mark inherited (`concept`, `sizing`, `spec`, `build`).

## 5. Write and verify

Write `.holagent/lab-ref.json`:

```json
{
  "repo": "<absolute path>",
  "origin": "generated | adopted",
  "adopted_stages": [],
  "spec_dir": "spec",
  "platforms": ["k8s"],
  "environments": [{ "name": "dev-gb10", "kind": "dev", "endpoint": "https://…" }]
}
```

Then run `hol_status` and show the result: the lifecycle line should now report
the lab repo and its environments. Confirm the environment kinds read back the
way the user intended — this is the last easy moment to catch a mislabelled
production environment.

Report the next command: `/hol-spec` for a generated lab, `/hol-plan` for an
adopted one.
