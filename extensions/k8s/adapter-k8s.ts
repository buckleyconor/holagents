/**
 * Charmed Kubernetes deployment adapter (spec-k8s/03, spec-k8s/01 ARC-002).
 *
 * Wires the milestone-2…5 pieces behind the `DeploymentAdapter` boundary:
 * deterministic raw-YAML preparation, approved development deployment,
 * evidence-bearing promotion, exact-revision Argo observation, ordered test
 * suites, and GitOps-driven destruction. The adapter never writes to UAT or
 * production clusters directly (ADP-004, ADR-K8S-004), never embeds the vCD
 * Docker implementation (ADR-K8S-009), and fails closed when a required
 * dependency (policy, credentials, approval) is unavailable.
 */
import { createHash } from 'node:crypto';
import type {
  ChangeSet,
  DeploymentAdapter,
  DeployDevInput,
  DeployDevOutput,
  DestroyInput,
  DestroyOutput,
  ObserveInput,
  ObserveOutput,
  PrepareInput,
  PromoteInput,
  PromoteOutput,
  ResourceSpec,
  SuiteResult,
  TestInput,
  TestOutput,
  ValidateInput,
  ValidateOutput,
} from './adapter.ts';
import {
  TEST_SUITES,
  type Finding,
  type GateClassification,
  type GateOutcome,
  type TestSuiteId,
} from './results.ts';
import { validateProfile, type KubernetesDeploymentProfile, type YNode } from './profile.ts';
import { manifestSetDigest, parseManifestDocuments, validateManifests } from './manifests.ts';
import { canonicalDigest, toPlain } from './yaml.ts';
import { waitApplicationReady, type ArgoClient } from './argo.ts';
import type { GitLabClient } from './gitlab.ts';
import { idempotencyKey, IdempotencyStore } from './idempotency.ts';
import { evaluatePolicy, type PlatformPolicy, type RuntimeObservation } from './policy.ts';
import { runVirtualServerSuite, type ProbeTransport, type VsReport } from './virtualserver.ts';
import { runAcceptance, type AcceptanceExecutable } from './acceptance.ts';
import { promote as promoteTransition } from './promotion.ts';
import type { Clock } from './clock.ts';

const ACCEPTANCE_TIMEOUT_MS = 300000;

export interface CharmedKubernetesDependencies {
  /** The lab's deployment profile (one project per lab, GAP-001). */
  profile: KubernetesDeploymentProfile;
  gitlab: GitLabClient;
  argo: ArgoClient;
  policy: PlatformPolicy | null;
  clock: Clock;
  /** VirtualServer probe transport (the deployed app / simulator). */
  virtualServerTransport: ProbeTransport;
  /** Acceptance-script execution boundary. */
  acceptanceExecutable: AcceptanceExecutable;
  acceptanceScriptCheck: (path: string) => { exists: boolean; executable: boolean };
  /**
   * Runtime observation provider (cluster access). Absent credentials must
   * surface as `BLOCKED_CREDENTIALS` results, never as inferred passes.
   */
  observationsProvider?: (
    environment: string,
    revision: string,
  ) => Promise<RuntimeObservation[] | null>;
  runnerIdentity: string;
  idempotency?: IdempotencyStore;
  argoTimeoutMs?: number;
  argoPollIntervalMs?: number;
}

/**
 * Create the Charmed Kubernetes adapter for one lab (bound to its profile).
 * Register the result with `registerAdapter` when a pipeline selects the
 * `charmed-kubernetes` platform.
 */
export function createCharmedKubernetesAdapter(
  deps: CharmedKubernetesDependencies,
): DeploymentAdapter {
  const { profile } = deps;
  const idempotency = deps.idempotency ?? new IdempotencyStore(() => deps.clock.now());
  // Environment files prepared at each revision (path → content), kept for
  // deploy/destroy so identical inputs produce identical commits.
  const prepared = new Map<
    string,
    { files: Record<string, string>; digest: string; revision: string }
  >();

  const envOf = (environment: string) => {
    const env = profile.environments.find((e) => e.name === environment);
    if (!env) throw new Error(`unknown environment ${environment} in profile ${profile.labId}`);
    return env;
  };

  const envFiles = (
    manifests: Record<string, string>,
    environment: string,
  ): Record<string, string> => {
    const prefix = envOf(environment).manifestsPath;
    const out: Record<string, string> = {};
    for (const [path, content] of Object.entries(manifests)) {
      if (path === prefix || path.startsWith(prefix + '/')) out[path] = content;
    }
    return out;
  };

  const documentsOf = (contents: string[]): YNode[] =>
    parseManifestDocuments(contents.map((c) => c.trimEnd()).join('\n---\n')).docs;

  return {
    platform: 'charmed-kubernetes',

    async validate(input: ValidateInput): Promise<ValidateOutput> {
      const parsed = validateProfile(input.profileText);
      if (!parsed.ok) {
        return { classification: 'FAIL', findings: [], errors: parsed.errors };
      }
      if (input.manifests === undefined) {
        // Profile-level validation only. A required-but-missing policy
        // blocks the manifest stage (POL-001) even though nothing has been
        // rendered yet.
        if (parsed.profile.policy.required && input.policy === null) {
          return {
            classification: 'BLOCKED',
            subcode: 'BLOCKED_POLICY',
            findings: [
              {
                id: 'POL-001',
                severity: 'mandatory',
                expected: 'platform policy available',
                observed: 'policy unavailable',
              },
            ],
            errors: [],
          };
        }
        return { classification: 'PASS', findings: [], errors: [] };
      }
      const files = envFiles(input.manifests, input.environment);
      const contents = Object.values(files);
      if (contents.length === 0) {
        return {
          classification: 'FAIL',
          findings: [],
          errors: [
            {
              code: 'bad-value',
              message: `no manifests found under ${envOf(input.environment).manifestsPath}`,
              path: 'manifests',
            },
          ],
        };
      }
      const validation = validateManifests(
        contents,
        parsed.profile,
        input.policy,
        input.environment,
      );
      return {
        classification: validation.classification,
        subcode: validation.subcode,
        findings: validation.findings,
        errors: validation.errors,
      };
    },

    async prepare(input: PrepareInput): Promise<ChangeSet> {
      const files = envFiles(input.manifests, input.environment);
      const contents = Object.values(files);
      if (contents.length === 0)
        throw new Error(`no manifests found under ${envOf(input.environment).manifestsPath}`);
      const { docs, errors } = parseManifestDocuments(
        contents.map((c) => c.trimEnd()).join('\n---\n'),
      );
      if (errors.length > 0)
        throw new Error(`manifest parse failure: ${errors.map((e) => e.message).join('; ')}`);
      const resources: ResourceSpec[] = docs.map((doc) => {
        const plain = toPlain(doc) as Record<string, unknown>;
        const meta = (plain.metadata ?? {}) as Record<string, unknown>;
        return {
          apiVersion: String(plain.apiVersion ?? ''),
          kind: String(plain.kind ?? ''),
          name: String(meta.name ?? ''),
          namespace: typeof meta.namespace === 'string' ? meta.namespace : undefined,
          digest: canonicalDigest(doc),
        };
      });
      const digest = manifestSetDigest(
        resources.map((r) => ({ kind: r.kind, name: r.name, digest: r.digest })),
      );
      prepared.set(input.environment, { files, digest, revision: input.sourceRevision });
      return {
        environment: input.environment,
        sourceRevision: input.sourceRevision,
        resources,
        digest,
      };
    },

    async deployDev(input: DeployDevInput): Promise<DeployDevOutput> {
      const { changeSet, approval } = input;
      const env = envOf(changeSet.environment);
      // Development automation MAY only start with explicit approval (ADP-003),
      // bound to the desired-state digest.
      if (approval.approver === '' || approval.evidenceDigest !== changeSet.digest) {
        return {
          classification: 'BLOCKED',
          subcode: 'BLOCKED_APPROVAL',
          findings: [
            {
              id: 'ADP-003',
              severity: 'mandatory',
              expected: 'explicit approval bound to the change-set digest',
              observed: approval.approver === '' ? 'no approver' : 'approval digest mismatch',
            },
          ],
        };
      }
      const key = idempotencyKey({
        labId: profile.labId,
        environment: changeSet.environment,
        operation: 'deployDev',
        expectedRevision: changeSet.sourceRevision,
        desiredDigest: changeSet.digest,
      });
      const begun = idempotency.begin(key, changeSet.digest);
      if (!begun.started) return begun.outcome as DeployDevOutput;

      const stored = prepared.get(changeSet.environment);
      if (stored === undefined || stored.digest !== changeSet.digest) {
        idempotency.retry(key);
        return {
          classification: 'ERROR',
          findings: [
            {
              id: 'ADP-002',
              severity: 'mandatory',
              expected: 'prepared change set',
              observed: 'no matching prepare() for this environment/digest',
            },
          ],
        };
      }
      // Commit the approved desired state to the development branch; Argo
      // reconciles (ADP-003).
      const sha = await deps.gitlab.commit(
        profile.labId,
        env.branch,
        stored.files,
        `deploy(${changeSet.environment}): ${changeSet.sourceRevision.slice(0, 12)} @ ${changeSet.digest.slice(0, 12)}`,
        approval.approver,
      );
      const result: DeployDevOutput = { classification: 'PASS', findings: [], mergeRef: sha };
      idempotency.complete(key, result);
      return result;
    },

    async promote(input: PromoteInput): Promise<PromoteOutput> {
      const result = await promoteTransition(
        { gitlab: deps.gitlab, clock: deps.clock, idempotency },
        {
          profile,
          sourceEnvironment: input.sourceEnvironment,
          targetEnvironment: input.targetEnvironment,
          candidateRevision: input.evidence.revision,
          sourceBundle: input.evidence,
          sourceArgo: {
            application: envOf(input.sourceEnvironment).argoApplication,
            syncStatus: input.evidence.argo.syncStatus,
            healthStatus: input.evidence.argo.healthStatus,
            observedRevision: input.evidence.argo.observedRevision,
          },
          approval: input.approval ?? null,
        },
      );
      return {
        classification: result.classification,
        subcode: result.subcode,
        findings: result.reasons.map((reason) => ({
          id: 'GAP-003',
          severity: result.classification === 'FAIL' ? 'mandatory' : 'advisory',
          expected: 'evidence-bearing promotion',
          observed: reason,
        })),
        mergeRequestRef:
          result.mergeRequestIid !== undefined ? String(result.mergeRequestIid) : undefined,
      };
    },

    async observe(input: ObserveInput): Promise<ObserveOutput> {
      const env = envOf(input.environment);
      const readiness = await waitApplicationReady(
        deps.argo,
        env.argoApplication,
        input.expectedRevision,
        {
          timeoutMs: input.timeoutMs,
          pollIntervalMs: input.pollIntervalMs,
          clock: deps.clock,
        },
      );
      return {
        classification: readiness.classification,
        subcode: readiness.subcode,
        findings:
          readiness.classification !== 'PASS'
            ? [
                {
                  id: 'GAP-011',
                  severity: 'mandatory',
                  expected: `Synced/Healthy at ${input.expectedRevision}`,
                  observed: `${readiness.syncStatus}/${readiness.healthStatus} at ${readiness.observedRevision ?? 'unknown'}${readiness.timedOut ? ' (timed out)' : ''}`,
                },
              ]
            : [],
        syncStatus: readiness.syncStatus,
        healthStatus: readiness.healthStatus,
        observedRevision: readiness.observedRevision,
        durationMs: readiness.polls * input.pollIntervalMs,
      };
    },

    async test(input: TestInput): Promise<TestOutput> {
      const env = envOf(input.environment);
      const docs = input.manifests.map((m) => {
        const d = parseManifestDocuments(m);
        return d.docs[0]!;
      });
      const manifestDigest = manifestSetDigest(
        docs.map((doc) => {
          const plain = toPlain(doc) as Record<string, unknown>;
          const meta = (plain.metadata ?? {}) as Record<string, unknown>;
          return {
            kind: String(plain.kind ?? ''),
            name: String(meta.name ?? ''),
            digest: canonicalDigest(doc),
          };
        }),
      );
      let observations = input.observations;
      if (observations === undefined && deps.observationsProvider !== undefined) {
        const fetched = await deps.observationsProvider(input.environment, input.revision);
        if (fetched === null) {
          // Cluster access unavailable: the runtime portion is a blocker,
          // not an inferred pass (spec-k8s/03 §Identity and access).
          return {
            classification: 'BLOCKED',
            subcode: 'BLOCKED_CREDENTIALS',
            findings: [
              {
                id: 'ADP-006',
                severity: 'mandatory',
                expected: 'runtime observations',
                observed: 'cluster access unavailable (credentials)',
              },
            ],
            suites: [],
            skipped: [...TEST_SUITES],
          };
        }
        observations = fetched;
      }

      const suites: SuiteResult[] = [];
      const skipped: TestSuiteId[] = [];
      const requested = new Set(input.suites);

      // 1. Infrastructure and security (UAT-001 / ADP-006): static manifest
      //    checks + policy controls over static docs and runtime
      //    observations.
      if (requested.has('infrastructure')) {
        if (profile.policy.required && deps.policy === null) {
          suites.push({
            suite: 'infrastructure',
            outcome: {
              classification: 'BLOCKED',
              subcode: 'BLOCKED_POLICY',
              findings: [
                {
                  id: 'POL-001',
                  severity: 'mandatory',
                  expected: 'platform policy',
                  observed: 'unavailable',
                },
              ],
            },
          });
        } else {
          const started = deps.clock.now();
          const staticValidation = validateManifests(
            input.manifests,
            profile,
            deps.policy,
            input.environment,
          );
          const runtime =
            deps.policy !== null
              ? evaluatePolicy(
                  deps.policy,
                  input.environment,
                  [],
                  observations ?? [],
                  deps.clock.now(),
                )
              : { findings: [], mandatoryViolations: [] };
          const findings = [...staticValidation.findings, ...runtime.findings];
          const mandatoryFail =
            staticValidation.classification === 'FAIL' || runtime.mandatoryViolations.length > 0;
          const classification: GateClassification = mandatoryFail
            ? 'FAIL'
            : findings.length > 0
              ? 'PASS_WITH_WARNINGS'
              : 'PASS';
          suites.push({
            suite: 'infrastructure',
            outcome: { classification, findings: findings as Finding[] },
            metrics: { durationMs: 0 },
          });
        }
      }

      // A blocking infrastructure failure stops later suites unless this is
      // a diagnostic run (ADP-006).
      const infra = suites.find((s) => s.suite === 'infrastructure');
      if (
        infra !== undefined &&
        (infra.outcome.classification === 'FAIL' || infra.outcome.classification === 'ERROR') &&
        !input.diagnosticsOnly
      ) {
        for (const s of TEST_SUITES)
          if (s !== 'infrastructure' && requested.has(s)) skipped.push(s);
        return {
          classification: infra.outcome.classification,
          subcode: infra.outcome.subcode,
          findings: infra.outcome.findings,
          suites,
          skipped,
        };
      }

      // 2. VirtualServer access (UAT-002).
      let vsReport: VsReport | undefined;
      if (requested.has('virtualserver')) {
        const argoObs = await deps.argo.getApplication(env.argoApplication);
        vsReport = await runVirtualServerSuite(input.virtualServer, {
          transport: deps.virtualServerTransport,
          clock: deps.clock,
          environment: input.environment,
          branch: env.branch,
          expectedRevision: input.revision,
          argo: {
            application: env.argoApplication,
            observedRevision: argoObs?.observedRevision,
            syncStatus: argoObs?.syncStatus,
            healthStatus: argoObs?.healthStatus,
          },
        });
        const problems = vsReport.tests.filter((t) => t.status !== 'PASS');
        suites.push({
          suite: 'virtualserver',
          outcome: {
            classification: vsReport.aggregate,
            findings: problems.map((t) => ({
              id: t.id,
              severity: t.status === 'FAIL' ? 'mandatory' : 'advisory',
              resource: input.virtualServer.host,
              expected: 'six-test contract (spec-k8s/06)',
              observed: `status ${t.status}, http ${t.observedHttp ?? 'n/a'}`,
            })),
          },
          details: vsReport.json,
          metrics: { exitCode: vsReport.exitCode, durationMs: 5 },
        });
      }

      // 3. Repository application acceptance (UAT-003).
      if (requested.has('acceptance')) {
        const scriptCheck = deps.acceptanceScriptCheck(profile.tests.acceptance);
        const acc = await runAcceptance(
          { path: profile.tests.acceptance, requiredEnv: [], timeoutMs: ACCEPTANCE_TIMEOUT_MS },
          {
            cwd: process.cwd(),
            env: {
              HOL_ENV: input.environment,
              HOL_REVISION: input.revision,
              ...(input.acceptanceEnv ?? {}),
            },
            executable: deps.acceptanceExecutable,
            scriptExists: scriptCheck.exists,
            scriptExecutable: scriptCheck.executable,
            startedAt: deps.clock.now(),
            completedAt: deps.clock.now(),
          },
        );
        suites.push({
          suite: 'acceptance',
          outcome: {
            classification: acc.classification,
            subcode: acc.subcode,
            findings:
              acc.classification === 'FAIL'
                ? [
                    {
                      id: 'UAT-003',
                      severity: 'mandatory',
                      expected: 'exit 0',
                      observed: `exit ${acc.exitCode}`,
                    },
                  ]
                : [],
          },
          details: acc.stdout,
          metrics: { exitCode: acc.exitCode, durationMs: 0, timedOut: acc.timedOut },
        });
      }

      const classes = suites.map((s) => s.outcome.classification);
      const classification: GateClassification = classes.includes('ERROR')
        ? 'ERROR'
        : classes.includes('FAIL')
          ? 'FAIL'
          : classes.includes('BLOCKED')
            ? 'BLOCKED'
            : classes.includes('PASS_WITH_WARNINGS')
              ? 'PASS_WITH_WARNINGS'
              : 'PASS';

      return {
        classification,
        subcode: suites.find((s) => s.outcome.classification === 'BLOCKED')?.outcome.subcode,
        findings: suites.flatMap((s) => s.outcome.findings),
        suites,
        skipped,
        manifestDigest,
        virtualServer:
          vsReport !== undefined
            ? {
                markdownDigest: createHash('sha256').update(vsReport.markdown).digest('hex'),
                jsonDigest: vsReport.evidenceDigest,
                exitCode: vsReport.exitCode,
              }
            : null,
      };
    },

    async destroy(input: DestroyInput): Promise<DestroyOutput> {
      const env = envOf(input.environment);
      const head = await deps.gitlab.head(profile.labId, env.branch);
      if (head === null) return { classification: 'ERROR', findings: [] };

      const stored = prepared.get(input.environment);
      // Repeating destruction for an already absent environment is safe and
      // idempotent (ADP-007).
      if (stored === undefined || Object.keys(stored.files).length === 0) {
        return {
          classification: 'PASS',
          findings: [],
        };
      }
      if (env.consequential && input.approval.approver === '') {
        return { classification: 'BLOCKED', subcode: 'BLOCKED_APPROVAL', findings: [] };
      }
      const desiredDigest = digestOfEmpty();
      const key = idempotencyKey({
        labId: profile.labId,
        environment: input.environment,
        operation: 'destroy',
        expectedRevision: head,
        desiredDigest,
      });
      const begun = idempotency.begin(key, desiredDigest);
      if (!begun.started) return begun.outcome as DestroyOutput;

      const deletions: Record<string, string | null> = {};
      for (const path of Object.keys(stored.files)) deletions[path] = null;
      await deps.gitlab.commit(
        profile.labId,
        env.branch,
        deletions,
        `destroy(${input.environment}): remove manifests @ ${head.slice(0, 12)}`,
        input.approval.approver || 'holagent',
      );
      const result: DestroyOutput = { classification: 'PASS', findings: [] };
      idempotency.complete(key, result);
      return result;
    },
  };
}

function digestOfEmpty(): string {
  return createHash('sha256').update('{}').digest('hex');
}
