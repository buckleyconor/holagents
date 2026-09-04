# Platform interview question bank

Walk the ten categories in order. Ask what applies; skip what obviously does
not. Every answer goes into `~/.holagent/platforms/<name>/requirements.md`
with its source and a confidence (`stated` / `inferred` / `assumed`).

Batch a category's questions into one message rather than asking them one at a
time — this is a conversation with a busy team, not an interrogation.

## networking

- How does traffic reach a lab instance — ingress controller, load balancer,
  published ports, an org edge gateway? Who creates that object?
- What may a lab expose publicly, and what must stay internal?
- Is egress allowed? To the whole internet, an allowlist, or a proxy? Does the
  lab need to pull models or datasets at run time, and is that acceptable?
- How is DNS assigned — wildcard domain, per-instance hostname, IP only?
- Is east-west traffic between lab components restricted (network policies,
  segments, security groups)?
- Are there reserved ports or protocols? Anything forbidden outright?

## security

- Where must images come from, and are they scanned? What CVE severity fails?
- Are privileged containers, host mounts, host networking, or `CAP_SYS_ADMIN`
  permitted? What is the escape hatch when a workload genuinely needs one
  (GPU device plugins, for example)?
- How are secrets supplied — platform secret store, injected env, sealed
  manifests? What must never be committed?
- What identity does a lab instance run as? What RBAC is it granted, and who
  approves it?
- Is there an accepted answer for demo credentials in a throwaway lab, or do
  the production rules apply?

## storage

- Which storage classes exist, and which should a lab use?
- What persists across an instance's life, and what is wiped at teardown?
- Per-instance quotas — size, IOPS, object count?
- Is anything backed up? Should a lab assume nothing is?
- How are large read-only artifacts (models, corpora, images) shared between
  concurrent instances rather than copied per instance?

## config

- What deployment format do you accept — Helm chart, plain manifests, compose,
  OVF/OVA, Terraform? Is there a template or an example to follow?
- What must the deployment describe up front: resources, health checks,
  labels, ownership?
- Is there a CI or review step a lab must pass before it can be deployed?
- Who runs the deploy — the platform team, the lab owner, or automation?

## registry

- Which registry must images live in? How do images get there?
- Are third-party images allowed directly, or must they be mirrored?
- Tagging rules — is a floating tag (`latest`) acceptable, or must every image
  be pinned by digest?
- Retention: how long do images live, and what happens to a lab whose image is
  garbage-collected?
- Is signing or attestation required?

## tenancy

- How are concurrent instances isolated — namespace, org, VDC, cluster?
- What is the blast radius of one lab instance misbehaving?
- Do instances share anything (a registry cache, a model server, a GPU node)?
- Is there a hard cap on concurrent instances per lab or per team?

## resources

- What quotas apply per instance and per team — CPU, memory, storage, GPU?
- How is GPU allocated: whole device, MIG slice, time-sliced? Which models are
  available, and how many?
- Is oversubscription allowed? What happens when the pool is exhausted —
  queue, refuse, evict?
- Are there scheduling constraints: node pools, taints, maintenance windows?

## naming

- Naming convention for namespaces, VMs, services, volumes, images?
- Required labels/tags — owner, cost centre, expiry, project?
- How is ownership recorded so someone can find the human behind an instance?

## lifecycle

- How is an instance provisioned and torn down, and by what?
- Maximum lifetime; is there an idle reaper?
- Patching: who patches the base image, and how does a lab pick it up?
- What is the process for updating a lab that is already published?
- What is the platform's HOL code for a lab guide — the delivery format and its
  fields (or a sample of a published lab's code)? Capture it up front so the
  launch collateral is produced handoff-ready, without guessing or renaming
  after the fact.

## operations

- What monitoring and logging must a lab emit, and where does it go?
- Who is on call when a lab breaks during a customer session?
- **What do you need from us before you will onboard this lab?** Ask it in
  those words. The answer is the most actionable thing in the interview.
- What has gone wrong with labs before that you would rather not repeat?
- Who is the right person to review the next one, and how much notice do they
  need?

## Closing questions (every interview)

- What did I not ask that I should have?
- Which of these rules are hard requirements, and which are preferences you
  would accept an argument about?
- How do these rules change, and how would we find out?
