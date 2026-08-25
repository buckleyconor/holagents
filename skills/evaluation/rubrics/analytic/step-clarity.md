---
name: step-clarity
kind: analytic
scope: module
threshold: 4
---

# Step clarity (module level)

The core craft rubric for generated module bodies. Score each
criterion 1–5.

## Criteria

### actionable-steps

Each numbered step is a single unambiguous action: what the reader
does, on which surface (terminal / console page / file). Steps that
bundle multiple actions or hide the "where" score low.

### ui-actions

UI interactions name the control in bold with quotes
(Click the **"New Collection"** button); vague "open the collection
page" phrasing scores low.

### expected-results

Every step has an observable outcome (command output, named UI state,
or an explicit check). Steps ending in a verb with nothing to observe
score low — cite them in findings.

### no-fluff

No marketing or motivational filler ("Experience the power of …"),
no unexplained jargon. Fluff lines dilute the step count a reader
actually has to perform.

### terminology-consistent

Within the module, the same object/feature is always called the same
thing (cite synonym drift in the finding).
