---
name: launch-collateral
description: Writing the material that announces a finished lab — exec summary, catalogue description, internal social posts, SE enablement brief. Use when drafting or judging launch collateral (launch-writer, /hol-launch), or when a claim needs to be traced back to something the lab actually does.
---

# Launch Collateral

The lab is built, the guide is written, and now somebody has to describe it to
people who will not read it. That description is the only thing most of the
audience ever sees, so it decides whether the work gets used.

Collateral is the one stage where the pressure runs the wrong way. Every other
stage is rewarded for admitting what it does not know; this one is rewarded for
sounding confident. That is exactly why it needs the tightest rule.

## The rule: every claim traces

**A claim earns its place by pointing at something.** Before writing any
sentence that asserts a capability, a benefit, or a number, name where it comes
from:

| Claim type                     | Traces to                                                   |
| ------------------------------ | ----------------------------------------------------------- |
| "the learner will be able to…" | a guide objective, or a module's success criteria           |
| "in under an hour"             | `plan.md` `duration_minutes`                                |
| "runs on a single GPU"         | `sizing.md`'s per-instance footprint                        |
| "handles N concurrent users"   | `sizing.md`'s density math and binding constraint           |
| "detects X in Y seconds"       | something the guide has the learner observe                 |
| "solves <business problem>"    | `concept.md`'s business problem, in the customer's language |
| "uses <product> <version>"     | `lab-prep.md` frontmatter                                   |

If you cannot name the source, the sentence does not go in. Not softened, not
hedged — out. A claim nobody can check is how a lab acquires a reputation for
overpromising, and it is the reputation the next lab inherits.

## The four artifacts

Each answers a different person's question. Write them for that person, not as
four lengths of the same text.

### `exec-summary.md` — "should we invest in this?"

One page. The business problem, who has it, what the lab demonstrates, what it
costs to run, and what happens next. A leader reads this to decide whether to
put it in front of a customer. Lead with the problem, not the technology; close
with what you want them to do.

### `catalogue-description.md` — "is this the lab I want?"

What a browsing engineer sees. Frontmatter is machine-checked
(`hol_launch_check`) and must agree with `plan.md`:

- `id`, `title`, `duration_minutes` — **identical to `plan.md`**. Collateral
  that drifts from the guide it describes is the failure that survives every
  review, because nobody reads the two files side by side.
- `short_blurb` — one sentence, **at most 200 characters**. It is a fixed-width
  field in someone else's system; over the limit it is truncated in front of a
  customer.
- `audience` — from `plan.md`, phrased as roles, not "IT professionals".
- `prerequisites` — what they need before starting. "None" is an entry, not an
  omission; leaving it empty makes people assume the worst.

Body: an abstract, the longer description, what they will learn (the guide's
objectives, in the guide's words), and the prerequisites restated.

### `social.md` — "is this worth ninety seconds?"

Internal posts, two or three variants of different lengths. Announce, do not
sell: state what the lab does and who it is for, and link to it. No emoji
walls, no "excited to share", no rhetorical questions. The audience is
colleagues who will notice if it oversells.

### `enablement-brief.md` (optional) — "how do I run this in front of a customer?"

The SE talk track: the story arc in five beats, the aha moment and how to set
it up, the two or three questions customers always ask with answers, what to do
when a demo step fails, and what this lab is **not** for. Write it for someone
delivering it live for the first time with a customer watching.

## House tone

- **Second person for the learner, plain declaratives for everything else.**
- **Concrete over superlative.** "Restores a 400GB vault in 12 minutes" beats
  "dramatically accelerates recovery" — and it is checkable.
- **The customer's language for the problem, the product's for the solution.**
  A problem statement that only makes sense once you name the product is a
  feature, not a problem.
- **Say what it is not.** Every lab has a boundary; naming it makes the rest
  more credible, and stops the lab being taken to the wrong meeting.

## Anti-patterns

- **Unverifiable claims** — "industry-leading", "seamless", "enterprise-grade",
  any percentage with no source. The commonest failure and the most damaging.
- **Comparative claims** — anything of the form "faster than X" that the lab
  does not actually measure against X.
- **Feature tours** — a list of what the lab touches, with no reason anyone
  should care. If `concept.md` has a story, use it; if it does not, say so
  rather than inventing one.
- **Restating the guide.** The collateral is not a summary of the modules; it
  is an argument for spending an hour on them.
- **Fabricated business value on an adopted lab.** An adopted lab has no
  `concept.md` (ADR-013). Write what the guide and the spec support, name the
  gap, and ask for a real concept — never invent a customer problem to fill it.
