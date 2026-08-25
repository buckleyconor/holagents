# Scorer Task Templates

The parent session builds one task per rubric using these templates. Placeholders
in `« … »` are filled from the guide state. **Inlining rule:** the scoring guide
and the rubric file are pasted in **verbatim** (file contents, no summarizing) —
scorers must see identical wording in every task. The content slice is the exact
file or section text (a module = its full `## Module <N>:` section including the
back-to-top line; the plan = the full `plan.md` frontmatter + body; the guide =
the full `guide.md`).

Every task ends with the contract reminder so the last thing the scorer sees is
the output format.

---

## Template: `plan` scope

```
Score the lab-guide PLAN below against the rubric «rubric-name».

### Scoring guide
«contents of scoring-guide.md, verbatim»

### Rubric: «rubric-name» (kind: «kind», threshold: «threshold»)
«rubric file content, verbatim»

### Scope label
scope: plan

### Content — plan.md
«full .holagent/plan.md: frontmatter + body, verbatim»
«plus: full .holagent/lab-prep.md under a "### lab-prep.md" sub-heading, if the rubric checks it»

### Output contract
End with exactly one fenced JSON block; no prose after it. criterion_text
copied verbatim; finding null on pass, concrete location otherwise.
```

## Template: `module-plan-<NN>` scope

```
Score the MODULE PLAN below against the rubric «rubric-name».

### Scoring guide
«contents of scoring-guide.md, verbatim»

### Rubric: «rubric-name» (kind: «kind», threshold: «threshold»)
«rubric file content, verbatim»

### Scope label
scope: module-plan-«NN»

### Content — module plan
«full .holagent/<NN-slug>/plan.md: frontmatter + body, verbatim»
«plus: the guide-level plan.md "modules" frontmatter line for this module (goal/est_minutes) and, if present, the prior module's plan.md Environment delta section, under a "### context" sub-heading»

### Output contract
End with exactly one fenced JSON block; no prose after it. criterion_text
copied verbatim; finding null on pass, concrete location otherwise.
```

## Template: `module-<NN-slug>` scope

```
Score the MODULE below against the rubric «rubric-name».

### Scoring guide
«contents of scoring-guide.md, verbatim»

### Rubric: «rubric-name» (kind: «kind», threshold: «threshold»)
«rubric file content, verbatim»

### Scope label
scope: module-«NN»-«slug»

### Content — module section
«the full "## Module <N>: …" section of guide.md, verbatim, including its [Back to top] line»
«plus: the guide's "### Lab Credentials:" block and, if present, the module plan's step outline / image checklist / success criteria under a "### context" sub-heading»

### Output contract
End with exactly one fenced JSON block; no prose after it. criterion_text
copied verbatim; finding null on pass, concrete location otherwise.
```

## Template: `guide` scope

```
Score the WHOLE LAB GUIDE below against the rubric «rubric-name».

### Scoring guide
«contents of scoring-guide.md, verbatim»

### Rubric: «rubric-name» (kind: «kind», threshold: «threshold»)
«rubric file content, verbatim»

### Scope label
scope: guide

### Content — full guide
«full guide.md, verbatim»
«plus: the plan.md frontmatter (objectives + modules list) under a "### context" sub-heading»

### Output contract
End with exactly one fenced JSON block; no prose after it. criterion_text
copied verbatim; finding null on pass, concrete location otherwise.
```

---

## Fanout pattern (parent)

One `runs.all` per scoring phase; stable keys = rubric names:

```js
const results = await runs.all([
  {
    key: 'score-plan-completeness',
    agent: 'holagent.scorer',
    task: '«plan task, checklist rubric»',
  },
  {
    key: 'score-plan-learning-arc',
    agent: 'holagent.scorer',
    task: '«plan task, analytic rubric»',
  },
  // …one item per rubric in the scope
]);
// then per child: extract the LAST fenced JSON block from result.output,
// parse (1 retry on failure, then record escalated "scorer output unparseable"),
// compute score/status per the SKILL.md table, hol_scores action=merge.
```
