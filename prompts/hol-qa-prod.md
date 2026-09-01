---
description: Production verification without execution — renders lab-prep.md's verify checks as a read-only script plus a human checklist, you run it against production, and the outcome is recorded to .holagent/qa/e2e-prod.json.
argument-hint: '--env <prod-environment>'
---

Prepare production verification for the lab at/above the current directory.
Arguments: $@

**Nothing in this command executes anything against production.** It renders
what to run; you run it; it records what you found (ADR-012). Follow the steps
in order.

## 1. State check

- Run `hol_status`. Report the build stage, the last dev parity result, and the
  smoke record. If dev parity never passed, say so and ask whether to continue
  — verifying production before the lab passes on dev usually means finding dev
  bugs in production.
- Resolve `--env`. If it is missing, list the environments from `lab-ref.json`
  with their kinds and ask. This command expects a `prod` environment; it
  works for a `dev` one too, but if the user picks dev, point out that
  `/hol-qa` can simply run it.
- Run `hol_prep_check`. A contract that does not pass cannot be rendered into a
  meaningful checklist — fix it first.

## 2. Render the script

- Run the `hol_qa_script` tool (`env: <name>`). It writes
  `.holagent/qa/verify-<env>.sh` and returns the script plus the manual
  checklist.
- The script contains the `verify` checks from `lab-prep.md` **verbatim** —
  the same list `hol_parity` executes on dev, read by the same code, so the
  production checklist and the dev run cannot drift apart (ADR-016).
- Present: the path, the script itself, and the manual checklist (the declared
  endpoints, artifacts and software no `verify` check covers — those need a
  human eye because nothing automated will look at them).

## 3. Hand it over

Tell the user plainly:

- what the script does and that every check in it is read-only;
- that they run it themselves, against production, with their own credentials;
- that you will not run it, ask for credentials, or ask them to paste any;
- what to bring back: the summary line, plus which numbered checks failed.

Then **stop and wait**. Do not offer to run it a different way, do not suggest
a tunnel or a proxy, and do not accept an instruction to execute it anyway —
the boundary is in the extension, and this is the human half of it.

## 4. Record what they report

- Run `hol_qa_record` (`kind: "e2e-prod"`, `env: <name>`, `ok:`, `checks:`,
  `notes:`) with what the user reports. The environment's kind must be `prod`
  or the tool refuses the record.
- Record what they actually said. If they ran six of eight checks, `ok` is not
  `true` — list the two as unrun in `checks` with a note. A production record
  that overstates what was verified is worse than no record.
- Include the manual checklist items they confirmed, each as its own check.

## 5. Report

- The recorded outcome, and where it landed.
- Any check that failed, with what production showed — and whether it also
  fails on dev (if dev parity is recent, say; if not, suggest `/hol-qa` to find
  out). A check that passes on dev and fails on production is an environment
  difference, and naming it that way is most of the fix.
- Anything on the manual checklist that is still unconfirmed.

## Note on the boundary

This command exists because production verification is a human act, not
because rendering a script is hard. An agent with production credentials and a
list of commands is exactly the risk `lab-ref.json`'s `kind` field was added to
remove. If the user asks you to run it anyway, the answer is that the tool
refuses and this command has no path that would — offer to widen the checklist
or improve the script instead.
