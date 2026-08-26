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
- gRPC port: 6334 — Qdrant gRPC port (container-internal only: not published to the host, no 0.0.0.0: binding in docker ps); not used in this lab (only the REST API on 6333 is used)

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

This module is the observe phase: five quick checks around one question — is the lab alive? — before you touch any data. You confirm the preloaded image, confirm the port is free, start Qdrant, and prove through its REST API that the service is up.

1. Confirm the preloaded image. The sandbox arrives with the Qdrant image already in the local Docker cache, so nothing is pulled from the network during this lab. Verify the image is in the cache:

	`docker image ls qdrant/qdrant --format 'table {{.Repository}}:{{.Tag}}\t{{.Size}}'`

   You should see a row for the pinned tag:

   ```
   REPOSITORY:TAG          SIZE
   qdrant/qdrant:v1.19.0   275MB
   ```

   The SIZE value is variable (about 275MB); the tag `v1.19.0` is stable. Seeing this row proves the image is local, so the container start in step 3 runs without a network pull.

2. Confirm port 6333 is free before starting. Qdrant is intentionally not running at prep time, so this request is expected to fail:

	`curl -s http://localhost:6333/`

   You see no output: with `-s`, curl stays silent when the connection is refused (exit code 7). That refusal is the expected prep invariant, not a failure to diagnose — it confirms nothing else is listening on port 6333, so the container you start next can bind the port.

3. Start Qdrant. Run the container in detached mode with the name `qdrant` and host port 6333 mapped to the container's REST API port:

	`docker run -d --name qdrant -p 6333:6333 qdrant/qdrant:v1.19.0`

   Docker prints the new container's 64-hex-digit id and returns to the prompt. The id is different on every run — the long hex string with no error is the success signal. The `-d` flag runs the container in the background, so the prompt returns while Qdrant keeps serving.

4. Poll the REST root endpoint until it answers. Qdrant needs a few seconds after the container starts before the API accepts connections:

	`curl -s http://localhost:6333/`

   If the first try returns nothing, wait a few seconds and run the command again — one retry is enough. On success, the endpoint returns HTTP 200 with the version JSON line. The commit hash is stable for the pinned tag:

   ```
   {"title":"qdrant - vector search engine","version":"1.19.0","commit":"74f3e85b9473c62560006c043e13737ce6b48412"}
   ```

   << INSERT SCREENSHOT: Terminal showing the output of curl -s http://localhost:6333/ returning HTTP 200 with the version JSON line {"title":"qdrant - vector search engine","version":"1.19.0","commit":"74f3e85b9473c62560006c043e13737ce6b48412"} >>

   > ✅ **Checkpoint:** The root endpoint `http://localhost:6333/` returns 200 with the version JSON — Qdrant is running and the REST API is ready for calls.

5. Confirm the container and port mapping:

	`docker ps --filter name=qdrant --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'`

   You should see the `qdrant` row in the `Up` state with the port mapping to host port 6333. The `Up <n> seconds` counter is variable:

   ```
   NAMES   STATUS          PORTS
   qdrant  Up 6 seconds    0.0.0.0:6333->6333/tcp, [::]:6333->6333/tcp, 6334/tcp
   ```

   The `6334/tcp` entry is Qdrant's gRPC port: it stays container-internal (no `0.0.0.0:` prefix), and this lab uses only the REST API on 6333.

   << INSERT SCREENSHOT: Terminal showing the docker ps row for the qdrant container: NAMES qdrant, STATUS Up, PORTS 0.0.0.0:6333->6333/tcp, [::]:6333->6333/tcp, 6334/tcp >>

   > ✅ **Checkpoint:** `docker ps` lists the `qdrant` container in Up state with the port mapping `0.0.0.0:6333->6333/tcp`, and `curl -s http://localhost:6333/` returns the version JSON — the REST root endpoint is alive and the service is ready for API calls.

[Back to top](#table-of-contents)

## Module 2: Ingest the corpus

This module is the ingest phase: six steps building the text → vector → upsert pipeline around one concept — loading the corpus into Qdrant with a stdlib-only embedder. You inspect the corpus, write and run the embedder, create the collection, upsert every document, and confirm the point count matches the corpus file.

1. Inspect the corpus before embedding it. The success criterion for this module is that the final point count matches the corpus file, not a hardcoded number, so the steps hold even if a differently sized corpus is provisioned:

	`python3 -c "import json; docs=json.load(open('/lab/corpus.json')); print(len(docs), 'documents'); print('first:', docs[0])"`

   You should see the file's length and the first document object:

   ```
   15 documents
first: {'id': 1, 'topic': 'nvme', 'text': 'NVMe (Non-Volatile Memory Express) is the storage interface protocol designed for flash memory, replacing the queueing architecture inherited from spinning disks. Because each NVMe queue can hold thousands of outstanding commands, a single NVMe SSD sustains more than a million IOPS at sub-millisecond latency.'}
   ```

   `15` is the current length of /lab/corpus.json; the `first:` line prints the file's first document — id `1`, topic `nvme`, and its full text. Remember the number you see here; the count at the end of this module must equal it.

2. Write the embedder. Create /lab/embed.py with a heredoc: the opening line starts a heredoc; everything until the closing `PY` is the script itself — type or paste it exactly as shown, blank lines included (Python is indentation-sensitive, and the quoted delimiter `'PY'` keeps the shell from expanding anything in the body). The write completes silently: after the `PY` line the prompt returns with no output, and /lab/embed.py now exists.

	`cat > /lab/embed.py <<'PY'`
cat > /lab/embed.py <<'PY'
import json, math

DIM = 64

def embed(text):
    vec = [0.0] * DIM
    for tok in text.lower().split():
        h = 0
        for ch in tok:
            h = (h * 131 + ord(ch)) % 4294967296
        vec[h % DIM] += 1.0
    norm = math.sqrt(sum(x * x for x in vec)) or 1.0
    return [x / norm for x in vec]

docs = json.load(open("/lab/corpus.json"))
points = [{"id": d["id"], "vector": embed(d["text"]),
           "payload": {"topic": d["topic"], "text": d["text"]}} for d in docs]
json.dump({"points": points}, open("/lab/points.json", "w"))
print(len(points), "documents embedded into", DIM, "dimensions")
PY

   The embedder is deliberately a toy: it is deterministic (the same text produces the same vector on every run), stdlib-only (no pip, no external model service, and the sandbox has no outbound network access), and — decisively — the same `embed()` function embeds the corpus here and your question in Module 3, so both sides of the search live in one vector space.

3. Run the embedder. It reads the corpus, computes one 64-dimensional vector per document, and writes the upsert payload file:

	`python3 /lab/embed.py`

   You should see one line of output, with the corpus file's length in place of `15`:

   ```
   15 documents embedded into 64 dimensions
   ```

   The run also wrote /lab/points.json with one `{id, vector, payload}` object per document: the point id is the document's `id`, and the payload is the document's `{topic, text}`.

<< INSERT SCREENSHOT: Terminal showing the embedder run: the stdout line `15 documents embedded into 64 dimensions` after running `python3 /lab/embed.py` (15 is the length of /lab/corpus.json) >>

> ✅ **Checkpoint:** The embedder printed `15 documents embedded into 64 dimensions` (15 is the length of /lab/corpus.json), and /lab/points.json exists with one `{id, vector, payload}` entry per document — the text → vector half of the pipeline works before you invest in the API calls.

4. Create the collection. Qdrant requires the collection schema to exist before any point can be upserted into it. Set the vector `size` to 64 to match the embedder's `DIM`, and use the `Cosine` distance, which fits the L2-normalized vectors `embed()` returns:

	`curl -s -X PUT http://localhost:6333/collections/corpus -H 'Content-Type: application/json' -d '{"vectors": {"size": 64, "distance": "Cosine"}}'`

   `result` of `true` with `status` `"ok"` means the collection was created (`time` is variable):

   ```
   {"result":true,"status":"ok","time":0.089687123}
   ```

5. Upsert the points. Send the whole /lab/points.json file as the request body. The `wait=true` parameter blocks until the write is applied, so the count in the next step cannot race the upsert:

	`curl -s -X PUT 'http://localhost:6333/collections/corpus/points?wait=true' -H 'Content-Type: application/json' -d @/lab/points.json`

   You should see a completed operation (`operation_id` and `time` are variable; on a fresh collection the operation id starts at 1):

   ```
   {"result":{"operation_id":1,"status":"completed"},"status":"ok","time":0.002628246}
   ```

   `status` `"completed"` is the success signal: every point from the file is now stored in the collection.

6. Count the points. The count endpoint in Qdrant 1.19 is a **POST** with a JSON body — a GET is misparsed as a point id and errors, so keep the method and the `{"count": true}` body exactly as shown:

	`curl -s -X POST http://localhost:6333/collections/corpus/points/count -H 'Content-Type: application/json' -d '{"count": true}'`

You should see the count equal the corpus file's length (`time` is variable):

   ```
   {"result":{"count":15},"status":"ok","time":0.000263578}
   ```

   The count matching the file is the module's payoff: 15 documents in, 15 points out proves every document became exactly one point — no more, no fewer — each carrying its `{topic, text}` payload copied from /lab/corpus.json.

   << INSERT SCREENSHOT: Terminal showing the count endpoint response `{"result":{"count":15},"status":"ok",...}` from the POST to http://localhost:6333/collections/corpus/points/count (15 is the corpus file length) >>

   > ✅ **Checkpoint:** The point count returned by POSTing `{"count": true}` to http://localhost:6333/collections/corpus/points/count equals the length of /lab/corpus.json (15 on this corpus) — the response is `{"result":{"count":15},"status":"ok",...}` — and every point in the `corpus` collection carries its document's `{topic, text}` payload.

[Back to top](#table-of-contents)

## Module 3: Run a similarity search

This module is the search phase: six steps applying the pipeline you built in Module 2 in reverse — question → vector → ranked hits. You write a question, embed it with the same stdlib embedder, inspect the search request, POST it to Qdrant's search endpoint, read the ranked results, and verify the top hit against the corpus.

The worked example below uses the reference question `how does nvme storage work`; swap in your own question about the corpus's topics (storage, AI infrastructure) and the steps still hold — the success criterion is a topically relevant top hit, not a specific score.

1. Write a question. Enter the heredoc block exactly as shown, replacing the reference question with your own question about the corpus's topics (storage, AI infrastructure). The expected outputs below use the reference question as the worked example; with your own question the echoed text and the hit list differ, but the steps and the success criterion are the same. Only the opening `cat` line is a shell command; the JSON line and the closing `JSON` terminator are heredoc content — type them at column 0, with no backticks:

	`cat > /lab/question.json <<'JSON'`
cat > /lab/question.json <<'JSON'
{"text": "how does nvme storage work"}
JSON

   The heredoc completes silently — the prompt returns with no output — and /lab/question.json now holds your question as JSON (the reference question shown):

   ```
   {"text": "how does nvme storage work"}
   ```

   The body line echoes whatever you typed in place of the reference question.

   A word on question choice: the embedder hashes every whitespace-delimited token — content words, stop words, and punctuation alike — so a question that shares its key terms with the target document (the reference question shares `nvme` and `storage` with the `nvme` document) ranks that document first, while filler words dilute the vector.

   **Tip:** The embedder splits on whitespace only and keeps attached punctuation, so a trailing `?` makes `work?` a different token from `work` — on the fixture corpus the reference question scores id 1 at ≈ 0.48 without the `?` and ≈ 0.40 with it. The reference question is therefore written without trailing punctuation.

2. Embed the question with the same embedder. The same `embed()` function embedded the corpus in Module 2 and embeds the question here, so both sides of the search live in one vector space — the property every real RAG pipeline requires of its embedder. The one-liner imports `embed`, reads the question from /lab/question.json, and writes the search request body to /lab/query.json:

	`python3 -c "import json, sys; sys.path.insert(0, '/lab'); from embed import embed; q = json.load(open('/lab/question.json'))['text']; v = embed(q); json.dump({'vector': v, 'limit': 5, 'with_payload': True}, open('/lab/query.json', 'w')); print('query vector built:', len(v), 'dimensions for question:', q)"`

   You should see two lines:

   ```
   15 documents embedded into 64 dimensions
   query vector built: 64 dimensions for question: how does nvme storage work
   ```

   `15` is the corpus file's length, and the second line confirms the question vector — 64 dimensions — and echoes the question text you wrote in step 1. /lab/query.json now holds the search request body.

   **Note:** Importing the `embed` module runs `embed.py`'s top-level code, so the corpus re-embeds first — the first line is the same deterministic output you saw in Module 2's step 3, and the run overwrites /lab/points.json with byte-identical content. The artifact stays valid; no action needed.

3. Inspect the search request body. Before the POST, confirm the request is well-formed — the vector, the result limit, and the payload flag:

	`python3 -m json.tool /lab/query.json`

   You should see formatted JSON with a `vector` holding 64 entries (elided below: 4 of the 64 entries are non-zero — ≈ 0.378 and ≈ 0.756, L2-normalized — the rest are 0.0) plus the two request options:

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

   Each field maps to something from Module 2: 64 dimensions is the `corpus` collection's vector size (Module 2's `size: 64`) — a dimension-count mismatch would be rejected by Qdrant; `limit: 5` asks for the top-5 hits — enough to show a ranking, few enough to read on one screen; `with_payload: true` returns each hit's `{topic, text}` so the results are readable without re-querying the corpus.

   > ✅ **Checkpoint:** /lab/query.json is valid JSON with a 64-element `vector` (the same dimensionality as the `corpus` collection), `"limit": 5`, and `"with_payload": true` — the question is embedded in the same vector space as the corpus before the search call is made.

4. POST the query to the search endpoint. This one POST is the retrieval step — the query-side half of the pipeline Module 2 built on the document side — and its shape (embed query → POST vector → ranked hits with payloads) is identical with a real embedding model in place of the toy:

	`curl -s -X POST http://localhost:6333/collections/corpus/points/search -H 'Content-Type: application/json' -d @/lab/query.json -o /lab/search_result.json`

   No terminal output — `-o` writes the response to /lab/search_result.json, so the prompt returning with no output is the success signal. The file now holds the single-line JSON response, with `result` sorted by score descending, top-1 first. For the reference question it starts with:

   ```
   {"result":[{"id":1,"version":1,"score":0.4834938,"payload":{"topic":"nvme","text":"NVMe (Non-Volatile Memory Express) is the storage interface protocol designed for flash memory, …
   ```

   With your own question the opening hit differs — the criterion is a topically relevant top hit, not a specific id or score. Each hit also carries a `version` field: Qdrant's per-point version counter, which increments on every write; it is not part of the match.

5. Read the ranked results. Format the response for readability:

	`python3 -m json.tool /lab/search_result.json`

   For the reference question on the 15-document fixture corpus, you should see (the top hit's `text` is shown in full; the remaining `text` values are elided with `…`; `time` is variable between runs):

   ```
   {
       "result": [
           {
               "id": 1,
               "version": 1,
               "score": 0.4834938,
               "payload": {
                   "topic": "nvme",
                   "text": "NVMe (Non-Volatile Memory Express) is the storage interface protocol designed for flash memory, replacing the queueing architecture inherited from spinning disks. Because each NVMe queue can hold thousands of outstanding commands, a single NVMe SSD sustains more than a million IOPS at sub-millisecond latency."
               }
           },
           {
               "id": 15,
               "version": 1,
               "score": 0.2548236,
               "payload": { "topic": "vector-search", "text": "Vector databases index high-dimensional embeddings for similarity search, …" }
           },
           {
               "id": 13,
               "version": 1,
               "score": 0.25031307,
               "payload": { "topic": "compression", "text": "Lossless compression reduces capacity and network transfer …" }
           },
           {
               "id": 10,
               "version": 1,
               "score": 0.22917463,
               "payload": { "topic": "iops-latency", "text": "IOPS counts how many requests per second a storage tier sustains, …" }
           },
           {
               "id": 5,
               "version": 1,
               "score": 0.22792113,
               "payload": { "topic": "erasure-coding", "text": "Erasure coding splits each object into k data shards and m parity shards …" }
           }
       ],
       "status": "ok",
       "time": 0.00080558
   }
   ```

   `"status": "ok"` with 5 hits — the request's `limit` — sorted by score descending, top-1 first, and every hit carrying `id`, `score`, and `payload`, is the success shape. Read the fields: `score` is Cosine similarity in (−1, 1] — higher means more similar, 1.0 means identical direction — and under the toy metric it is a weighted word-overlap measure: shared tokens push the vectors together, so the sparse query vector's few non-zero buckets only overlap documents containing those tokens. `payload` is what makes a hit readable — `topic` names the document's subject and `text` is the document itself, so you can judge topical relevance directly from the response. A real embedding model changes the score, not the shape: the same call and the same response, with the score reflecting semantic similarity instead of word overlap — which is why retrieval quality scales with the model rather than with the query's word choices.

   << INSERT SCREENSHOT: Terminal showing the formatted search response from `python3 -m json.tool /lab/search_result.json`: the `result` array of 5 ranked hits — each hit carrying `id`, `score`, and `payload` (`topic` + `text`) — sorted highest score first; for the reference question the top hit is `id: 1` with `payload.topic` `nvme` and score ≈ 0.48 >>

6. Verify the top hit against the corpus. A ranked hit is only as good as its resolution to the source data, so close the loop — raw text → embedding → ranked hit, the same path as every production RAG retrieval flow. Re-read /lab/corpus.json and print the top hit's id, score (rounded to 4 decimals), and the corpus document's topic and full text:

	`python3 -c "import json; docs = json.load(open('/lab/corpus.json')); hits = json.load(open('/lab/search_result.json'))['result']; top = hits[0]; doc = next(d for d in docs if d['id'] == top['id']); print('top hit:', top['id'], '| score:', round(top['score'], 4), '| topic:', doc['topic']); print(doc['text'])"`

   You should see the top hit's summary line followed by the full text of the corpus document it resolves to — for the reference question:

   ```
   top hit: 1 | score: 0.4835 | topic: nvme
   NVMe (Non-Volatile Memory Express) is the storage interface protocol designed for flash memory, replacing the queueing architecture inherited from spinning disks. Because each NVMe queue can hold thousands of outstanding commands, a single NVMe SSD sustains more than a million IOPS at sub-millisecond latency.
   ```

   The top hit's `id` resolves to a corpus document whose `topic` matches the subject of the question — the document the question is about — confirming the ranking against the source data. With your own question the id, score, and topic differ; the success criterion is topical match, not a specific value.

   << INSERT SCREENSHOT: Terminal showing the top-hit verification one-liner output: the line `top hit: 1 | score: 0.4835 | topic: nvme` (fourth decimal as captured by the dry run) followed by the full text of corpus document 1 (the NVMe document) — the top-ranked hit resolves to the corpus document matching the subject of the question >>

   > ✅ **Checkpoint:** The search response returns `"status": "ok"` with a ranked list of 5 hits (sorted by score descending, each with `id`, `score`, and the `{topic, text}` payload), and the top hit's `id` resolves to a corpus document topically matching the question (reference: `id: 1`, `payload.topic` "nvme", score strictly greater than every other hit).

[Back to top](#table-of-contents)

## Summary

In this lab, you drove a real vector database entirely through its REST API: you started Qdrant and proved the REST root endpoint was live, embedded a 15-document corpus with a deterministic stdlib embedder and upserted each document into the `corpus` collection as a point carrying its `{topic, text}` payload, then embedded a natural-language question with the same `embed()` function and POSTed it to the search endpoint, reading back the ranked top-5 hits — the top hit resolving to the corpus document the question was about. That raw text → embedding → ranked hit path is the same shape as every production RAG ingestion and retrieval flow. To go further, re-run the search with your own question: write a new /lab/question.json and repeat steps 2–4 of Module 3, and/or swap the toy embedder for a real embedding model — the call and response shapes stay identical.

[Back to top](#table-of-contents)
