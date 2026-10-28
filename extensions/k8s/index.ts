/**
 * Charmed Kubernetes extension (spec-k8s/).
 *
 * Milestone 1: deployment profile schema and validator, shared result/
 * evidence contracts, operational/promotion/UAT state machines, and the
 * deployment adapter boundary.
 * Milestones 2–5: deterministic raw-YAML generation and static validation,
 * GitLab project/MR contracts, Argo exact-revision readiness, test
 * orchestration (policy-driven infrastructure suite, VirtualServer runner,
 * acceptance contract, evidence bundles), and UAT/promotion/rollback.
 *
 * Nothing here is registered with the hol extension; selection of the
 * `charmed-kubernetes` platform is a pipeline decision (see spec-k8s/STATUS.md).
 */
export * from './results.ts';
export * from './states.ts';
export * from './profile.ts';
export * from './adapter.ts';
export * from './clock.ts';
export * from './redact.ts';
export * from './yaml.ts';
export * from './policy.ts';
export * from './manifests.ts';
export * from './gitlab.ts';
export * from './argo.ts';
export * from './idempotency.ts';
export * from './virtualserver.ts';
export * from './acceptance.ts';
export * from './bundle.ts';
export * from './uat.ts';
export * from './promotion.ts';
export * from './adapter-k8s.ts';
