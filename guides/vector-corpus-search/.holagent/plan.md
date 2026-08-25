---
id: HOL-2000-01
title: 'Store and Search an Embedded Document Corpus'
slug: vector-corpus-search
audience:
  - 'AI infrastructure engineers'
  - 'Developers building RAG pipelines'
prerequisites:
  - 'Docker basics'
  - 'Comfort with curl and JSON'
duration_minutes: 45
objectives:
  - 'Launch a Qdrant vector database and verify its health endpoint'
  - 'Ingest a small document corpus with embeddings into a collection'
  - 'Run a similarity search and inspect the ranked results'
environment:
  baseline: 'Dev sandbox container, Ubuntu 24.04 (Docker 29.x available)'
  credentials:
    - 'demouser / Password123! — sandbox shell login (Qdrant itself runs unauthenticated on localhost)'
  urls:
    - 'http://localhost:6333 (Qdrant REST API)'
  preloaded:
    - 'Docker image qdrant/qdrant (pulled; no network pulls during the lab)'
    - '/lab/corpus.json — small document corpus (~15 short documents on storage/AI infrastructure)'
modules:
  - {
      n: 1,
      slug: launch-qdrant,
      title: 'Launch the vector database',
      goal: 'Qdrant is running in Docker on port 6333 and curl to its REST endpoint returns 200, proving the service is ready for API calls.',
      est_minutes: 10,
    }
  - {
      n: 2,
      slug: ingest-corpus,
      title: 'Ingest the corpus',
      goal: 'A collection holds every document from /lab/corpus.json as an embedded point with payload, confirmed by the point count matching the corpus size.',
      est_minutes: 20,
    }
  - {
      n: 3,
      slug: similarity-search,
      title: 'Run a similarity search',
      goal: 'A question embedded with the same stdlib embedder returns ranked results with scores and payloads, and the top hit is a topically relevant corpus document.',
      est_minutes: 15,
    }
---

## Why this guide

RAG pipelines live or die on the retrieval step: a store that can find the
document that _means_ what the question is about, not just the one that shares
its keywords. This 45-minute lab walks the full lifecycle of an embedded
corpus in Qdrant — from a pre-pulled Docker image to ranked search results —
using only what the pre-provisioned sandbox already has: Docker, curl, and
the python3 stdlib. No installs, no external model service, no GPU.

The learning arc follows observation → guided → independent:

1. **Observe** (Module 1): verify the pre-provisioned baseline, start Qdrant,
   and confirm through its REST endpoint that the service is alive.
2. **Guided hands-on** (Module 2): build the text → vector → upsert pipeline
   with a small deterministic toy embedder (python3 stdlib only) and load the
   corpus into a collection.
3. **Independent application** (Module 3): embed a question of the learner's
   choosing with the same embedder, run a similarity search, and read the
   ranked results — scores, payloads, and why the top hit is right.

By the end, the learner has driven a real vector database entirely through
its REST API and can trace a document from raw text to embedding to ranked
hit — the same shape as every production RAG ingestion and retrieval flow.

## Module roadmap

One entry per module — narrative, depends-on, teaching points, in learner
order. The frontmatter `modules` list is the machine-readable source; keep the
two in sync.

- **Module 1 — Launch the vector database** (10 min). The learner confirms the
  pre-provisioned baseline (Docker daemon up, `qdrant/qdrant` image already in
  the local cache — no pulls), starts Qdrant as a container bound to
  localhost port 6333, and polls the REST root endpoint with curl until it
  returns 200 with version info. This is the "is the lab alive" checkpoint
  every later module assumes. Depends on: none. Teaching points: images vs.
  containers, port binding to localhost, Qdrant's unauthenticated REST API
  surface, and what a healthy service response looks like. Leaves behind: a
  running Qdrant container at `http://localhost:6333`.
- **Module 2 — Ingest the corpus** (20 min). The core pipeline. The learner
  writes a small deterministic toy embedder in python3 stdlib (hash word
  tokens into a fixed 64-dimension bucket vector, L2-normalize — no pip, no
  external model service), runs it over `/lab/corpus.json`, creates a
  collection via the REST API with a matching vector size and distance
  metric, and upserts every embedded document as a point carrying its text as
  payload. Depends on: Module 1 (running Qdrant). Teaching points: why the
  embedder must be deterministic and self-contained (the same function must
  later embed the query), collection schema (vector size + distance metric),
  upsert semantics, and payload metadata for later inspection. Leaves behind:
  a populated collection whose point count equals the corpus size.
- **Module 3 — Run a similarity search** (15 min). The learner applies the
  pipeline in reverse: pick a natural-language question about the corpus's
  topics (storage / AI infrastructure), embed it with the same stdlib
  embedder, POST it to the search endpoint, and inspect the ranked results —
  what the score means, how payloads identify the hit documents, and why the
  top hits are topically relevant under a word-overlap toy metric. Depends
  on: Module 2 (populated collection + the same embedder). Teaching points:
  reading scores and top-k rankings, payload-driven result inspection, how a
  toy embedder's behavior scales to real embedding models, and where this
  search call sits in a RAG pipeline (the retrieval step).

## Environment & lab prep summary (points at lab-prep.md)

The environment is fully pre-provisioned before the learner starts: an
Ubuntu 24.04 dev sandbox with Docker 29.x (daemon running), python3, and
curl on the base image; the `qdrant/qdrant` Docker image already pulled; and
`/lab/corpus.json` in place. Nothing installs software or pulls images during
the lab. The learner's only credential is the sandbox shell login; Qdrant
runs unauthenticated on `http://localhost:6333`, which the learner starts in
Module 1 (the container is intentionally not running at prep time). The full
handoff for the environment team — baseline, preloaded software,
credentials, URLs/hosts/ports, network access, expected starting artifacts,
and verification steps — lives in `lab-prep.md`.

## Open questions / assumptions

- **Embedding approach — option (a) chosen.** Per the design constraints,
  embeddings are self-contained: a small deterministic toy embedder written
  inline in python3 stdlib (word-token hashing into 64 dimensions,
  L2-normalized). No external model service and no preloaded vector files, so
  the preloaded list in `lab-prep.md` needs no additions. Corpus and query
  vectors come from the same function (Module 2 embeds the corpus, Module 3
  embeds the question).
- **Corpus size is "~15".** The exact document count is not user-confirmed;
  the environment team should keep it stable, and Module 2's success
  criterion is that the point count _matches the file_ (length of
  `/lab/corpus.json`), not a hardcoded number.
- **Qdrant image tag.** The payload says `qdrant/qdrant` was pulled without a
  tag; the environment team should pin and record the exact tag in
  `lab-prep.md`'s Preloaded software table at provision time.
- **Qdrant not running at prep time.** Module 1's goal is the learner
  launching it, so the pre-provisioned state is "image present, container
  stopped". `lab-prep.md` verification therefore checks the image/file
  baseline rather than a live 200 from port 6333 (which is asserted only
  after the learner starts it).
- **Collection name and embedding dimensionality** (`corpus`, 64) are working
  values the module planner/guide will finalize; they are not user-confirmed
  machine fields.
- **Time budget.** Module estimates follow the user's hint (10 + 20 + 15 =
  45), so the sum equals `duration_minutes` (45), within the required ≤
  bound.
