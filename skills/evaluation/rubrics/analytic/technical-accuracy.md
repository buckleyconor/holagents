---
name: technical-accuracy
kind: analytic
scope: module
threshold: 4
---

# Technical accuracy (module level)

Is the module technically sound against the loaded context (the
research docs under ~/.holagent, plus the plan, lab-prep, and
Lab Credentials/environment notes the task provides)? Score each
criterion 1–5.

## Criteria

### commands-valid

Shell commands parse as real bash with correct syntax/flags for the
tools used (the linter's shellcheck catches parse errors; this rubric
catches the ones that parse but are wrong: bad flag, wrong subcommand,
impossible argument). A command that is valid for its tool but cannot
succeed in the stated environment (a tool or device the environment
lacks) is not docked here — that conflict is scored by
`no-fabrication` and `expected-output-plausible`.

### credential-alignment

Hosts, ports, usernames, and passwords in the body match the
`### Lab Credentials:` block exactly (a host that drifts by one octet
is a finding, not a rounding error).

### no-fabrication

No invented UI paths, console menu names, CLI flags, endpoints, or
output that the loaded research context does not support. When the
context is silent, the correct text is conservative — flag confident
specific claims with no context basis. Environment capabilities the
task context states the lab lacks (e.g., a GPU line in a CPU-only lab)
count as fabrication.

### expected-output-plausible

Shown outputs are plausible for the product (format, field names,
column headers) — not generic lorem output pasted as an example. Shown outputs must also
be consistent with the environment facts the task context gives (a
CPU-only lab cannot show GPU output).
