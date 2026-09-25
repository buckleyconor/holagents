/**
 * Charmed Kubernetes extension contracts (spec-k8s/). Milestone 1:
 * deployment profile schema and validator, shared result/evidence
 * contracts, operational/promotion/UAT state machines, and the deployment
 * adapter boundary. Nothing here is wired into the hol extension yet.
 */
export * from './results.ts';
export * from './states.ts';
export * from './profile.ts';
export * from './adapter.ts';
