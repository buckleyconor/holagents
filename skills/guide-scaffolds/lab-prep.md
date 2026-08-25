# Lab prep — << FILL: guide ID and title, e.g. HOL-1345-01 NVIDIA Enterprise RAG 2.3 Blueprint >>

Handoff artifact for the (out-of-scope) environment provisioning team.
Everything below is provisioned **before** the learner starts; the guide never
installs, provisions, or mutates the environment. Keep this file in lockstep
with the `environment` block in `.holagent/plan.md` and with the guide's
`### Lab Credentials:` block (single source of truth for credentials/hosts).

## Baseline

- Image / OS: << FILL: e.g. dev sandbox container, Ubuntu 22.04 >>
- Kernel / runtime notes: << FILL: or "none" >>

## Preloaded software

| Component                                           | Version             | Where                                    |
| --------------------------------------------------- | ------------------- | ---------------------------------------- |
| << FILL: component, e.g. Triton Inference Server >> | << FILL: version >> | << FILL: install path or service name >> |

## Credentials

| User             | Password             | Applies to                                                                      |
| ---------------- | -------------------- | ------------------------------------------------------------------------------- |
| << FILL: user >> | << FILL: password >> | << FILL: host/service — must match the guide's Lab Credentials block exactly >> |

## URLs, hosts & ports

| URL / host:port               | Purpose                    |
| ----------------------------- | -------------------------- |
| << FILL: https://host:port >> | << FILL: what it serves >> |

## Network access

- << FILL: outbound/inbound needs, or "fully pre-wired — no learner network config" >>

## Expected starting artifacts

- << FILL: files/datasets expected at a path, e.g. /mnt/cache/RAG_Files/Manufacturing/ >>

## Verification

The environment is ready when:

1. << FILL: check, e.g. `curl -s http://host:port/health` returns 200 >>
2. << FILL: check 2 >>
