---
name: platform-coverage
kind: checklist
scope: platform
threshold: 1.0
---

# Platform coverage

Did the review actually cover the platform's requirements, and does it say
where it could not? Scored at `/hol-platform-check`. The deterministic gate
(`hol_platform_findings`) covers the file's shape; this rubric covers whether
the review did the work. Binary criteria: met (1) or not met (0).

## Criteria

### categories-walked

Every category the requirements file has content for was considered. A
category with requirements and no finding reads as compliance, not as an
omission — but a category the review never mentions anywhere, in findings,
asks or unknowns, was skipped.

### artifacts-read

The observations show the review read the lab's real deployment artifacts —
compose files, manifests, charts, Dockerfiles, `lab-prep.md` frontmatter —
rather than describing the lab in general terms.

### evidence-located

Every finding's observation names where it was seen: a file and line, an image
reference, a manifest field, or a `lab-prep.md` row. No observation is a
paraphrase with no locator.

### requirements-traced

Every finding quotes or references the requirement it comes from, and that
requirement exists in `requirements.md`. Nothing is scored against general
good practice.

### silence-declared

Where the requirements file is silent, the review says so in `unknowns`
rather than inventing a finding — and the `unknowns` list is present and
specific.

### asks-separated

Findings owned by `them` are reflected in `asks`, phrased as something the
platform team can act on, not as a complaint about the platform.

### severity-justified

Every `blocker` is a case where the lab would actually be refused or could not
run, and the finding's `impact` says which. Nothing is escalated for emphasis.

### actions-concrete

Every finding's `action` names a change to make or a question to ask, specific
enough to act on without further investigation.
