# Corpus fixture — dev stand-in for `/lab/corpus.json`

The real lab environment provisions `/lab/corpus.json` (see `../lab-prep.md`).
This fixture is the dev-machine stand-in used by the M8+ gates (module
generation, scoring, later verification runs). The **guide text keeps the
canonical `/lab/corpus.json` path** — the fixture is never referenced from
`guide.md`.

## Schema

Top-level JSON array; one object per document:

```json
{ "id": 1, "topic": "nvme", "text": "…1–3 sentence technical blurb…" }
```

- `id` — 1-based, unique; maps to the Qdrant point id.
- `topic` — kebab-case label; goes into the point payload for result inspection.
- `text` — embedded by the guide's deterministic 64-dim stdlib toy embedder
  (the same function embeds the learner's query).

Ingest mapping (Module 2): each object → one point; `text` + `topic` → payload.

## Design constraints

- 15 short documents on storage / AI infrastructure topics (plan: "~15").
- Vocabulary overlaps with plausible Module 3 questions so the toy
  word-overlap embedder produces deterministic topical top-k.

**Verified (2026-08-25)** against `qdrant/qdrant:v1.19.0` with the guide's
64-dim stdlib embedder (Cosine, collection `corpus`, 15 points): the top-1
hit for each question is the intended document —

| Question (tested)                                                      | Top-1 (score)                |
| ---------------------------------------------------------------------- | ---------------------------- |
| "How are checkpoints stored during distributed GPU training?"          | checkpointing (0.464)        |
| "Which filesystem gives HPC clusters high-throughput shared datasets?" | parallel-filesystems (0.592) |
| "What does erasure coding trade away compared with replication?"       | erasure-coding (0.394)       |

A fourth question ("What is the low-latency storage interface for flash
memory?") returns `parallel-filesystems` at 0.493 with `nvme` second at
0.391 — topically adjacent, not a clean top-1; prefer the three above for
gate assertions.

## Provenance

Authored for the holagent build (M8 gate prep, 2026-08-25). Not scraped; no
external sources.
