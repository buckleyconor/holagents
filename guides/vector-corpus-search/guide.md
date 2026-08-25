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

1. << FILL: embed a natural-language question with the same embedder and POST it to the search endpoint. >>

<< FILL: expected result, e.g. ranked results with scores and payloads. >>

> ✅ **Checkpoint:** << FILL: ranked results return and the top hit is a topically relevant corpus document. >>

[Back to top](#table-of-contents)

## Summary

<< FILL: what the learner accomplished — driving a real vector database through its REST API and tracing a document from raw text to embedding to ranked hit. >>

[Back to top](#table-of-contents)
