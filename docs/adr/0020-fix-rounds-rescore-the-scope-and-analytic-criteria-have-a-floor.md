# ADR-020: A fix round rescores the whole scope, and an analytic floor gates the entry

- **Status**: Accepted (2026-09-23)
- **References**: ADR-001, ADR-006, ADR-019; `skills/evaluation/scorer-prompts.md`
  §Fix loop and caps; `skills/evaluation/scoring-guide.md`; `agents/scorer.md`;
  `docs/manual-e2e.md` (fix loop, round 2)

## Context

The first fix loop run end to end (2026-09-23, a mirrored module scope) exposed
two ways the loop could report a scope as healthy when it was not.

1. **A fix round rescored only the still-failed rubrics.** The `guide-implementer`
   dispatch edits one section, and every rubric in the scope reads that section —
   so the edit is in scope for all of them, not just the one that complained. In
   the run, the fix raised `step-clarity` 3.4 → 4.4 and simultaneously dropped a
   criterion of the already-passing `technical-accuracy` from 4 to 3: the writer
   had copied UI strings from Jinja templates deleted in `7f6383c`, which were
   readable only from git history. The loop never looked, because that rubric had
   not failed.
2. **The entry mean hides a criterion trade.** Round 1 criteria were 5, 5, 4, 3;
   round 2 were 5, 5, 3, 4. Same mean, same rounded entry score, same `passed`.
   A regression and an improvement cancelled exactly, and nothing on disk showed
   it. Threshold-on-mean is a fair aggregate for a first pass and a poor one for
   a diff across rounds.

## Decision

**A fix round rescores the whole scope.** The fanout in a fix round contains
every rubric of the scope whose content overlaps the edited section — for module,
plan and guide scope, that is every rubric of the scope, not the failed subset.
Round-1 semantics are unchanged.

**Analytic entries get a criterion floor.** An `analytic` entry is `passed` iff
its mean meets the rubric threshold **and** no criterion scores below 3. One
weak criterion cannot be averaged away. `checklist` is already gated this way by
its 1.0 threshold (a single unmet criterion fails), and `holistic` scores one
overall number, so the floor is analytic-only.

**Round-over-round deltas are reported, not gated.** Before merging a round ≥ 2
entry, the parent compares each criterion score with the stored entry for the
same `scope`/`rubric` and prints any drop of ≥1 on the scorecard, labelled. A
drop is not its own failure condition — the floor decides that — because a fix
round is allowed to trade a little on one criterion to gain a lot on another.

## Consequences

- **The extra cost is the wave's tail, not its count.** A parallel wave is
  bounded by its slowest child: measured on the same section, a 4-rubric wave
  took 13.8 minutes and a 2-rubric wave took 11.7. Rescoring all four instead of
  the one that failed costs about two minutes a round. The fix dispatch, at
  26.9 minutes, remains the loop's dominant cost — the loop is writer-bound.
- **The floor is a behaviour change**, so an analytic scope that passed with a 2
  somewhere now fails on its next rescore. Measured against the live lab's
  history: **0 of 28** analytic entries would flip. It is a guard rail, not a
  purge. Where it does bite, the fix is to raise the criterion, not to average
  over it — which is the whole point.
- **Scorer and parent must agree on the pass rule**, so the floor is spelled in
  `scoring-guide.md` and `agents/scorer.md` as well as in the parent procedure;
  the parent still recomputes status from the criterion scores (ADR-001's defense
  in depth) and that recomputation now applies the floor.
- The envelope contract is unchanged: no new fields, so `validateScoreEntry` and
  ADR-006's parse path are untouched. The delta comparison reads `scores.json`,
  which already stores per-criterion scores.
- **The two halves do different work, and neither alone is enough.** Today's
  regression was 4 → 3, which the floor does not catch — a 3 is above the floor.
  It is the delta report that surfaces it. The floor exists for the stronger
  case (a criterion at 1–2 hidden by a healthy mean), which this lab has not yet
  produced: 0 of 28 analytic entries trip it. The delta report is the sensitive
  instrument; the floor is the backstop.
- `test/prompts.test.ts` (T-96f) fails if either rule is dropped from the
  contract files or if the old "rescore only the still-failed rubrics" wording
  returns — these are prose rules, and prose drifts.
