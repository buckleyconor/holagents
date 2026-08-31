---
name: lab-sizing
description: Shrinking a solution to the smallest footprint that still demonstrates it, and working out how many instances fit. Use when drafting or revising sizing.md (sizing-architect, /hol-concept), or when judging whether a footprint is realistic and honestly reduced.
---

# Lab Sizing

Labs run many at once, in a fixed pool. Every gigabyte of vRAM in one instance
is multiplied by the concurrency target, so sizing is not a formality — it
decides how many people can take the lab at all.

The goal is **the smallest footprint that still tells the story in
`concept.md`**. Not the smallest footprint. The story is the constraint.

## Method

1. **Size production honestly first.** Write down what a real deployment needs,
   before reducing anything. Without it, the reduction has no baseline and the
   lab quietly becomes a toy that misrepresents the product.
2. **Walk the beats.** For each beat in the concept, ask what it actually
   requires. Beats that need a GPU are rare; beats that need _a visible result_
   are all of them.
3. **Cut to the beat, not to the floor.** Reduce each component until the next
   cut would break a beat — then stop and record what would break.
4. **Multiply.** Per-instance × concurrency target. Find what runs out first.
5. **Share what can be shared.** Then re-check density.

## Where the reductions usually are

| Lever                 | Typical reduction                                                     | What it costs                                                    |
| --------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Model size            | A 70B swapped for an 8B, or a distilled variant                       | Output quality — fine if the beat shows _behaviour_, not quality |
| Quantisation          | FP16 → FP8/INT8/NVFP4                                                 | Accuracy at the margins; often invisible in a demo               |
| Replica count         | HA triples → 1                                                        | The failover beat, if there is one — keep 2 if there is          |
| Dataset size          | Full corpus → a curated tens-of-items sample                          | Nothing, if the sample is chosen to make the results legible     |
| Retention / history   | Months → hours                                                        | Long-horizon beats; usually none                                 |
| Node count            | Multi-node cluster → single node                                      | Topology beats; keep 2 nodes if the story is about distribution  |
| Precomputation        | Train at lab time → ship a trained checkpoint, train only a small one | Time, in the learner's favour                                    |
| Service consolidation | Separate services → one container                                     | Realism of the architecture diagram; note it in the guide        |

**Never reduce:** anything the aha moment runs through. If the reveal depends on
it, it stays at whatever size makes the reveal convincing.

## Shared vs per-tenant

Shared across all instances (size once): image registry, model cache and
weights, read-only datasets, base images, license servers.

Per-instance (multiplied): running containers, vRAM, writable volumes, databases
holding learner state, anything the learner mutates.

Getting a model cache from per-instance to shared is usually the single largest
density win available.

## Density

State it explicitly, because it is the number the platform team will ask for:

- per-instance footprint, per resource;
- the concurrency target;
- the aggregate;
- **what runs out first**, and at what N.

"8 concurrent instances at 12 GB vRAM each = 96 GB; vRAM is the binding
constraint on a 96 GB card, so 8 is the ceiling with no headroom — 6 is the
safe target" is a useful sizing. "Should be fine" is not.

## Honesty rules

- An estimated number is an assumption. Put it in **Open questions &
  assumptions**, not silently in a table.
- Record versions, not "latest". `latest` is not a footprint and will not
  reproduce.
- If the demo footprint misrepresents how the product actually deploys, say so
  in the guide rather than hiding it — a learner who later sizes production
  from the lab will be wrong, and that costs more than the admission.
- Ephemeral beats persistent wherever the learner does not need state to
  survive a restart.

## Handoff

`sizing.md` is what `/hol-spec` derives `lab-prep.md` from — the machine-readable
environment contract (ADR-011). Anything vague here becomes an unverifiable
`verify` check there, so name concrete images, versions, paths, ports, and
observable readiness conditions.
