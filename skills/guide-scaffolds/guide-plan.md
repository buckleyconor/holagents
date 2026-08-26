---
id: HOL-XXXX-NN
title: '<< FILL: Guide Title >>'
slug: fill-guide-slug
audience:
  - '<< FILL: primary audience >>'
  - '<< FILL: secondary audience >>'
prerequisites:
  - '<< FILL: prerequisite knowledge or skill >>'
duration_minutes: 60
objectives:
  - '<< FILL: objective, action-verb led >>'
  - '<< FILL: objective, action-verb led >>'
  - '<< FILL: objective, action-verb led >>'
environment:
  baseline: '<< FILL: environment baseline, e.g. Dev sandbox container, Ubuntu 22.04 >>'
  credentials:
    ['<< FILL: User/Pass — host:port, e.g. demouser / Password123! — http://localhost:8090 >>']
  urls: ['<< FILL: https://host:port >>']
  preloaded: ['<< FILL: /path/to/preloaded/resource >>']
modules:
  - {
      n: 1,
      slug: fill-module-1,
      title: '<< FILL: Module 1 title >>',
      goal: '<< FILL: what the learner achieves >>',
      est_minutes: 10,
    }
  - {
      n: 2,
      slug: fill-module-2,
      title: '<< FILL: Module 2 title >>',
      goal: '<< FILL: what the learner achieves >>',
      est_minutes: 15,
    }
  - {
      n: 3,
      slug: fill-module-3,
      title: '<< FILL: Module 3 title >>',
      goal: '<< FILL: what the learner achieves >>',
      est_minutes: 15,
    }
---

## Frontmatter subset rule

The frontmatter is parsed by a minimal YAML-subset reader (see
`extensions/frontmatter.ts`), not full YAML: top-level `key: value` scalars
(quoted or bare), block lists, inline flow lists `[a, b]`, and flow maps —
one per list item, which may span lines while brackets balance. Rules of
thumb: quote scalar values with special characters; inside a single-quoted
value double any apostrophe you need (`'the request''s limit'`) — an
unescaped apostrophe terminates the scalar; keep numbers bare. An
unparseable frontmatter fails plan validation (it does not crash the tools).

## Module roadmap

One entry per module — narrative, depends-on, teaching points, in learner
order. The frontmatter `modules` list is the machine-readable source; keep the
two in sync.

- **Module 1 — << FILL: title >>** (<< FILL: est_minutes >> min). << FILL: narrative — what the learner does and why it matters. >> Depends on: none. Teaching points: << FILL: … >>
- **Module 2 — << FILL: title >>** (<< FILL: est_minutes >> min). << FILL: narrative. >> Depends on: << FILL: module 1 >>. Teaching points: << FILL: … >>
- **Module 3 — << FILL: title >>** (<< FILL: est_minutes >> min). << FILL: narrative. >> Depends on: << FILL: … >>. Teaching points: << FILL: … >>

## Environment & lab prep summary (points at lab-prep.md)

<< FILL: one paragraph — what is pre-provisioned and what the learner must not
have to set up. The full handoff for the environment team (baseline, preloaded
software, credentials, URLs/hosts/ports, verification) lives in `lab-prep.md`. >>

## Open questions / assumptions

- << FILL: open question or assumption, or "None" >>
