# holagent — user guide

How to drive the pipeline, **where you can join it**, and what each command
needs before it will run.

`README.md` is the reference (install, command table, troubleshooting).
`docs/quickstart.md` is the tour (what the parts are, how they fit). This
document answers the operational question: _I have some of a lab already —
what do I run?_

> **Status.** Stages 1–3 and 5 (`/hol-concept`, `/hol-spec`, `/hol-build`,
> `/hol-qa`, `/hol-platform-*`, `/hol-launch`, `/hol-adopt`) shipped in v0.2.0
> and are covered by unit tests and deterministic gates, but **have not yet
> been run end-to-end against a real lab**. Stage 4 (the guide pipeline) has
> been. See `docs/manual-e2e.md` for exactly what is verified.

---

## 1. Two things that make everything else make sense

**State lives in files, never in the conversation.** Every command re-reads
the guide root's `.holagent/` and works out where it is. The guide root is
the directory holding `guide.md` + `.holagent/` — for a lab, the **lab's own
repo** (the guide lives at the repo root, next to the build code); standalone
or legacy guides may sit under `guides/<slug>/` instead. Discovery walks up
from your working directory, so you can `/clear`
between stages, close the session, come back tomorrow, or hand the directory to
a colleague — nothing is lost, and nothing needs re-explaining.

**You never have to start at the beginning.** The lifecycle is six stages, but
it is not a queue. Each command states its own preconditions and checks them;
if you already have what a stage produces, you tell holagent that once and it
skips it. Section 3 is the table for this.

---

## 2. The map

```
STAGE 1  concept   /hol-concept                    .holagent/concept.md, sizing.md
STAGE 2  spec      /hol-lab-register → /hol-spec   <lab-repo>/spec/*, lab-prep.md
STAGE 3  build     /hol-build[-all] → /hol-qa      the lab, verified against its contract
STAGE 4  guide     /hol-plan → /hol-plan-module →  guide.md → <ID>-<Title>.md
                   /hol-generate-module →
                   /hol-review-guide
STAGE 5  ship      /hol-platform-check             .holagent/platform/<name>.json
                   /hol-launch                     launch/*.md

         /hol-adopt   ─── existing lab, no spec ──▶ join at STAGE 4
```

**Stages 3 and 4 are independent.** An approved spec unblocks both; neither
waits for the other. Build the lab and write the guide in either order, or in
parallel — though running `/hol-qa` first gives `/hol-generate-module` real
captured output instead of "describe the signal to look for".

Check where you are at any time — no LLM involved:

```
/hol-status
```

It prints the stage bar, the milestone list, the module list, the QA records,
and the next recommended command.

---

## 3. Where do I join? — the decision table

Find the row that matches what you actually have.

| What you already have                               | Start with                                       | Why                                                                                              |
| --------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| An idea, nothing else                               | `/hol-concept`                                   | The front door. Interviews you into a story and a footprint.                                     |
| A lab repo + a running dev environment, **no spec** | `/hol-adopt`                                     | Reverse-engineers the environment contract; marks stages 1–3 inherited. **The common case.**     |
| Hand-written spec documents, no lab built           | `/hol-lab-register`, then §4                     | Register the repo, mark concept/sizing inherited, then build or plan.                            |
| A built lab **and** a spec, no guide                | `/hol-lab-register`, mark `build` inherited      | Straight to `/hol-plan`.                                                                         |
| A finished guide, no lab repo (a pre-v0.2.0 guide)  | nothing — it still works                         | Guides that predate the lifecycle behave exactly as before. Add a lab repo later if you want to. |
| A half-finished guide                               | `/hol-status`, then `/hol-generate-all`          | Resumes from state; prints a resume table before touching anything.                              |
| A published guide, need the write-up                | `/hol-launch`                                    | Needs a plan and a complete guide; warns if either is thin.                                      |
| A lab going to a platform team next week            | `/hol-platform-init`, then `/hol-platform-check` | Independent of everything else — needs only a registered lab repo.                               |
| Just want the guide, no interest in the rest        | `/hol-plan`                                      | Requires nothing. The original entry point, unchanged.                                           |

### The mechanism behind "mark it inherited"

`/hol-lab-register` asks for an `origin` and, for `adopted`, **which stages to
mark inherited**. That writes `.holagent/lab-ref.json`:

```json
{
  "repo": "/home/you/projects/my-lab",
  "origin": "adopted",
  "adopted_stages": ["concept", "sizing", "spec"],
  "spec_dir": "spec",
  "platforms": ["k8s"],
  "environments": [{ "name": "dev-gb10", "kind": "dev", "endpoint": "https://…" }]
}
```

A stage listed there reads as `adopted` in `/hol-status` and stops blocking
what comes after it. Only `concept`, `sizing`, `spec` and `build` can be
inherited — the guide and ship stages are always earned.

**`adopted` means "never written here", not "written elsewhere".** Anything
downstream that needs a concept — launch collateral above all — will ask for
one rather than inventing it.

---

## 4. What each command needs, and what stops it

**Hard stop** = the command refuses and tells you what to run.
**Warn** = it explains the risk and asks whether to continue; you decide.

| Command                | Hard stops when…                                                                               | Warns when…                                                 |
| ---------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `/hol-concept`         | pi-subagents missing                                                                           | a concept already exists (re-concept); lab is adopted       |
| `/hol-lab-register`    | the path is not a directory                                                                    | `lab-ref.json` already exists                               |
| `/hol-spec`            | concept **or** sizing missing; no `lab-ref.json`                                               | either is `drafted` (unscored); a spec already exists       |
| `/hol-build`           | spec missing; §7 has no `milestones` frontmatter; the milestone's own test fails after a retry | spec is `drafted`; a dependency is untested; already passed |
| `/hol-qa`              | `hol_prep_check` fails; you name a `prod` environment                                          | milestones are not all `scored-passed`                      |
| `/hol-qa-prod`         | `hol_prep_check` fails                                                                         | dev parity never passed                                     |
| `/hol-plan`            | pi-subagents missing                                                                           | a plan already exists (re-plan)                             |
| `/hol-generate-module` | the module is not planned                                                                      | the section already exists (overwrite)                      |
| `/hol-platform-check`  | no `requirements.md` for that platform; no `lab-ref.json`                                      | no `lab-prep.md` (thinner review); a review exists          |
| `/hol-launch`          | no plan                                                                                        | guide incomplete; concept is `adopted` (no business case)   |

Two commands need **no LLM at all** and work regardless of everything above:

```
/hol-validate [dir]    # run the linter, record the report
/hol-status   [dir]    # the whole state machine
```

---

## 5. Scenarios

### 5.1 A new lab, start to finish

The full path. `/clear` between stages — state is on disk.

```
/hol-concept "PowerProtect cyber recovery vault"
    → interview → concept-author + sizing-architect → scorecard → you approve

/hol-lab-register ~/projects/cyber-vault-lab
    → you confirm the external path; declare dev/prod environments

/hol-spec
    → spec-author writes spec/01…08 + lab-prep.md
    → hol_spec_check gate (section 8 must be substantive) → you approve

/hol-build-all
    → each milestone: lab-builder → its own declared test → scoring
    → a failing test stops the run

/hol-qa --env dev-gb10
    → hol_parity runs lab-prep.md's verify checks
    → qa-runner brings the lab up and captures verbatim output

/hol-plan  →  /hol-generate-all  →  /hol-review-guide
/hol-platform-check k8s
/hol-launch
```

### 5.2 The common case — an existing lab with no spec

`sign-tutor` shape: the repo exists, dev instance runs, nobody ever wrote a
spec.

```
/hol-adopt sign-tutor --repo ~/projects/sign-tutor --env dev-gb10=https://dev.example
```

What happens:

1. It shows you what is in the repo and asks you to confirm the external path.
2. It asks for each environment and its `kind` — **`dev` can be executed
   against, `prod` never is.** If unsure, `prod` is the safe answer.
3. `lab-surveyor` reads the compose files, manifests, Dockerfiles, Makefile and
   inventory docs, and — given a dev endpoint — observes the running instance
   read-only. It writes a proposed `lab-prep.md` and an observed `sizing.md`.
4. `hol_prep_check` verifies the contract parses and every `verify` check can
   run unattended.
5. **You confirm it, row by row.** Each row shows its evidence and a confidence
   of `observed` / `declared` / `inferred`. Inferred rows come first, because
   that is where the mistakes are. Conflicts (README says 25.02, compose pins
   25.01) are reported, never silently resolved.
6. Only then is `lab-ref.json` written, marking `concept`, `spec` and `build`
   inherited.

Then `/hol-status` shows `concept: ⊕ · sizing: ◐ · spec: ⊕ · build: ⊕` and
`next: /hol-plan`, and the guide pipeline runs exactly as it always has.

> **Do not skip step 5.** A confident wrong version is the failure mode this
> whole flow exists to catch, and a tidy-looking reconstruction is the most
> dangerous kind.

### 5.3 You have spec documents but nothing is built

This one has friction worth knowing about up front.

```
cd ~/projects/my-lab          # the lab's repo — the guide root is the repo itself
mkdir -p .holagent
/hol-lab-register .
    → origin: generated
    → mark inherited: concept, sizing        (you have neither, and don't need them to build)
    → spec_dir: point at the existing spec directory
```

Now `/hol-status` shows `spec: ⊕`. But `/hol-build` will **hard stop**: it
reads a machine-readable `milestones` list from `07-build-sequence.md`
frontmatter (ADR-015), and a hand-written spec does not have one. Two ways
forward:

- **Add the frontmatter by hand** to `07-build-sequence.md` — one flow map per
  milestone with `n`, `slug`, `title`, `deliverable`, `exit`, `test`. The
  `test` is the command that proves that milestone alone; `hol_build_test` runs
  it verbatim and its exit code is the gate.
- **Or run `/hol-spec`** and let `spec-author` rewrite the set properly. It
  needs a concept and sizing, so either write them (`/hol-concept`) or accept
  the warning and proceed with them marked inherited.

Naming each milestone's test is the point, not a tax: a milestone whose test
you cannot name is a phase in disguise, and splitting it is the right answer.

### 5.4 The lab is built; the guide is not

```
/hol-lab-register ~/projects/my-lab
    → origin: adopted, mark inherited: concept, sizing, spec, build
/hol-qa --env dev-gb10          # optional but worth it — see below
/hol-plan
/hol-generate-all
/hol-review-guide
```

Run `/hol-qa` **before** `/hol-plan` if you can. `/hol-generate-module` looks
for a passing smoke record first and prefers that dry-run material over
anything captured locally — it came from the environment the guide is written
against. Without it, the implementer names the signal to look for instead of
showing real output, and a guide with unseen outputs should not ship.

### 5.5 A finished guide that predates the lifecycle

Nothing to do. Guides with no `concept.md`, `sizing.md` or `lab-ref.json` are
not "engaged" in the lifecycle: `/hol-status` reports them exactly as it did
before, and `next` is byte-identical. Every stage-4 command works unchanged.

To bring one in later, register a lab repo — that alone engages the lifecycle
and the stage bar appears.

### 5.6 A platform review, and nothing else

Completely independent of the guide and build tracks. It needs a registered
lab repo and a requirements file, and that is all.

```
/hol-platform-init k8s
    → a ten-category interview: networking, security, storage, config,
      registry, tenancy, resources, naming, lifecycle, operations
    → ~/.holagent/platforms/k8s/requirements.md

/hol-platform-check k8s
    → platform-reviewer reads the lab's deployment artifacts + lab-prep.md
    → findings: severity-tagged, traced to a requirement, evidenced, owned
    → a pre-meeting brief: what we don't comply with · what we need from them ·
      what they'll ask us
    → ends by asking "did the team flag anything new?" and appends it
```

The requirements file is **per platform, not per lab** — every lab on that
platform is reviewed against the same file, and the file gets better after
every meeting. Where it is silent, the review records an `unknown` rather than
inventing a finding; those unknowns are the agenda for the next conversation.

You do not need answers to all ten categories on the first pass. An unanswered
question is content, not a gap to fill.

### 5.7 Re-running things after a hand-edit

Every scored scope can be re-scored without regenerating anything:

```
/hol-review-concept                     # concept + sizing
/hol-review-spec                        # deterministic spec check + 3 rubrics
/hol-review-plan
/hol-review-module-plan <module>
/hol-review-module <module>
/hol-review-guide                       # and the rename offer
/hol-review-launch                      # worth running after the guide changes
```

`--fresh` on `/hol-generate-module`, `/hol-generate-all`, `/hol-build` and
`/hol-build-all` clears the scope and re-scores at round 1 without rewriting
the content. Use it after a hand-edit, after a rubric wording change, or to
restart a scope stuck at `scored-escalated`.

There is deliberately no `/hol-review-platform`: a review scores the lab as it
was that day, so re-run `/hol-platform-check` instead of re-scoring stale
findings.

### 5.8 Production verification

Production is never executed against. This is enforced in the extension, not
in prose — `hol_parity` resolves the environment through a guard that refuses
anything not marked `dev`, and there is no override parameter.

```
/hol-qa-prod --env prod-k8s
    → renders .holagent/qa/verify-prod-k8s.sh (read-only, every check verbatim
      from lab-prep.md — the same list /hol-qa executes on dev)
    → plus a manual checklist for whatever no verify check covers
    → you run it, against production, with your own credentials
    → you report the summary; it records .holagent/qa/e2e-prod.json
```

If you ask it to run the script anyway, the answer is that the tool refuses and
this command has no path that would.

---

## 6. How the pipeline is wired

### Nothing hands off to anything

There is no agent-to-agent handoff configuration, because no agent can invoke
another. All fourteen carry `maxSubagentDepth: 0` in their frontmatter — that
is enforcement, not convention.

The extension does not orchestrate either. `extensions/hol.ts` registers tools
and commands; its only mention of `subagent` is a `session_start` check for
whether pi-subagents is installed at all.

```
                    ┌──────────────────────────────────────┐
   you ───────────▶ │  PARENT SESSION                      │
   /hol-concept     │  runs prompts/hol-concept.md,         │
                    │  step by step                         │
                    └───┬──────────────────────────────┬────┘
                        │ subagent (blocking)          │ ▲
                        ▼                              │ │ final report
              ┌───────────────────┐                    │ │ (transient)
              │  holagent.<agent> │────────────────────┘ │
              │  no context,      │──────────────────────┘
              │  no children      │
              └─────────┬─────────┘
                        │ writes
                        ▼
            ┌───────────────────────────┐
            │  files on disk            │  ◀── the durable handoff:
            │  .holagent/, lab-prep.md  │      the parent reads these and
            └───────────────────────────┘      inlines them into the next payload
```

### The flow lives in the prompt templates

`prompts/*.md` are the orchestration layer. They are prose the **parent
session** executes, and the numbered steps _are_ the sequence. Every dispatch
in the package has the same shape:

```
`subagent` tool — agent: "holagent.<name>", async: false
```

`async: false` means blocking: the parent waits for the agent's report before
moving to the next step. Scorer dispatches add **`acceptance: false`**, which
is mandatory — without it the harness strips the trailing JSON block and the
score is lost.

Agent names are derived, not configured. `package.json` declares
`"pi-subagents": { "agents": ["./agents"] }`, which loads the directory; each
file's frontmatter (`package: holagent` plus `name: spec-author`) yields the
runtime name `holagent.spec-author`. So any dispatch line in a prompt tells you
exactly which file to read.

### The parent is the only integration point

Every agent runs with `inheritProjectContext: false` and
`inheritSkills: false`. It sees its task payload and the skills its frontmatter
lists — nothing else. No conversation history, no ambient project context, no
other agent's output. Everything that crosses a boundary crosses it because the
parent carried it, by one of three routes:

| Medium                       | Carries                                                                                    | Survives `/clear`? |
| ---------------------------- | ------------------------------------------------------------------------------------------ | ------------------ |
| **Files on disk**            | The real handoff: A writes, the parent reads, the parent inlines the text into B's payload | **yes**            |
| **The agent's final report** | Findings, decisions it made, dry-run output, conflicts it found                            | no                 |
| **Parent-captured data**     | Your interview answers, `hol_*` tool results                                               | no                 |

Only the first survives a cleared session, which is why every durable artifact
is a file and why `hol_status` can reconstruct the whole state machine from
disk.

### A worked trace

`/hol-concept` is the clearest two-agent sequence in the package:

- **Step 6** dispatches `concept-author` with your confirmed interview answers
  and an absolute path to write `.holagent/concept.md`.
- **Step 7** dispatches `sizing-architect` with, in the prompt's own words,
  _"the **full text of `.holagent/concept.md`**"_.

That is the handoff: the parent read the file the first agent wrote and pasted
it into the second agent's payload. `sizing-architect` has a `read` tool and
could open the file itself — but it is told to _"work strictly from the task
payload"_, and that discipline is what makes a dispatch reproducible from its
payload alone.

The fix loop is the same shape reversed. Scorer findings come back in the
parent's context, and the parent re-dispatches the writer _"carrying the
failing findings verbatim, grouped by rubric"_ — the agent never sees the
scorer, only what the parent chose to forward.

### Why it is built this way

ADR-001. The upstream plugin had review agents spawning their own scorers as
grandchildren; that was dropped for three reasons: pi-subagents policy keeps
orchestration in the parent, the parent must own the merge and the fix loop and
the escalation state anyway, and a payload the parent composes is one it can
reproduce and test.

The cost is recorded there too, and it is real: the parent's context carries
every task payload, and a guide-scope scoring task inlines the whole guide.

### Calling agents directly

You _can_ dispatch an agent yourself with the `subagent` tool. You usually
should not, and the machinery above is why.

Calling an agent directly means hand-assembling the payload the prompt template
would have built — the confirmed answers, the full text of every file it needs,
the absolute paths it may write to, and the reminders that keep it inside its
boundaries. An under-specified payload is how an agent invents a version number
or writes to the wrong path. You also lose everything around the dispatch: the
deterministic gate, the scoring fanout, the fix loop, and the merge into
`scores.json`.

**When it is reasonable:**

- **Re-running one scorer** whose output was unparseable, when you want the raw
  JSON. Dispatch `holagent.scorer` with `acceptance: false` — mandatory, or the
  trailing JSON block is stripped and the score is lost.
- **A one-off survey** of a repo you are not adopting: `holagent.lab-surveyor`
  with explicit paths, to see what it reconstructs.
- **Debugging a stage** — dispatch the agent with the payload the prompt built,
  to separate "the agent got it wrong" from "the prompt fed it badly".

**When it is not:** anything you intend to keep. Run the command instead; the
gates and the scorecard are most of the value.

| Agent                         | Writes                                      | Dispatched by           |
| ----------------------------- | ------------------------------------------- | ----------------------- |
| `holagent.concept-author`     | `.holagent/concept.md`                      | `/hol-concept`          |
| `holagent.sizing-architect`   | `.holagent/sizing.md`                       | `/hol-concept`          |
| `holagent.spec-author`        | `<lab-repo>/spec/*`, `lab-prep.md`          | `/hol-spec`             |
| `holagent.lab-surveyor`       | `lab-prep.md`, `.holagent/sizing.md`        | `/hol-adopt`            |
| `holagent.lab-builder`        | code + tests in the lab repo                | `/hol-build`            |
| `holagent.qa-runner`          | nothing — returns findings + dry-run output | `/hol-qa`               |
| `holagent.guide-planner`      | `.holagent/plan.md`, `lab-prep.md`          | `/hol-plan`             |
| `holagent.module-planner`     | `.holagent/<NN-slug>/plan.md`               | `/hol-plan-module`      |
| `holagent.guide-implementer`  | one `## Module N:` section                  | `/hol-generate-module`  |
| `holagent.platform-reviewer`  | `.holagent/platform/<name>.json`            | `/hol-platform-check`   |
| `holagent.launch-writer`      | `launch/*.md`                               | `/hol-launch`           |
| `holagent.company-researcher` | `~/.holagent/companies/<slug>/*`            | `/hol-research-company` |
| `holagent.product-researcher` | `~/.holagent/products/<co>/<prod>/*`        | `/hol-research-product` |
| `holagent.scorer`             | nothing (read-only)                         | every scoring stage     |

---

## 7. The extension — what you can run without a model

Eleven tools back the commands. You will rarely call them by hand, but knowing
what they decide tells you what a stage is actually checking.

| Tool                    | Decides                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| `hol_status`            | Every stage's state, the milestone and module lists, QA records, the next command.           |
| `hol_scores`            | Read / atomically merge / clear scoring entries by scope.                                    |
| `hol_validate`          | The linter verdict on a guide, recorded to `.holagent/last-validation.json`.                 |
| `hol_spec_check`        | Stage 2: all eight sections, no unfilled markers, section 8 substantive.                     |
| `hol_prep_check`        | The environment contract: seven keys, filled rows, every `verify` check runnable unattended. |
| `hol_build_test`        | Stage 3: runs one milestone's own declared test in the lab repo.                             |
| `hol_parity`            | Executes `lab-prep.md`'s checks against a **dev** environment. Refuses anything else.        |
| `hol_qa_script`         | Renders those same checks as a script for a human. Executes nothing.                         |
| `hol_qa_record`         | Records a smoke or production outcome; the environment's kind must match.                    |
| `hol_platform_findings` | Platform findings are shaped, traced, owned, actionable — and the brief, structured.         |
| `hol_launch_check`      | Stage 5: collateral complete, fits the catalogue field, agrees with `plan.md`.               |

Only two things ever execute a command: `hol_build_test` (a milestone's
declared test, in the lab repo) and `hol_parity` (a contract's declared checks,
against a dev environment). Both go through one function with a timeout, and a
killed command counts as a failure.

---

## 8. Habits worth having

- **`/clear` between stages.** Context is not state; files are.
- **Read the open questions.** Every authoring stage ends with them, and they
  are the most valuable output — an empty section almost always means a guess
  is hiding in the prose.
- **Do not fix a failing check by editing the contract.** If `/hol-qa` fails,
  the disagreement between `lab-prep.md` and reality is the finding. Changing
  the contract to match a broken environment moves the failure somewhere it
  will not be found until a learner hits it.
- **Treat an adopted lab's missing concept as missing.** It is why launch
  collateral for an adopted lab is thin. The fix is a retroactive
  `/hol-concept`, not invention.
- **`prod` is the safe answer** when you are unsure of an environment's kind.
  A mislabelled production environment is the one mistake that field exists to
  prevent.

---

## 9. Where to look next

- `README.md` — install, the full command table, troubleshooting.
- `docs/quickstart.md` — the component tour and the diagrams.
- `docs/adr/README.md` — the eighteen decisions, indexed, and why they hang
  together.
- `docs/manual-e2e.md` — what is verified, and what is not.
