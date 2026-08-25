---
module_n: 1
slug: launch-qdrant
title: 'Launch the vector database'
depends_on: []
est_minutes: 10
image_checklist:
  - 'Terminal showing the output of curl -s http://localhost:6333/ returning HTTP 200 with the version JSON line {"title":"qdrant - vector search engine","version":"1.19.0","commit":"74f3e85b9473c62560006c043e13737ce6b48412"}'
  - 'Terminal showing the docker ps row for the qdrant container: NAMES qdrant, STATUS Up, PORTS 0.0.0.0:6333->6333/tcp, [::]:6333->6333/tcp, 6334/tcp'
success_criteria:
  - 'curl -s http://localhost:6333/ returns HTTP 200 with the version JSON {"title":"qdrant - vector search engine","version":"1.19.0",...} — the REST root endpoint is alive and the service is ready for API calls'
  - 'docker ps lists the qdrant container in Up state with the port mapping 0.0.0.0:6333->6333/tcp'
---

## Step outline (numbered; each step: action, expected result, screenshot?)

Observe-phase module: five quick verifications around one concept — "is the
lab alive" — before any data is touched.

1. **Confirm the preloaded image** — run `docker image ls qdrant/qdrant --format 'table {{.Repository}}:{{.Tag}}\t{{.Size}}'` to verify the pre-pulled image is in the local cache (no network pull). — expected: table row `qdrant/qdrant:v1.19.0` with a size (~275MB; SIZE is variable) — screenshot: no

2. **Confirm port 6333 is free before starting** — run `curl -s http://localhost:6333/`. The guide explains the refused connection as the expected prep invariant, not a failure. — expected: no output; connection refused (curl exit code 7) — screenshot: no

3. **Start Qdrant** — run `docker run -d --name qdrant -p 6333:6333 qdrant/qdrant:v1.19.0`. — expected: a 64-hex-digit container id printed (variable), no error — screenshot: no

4. **Poll the REST root endpoint until it answers** — run `curl -s http://localhost:6333/`; the first try may need a few seconds — the guide says to retry once if the output is empty. — expected: HTTP 200 with `{"title":"qdrant - vector search engine","version":"1.19.0","commit":"74f3e85b9473c62560006c043e13737ce6b48412"}` (commit is stable for the pinned tag) — screenshot: yes — image_checklist item 1

5. **Confirm the container and port mapping** — run `docker ps --filter name=qdrant --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'`. — expected: row `qdrant` / `Up <n> seconds` (counter variable) / `0.0.0.0:6333->6333/tcp, [::]:6333->6333/tcp, 6334/tcp` — screenshot: yes — image_checklist item 2

Checkpoint placement (5 command steps, so W004 requires at least one
`> ✅ **Checkpoint:**` line in the finished module):

- After step 4: `> ✅ **Checkpoint:**` the root endpoint `http://localhost:6333/` returns 200 with the version JSON (first observable artifact — verifies the environment works before the learner moves on).
- After step 5 (module end): checkpoint stating the success criteria verbatim — container `qdrant` Up with `0.0.0.0:6333->6333/tcp`, root endpoint answering with the version JSON.

## Environment delta

Assumes (already true — cited from `lab-prep.md`, not restated):

- Docker daemon running on the Ubuntu 24.04 dev sandbox baseline (`lab-prep.md` → Baseline).
- Image `qdrant/qdrant:v1.19.0` preloaded in the local Docker image cache; no network pulls during the lab (`lab-prep.md` → Preloaded software, Network access).
- `curl` on the base image (`lab-prep.md` → Preloaded software).
- Port 6333 free — `curl -s http://localhost:6333` fails with connection refused; the Qdrant container is intentionally not started at prep time (`lab-prep.md` → Verification, item 4).
- Sandbox shell login per the guide's `### Lab Credentials:` block; Qdrant itself runs unauthenticated on localhost, so no credential setup occurs in this module (`lab-prep.md` → Credentials).

Leaves behind (consumed by Module 2 `ingest-corpus` and Module 3 `similarity-search`):

- A running Qdrant container named `qdrant` (image `qdrant/qdrant:v1.19.0`) serving its REST API unauthenticated at `http://localhost:6333`, with host port 6333 mapped to the container.

The environment is pre-provisioned: this module records a state transition only — no setup, provisioning, or cleanup steps.

## Commands used (full command text, in backtick form)

The root-endpoint curl is used twice: step 2 (pre-start; expected refusal)
and step 4 (post-start; expected 200). Commands in step order:

    `docker image ls qdrant/qdrant --format 'table {{.Repository}}:{{.Tag}}\t{{.Size}}'`
    `curl -s http://localhost:6333/`
    `docker run -d --name qdrant -p 6333:6333 qdrant/qdrant:v1.19.0`
    `curl -s http://localhost:6333/`
    `docker ps --filter name=qdrant --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'`

## Expected outputs (verbatim sample output where known)

Step 1 — image confirmation (SIZE variable, ~275MB; tag stable):

```
REPOSITORY:TAG          SIZE
qdrant/qdrant:v1.19.0   275MB
```

Step 2 — port check before start: no output. Connection refused (curl exit
code 7) — the expected prep invariant, not an error state for the learner to
diagnose.

Step 3 — container start: a 64-hex-digit container id (variable). Signal: the
long hex id, no error.

Step 4 — REST root endpoint (HTTP 200; commit stable for the pinned tag;
first try may need a few seconds — the guide says to retry once if empty):

```
{"title":"qdrant - vector search engine","version":"1.19.0","commit":"74f3e85b9473c62560006c043e13737ce6b48412"}
```

Step 5 — container and port mapping (the `Up <n> seconds` counter is
variable):

```
NAMES   STATUS          PORTS
qdrant  Up 6 seconds    0.0.0.0:6333->6333/tcp, [::]:6333->6333/tcp, 6334/tcp
```

## Open questions / assumptions

- Pacing: 5 steps against `est_minutes: 10` — parent-directed (the five
  commands are fixed verbatim). Each step is a single fast command with low
  likelihood of failure, so the count sits at the top of the 5–10 min short
  band without stretching the estimate.
- Dry-run outputs were captured on the authoring machine against
  `qdrant/qdrant:v1.19.0` (2026-08-25). Variable fields (SIZE, container id,
  `Up` seconds counter) are flagged above; the implementer keeps the verbatim
  lines as-is and flags them, rather than "normalizing" them.
