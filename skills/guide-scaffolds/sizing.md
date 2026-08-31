---
target_platforms:
  - '<< FILL: vcd | k8s >>'
concurrency_target: << FILL: how many simultaneous learner instances, e.g. 8 >>
deployment_target: '<< FILL: the concrete target, e.g. Charmed Kubernetes, x86, RTX PRO 6000 >>'
demo_footprint:
  gpu: '<< FILL: model + count, or "none" >>'
  vram_gb: << FILL: number, or 0 >>
  vcpu: << FILL: number >>
  ram_gb: << FILL: number >>
  storage_gb: << FILL: number >>
---

# Sizing — << FILL: solution name >>

What this lab needs to run, shrunk to the smallest thing that still tells the
story in `concept.md`. Multiple instances run concurrently, so per-instance
footprint is the constraint that matters. Consumed by `/hol-spec`, which derives
`lab-prep.md` from it.

## Production footprint

What a real customer deployment looks like — the honest number, before any
reduction.

| Component        | GPU / vRAM  | vCPU        | RAM         | Storage     | Notes       |
| ---------------- | ----------- | ----------- | ----------- | ----------- | ----------- |
| << FILL: name >> | << FILL: >> | << FILL: >> | << FILL: >> | << FILL: >> | << FILL: >> |

## Minimal demo footprint

What one learner instance actually needs.

| Component        | GPU / vRAM  | vCPU        | RAM         | Storage     | Notes       |
| ---------------- | ----------- | ----------- | ----------- | ----------- | ----------- |
| << FILL: name >> | << FILL: >> | << FILL: >> | << FILL: >> | << FILL: >> | << FILL: >> |

**Per-instance total:** << FILL: GPU/vRAM, vCPU, RAM, storage >>

## Reduction decisions

Every shrink, and its cost. The last column is the one that matters — it is
what stops the next person shrinking it further and breaking the lab.

| Component        | Production  | Demo        | Why it still demonstrates the story | What breaks if smaller |
| ---------------- | ----------- | ----------- | ----------------------------------- | ---------------------- |
| << FILL: name >> | << FILL: >> | << FILL: >> | << FILL: >>                         | << FILL: >>            |

## Density

- Per-instance footprint: << FILL: from above >>
- Concurrency target: << FILL: N simultaneous instances >>
- Aggregate: << FILL: N × per-instance, per resource >>
- Shared vs per-tenant: << FILL: what is shared across instances (registry,
  model cache, dataset volume) and what must be per-instance >>
- Headroom / limits: << FILL: what runs out first at the target, and at what N >>

## Software stack

| Component        | Version             | Source / image    | Licensing             |
| ---------------- | ------------------- | ----------------- | --------------------- |
| << FILL: name >> | << FILL: version >> | << FILL: image >> | << FILL: or "none" >> |

## Deployment target

<< FILL: which platform (vCD / Kubernetes), why that one for this lab, and any
platform requirement already known to be a problem. `/hol-platform-check` is
the real gate — this is the first guess. >>

## Open questions & assumptions

- << FILL: every number estimated rather than measured, and anything a human
  should confirm before the spec is written. Estimated footprints belong here
  explicitly — an empty section means guesses are hiding in the tables. >>
