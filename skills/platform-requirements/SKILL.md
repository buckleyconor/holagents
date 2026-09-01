---
name: platform-requirements
description: How to interview a platform team into a written requirements file, and how to review a lab against it. Use when running /hol-platform-init or /hol-platform-check, or when a platform review needs findings someone can act on.
---

# Platform Requirements

Nobody wrote down what it takes to run a lab on the vCD estate or on the
Kubernetes cluster. The rules exist — they live with the people who operate
the platform, and you find out about them in a meeting, usually late. This
skill turns that into a file that gets better after every meeting.

Two jobs, one knowledge base:

- **Init** — interview a platform team into
  `~/.holagent/platforms/<name>/requirements.md`.
- **Check** — review a lab against that file, and come out with findings, asks,
  and the questions they are going to ask you.

## The taxonomy

Ten categories. Use them in both jobs: the interview walks them in order, the
review tags every finding with one, and comparing vCD to Kubernetes only works
because both files answer the same questions.

| Category     | What it settles                                                                 |
| ------------ | ------------------------------------------------------------------------------- |
| `networking` | ingress, egress, segmentation, DNS, load balancing, what a lab may expose       |
| `security`   | image provenance and scanning, privileged containers, secrets, RBAC, CVE policy |
| `storage`    | classes, persistence, quotas, backup expectations, what survives a teardown     |
| `config`     | the accepted deployment format — compose, Helm, OVF, Terraform — and its shape  |
| `registry`   | where images must live, how they get there, retention, signing                  |
| `tenancy`    | isolation between concurrent lab instances, namespaces, orgs, blast radius      |
| `resources`  | quotas, limits, GPU allocation, oversubscription policy, scheduling             |
| `naming`     | naming conventions, labels, tags, ownership metadata                            |
| `lifecycle`  | provisioning, teardown, patching, how long an instance may live                 |
| `operations` | monitoring, logging, on-call expectations, and what the team needs _from us_    |

The last one is the one people forget. A platform team is being asked to run
somebody else's software; what they need from the lab owner is a requirement
too, and it is the part that decides whether onboarding is pleasant.

## Interviewing

- **One category at a time, in the table's order.** The question bank
  (`question-bank.md`) carries the questions; ask the ones that apply and skip
  the ones that obviously do not.
- **Write the answer, not the paraphrase.** "Images from the internal registry
  only, mirrored via the weekly sync job" is a requirement. "Registry rules
  apply" is nothing.
- **Record who said it and when.** A requirement with no source cannot be
  re-checked when it changes, and platform rules change.
- **Mark confidence.** `stated` (they said it), `inferred` (you concluded it),
  `assumed` (nobody has said, you are guessing). Assumed entries are the ones
  to raise in the next meeting.
- **An unanswered question is content.** Leave it in the file as an open
  question rather than dropping it — the gaps are the agenda for the next
  conversation.
- **Never invent a requirement to look thorough.** A short honest file beats a
  plausible long one; the review is only as trustworthy as what it checks
  against.

## Reviewing a lab

Read the lab's deployment artifacts, `lab-prep.md` frontmatter, and
`sizing.md`; compare against the requirements file; write findings.

A finding is worth writing only when all five parts are there:

1. **requirement** — what the platform asks, quoted or referenced.
2. **observation** — what the lab actually does, with evidence: a file and
   line, an image tag, a frontmatter row.
3. **impact** — what happens on this platform if it stays as it is.
4. **action** — the concrete change, or the exact question to put to the team.
5. **owner** — `us` (we change the lab) or `them` (we need something from the
   platform).

Severity means consequence, not annoyance:

- **blocker** — the lab cannot run, or will be refused, as it stands.
- **should-fix** — it will run, but it violates a stated preference, carries
  avoidable risk, or will be argued about.
- **note** — worth knowing; no action required now.

Inflating severity is the fastest way to make the next review ignored. If
everything is a blocker, nothing is.

## What the review must not do

- **Do not review against requirements that do not exist.** Where
  `requirements.md` is silent, the honest output is an `unknown`, not a
  finding invented from general good practice. Unknowns are what turn the next
  meeting into a productive one.
- **Do not fix the lab.** The review reports; changing the lab is a separate,
  deliberate act by whoever owns it.
- **Do not soften a blocker to keep the report tidy.** The report exists to be
  uncomfortable before the meeting rather than during it.

## The pre-meeting brief

Every review ends in three lists, because that is what a person walking into
the meeting needs:

- **What we do not comply with** — blockers and should-fixes owned by `us`.
- **What we need from them** — the asks, owned by `them`.
- **What they will ask us** — the questions the requirements file implies and
  the lab does not yet answer, plus every `unknown`.

## Growing the file

The knowledge base is only useful if it grows. `/hol-platform-check` ends by
asking whether the team flagged anything new, and appends what they said to
`requirements.md` with the date and the source. A requirement learned in a
meeting and not written down will be learned again, in another meeting.
