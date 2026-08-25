---
name: technical-accuracy
kind: analytic
scope: module
threshold: 4
---

# Technical accuracy (module level)

Is the module technically sound against the loaded research context
(product/company docs in ~/.holagent)? Score each criterion 1–5.

## Criteria

### commands-valid

Shell commands parse as real bash with correct syntax/flags for the
tools used (the linter's shellcheck catches parse errors; this rubric
catches the ones that parse but are wrong: bad flag, wrong subcommand,
impossible argument).

### credential-alignment

Hosts, ports, usernames, and passwords in the body match the
`### Lab Credentials:` block exactly (a host that drifts by one octet
is a finding, not a rounding error).

### no-fabrication

No invented UI paths, console menu names, CLI flags, endpoints, or
output that the loaded research context does not support. When the
context is silent, the correct text is conservative — flag confident
specific claims with no context basis.

### expected-output-plausible

Shown outputs are plausible for the product (format, field names,
column headers) — not generic lorem output pasted as an example.
