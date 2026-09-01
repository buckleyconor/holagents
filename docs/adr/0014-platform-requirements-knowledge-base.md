# ADR-014: platform requirements are an interviewed knowledge base, not a policy document

- **Status**: Accepted (2026-09-01)
- **References**: ADR-002, ADR-007, ADR-009; `skills/platform-requirements/`,
  `prompts/hol-platform-init.md`, `prompts/hol-platform-check.md`,
  `agents/platform-reviewer.md`

## Context

A lab has to land on a platform — the vCD estate, the Kubernetes cluster —
and the platform teams have rules: where images come from, what may be
exposed, what a namespace is allowed to consume, what they need from us before
they will onboard anything. None of it is written down. It is tribal knowledge,
and it surfaces in a meeting, usually as a surprise, usually late.

Two ways to close that gap. Encode general platform good practice and review
against it, or record what these specific teams actually said and review
against that. The first is easy and produces a report nobody accepts: findings
traced to nothing carry no authority, and the one invented finding discredits
the nine real ones.

## Decision

Platform requirements live in `~/.holagent/platforms/<name>/requirements.md` —
user-level, not per-lab, because the rules belong to the platform and every lab
on it inherits them. The file is **grown by interview**
(`/hol-platform-init`), organised by a fixed ten-category taxonomy
(networking, security, storage, config, registry, tenancy, resources, naming,
lifecycle, operations) so that vCD and Kubernetes answer the same questions and
stay comparable.

Every requirement carries a **source** (who said it, when) and a **confidence**
— `stated`, `inferred`, or `assumed`. Assumed entries are visible everywhere
they are used, including in the brief of any review that leaned on them.

`/hol-platform-check` reviews a lab against that file and **only** that file.
Where the requirements are silent the output is an `unknowns` entry, never a
finding invented from general good practice. Findings are severity-tagged
(`blocker` / `should-fix` / `note`), owned (`us` / `them`), traced to a
requirement, evidenced with a locator in the lab's own artifacts, and closed
with an action — enforced deterministically by `hol_platform_findings`
(ADR-007) and judged for substance by two rubrics at scope `platform-<name>`.

The command **ends by asking whether the team flagged anything new**, and
appends it — with source, confidence, and a change-log row. The knowledge base
grows after every meeting; that is the mechanism, not a nicety.

## Consequences

- The second review of a platform is better than the first, and the tenth is
  worth having. The value compounds in the file, not in any one report.
- A review is only as good as the interview behind it. A thin `requirements.md`
  produces a thin review that says so, which is the correct failure mode: a
  long list of `unknowns` is an agenda, a long list of invented findings is a
  liability.
- The report's authority rests entirely on traceability, so the reviewer is
  explicitly forbidden from filling gaps with best practice, and the coverage
  rubric checks that silence was declared rather than papered over.
- There is no `/hol-review-platform`. A review scores the lab as it was that
  day; re-scoring stale findings answers nothing, so the re-run is the check
  itself.
- Requirements are shared state outside any lab. Two labs reviewed a week apart
  can be reviewed against different revisions of the same file — the findings
  file records `requirements_source` and `requirements_updated` so that is
  visible rather than confusing.
