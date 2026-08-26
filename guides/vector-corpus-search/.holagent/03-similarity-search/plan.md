---
module_n: 3
slug: similarity-search
title: 'Run a similarity search'
depends_on: [2]
est_minutes: 15
image_checklist:
  - 'Terminal showing the formatted search response from `python3 -m json.tool /lab/search_result.json`: the `result` array of 5 ranked hits — each hit carrying `id`, `score`, and `payload` (`topic` + `text`) — sorted highest score first; for the reference question the top hit is `id: 1` with `payload.topic` `nvme` and score ≈ 0.48'
  - 'Terminal showing the top-hit verification one-liner output: the line `top hit: 1 | score: 0.4835 | topic: nvme` (fourth decimal as captured by the dry run) followed by the full text of corpus document 1 (the NVMe document) — the top-ranked hit resolves to the corpus document matching the subject of the question'
success_criteria:
  - 'POSTing /lab/query.json to http://localhost:6333/collections/corpus/points/search returns a response with `"status": "ok"` whose `result` is a ranked list of 5 hits (the `limit` of the request) sorted by score descending (top-1 first), each hit carrying `id`, `score` (Cosine similarity in (−1, 1]), and the `payload` of the matched document {topic, text}'
  - 'The top hit (first element of `result`) is a topically relevant corpus document: its `id` resolves to a document in /lab/corpus.json whose `topic` matches the subject of the question — for the reference question "how does nvme storage work" the top hit is `id: 1` with `payload.topic` "nvme" and a score strictly greater than every other returned hit (≈ 0.48 vs ≈ 0.25 on the fixture corpus)'
  - '/lab/query.json exists and holds `{"vector": [<64 floats>], "limit": 5, "with_payload": true}` where the vector was built by the _same_ `embed()` from /lab/embed.py that embedded the corpus in Module 2 — question and corpus vectors live in one vector space'
---

## Step outline (numbered; each step: action, expected result, screenshot?)

Independent-application module — six steps around one concept: "apply the
Module 2 pipeline in reverse — question → vector → ranked hits". Goal: a
question embedded with the same stdlib embedder returns ranked results with
scores and payloads, and the top hit is a topically relevant corpus
document. The learner picks the question; the reference question below
("how does nvme storage work") is the worked example the guide's outputs use.

1. **Write a question** — enter the heredoc block exactly as shown, swapping the reference question for the learner's own question about the corpus's topics (storage / AI infrastructure). Only the opening `cat` line is a backticked command; the JSON line and the closing `JSON` terminator are heredoc content — no backticks, not a shell command (same convention as Module 2's step 2; in the guide the body line and `JSON` sit at column 0). — expected: the heredoc completes silently — the prompt returns with no output and `/lab/question.json` now holds `{"text": "<the question>"}`. — screenshot: no. The guide explains the toy-metric constraint on question choice: the embedder hashes _every_ whitespace-delimited token — content words, stop words, and punctuation alike — so a question that shares its key terms with the target document ("how does nvme storage work" shares `nvme` and `storage` with the `nvme` document) ranks that document first, while filler words dilute the vector. **Tip material:** the embedder splits on whitespace only and keeps attached punctuation, so a trailing `?` makes "work?" a different token from "work" — on the fixture corpus the reference question scores id 1 at ≈ 0.48 without the `?` and ≈ 0.40 with it. The guide's reference question is therefore written without trailing punctuation (the learner's own question may be phrased however they like; the module's success is topical relevance of the top hit, not a specific score).

   ```
   cat > /lab/question.json <<'JSON'
   {"text": "how does nvme storage work"}
   JSON
   ```

2. **Embed the question with the same embedder** — run `python3 -c "import json, sys; sys.path.insert(0, '/lab'); from embed import embed; q = json.load(open('/lab/question.json'))['text']; v = embed(q); json.dump({'vector': v, 'limit': 5, 'with_payload': True}, open('/lab/query.json', 'w')); print('query vector built:', len(v), 'dimensions for question:', q)"`. — expected: two stdout lines — `15 documents embedded into 64 dimensions` followed by `query vector built: 64 dimensions for question: how does nvme storage work` (15 = corpus file length; the question text echoes whatever the learner wrote) — and `/lab/query.json` written with the search request body. — screenshot: no. The guide explains the two lines: importing the `embed` module runs `embed.py`'s top-level code, so the corpus re-embeds first (the same deterministic output the learner saw in Module 2's step 3 — identical vectors, byte-identical `/lab/points.json` overwrite) and only then the question is embedded; the second line confirms the question vector and its destination. Decisive teaching point: the _same_ `embed()` function embeds the corpus (Module 2) and the question (here), so both sides of the search live in one vector space — this is the property every real RAG pipeline requires of its embedder.

3. **Inspect the search request body** — run `python3 -m json.tool /lab/query.json`. — expected: formatted JSON with a `"vector"` key holding a list of 64 floats (mostly 0.0 — the sparse hash-bucket vectors — a handful of non-zero values ≈ 0.5), `"limit": 5`, `"with_payload": true`. — screenshot: no. The guide explains each field: 64 dimensions = the `corpus` collection's vector size (Module 2's `size: 64`) — a dimension-count mismatch would be rejected by Qdrant; `limit: 5` = top-5 hits (a working value: enough to show a ranking, few enough to read on one screen); `with_payload: true` = return each hit's `{topic, text}` so the results can be read without re-querying the corpus.

4. **POST the query to the search endpoint** — run `curl -s -X POST http://localhost:6333/collections/corpus/points/search -H 'Content-Type: application/json' -d @/lab/query.json -o /lab/search_result.json`. — expected: no stdout (the response goes to the file); `/lab/search_result.json` now holds the response — a single-line JSON `{"result": [ … up to 5 hits … ], "status": "ok", "time": …}` with hits sorted by score descending, top-1 first. — screenshot: no. The guide places this call in a production RAG pipeline: this one POST is the retrieval step — the query-side half of the pipeline Module 2 built on the document side — and the shape (embed query → POST vector → ranked hits with payloads) is identical with a real embedding model in place of the toy.

5. **Read the ranked results** — run `python3 -m json.tool /lab/search_result.json`. — expected: the formatted response; for the reference question (fixture corpus): top hit `id: 1` with the highest score (≈ 0.4835; dry-run pending), then `id: 15` (≈ 0.2548), `id: 13` (≈ 0.2503), `id: 10` (≈ 0.2292), `id: 5` (≈ 0.2279) — every hit carries `id`, `score`, and `payload` {`topic`, `text`}. — screenshot: yes — image_checklist item 1. The guide explains how to read the results: scores are Cosine similarity in (−1, 1] — higher = more similar, 1.0 = identical direction — and under this toy metric the score is a weighted word-overlap measure (shared tokens push the vectors together; the sparse query vector's few non-zero buckets only overlap documents containing those tokens); `payload` is what makes a hit _readable_ — `topic` names the document's subject and `text` is the document itself, so the learner can judge topical relevance directly from the response; and where a real embedding model changes the picture — the same call and response shape, but the score reflects semantic similarity instead of word overlap, which is why retrieval quality scales with the model rather than with the query's word choices.

6. **Verify the top hit against the corpus** — run `python3 -c "import json; docs = json.load(open('/lab/corpus.json')); hits = json.load(open('/lab/search_result.json'))['result']; top = hits[0]; doc = next(d for d in docs if d['id'] == top['id']); print('top hit:', top['id'], '| score:', round(top['score'], 4), '| topic:', doc['topic']); print(doc['text'])"`. — expected: line `top hit: 1 | score: 0.4835 | topic: nvme` (score rounded to 4 decimals; exact value dry-run pending) followed by the full text of corpus document 1 — the top hit's `id` resolves to a corpus document whose topic matches the question's subject, confirming the ranking against the source data. — screenshot: yes — image_checklist item 2. This is the module's payoff step: the guide closes the loop from raw text → embedding → ranked hit (the same path as every production RAG retrieval flow) and states the success criterion — the top hit is the document the question is _about_.

Checkpoint placement (6 command steps, so W004 requires at least one
`> ✅ **Checkpoint:**` line in the finished module):

- After step 3: `> ✅ **Checkpoint:**` `/lab/query.json` is valid JSON with a 64-element `vector` (the same dimensionality as the `corpus` collection), `"limit": 5`, and `"with_payload": true` — the question is embedded in the same vector space as the corpus before the search call is made.
- After step 6 (module end): checkpoint stating the success criteria verbatim — the search response returns `"status": "ok"` with a ranked list of 5 hits (sorted by score descending, each with `id`, `score`, and the `{topic, text}` payload), and the top hit's `id` resolves to a corpus document topically matching the question (reference: `id: 1`, `payload.topic` "nvme", score strictly greater than every other hit).

## Environment delta

Assumes (already true — cited, not restated):

- A running Qdrant container named `qdrant` (image `qdrant/qdrant:v1.19.0`) serving its REST API unauthenticated at `http://localhost:6333` — Module 1's leaves-behind state (`.holagent/01-launch-qdrant/plan.md`). Qdrant runs unauthenticated on localhost per the guide's `### Lab Credentials:` block (`lab-prep.md` → Credentials), so no auth setup occurs in this module.
- The collection `corpus` in Qdrant — 64-dim Cosine vectors — holding one point per corpus document: point id = the document's `id`, vector = the embedded `text`, payload `{topic, text}`; point count equals the corpus file's length — Module 2's leaves-behind state (`.holagent/02-ingest-corpus/plan.md`).
- `/lab/embed.py` present with `embed(text)` → a 64-dim L2-normalized list of floats (deterministic word-token hashing, python3 stdlib only) — Module 2's leaves-behind state; this module reuses the _same_ function for the question.
- `/lab/points.json` present and inspectable — Module 2's leaves-behind state (step 2's import re-runs the corpus embedding and deterministically overwrites it with byte-identical content — the artifact stays valid).
- `python3` 3.12.x and `curl` on the base image (`lab-prep.md` → Preloaded software); `/lab/` writable for lab artifacts (`lab-prep.md` → Expected starting artifacts); `/lab/corpus.json` valid JSON, `{"id", "topic", "text"}` schema (`lab-prep.md` → Verification item 3) — re-read in step 6 to verify the top hit.

Leaves behind (this is the final module — no later module consumes these; they
remain in `/lab` as inspectable lab artifacts):

- `/lab/question.json` — the learner's question, `{"text": "…"}`.
- `/lab/query.json` — the search request body: `{"vector": [<64 floats>], "limit": 5, "with_payload": true}`.
- `/lab/search_result.json` — the raw search response (ranked `{id, score, payload}` hits).
- Together with Module 2's `/lab/embed.py` and `/lab/points.json`, the learner can re-run the search with a new question (new `/lab/question.json` → repeat steps 2–4).

The environment is pre-provisioned: this module records a state transition
only — no setup, provisioning, or cleanup steps.

## Commands used (full command text, in backtick form)

In step order. The step-1 heredoc is listed here as its backticked opening
line only — the JSON body line and the closing `JSON` are heredoc content,
not shell commands (full block in the step outline):

	`cat > /lab/question.json <<'JSON'`
	`python3 -c "import json, sys; sys.path.insert(0, '/lab'); from embed import embed; q = json.load(open('/lab/question.json'))['text']; v = embed(q); json.dump({'vector': v, 'limit': 5, 'with_payload': True}, open('/lab/query.json', 'w')); print('query vector built:', len(v), 'dimensions for question:', q)"`
	`python3 -m json.tool /lab/query.json`
	`curl -s -X POST http://localhost:6333/collections/corpus/points/search -H 'Content-Type: application/json' -d @/lab/query.json -o /lab/search_result.json`
	`python3 -m json.tool /lab/search_result.json`
	`python3 -c "import json; docs = json.load(open('/lab/corpus.json')); hits = json.load(open('/lab/search_result.json'))['result']; top = hits[0]; doc = next(d for d in docs if d['id'] == top['id']); print('top hit:', top['id'], '| score:', round(top['score'], 4), '| topic:', doc['topic']); print(doc['text'])"`

## Expected outputs (verbatim sample output where known)

Dry-run pending — the parent dry-runs before generation and supplies
verbatim captures. The numbers below were computed locally on the authoring
machine (2026-08-26) with the exact Module 2 embedder applied to the
15-document fixture corpus (`fixtures/corpus.json`) — deterministic, so the
top-1 identity and the ranking are expected to hold; Qdrant's Cosine score
is the dot product of the (normalized) vectors, so the local cosine values
are the expected scores (f32-vs-f64 may shift the last decimal; `time`, and
any `version` fields Qdrant 1.19 includes in scored points, are variable —
confirm the exact response shape, including whether `version` appears,
during the dry run).

Step 1 — writing the question: no output (the heredoc writes
`/lab/question.json` silently; the prompt returns).

Step 2 — embedding the question (15 = corpus file length; the question text
echoes whatever the learner wrote; the first line is the import side effect
re-running the corpus embed, byte-identical to Module 2's step 3 output):

```
15 documents embedded into 64 dimensions
query vector built: 64 dimensions for question: how does nvme storage work
```

Step 3 — request body (`python3 -m json.tool /lab/query.json`; the vector is
64 floats — sparse hash-bucket vector: 5 query tokens land in 4 distinct
buckets, so 4 non-zero values of ≈ 0.5 and 60 zeros; first entry shown,
remaining 62 elided here):

```
{
    "vector": [
        0.0,
        …
    ],
    "limit": 5,
    "with_payload": true
}
```

Step 4 — search POST: no stdout (the response is written to
`/lab/search_result.json`). Signal: the file exists and starts with
`{"result":[` — single-line JSON, top-1 first.

Step 5 — formatted response (shape as returned by Qdrant 1.19 with
`with_payload: true`; scores and ranking computed locally as flagged above —
dry-run pending for the verbatim capture; `payload.text` values are the real
corpus texts and are elided here):

```
{
    "result": [
        {
            "id": 1,
            "score": 0.4835,
            "payload": {
                "topic": "nvme",
                "text": "NVMe (Non-Volatile Memory Express) is the storage interface protocol …"
            }
        },
        {
            "id": 15,
            "score": 0.2548,
            "payload": { "topic": "vector-search", "text": "Vector databases index high-dimensional …" }
        },
        {
            "id": 13,
            "score": 0.2503,
            "payload": { "topic": "compression", "text": "Lossless compression reduces capacity …" }
        },
        {
            "id": 10,
            "score": 0.2292,
            "payload": { "topic": "iops-latency", "text": "IOPS counts how many requests …" }
        },
        {
            "id": 5,
            "score": 0.2279,
            "payload": { "topic": "erasure-coding", "text": "Erasure coding splits each object …" }
        }
    ],
    "status": "ok",
    "time": 0.0004
}
```

Step 6 — top-hit verification (score to 4 decimals as captured in the dry
run; the second line is document 1's full `text` from `/lab/corpus.json`):

```
top hit: 1 | score: 0.4835 | topic: nvme
NVMe (Non-Volatile Memory Express) is the storage interface protocol designed for flash memory, replacing the queueing architecture inherited from spinning disks. Because each NVMe queue can hold thousands of outstanding commands, a single NVMe SSD sustains more than a million IOPS at sub-millisecond latency.
```

## Open questions / assumptions

- Pacing: 6 steps against `est_minutes: 15` — inside the 5–8 steps / 10–20
  min band; the learner's question choice (step 1) is the independent
  variable — slow learners who deliberate longer over the question or
  re-run the search with a second question fit the 15-minute estimate,
  which already includes likely mistakes. Estimate kept at the
  parent-directed 15 — no adjustment.
- Expected outputs are marked dry-run pending (no live search capture exists
  yet). All numbers were computed locally on the authoring machine
  (2026-08-26) with the exact Module 2 embedder code and the 15-document
  fixture corpus: deterministic, so the top-1 identity (`id: 1`, topic
  `nvme` for the reference question) and the full top-5 ranking above are
  expected to hold; if the provisioned corpus differs from the fixture, the
  finished guide must update the ids/scores to match the corpus file (the
  same convention Module 2's plan applies to the count). Success criteria
  are stated in terms of ranking + topical relevance, not exact scores, so
  f32-vs-f64 rounding in Qdrant cannot fail them.
- Step 2's expected output is two lines, not one: importing `embed` from
  `/lab/embed.py` runs the script's top-level code, which re-embeds the
  corpus and prints Module 2's step-3 line (`15 documents embedded into 64
  dimensions`) and deterministically overwrites `/lab/points.json` with
  byte-identical content before the question is embedded. Verified locally.
  The guide explains this rather than suppressing it — it reinforces that
  corpus and question went through the _same_ function.
- Reference question is "how does nvme storage work" — no trailing
  punctuation, by design: the embedder keeps whitespace-attached punctuation
  in the token, so "work?" hashes to a different bucket and measurably
  lowers the top score (≈ 0.40 vs ≈ 0.48 for id 1 on the fixture corpus).
  The reference is chosen to make the top hit unambiguous (margin ≈ 0.48 vs
  ≈ 0.25 for the runner-up); questions computed to be weak demos (e.g. a
  vector-databases question ranking the `nvme` document first) are not
  suggested.
- `limit: 5` is a working value for readability (top-5 of a 15-document
  corpus fills one screen); not a machine field the learner must match.
- `goal` is carried in the step-outline intro (frontmatter follows the
  machine contract of the approved Module 1/2 plans, which omit `goal`).
- Two checkpoints planned (after step 3, after step 6) — required anyway
  (6 command steps ≥ 3, W004); the step-3 checkpoint gates on the request
  body before the API call, the step-6 checkpoint states the success
  criteria verbatim.
