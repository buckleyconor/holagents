---
description: First run per platform — interview the platform team's requirements (networking, security, storage, config, registry, tenancy, resources, naming, lifecycle, operations) into ~/.holagent/platforms/<name>/requirements.md.
argument-hint: '<platform>'
---

Start the requirements file for a platform. Platform argument: $@

Nobody wrote down what it takes to run a lab on the vCD estate or the
Kubernetes cluster — the rules live with the people who operate it. This
command turns that into a file, once. `/hol-platform-check` keeps it growing.

## 1. Prerequisites

- **Locate the package skills**: `platform-requirements`, `guide-scaffolds`.
  Read `platform-requirements/SKILL.md` (the ten-category taxonomy and the
  interviewing rules) and its `question-bank.md` now.
- No subagent is needed: **you** conduct this interview. It is a conversation
  with a person who knows the platform, and it is short.

## 2. State check

- Resolve the platform slug (kebab-case: `k8s`, `vcd`, …). Ask if the argument
  is missing.
- If `~/.holagent/platforms/<name>/requirements.md` already exists, this is an
  **extension, not a restart**: read it, show what is already recorded and what
  is still open, and interview only the gaps and the `assumed` entries. Never
  overwrite an existing file wholesale — the change log and the sources are the
  most valuable part of it.

## 3. Interview (you conduct it)

Walk the ten categories in the taxonomy's order, **one category per message**,
batching that category's questions together. Use the question bank; ask what
applies, skip what obviously does not.

`networking` → `security` → `storage` → `config` → `registry` → `tenancy` →
`resources` → `naming` → `lifecycle` → `operations`

Then the closing questions: what should I have asked; which of these are hard
requirements and which are preferences; how do these rules change.

While interviewing:

- **Write the answer, not the paraphrase.** Keep their words where their words
  are specific.
- **Record the source** — who said it, and when. A requirement with no source
  cannot be re-checked when it changes.
- **Mark confidence** — `stated`, `inferred`, or `assumed`. If the user is
  relaying second-hand, that is `inferred`; if nobody has said it, `assumed`.
- **Keep the gaps.** An unanswered question goes to Open questions, not into
  the bin. Do not fill a category with plausible-sounding rules to make the
  file look complete — a short honest file beats a long invented one, because
  every review afterwards is only as good as this.
- If the user does not know a category at all, say so in the file and move on.
  That is a normal outcome for a first pass.

## 4. Write the file

- Copy the `platform-requirements.md` template from `guide-scaffolds` to
  `~/.holagent/platforms/<name>/requirements.md` (`mkdir -p` first).
- Fill every `<< FILL: ... >>` marker, or delete the row it sits in. A category
  nobody could answer keeps its heading and one line saying so — an empty
  heading and a fabricated table are both worse.
- Frontmatter: `platform`, `display_name`, `owners`, `created`, `updated`, and
  one `sources` entry per conversation this file draws on. Stay inside the
  mini-YAML subset (`guide-scaffolds`, "Frontmatter subset rule").
- Seed the change log with this interview.

## 5. Report

- Path written, and the count of requirements by category.
- **The `assumed` entries**, listed — they are the agenda for the next
  conversation, and everything downstream that leans on them inherits the risk.
- **The Open questions**, listed, with who to ask.
- Next command: `/hol-platform-check <name>` inside a lab dir, to review a lab
  against this file.

## Note on what this file is

It is a record of what the platform team told us, not a policy document and not
best practice. Its authority comes entirely from the sources column. Anything
in it that no one actually said should be marked `assumed` and should make you
uncomfortable until it is confirmed.
