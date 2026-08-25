# HOL-2000-01 Store and Search an Embedded Document Corpus

ℹ️ You can resize or hide the lab guide anytime by sliding it left or right.

## Table of Contents

- [1. Introduction](#introduction)
- [2. Launch the vector database](#module-1-launch-the-vector-database)
- [3. Ingest the corpus](#module-2-ingest-the-corpus)
- [4. Run a similarity search](#module-3-run-a-similarity-search)
- [5. Summary](#summary)

### Lab Credentials:

- Username/Password: demouser / Password123! — Qdrant REST API (unauthenticated): http://localhost:6333

### Target Audience

- AI infrastructure engineers
- Developers building RAG pipelines

## Introduction

**Duration:** This guide is designed to be completed in approximately 45 minutes.

**Objective:** The objective of this guide is to store and search an embedded document corpus in a Qdrant vector database.

- Launch a Qdrant vector database and verify its health endpoint
- Ingest a small document corpus with embeddings into a collection
- Run a similarity search and inspect the ranked results

[Back to top](#table-of-contents)

## Module 1: Launch the vector database

1. << FILL: confirm the pre-provisioned baseline and start the Qdrant container bound to localhost:6333. >>

<< FILL: expected result, e.g. the container starts and the REST endpoint answers. >>

> ✅ **Checkpoint:** << FILL: Qdrant is running in Docker on port 6333 and the REST endpoint returns 200. >>

[Back to top](#table-of-contents)

## Module 2: Ingest the corpus

1. << FILL: embed /lab/corpus.json with the deterministic python3 stdlib embedder, create the collection, and upsert every document as a point. >>

<< FILL: expected result, e.g. the point count equals the corpus size. >>

> ✅ **Checkpoint:** << FILL: the collection holds every corpus document as an embedded point with payload. >>

[Back to top](#table-of-contents)

## Module 3: Run a similarity search

1. << FILL: embed a natural-language question with the same embedder and POST it to the search endpoint. >>

<< FILL: expected result, e.g. ranked results with scores and payloads. >>

> ✅ **Checkpoint:** << FILL: ranked results return and the top hit is a topically relevant corpus document. >>

[Back to top](#table-of-contents)

## Summary

<< FILL: what the learner accomplished — driving a real vector database through its REST API and tracing a document from raw text to embedding to ranked hit. >>

[Back to top](#table-of-contents)
