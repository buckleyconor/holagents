# Lab prep — HOL-2000-01 Store and Search an Embedded Document Corpus

Handoff artifact for the (out-of-scope) environment provisioning team.
Everything below is provisioned **before** the learner starts; the guide never
installs, provisions, or mutates the environment. Keep this file in lockstep
with the `environment` block in `.holagent/plan.md` and with the guide's
`### Lab Credentials:` block (single source of truth for credentials/hosts).

## Baseline

- Image / OS: dev sandbox container, Ubuntu 24.04
- Kernel / runtime notes: Docker 29.x with the daemon running; python3
  (3.12.x) and curl on the base image; no GPU, no Kubernetes. Fully
  pre-wired — no learner network config and no image pulls during the lab.

## Preloaded software

| Component           | Version                       | Where                               |
| ------------------- | ----------------------------- | ----------------------------------- |
| Docker              | 29.x                          | /usr/bin/docker (daemon running)    |
| Qdrant Docker image | qdrant/qdrant (pin exact tag) | local image cache (docker image ls) |
| python3             | 3.12.x (Ubuntu 24.04 base)    | /usr/bin/python3                    |
| curl                | Ubuntu 24.04 base             | /usr/bin/curl                       |

## Credentials

| User     | Password     | Applies to                                                            |
| -------- | ------------ | --------------------------------------------------------------------- |
| demouser | Password123! | sandbox shell login (Qdrant itself runs unauthenticated on localhost) |

## URLs, hosts & ports

| URL / host:port       | Purpose                                                               |
| --------------------- | --------------------------------------------------------------------- |
| http://localhost:6333 | Qdrant REST API (unauthenticated; started by the learner in Module 1) |

## Network access

- Fully pre-wired — no learner network config; no outbound image pulls during
  the lab (the `qdrant/qdrant` image is pre-pulled and the corpus is a local
  file).

## Expected starting artifacts

- `/lab/corpus.json` — small document corpus (~15 short documents on
  storage/AI infrastructure), valid JSON
- `/lab/` — writable working directory for lab artifacts (embedder helper,
  question files)

## Verification

The environment is ready when:

1. `docker info` succeeds and `docker image ls qdrant/qdrant` lists the
   pre-pulled image
2. `python3 --version` and `curl --version` both succeed
3. `python3 -m json.tool /lab/corpus.json > /dev/null` succeeds (valid JSON)
   and the file holds ~15 short documents on storage/AI infrastructure
4. Port 6333 is free — `curl -s http://localhost:6333` fails with connection
   refused. The Qdrant container is intentionally **not** started at prep
   time: Module 1 of the guide starts it, and that module's first checkpoint
   is this same command returning 200.
