---
module_n: 2
slug: ingest-corpus
title: 'Ingest the corpus'
depends_on: [1]
est_minutes: 20
image_checklist:
  - 'Terminal showing the embedder run: the stdout line `15 documents embedded into 64 dimensions` after running `python3 /lab/embed.py` (15 is the length of /lab/corpus.json; the number in the finished guide must match the corpus file)'
  - 'Terminal showing the count endpoint response `{"result":{"count":15},"status":"ok",...}` from the POST to http://localhost:6333/collections/corpus/points/count (15 is the corpus file length; the count in the finished guide must match the corpus file)'
success_criteria:
  - 'The point count returned by POSTing {"count": true} to http://localhost:6333/collections/corpus/points/count equals the length of /lab/corpus.json (15 on this corpus) — the response is {"result":{"count":15},"status":"ok",...}'
  - 'Every point in the `corpus` collection carries the document's {topic, text} payload copied from /lab/corpus.json — the same payload objects sent in /lab/points.json, one per document, confirmed by the point count matching the corpus size'
---

## Step outline (numbered; each step: action, expected result, screenshot?)

Guided hands-on module — six steps building the text → vector → upsert
pipeline around one concept: "load the corpus into Qdrant with a stdlib-only
embedder". Goal: the `corpus` collection holds every document from
`/lab/corpus.json` as an embedded point with payload, confirmed by the point
count matching the corpus size.

1. **Inspect the corpus** — run `python3 -c "import json; docs=json.load(open('/lab/corpus.json')); print(len(docs), 'documents'); print('first:', docs[0])"`. — expected: `15 documents` (the file's current length) plus a `first: {...}` line printing the first document object (id 1, topic `nvme`, full text). — screenshot: no. The guide explains why the number is stated as "the file's length" rather than a hardcoded 15: the success criterion is that the point count _matches the file_, so the module still holds if the provisioned corpus has a different size.

2. **Write the embedder** — enter the heredoc block exactly as shown below. Only the opening `cat` line is a backticked command; the Python script lines and the closing `PY` terminator are heredoc content — no backticks, not a shell command. The block's 3-space indent is this plan's list formatting only: in the guide the heredoc body lines and `PY` sit at column 0 (as in the dry-run material), the quoted delimiter `'PY'` prevents shell expansion, and the implementer reproduces the body line-for-line (including the empty lines). — expected: the heredoc completes silently — the prompt returns with no output and `/lab/embed.py` now exists. — screenshot: no. The guide explains why a toy hash-bucket embedder is enough for this lab: it is deterministic (same text → same vector on every run), stdlib-only (no pip, no external model service, no network — the environment has no outbound access), and — decisively — the _same_ `embed()` function embeds the corpus here and the learner's question in Module 3, so both sides of the search live in one vector space.

   ```
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
   ```

3. **Run the embedder** — run `python3 /lab/embed.py`. — expected: stdout line `15 documents embedded into 64 dimensions` (15 = corpus file length) and `/lab/points.json` written with one `{id, vector, payload}` object per document (point id = the document's `id`, payload `{topic, text}`). — screenshot: yes — image_checklist item 1.

4. **Create the collection** — run `curl -s -X PUT http://localhost:6333/collections/corpus -H 'Content-Type: application/json' -d '{"vectors": {"size": 64, "distance": "Cosine"}}'`. — expected: `{"result":true,"status":"ok","time":...}` (time variable). — screenshot: no. The guide explains: `size: 64` must match the embedder's `DIM`, and `Cosine` fits the L2-normalized vectors; Qdrant requires the collection schema to exist before any point can be upserted into it.

5. **Upsert the points** — run `curl -s -X PUT 'http://localhost:6333/collections/corpus/points?wait=true' -H 'Content-Type: application/json' -d @/lab/points.json`. — expected: `{"result":{"operation_id":1,"status":"completed"},"status":"ok","time":...}` (operation_id and time variable). — screenshot: no. The guide explains: `wait=true` blocks until the write is applied, so the count in the next step cannot race the upsert.

6. **Count the points** — run `curl -s -X POST http://localhost:6333/collections/corpus/points/count -H 'Content-Type: application/json' -d '{"count": true}'`. — expected: `{"result":{"count":15},"status":"ok","time":...}` (time variable) — and the count must equal the corpus file's length (15 here). — screenshot: yes — image_checklist item 2. The guide explains two things here: (a) the count endpoint in Qdrant 1.19 is a **POST** with a JSON body — a GET is misparsed as a point id and errors; (b) the count matching the file is the module's payoff — 15 documents in, 15 points out proves every document became exactly one point, no more, no fewer.

Checkpoint placement (6 command steps, so W004 requires at least one
`> ✅ **Checkpoint:**` line in the finished module):

- After step 3: `> ✅ **Checkpoint:**` the embedder printed `<N> documents embedded into 64 dimensions` (N = length of `/lab/corpus.json`) and `/lab/points.json` exists with N `{id, vector, payload}` entries — the text → vector half of the pipeline works before the learner invests in the API calls.
- After step 6 (module end): checkpoint stating the success criteria verbatim — the count endpoint returns `{"result":{"count":<N>},"status":"ok",...}` with N equal to the length of `/lab/corpus.json`, and every point in `corpus` carries its `{topic, text}` payload.

## Environment delta

Assumes (already true — cited, not restated):

- A running Qdrant container named `qdrant` (image `qdrant/qdrant:v1.19.0`) serving its REST API unauthenticated at `http://localhost:6333`, host port 6333 mapped to the container — Module 1's leaves-behind state (`.holagent/01-launch-qdrant/plan.md`). Qdrant runs unauthenticated on localhost per the guide's `### Lab Credentials:` block (`lab-prep.md` → Credentials), so no auth setup occurs in this module.
- `/lab/corpus.json` present, valid JSON, `{"id", "topic", "text"}` schema (`lab-prep.md` → Expected starting artifacts, Verification item 3).
- `python3` 3.12.x and `curl` on the base image (`lab-prep.md` → Preloaded software); no network access during the lab (`lab-prep.md` → Network access) — which is why the embedder is stdlib-only and why no model service or pip install appears anywhere.
- `/lab/` writable for lab artifacts (`lab-prep.md` → Expected starting artifacts).

Leaves behind (consumed by Module 3 `similarity-search`):

- The collection `corpus` in Qdrant — 64-dim Cosine vectors — holding one point per corpus document: point id = the document's `id`, vector = the embedded `text`, payload `{topic, text}`; point count equals the corpus file's length.
- `/lab/embed.py` — the deterministic stdlib embedder; Module 3 reuses the _same_ `embed()` function to embed the learner's question, so corpus and query vectors live in the same vector space.
- `/lab/points.json` — the upserted `{points: [{id, vector, payload}, ...]}` payload file (intermediate artifact; Module 3 re-embeds rather than re-reading it, but the learner can inspect it).

The environment is pre-provisioned: this module records a state transition
only — no setup, provisioning, or cleanup steps.

## Commands used (full command text, in backtick form)

In step order. The step-2 heredoc is listed here as its backticked opening
line only — the script body and the closing `PY` are heredoc content, not
shell commands (full block in the step outline):

    `python3 -c "import json; docs=json.load(open('/lab/corpus.json')); print(len(docs), 'documents'); print('first:', docs[0])"`
    `cat > /lab/embed.py <<'PY'`
    `python3 /lab/embed.py`
    `curl -s -X PUT http://localhost:6333/collections/corpus -H 'Content-Type: application/json' -d '{"vectors": {"size": 64, "distance": "Cosine"}}'`
    `curl -s -X PUT 'http://localhost:6333/collections/corpus/points?wait=true' -H 'Content-Type: application/json' -d @/lab/points.json`
    `curl -s -X POST http://localhost:6333/collections/corpus/points/count -H 'Content-Type: application/json' -d '{"count": true}'`

## Expected outputs (verbatim sample output where known)

Dry-run capture (authoring machine, 2026-08-25, `qdrant/qdrant:v1.19.0`,
15-document corpus). Variable fields are flagged; the implementer keeps the
verbatim lines as-is and flags them rather than "normalizing" them.

Step 1 — corpus inspection (15 is the file's length on this corpus; the
`text` value is real corpus content, not a placeholder):

```
15 documents
first: {'id': 1, 'topic': 'nvme', 'text': 'NVMe (Non-Volatile Memory Express) is the storage interface protocol designed for flash memory, replacing the queueing architecture inherited from spinning disks. Because each NVMe queue can hold thousands of outstanding commands, a single NVMe SSD sustains more than a million IOPS at sub-millisecond latency.'}
```

Step 2 — writing the embedder: no output (the heredoc writes
`/lab/embed.py` silently; the prompt returns).

Step 3 — embedder run (15 = corpus file length):

```
15 documents embedded into 64 dimensions
```

Step 4 — collection creation (time is variable):

```
{"result":true,"status":"ok","time":0.089687123}
```

Step 5 — upsert (operation_id and time are variable; on a fresh collection
operation_id starts at 1):

```
{"result":{"operation_id":1,"status":"completed"},"status":"ok","time":0.002628246}
```

Step 6 — point count (count must equal the corpus file length — 15 here;
time is variable):

```
{"result":{"count":15},"status":"ok","time":0.000263578}
```

## Open questions / assumptions

- Pacing: 6 steps against `est_minutes: 20` — inside the 5–8 steps / 10–20
  min band; step 2 (typing the full embedder heredoc) is the slow part, which
  is why the module sits at the top of the band rather than lower. Estimate
  kept at the parent-directed 20 — no adjustment.
- Dry-run outputs were captured on the authoring machine against
  `qdrant/qdrant:v1.19.0` (2026-08-25). Variable fields (all `time` values,
  `operation_id`, and every corpus-size-dependent number) are flagged above;
  the verbatim lines stay as captured.
- Corpus size is "~15" (guide plan open question). All outputs show 15, which
  matches the 15-document fixture at `fixtures/corpus.json`; the plan states
  the count criterion as "matches the file" everywhere, so the module still
  passes if the provisioned corpus differs.
- Two checkpoints planned (after step 3, after step 6) — required anyway
  (6 command steps ≥ 3, W004), with step 3 placed first as the "environment
  works before you invest more" checkpoint.
- `goal` is carried in the step-outline intro (frontmatter follows the
  machine contract of the approved Module 1 plan, which omits `goal`).
