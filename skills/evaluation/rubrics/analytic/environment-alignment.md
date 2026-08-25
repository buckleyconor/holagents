---
name: environment-alignment
kind: analytic
scope: plan
threshold: 4
---

# Environment alignment (plan level)

Is the plan's use of the pre-provisioned environment coherent? The
environment is built by another team to `lab-prep.md` — the plan must
not assume what it does not declare.

## Criteria

### baseline-consistent

Module environment deltas and steps never contradict the declared
baseline/preloaded (e.g. a step installing a tool that is already
preloaded, or assuming a host that is not in `urls`).

### credentials-and-urls-complete

Every host, port, and credential any module references appears in the
`environment` block (and vice versa: no unused entries that suggest a
dropped module).

### no-duplicated-setup

Shared prerequisites live in the baseline/preloaded (and lab-prep),
not repeated as setup steps across module deltas.

### lab-prep-captures-assumptions

Everything modules assume is already true is captured in `lab-prep.md`
— the environment team can provision from it without reading module plans.
