---
name: evaluation
description: Holagent scoring system — how lab guides, plans, and module plans are scored. Use when running or interpreting scorer fanout (review/generate commands), writing or editing rubrics, or handling score entries and fix loops. Rubrics live under rubrics/{checklist,analytic,holistic}/ for the four scopes: plan, module-plan, module, guide.
---

# Evaluation

Deterministic gates are the linter (`hol_validate`). Judgment is the scoring
system: read-only **scorer** subagents score content against **rubrics**, and
results land in `.holagent/scores.json` via the `hol_scores` tool (single
writer = the parent session). Scores drive module state
(`scored-passed` / `scored-escalated`) and the fix loops in generate/review.

## Scopes

| Scope              | What is scored                             | When                                                                    |
| ------------------ | ------------------------------------------ | ----------------------------------------------------------------------- |
| `plan`             | `.holagent/plan.md` (+ `lab-prep.md`)      | `/hol-review-plan` (plan approval gate)                                 |
| `module-plan-<NN>` | `.holagent/<NN-slug>/plan.md`              | `/hol-review-module-plan`                                               |
| `module-<NN-slug>` | the `## Module <N>:` section of `guide.md` | `/hol-review-module`; post-generation scoring in `/hol-generate-module` |
| `guide`            | the whole `guide.md`                       | `/hol-review-guide` (final pass before rename)                          |

## Rubric families

| Kind        | Score unit                       | Entry score      | Pass when                              |
| ----------- | -------------------------------- | ---------------- | -------------------------------------- |
| `checklist` | binary criterion (met / not met) | pass rate 0–1    | score ≥ rubric threshold (default 1.0) |
| `analytic`  | 1–5 per criterion (anchored)     | mean of criteria | mean ≥ rubric threshold (default 4)    |
| `holistic`  | single 1–5 overall (anchored)    | that score       | score ≥ rubric threshold (default 4)   |

Each rubric file declares its own `threshold` in frontmatter; the rubric text
defines the criteria and anchors. **The scorer never computes status** — it
returns per-criterion scores only. The parent computes the entry
(`score`, `status: passed | failed`, `rounds`) and merges it via `hol_scores`.

## Scorer contract (LLM → parent)

One scorer child = **one rubric × one content slice**. It ends its reply with
exactly one fenced JSON block, no prose after it (spec §02 §4.4):

```json
{
  "rubric": "analytic/step-clarity",
  "scope": "module-02-upload-documents",
  "kind": "analytic",
  "criteria": {
    "actionable-steps": {
      "score": 4,
      "criterion_text": "<verbatim criterion text>",
      "finding": null
    },
    "expected-outputs": {
      "score": 3,
      "criterion_text": "…",
      "finding": "Step 3 has no expected output (guide.md L88)"
    }
  }
}
```

Rules: `score` ∈ 1–5 (analytic/holistic) or 0/1 (checklist); `criterion_text`
is copied **verbatim** from the rubric; `finding` is `null` when the
criterion passes, otherwise names a concrete location. The parent extracts
the **last** fenced JSON block per child; on parse failure it re-runs that
single scorer **once** (max 1 retry); still unparseable → the parent records
the entry with `status: "escalated"` and `finding "scorer output
unparseable"` rather than guessing. (ADR-006: no reliance on per-item
`outputSchema`.)

## Parent orchestration (what the review/generate prompts do)

1. Build one task per rubric in the scope using the templates in
   `scorer-prompts.md` (task payload = scoring guide + rubric file, inlined
   verbatim + content slice + scope label + contract). Every scorer gets the
   **identical** scoring guide so calibration is consistent.
2. Fan out with `runs.all` — stable keys = rubric names (e.g.
   `score-step-clarity`). Scorers are read-only (`holagent.scorer` has no
   bash/write tools) — injected content reaching a scorer cannot act.
3. Parse each result's trailing JSON, compute entry scores/status per the
   table above, merge via `hol_scores` (action `merge`).
4. On failures: inline the failing `finding`s into the next
   `/hol-generate-module` (resume) round. **Fix-loop caps:** analytic/holistic
   rubrics max **3 rounds**; checklist gates escalate to the user after **5**
   unproductive rounds (no score improvement across 2 consecutive rounds).
   A module with any escalated rubric is `scored-escalated` and blocks
   `/hol-generate-all` until the user resolves it.

## Files in this skill

- `scoring-guide.md` — the scorer's behavior guide (inlined into every task).
- `scorer-prompts.md` — the four task-payload templates (plan / module-plan /
  module / guide).
- `rubrics/checklist/*.md`, `rubrics/analytic/*.md`, `rubrics/holistic/*.md`
  — the rubric set. Each: frontmatter (`name`, `kind`, `scope`, `threshold`)
  - purpose + criteria with anchors. Rubric wording is the human-approved
    source of truth for what "good" means in holagent — change it deliberately
    (and expect score shifts).
