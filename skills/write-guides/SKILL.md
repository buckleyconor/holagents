---
name: write-guides
description: Prose craft for holagent lab guide module bodies — steps, UI actions, commands, expected outputs, checkpoints, callouts, and images. Use when authoring or revising module content in guide.md (guide-implementer).
---

# Write Guides

The format rules live in the `guide-format` skill (the linter enforces
them); this skill is about making the prose _good_. Write for the reader who
is following along in a live environment, one step at a time.

## Steps

- Numbered list, one action per step. "Click **Save**, then refresh the
  page" is two steps.
- Every step ends in a **verifiable outcome**: what the learner sees or gets.
  "Upload the video" is not a step; "upload the video and watch the preview
  pane play it" is.
- Name UI controls in bold with quotes, exactly as they appear:
  Click the **"New Collection"** button.
- Lead with the action verb: Open, Click, Paste, Run, Select, Enter.

Bad vs good (adapted from the style corpus):

> **Bad:** Configure the collection appropriately using the advanced options.
>
> **Good:** Under **Configure Metadata Schema (Advanced)**, add a
> `Document_Type` field. The collection can now be tagged per document type,
> which later modules query on.

## Commands

- Tab-indented, single backtick span, one command per line — the linter
  extracts exactly these lines and runs shellcheck on them (L014/W014): they
  must parse and actually work in a bash shell. No pseudo-code, no
  `# then do the thing` placeholders.
- Give the command, then state the **expected output verbatim** when known —
  a few lines is enough:

      `curl -s -o /dev/null -w "%{http_code}\n" http://triton:8000/v2/health/ready`

  200 returned is a successful result.

- When output is long or variable, name the signal to look for: "the build
  log streams in the terminal and ends with `&&&& PASSED` on success."
- Flag expected oddities so the learner does not stop at them: "You may see
  a `Small dataset: batch_size 256 -> 44` line. That is expected and
  intentional — no action needed."

## Checkpoints

`> ✅ **Checkpoint:** <verifiable end state>` — a state, not a sentiment:

- Good: "Triton is serving your ISL model." (confirmed by the `curl` the
  step just ran)
- Bad: "Everything is working."

Modules with 3+ command steps need at least one (W004); place one after the
first observable artifact and one at the end stating the success criterion.

## Callouts

Standard forms only — mixed variants trigger W001:

| Form                | Use                                     |
| ------------------- | --------------------------------------- |
| `**Tip:**`          | Shortcut, reset procedure, gotcha       |
| `**Note:**`         | Scope limit, lab-environment caveat     |
| `⚠️ **Important:**` | Safety / loss-of-state warning          |
| `**Use Case:**`     | Why this capability matters in the wild |
| `> 💡 <tip>`        | Inline aside inside a procedure         |

Never `**Tip!**`, `**Use Case!**`, `_Lab Tip:_`, or `**Important Note:**`.

## Images

- One image per **state**, placed immediately after the step that produces
  that state — never before it.
- Authored form:
  `![Image](/ImageProxy?filename=<uuid>/<file>.png "Click to enlarge"){data-modal=true}`;
  pending screenshot: `<< INSERT SCREENSHOT: <what the reader should see> >>`.
- The module plan's `image_checklist` is the contract: the finished module
  contains exactly those images, nothing more, nothing less (W005).
- An image the reader cannot act on is decoration; cut it.

## Voice and terminology

- Second person, present tense, active voice: "You will see the ASL
  classifier with platform `tensorrt_plan`."
- Use the product's own terminology from the research profiles
  (`~/.holagent/products/...`); expand an abbreviation once, on first use.
- Consistency across the guide: one spelling per concept (`Triton`,
  `TensorRT` — never "the tensor RT engine").
- Explain the _why_ on non-obvious steps ("the ONNX is the portable
  artefact; the engine is hardware-specific") — the why is what makes the lab
  educational.
- No marketing fluff in steps. "Experience the power of the platform"
  teaches nothing; the next verifiable step does.

## Read-aloud test

Read the module aloud at one sitting. Wherever you stumble, the reader will
too: split the step, cut the clause, or add the missing outcome.
