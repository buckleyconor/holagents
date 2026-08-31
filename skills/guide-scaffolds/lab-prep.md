---
baseline: '<< FILL: image / OS, e.g. Dev sandbox container, Ubuntu 22.04 >>'
software:
  - {
      name: '<< FILL: component >>',
      version: '<< FILL: version >>',
      where: '<< FILL: install path or service name >>',
    }
credentials:
  - {
      user: '<< FILL: user >>',
      secret: '<< FILL: password >>',
      applies_to: '<< FILL: host/service >>',
    }
endpoints:
  - { url: '<< FILL: https://host:port >>', purpose: '<< FILL: what it serves >>' }
artifacts:
  - { path: '<< FILL: /path/to/data >>', purpose: '<< FILL: what it is >>' }
network: '<< FILL: outbound/inbound needs, or "fully pre-wired — no learner network config" >>'
verify:
  - {
      check: '<< FILL: command, e.g. curl -sf http://host:port/health >>',
      expect: '<< FILL: observable result, e.g. HTTP 200 >>',
    }
---

# Lab prep — << FILL: guide ID and title, e.g. HOL-1345-01 NVIDIA Enterprise RAG 2.3 Blueprint >>

The environment contract. Everything below is provisioned **before** the learner
starts; the guide never installs, provisions, or mutates the environment.

**The frontmatter above is the source of truth** — it is machine-readable, and
`hol_parity` executes the `verify` checks against the dev environment to prove
the running lab matches this file (ADR-011/ADR-012). The tables below restate it
for human readers; keep the two in step, and keep both in step with the
`environment` block in `.holagent/plan.md` and the guide's `### Lab Credentials:`
block.

Frontmatter rules (guide-scaffolds, "Frontmatter subset rule"): one-line flow
map per list entry, quote anything with special characters, numbers bare.

## Baseline

- Image / OS: << FILL: mirrors `baseline` above >>
- Kernel / runtime notes: << FILL: or "none" >>

## Preloaded software

| Component          | Version             | Where                                    |
| ------------------ | ------------------- | ---------------------------------------- |
| << FILL: `name` >> | << FILL: version >> | << FILL: install path or service name >> |

## Credentials

| User             | Password             | Applies to                                                                      |
| ---------------- | -------------------- | ------------------------------------------------------------------------------- |
| << FILL: user >> | << FILL: password >> | << FILL: host/service — must match the guide's Lab Credentials block exactly >> |

## URLs, hosts & ports

| URL / host:port               | Purpose                    |
| ----------------------------- | -------------------------- |
| << FILL: https://host:port >> | << FILL: what it serves >> |

## Network access

- << FILL: mirrors `network` above >>

## Expected starting artifacts

- << FILL: files/datasets expected at a path, e.g. /mnt/cache/RAG_Files/Manufacturing/ >>

## Verification

The environment is ready when every `verify` check in the frontmatter passes:

1. << FILL: check 1 — mirrors `verify[0]` >>
2. << FILL: check 2 >>

Run them with `/hol-qa --env <dev-environment>`; production is verified by the
script `/hol-qa-prod` emits, never by an agent.
