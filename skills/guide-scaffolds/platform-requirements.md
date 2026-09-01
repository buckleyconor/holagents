---
platform: '<< FILL: platform slug, e.g. k8s or vcd >>'
display_name: '<< FILL: what the team calls it, e.g. "HOL Kubernetes cluster (prod-k8s)" >>'
owners: '<< FILL: team or people who set these rules >>'
created: '<< FILL: YYYY-MM-DD >>'
updated: '<< FILL: YYYY-MM-DD >>'
sources:
  - {
      who: '<< FILL: person or team >>',
      when: '<< FILL: YYYY-MM-DD >>',
      what: '<< FILL: meeting, doc, thread >>',
    }
---

# << FILL: display_name >> — platform requirements

What it takes to run a hands-on lab on this platform. Grown by interview
(`/hol-platform-init`) and appended after every review
(`/hol-platform-check`). Not a policy document — a record of what the people
who operate this platform have actually told us.

Each requirement carries a confidence: **stated** (they said it), **inferred**
(we concluded it), **assumed** (nobody has said; we are guessing). Assumed
entries are the agenda for the next conversation.

## Networking

| Requirement                                 | Confidence                          | Source                |
| ------------------------------------------- | ----------------------------------- | --------------------- |
| << FILL: the rule, stated in their words >> | << FILL: stated/inferred/assumed >> | << FILL: who, when >> |

## Security

| Requirement | Confidence  | Source      |
| ----------- | ----------- | ----------- |
| << FILL: >> | << FILL: >> | << FILL: >> |

## Storage

| Requirement | Confidence  | Source      |
| ----------- | ----------- | ----------- |
| << FILL: >> | << FILL: >> | << FILL: >> |

## Config format

| Requirement | Confidence  | Source      |
| ----------- | ----------- | ----------- |
| << FILL: >> | << FILL: >> | << FILL: >> |

## Registry

| Requirement | Confidence  | Source      |
| ----------- | ----------- | ----------- |
| << FILL: >> | << FILL: >> | << FILL: >> |

## Tenancy & isolation

| Requirement | Confidence  | Source      |
| ----------- | ----------- | ----------- |
| << FILL: >> | << FILL: >> | << FILL: >> |

## Resources & quotas

| Requirement | Confidence  | Source      |
| ----------- | ----------- | ----------- |
| << FILL: >> | << FILL: >> | << FILL: >> |

## Naming & metadata

| Requirement | Confidence  | Source      |
| ----------- | ----------- | ----------- |
| << FILL: >> | << FILL: >> | << FILL: >> |

## Lifecycle

| Requirement | Confidence  | Source      |
| ----------- | ----------- | ----------- |
| << FILL: >> | << FILL: >> | << FILL: >> |

## Operations — and what they need from us

| Requirement                                                                   | Confidence  | Source      |
| ----------------------------------------------------------------------------- | ----------- | ----------- |
| << FILL: what the platform team needs from the lab owner before onboarding >> | << FILL: >> | << FILL: >> |

## Hard requirements vs preferences

- **Hard**: << FILL: the rules that will refuse a lab outright >>
- **Preference**: << FILL: the rules they would accept an argument about >>

## Open questions

Everything nobody has answered yet. This section is the agenda for the next
meeting — keep it, do not tidy it away.

- << FILL: unanswered question, and who to ask >>

## Change log

Appended after each review. Never rewrite history here; the point is being
able to see when a rule changed.

| Date        | Change                                    | Source      |
| ----------- | ----------------------------------------- | ----------- |
| << FILL: >> | << FILL: what was learned or corrected >> | << FILL: >> |
