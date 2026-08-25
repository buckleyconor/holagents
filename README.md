# holagent-lab-guides

Pi agent package that produces hands-on lab guides end-to-end: research, plan,
generate module-by-module, validate (deterministic linter), and score (rubric
fanout).

> Status: under construction (spec in `spec/`). README is completed at M11.

## Commands (target surface)

`/hol-plan` · `/hol-plan-module` · `/hol-generate-module` · `/hol-generate-all` ·
`/hol-research-company` · `/hol-research-product` · `/hol-review-plan` ·
`/hol-review-module-plan` · `/hol-review-module` · `/hol-review-guide` ·
`/hol-validate` · `/hol-status`

## Develop

```bash
npm install
npm test           # typecheck + unit/integration (node:test, type-stripped TS)
npm run lint:corpus # run the linter over the style-corpus samples (triage aid)
```
