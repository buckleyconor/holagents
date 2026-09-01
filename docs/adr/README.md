# Architecture decision records

Short records of the decisions that shape holagent: the context that forced a
choice, the choice, and what it costs. **Accepted ADRs are immutable** — a
decision that changes gets a new record that supersedes the old one, so the
reasoning stays readable in order.

ADR-001…007 come from the original build, when holagent authored guides.
ADR-008…017 extend it to the full lab lifecycle. ADR-018 onwards are ordinary
corrections and reversals — including of the original spec.

## The guide pipeline (001–007)

| #                                                  | Decision                       | In one line                                                                                    |
| -------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------- |
| [001](0001-parent-owned-scorer-fanout.md)          | Parent-owned scorer fanout     | Orchestration stays in your session; agents never spawn agents.                                |
| [002](0002-knowledge-bundled-in-skills.md)         | Knowledge bundled in skills    | Everything an LLM reads lives in a skill dir, referenced by skill-relative path.               |
| [003](0003-no-lifecycle-scripts.md)                | No lifecycle scripts           | The guide never provisions: labs are pre-provisioned, every verification is an inline command. |
| [004](0004-line-based-linter-no-build.md)          | Line-based linter, no build    | A line scanner, not a Markdown AST; erasable TypeScript, no build step.                        |
| [005](0005-guide-file-convention.md)               | `guide.md` → `<ID>-<Title>.md` | `guide.md` is canonical only during the pipeline; the rename is the exit, and you confirm it.  |
| [006](0006-trailing-json-scorer-contract.md)       | Trailing-JSON scorer contract  | One fenced JSON block, last; dispatched with `acceptance: false` or the harness strips it.     |
| [007](0007-deterministic-commands-in-extension.md) | Determinism in the extension   | Anything decidable goes in the extension, not model judgment.                                  |

## The lab lifecycle (008–017)

| #                                                         | Decision                                | In one line                                                                                                   |
| --------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| [008](0008-external-lab-repo-reference.md)                | External lab-repo reference             | The lab's code lives in its own repo, reached only through a `lab-ref.json` you confirm once.                 |
| [009](0009-lifecycle-state-machine.md)                    | Lifecycle state machine                 | Six stages derived from files and scores; guides that predate it behave exactly as before.                    |
| [010](0010-build-and-qa-scope.md)                         | ADR-003 binds the guide, not the repo   | The guide still provisions nothing; the lab repo always did, and holagent stopped pretending otherwise.       |
| [011](0011-lab-prep-as-contract.md)                       | `lab-prep.md` as a machine contract     | Frontmatter is the source of truth, so guide/environment parity becomes a test instead of an opinion.         |
| [012](0012-dev-only-execution.md)                         | Dev-only execution                      | Only `dev` environments are ever executed against; production verification is a human act.                    |
| [013](0013-adoption-reconstructs-a-proposal.md)           | Adoption reconstructs a proposal        | A reverse-engineered contract is confirmed before it counts, and unknowable stages are inherited, not faked.  |
| [014](0014-platform-requirements-knowledge-base.md)       | Platform requirements are interviewed   | Review against what the platform team actually said — never against general good practice.                    |
| [015](0015-milestones-declare-their-own-test.md)          | Milestones declare their own test       | "Independently testable" becomes a property the pipeline checks, not a phrase in a template.                  |
| [016](0016-parity-executes-only-the-declared-contract.md) | Parity executes the declared contract   | Only the author's `verify` checks run; what nothing covers is a warning, and one reader serves both QA paths. |
| [017](0017-collateral-must-agree-with-the-guide.md)       | Collateral is checked against the guide | ID, title and duration are compared to `plan.md`; every claim must name a source or come out.                 |

## Corrections (018–)

| #                                    | Decision              | In one line                                                                                  |
| ------------------------------------ | --------------------- | -------------------------------------------------------------------------------------------- |
| [018](0018-tests-are-not-shipped.md) | Tests are not shipped | The shipped suite could not run; CI verifies the repo, `package-smoke` verifies the tarball. |

## The shape of these decisions

Read together, they are mostly one idea applied in different places:
**decide mechanically what can be decided mechanically, and be honest about
the rest.** Each stage gets a deterministic gate that checks something real
(ADR-007, 011, 015, 016, 017) and a rubric for the judgment the gate cannot
make. Where the package cannot know something — an adopted lab's business
case, a platform rule nobody stated, a claim with no source — the design makes
the gap visible rather than filling it (ADR-013, 014, 017).

The second idea is that safety boundaries live in code, not prose: the
dev/prod split (ADR-012) and write confinement (ADR-008) are enforced in
`hol-core.ts`, where a prompt cannot argue past them.
