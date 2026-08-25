---
name: match-writing-style
description: Applies a company style guide — or the holagent house conventions when none exists — when writing lab guide content. Use when authoring or editing guide prose so tone, voice, and terminology match the target.
---

# Match Writing Style

How to apply company tone, voice, and terminology when writing lab guide content.

## Prerequisites

Context should be loaded via the `load-context` skill (if available).

## Workflow

1. Read `~/.holagent/companies/<company-slug>/style-guide.md` (if available).
2. Before writing any content, internalize: tone, voice characteristics,
   terminology preferences.
3. Write the content draft.
4. Review against the style guide: does it sound like their docs?
5. Apply terminology substitutions from the style guide table.
6. Do a "read-aloud test" — would this fit on their documentation site?

## House fallback (no company style guide)

If no style guide exists, write in the holagent house lab-guide conventions
(see the `guide-format` skill) instead of a generic neutral tone:

- Second person ("you"), active voice, imperative step phrasing.
- One action per step; each step states an observable expected result.
- No marketing fluff — concrete controls, commands, and outputs only.
- Standard callouts only: `**Tip:**`, `**Note:**`, `⚠️ **Important:**`,
  `**Use Case:**`.
- Keep the guide's own terminology consistent from Module 1 to the Summary.

## Precedence

The style guide governs **tone, voice, and terminology**. The holagent house format
(`guide-format` skill) governs **structure and mechanics** (section skeleton, TOC
anchors, command blocks, image syntax, callout forms). Where they conflict, the house
format wins — the linter is the arbiter and it does not know about style guides.

## Verification

After editing, run `/hol-validate` if a guide file was touched: style changes must
never introduce format drift (e.g. a "nicer" callout that breaks W001).
