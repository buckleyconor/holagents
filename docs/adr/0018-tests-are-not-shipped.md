# ADR-018: tests are not shipped in the package

- **Status**: Accepted (2026-09-01) — supersedes the `files` list in `spec/03-build-decisions.md`
- **References**: ADR-007; `package.json` (`files`), `scripts/package-smoke.mjs`

## Context

`spec/03-build-decisions.md` specified
`"files": ["prompts", "agents", "skills", "extensions", "test", "docs", "README.md"]`
— the package shipped its own test suite so an installed copy could verify
itself. The spec's companion note refers to a `test/smoke.mjs` running inside
the tarball; that file no longer exists, and the check it described now lives
in `scripts/package-smoke.mjs`, which runs at pack time in CI.

Unpacking the v0.2.0 tarball and running it as a consumer would shows the
promise was not being kept:

- **`npm test` fails immediately.** It runs `tsc --noEmit` first, and
  `typescript` is a devDependency that a consumer never installs.
- **The raw runner does not pass either**: `node --experimental-strip-types
--test 'test/**/*.test.ts'` gives 119/121, and only 121 of the repo's 124
  tests exist in the tarball at all.
- One failure is **structural, not environmental**: `frontmatter.test.ts`
  T-65d reads `guides/vector-corpus-search/.holagent/plan.md`, a fixture in
  `guides/`, which is correctly excluded from the package. That test can never
  pass in an installed copy.

Nobody had noticed, which is the strongest evidence that nobody runs them
after installing.

## Decision

`test` is removed from `files`. The test suite stays in the repository and
runs in CI on every push; it is not part of what gets installed.

Post-install assurance comes from the two things that actually speak to the
consumer's environment rather than re-running unit tests that already passed
in CI:

- the `session_start` hook reports whether the extension loaded and whether
  pi-subagents is present, and `/hol-status` proves the deterministic surface
  works in one command;
- `scripts/package-smoke.mjs` asserts tarball integrity at pack time — every
  `pi.*` manifest path present, valid skill/agent frontmatter, no third-party
  branding in shipped markdown, no runtime dependencies.

## Consequences

- The tarball drops from 303K to 266K compressed (1,032KB to 882KB
  uncompressed, 181 files to 160) — a real but modest **12%**. Size was the
  weaker half of the argument; the tests not working was the decisive half.
- `extensions/` still ships, so the code a consumer would debug is present.
  What is gone is a suite that could not be run beside it.
- Tests may now depend on the repository layout without that breaking an
  installed package — T-65d's reach into `guides/` becomes a normal
  repo-relative fixture rather than a latent packaging bug. It is still
  cwd-sensitive, and would fail if `npm test` were run from a subdirectory;
  that is worth fixing on its own merits, not as a packaging concern.
- If self-verification is wanted later, the honest form is a small purpose-built
  smoke test that exercises the installed package in its own environment — not
  the development suite shipped as-is.
