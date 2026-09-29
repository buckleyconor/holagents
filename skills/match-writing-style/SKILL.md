---
name: match-writing-style
description: Applies the holagent house writing conventions — or a user-supplied style preference when one was given — when authoring lab guide content. Use when authoring or editing guide prose so tone, voice, and terminology stay consistent.
---

# Match Writing Style

How to apply tone, voice, and terminology when writing lab guide content.

## Prerequisites

Context should be loaded via the `load-context` skill (if available). If the
user supplied a style preference during the interview, that preference governs;
otherwise write in the holagent house conventions below.

## Workflow

1. Internalize the target voice: tone, terminology, and sentence patterns.
2. Write the content draft.
3. Review against the conventions: does it read like a hands-on lab guide?
4. Apply any terminology substitutions the user gave.
5. Do a "read-aloud test" — would a lab author read this as clear, consistent
   instructions?

## House conventions

Write in the holagent house lab-guide conventions (see the `guide-format` skill)
rather than a generic neutral tone:

- Second person ("you"), active voice, imperative step phrasing.
- One action per step; each step states an observable expected result.
- No marketing fluff — concrete controls, commands, and outputs only.
- Standard callouts only: `**Tip:**`, `**Note:**`, `⚠️ **Important:**`,
  `**Use Case:**`.
- Keep the guide's own terminology consistent from Module 1 to the Summary.

## Precedence

A user-supplied style preference governs **tone, voice, and terminology**. The
holagent house format (`guide-format` skill) governs **structure and mechanics**
(section skeleton, TOC anchors, command blocks, image syntax, callout forms).
Where they conflict, the house format wins — the linter is the arbiter and it
does not know about style preferences.

## Verification

After editing, run `/hol-validate` if a guide file was touched: style changes must
never introduce format drift (e.g. a "nicer" callout that breaks W001).
