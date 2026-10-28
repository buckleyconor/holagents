/**
 * GitLab contract (spec-k8s/04 GAP-001..GAP-003; spec-k8s/03 §Identity and
 * access). One project per lab; branches represent environments; promotion
 * happens through evidence-bearing merge requests with human approval on
 * consequential branches — never by direct writes.
 *
 * `InMemoryGitLab` implements the same contract for contract/integration
 * tests (spec-k8s/08 test strategy). The live GitLab client is a later
 * integration; until DEP-004 (protection/approval rules) is confirmed the
 * live path is out of scope and every operation that would need it fails
 * closed.
 */
import { createHash } from 'node:crypto';
import { redactText } from './redact.ts';
import type { Clock } from './clock.ts';
import { realClock } from './clock.ts';

export interface ApprovalRecord {
  approver: string;
  revision: string;
  transition: string;
  /** ISO 8601. */
  timestamp: string;
  evidenceDigest: string;
}

export interface MergeRequest {
  iid: number;
  project: string;
  sourceBranch: string;
  targetBranch: string;
  title: string;
  description: string;
  /** The immutable candidate revision this MR proposes (GAP-003). */
  candidateRevision: string;
  state: 'opened' | 'merged' | 'closed';
  approvals: ApprovalRecord[];
  mergedRevision?: string;
  createdAt: string;
}

export interface ProjectProvision {
  project: string;
  baseRevision: string;
  /** Branches created, one per profile environment. */
  branches: string[];
  /** Branches that require approval before merge (consequential). */
  protectedBranches: string[];
}

export interface GitLabClient {
  /** One project per lab (GAP-001); idempotent. */
  ensureProject(
    labId: string,
    envBranches: { name: string; consequential: boolean }[],
  ): Promise<ProjectProvision>;
  head(project: string, branch: string): Promise<string | null>;
  commit(
    project: string,
    branch: string,
    /** Path → content; `null` deletes the path. */
    files: Record<string, string | null>,
    message: string,
    author: string,
  ): Promise<string>;
  createMergeRequest(
    project: string,
    input: {
      sourceBranch: string;
      targetBranch: string;
      title: string;
      description: string;
      candidateRevision: string;
    },
  ): Promise<MergeRequest>;
  approveMergeRequest(project: string, iid: number, approval: ApprovalRecord): Promise<void>;
  /** Enforces branch protection; returns the merged revision. */
  mergeMergeRequest(project: string, iid: number): Promise<string>;
  getMergeRequest(project: string, iid: number): Promise<MergeRequest | null>;
}

// --- in-memory implementation -------------------------------------------------

interface ProjectState {
  project: string;
  files: Map<string, Map<string, string>>; // branch -> path -> content
  heads: Map<string, string>;
  protectedBranches: Set<string>;
  commits: number;
  mrs: Map<number, MergeRequest>;
  nextMrIid: number;
}

export class InMemoryGitLab implements GitLabClient {
  private projects = new Map<string, ProjectState>();
  private clock: Clock;

  constructor(clock: Clock = realClock) {
    this.clock = clock;
  }

  async ensureProject(
    labId: string,
    envBranches: { name: string; consequential: boolean }[],
  ): Promise<ProjectProvision> {
    const existing = this.projects.get(labId);
    if (existing) {
      return {
        project: labId,
        baseRevision: existing.heads.get('dev') ?? 'gen0',
        branches: [...envBranches.map((b) => b.name)],
        protectedBranches: [...existing.protectedBranches],
      };
    }
    const state: ProjectState = {
      project: labId,
      files: new Map(),
      heads: new Map(),
      protectedBranches: new Set(envBranches.filter((b) => b.consequential).map((b) => b.name)),
      commits: 0,
      mrs: new Map(),
      nextMrIid: 1,
    };
    this.projects.set(labId, state);
    state.files.set('dev', new Map());
    const baseRevision = this.commitNow(
      labId,
      'dev',
      {},
      'chore: initialize lab repository',
      'holagent',
    );
    for (const b of envBranches) {
      if (b.name !== 'dev') {
        state.files.set(b.name, new Map(Object.entries(state.files.get('dev')!)));
        state.heads.set(b.name, baseRevision);
      }
    }
    return {
      project: labId,
      baseRevision,
      branches: envBranches.map((b) => b.name),
      protectedBranches: [...state.protectedBranches],
    };
  }

  private commitNow(
    project: string,
    branch: string,
    files: Record<string, string | null>,
    message: string,
    author: string,
  ): string {
    const state = this.projects.get(project);
    if (!state) throw new Error(`unknown project ${project}`);
    const current = state.files.get(branch);
    if (!current) throw new Error(`unknown branch ${branch} in ${project}`);
    const next = new Map(current);
    for (const [path, content] of Object.entries(files)) {
      if (content === null) next.delete(path);
      else next.set(path, content);
    }
    state.files.set(branch, next);
    state.commits += 1;
    const payload = JSON.stringify({
      branch,
      author,
      message,
      files: [...next.entries()].sort(([a], [b]) => a.localeCompare(b)),
    });
    const sha = createHash('sha256').update(payload).digest('hex');
    state.heads.set(branch, sha);
    return sha;
  }

  async head(project: string, branch: string): Promise<string | null> {
    return this.projects.get(project)?.heads.get(branch) ?? null;
  }

  async commit(
    project: string,
    branch: string,
    files: Record<string, string | null>,
    message: string,
    author: string,
  ): Promise<string> {
    return this.commitNow(project, branch, files, message, author);
  }

  async createMergeRequest(
    project: string,
    input: {
      sourceBranch: string;
      targetBranch: string;
      title: string;
      description: string;
      candidateRevision: string;
    },
  ): Promise<MergeRequest> {
    const state = this.projects.get(project);
    if (!state) throw new Error(`unknown project ${project}`);
    const sourceHead = state.heads.get(input.sourceBranch);
    if (sourceHead === undefined) throw new Error(`unknown branch ${input.sourceBranch}`);
    // The candidate revision must be the branch head at MR time; a moved
    // branch means the candidate is stale and the MR must not be opened
    // against the wrong revision (GAP-003).
    if (sourceHead !== input.candidateRevision)
      throw new Error(
        `candidate revision ${input.candidateRevision} is not the head of ${input.sourceBranch} (${sourceHead})`,
      );
    const mr: MergeRequest = {
      iid: state.nextMrIid++,
      project,
      sourceBranch: input.sourceBranch,
      targetBranch: input.targetBranch,
      title: input.title,
      description: redactText(input.description),
      candidateRevision: input.candidateRevision,
      state: 'opened',
      approvals: [],
      createdAt: this.clock.now(),
    };
    state.mrs.set(mr.iid, mr);
    return mr;
  }

  async approveMergeRequest(project: string, iid: number, approval: ApprovalRecord): Promise<void> {
    const mr = this.projects.get(project)?.mrs.get(iid);
    if (!mr) throw new Error(`unknown merge request !${iid}`);
    if (mr.state !== 'opened') throw new Error(`merge request !${iid} is ${mr.state}`);
    // Approvals bind to the candidate revision; a moved candidate voids them.
    if (approval.revision !== mr.candidateRevision)
      throw new Error(
        `approval for revision ${approval.revision} does not bind to candidate ${mr.candidateRevision}`,
      );
    mr.approvals.push(approval);
  }

  async mergeMergeRequest(project: string, iid: number): Promise<string> {
    const state = this.projects.get(project)!;
    const mr = state.mrs.get(iid);
    if (!mr) throw new Error(`unknown merge request !${iid}`);
    if (mr.state !== 'opened') throw new Error(`merge request !${iid} is ${mr.state}`);
    const sourceHead = state.heads.get(mr.sourceBranch);
    if (sourceHead !== mr.candidateRevision)
      throw new Error(
        `merge blocked: ${mr.sourceBranch} moved past the approved candidate revision`,
      );
    if (state.protectedBranches.has(mr.targetBranch)) {
      if (mr.approvals.length === 0)
        throw new Error(`merge blocked: ${mr.targetBranch} requires approval (branch protection)`);
    }
    // Fast-forward the target to the candidate revision's content.
    const candidateFiles = state.files.get(mr.sourceBranch)!;
    const target = state.files.get(mr.targetBranch)!;
    const merged = new Map(target);
    for (const [path, content] of candidateFiles.entries()) merged.set(path, content);
    state.files.set(mr.targetBranch, merged);
    state.commits += 1;
    const payload = JSON.stringify({
      branch: mr.targetBranch,
      message: `merge !${mr.iid}`,
      files: [...merged.entries()].sort(([a], [b]) => a.localeCompare(b)),
    });
    const sha = createHash('sha256').update(payload).digest('hex');
    state.heads.set(mr.targetBranch, sha);
    mr.state = 'merged';
    mr.mergedRevision = sha;
    return sha;
  }

  async getMergeRequest(project: string, iid: number): Promise<MergeRequest | null> {
    return this.projects.get(project)?.mrs.get(iid) ?? null;
  }
}

// --- promotion merge-request description (GAP-003) ----------------------------

export interface PromotionMrFields {
  sourceEnvironment: string;
  targetEnvironment: string;
  candidateRevision: string;
  targetRevision: string;
  manifestDigest: string;
  policyDigest: string;
  argo: { syncStatus: string; healthStatus: string; observedRevision: string };
  evidence: {
    infrastructure: string;
    virtualServer: string;
    acceptance: string;
  };
  warnings: string[];
  blockers: string[];
  approvalStatus: string;
  /** ISO 8601 timestamp of the evidence run. */
  evidenceAt: string;
}

/**
 * Deterministic, secret-free merge-request description carrying every field
 * GAP-003 requires. Evidence for another revision must not authorize merge
 * — the candidate revision is stated and approvals bind to it.
 */
export function buildPromotionMrDescription(f: PromotionMrFields): string {
  const lines = [
    `## Promotion: ${f.sourceEnvironment} -> ${f.targetEnvironment}`,
    '',
    `| Field | Value |`,
    `| --- | --- |`,
    `| Candidate revision | \`${f.candidateRevision}\` |`,
    `| Target revision (current) | \`${f.targetRevision}\` |`,
    `| Manifest digest | \`${f.manifestDigest}\` |`,
    `| Policy digest | \`${f.policyDigest || 'n/a'}\` |`,
    `| Argo (source) | ${f.argo.syncStatus} / ${f.argo.healthStatus} at \`${f.argo.observedRevision}\` |`,
    `| Evidence at | ${f.evidenceAt} |`,
    '',
    `### Test evidence (source environment)`,
    '',
    `- Infrastructure/security: **${f.evidence.infrastructure}**`,
    `- VirtualServer access: **${f.evidence.virtualServer}**`,
    `- Application acceptance: **${f.evidence.acceptance}**`,
    '',
    `### Warnings`,
    '',
    ...(f.warnings.length ? f.warnings.map((w) => `- ${w}`) : ['- none']),
    '',
    `### Blockers`,
    '',
    ...(f.blockers.length ? f.blockers.map((b) => `- ${b}`) : ['- none']),
    '',
    `### Approval status`,
    '',
    f.approvalStatus,
    '',
    'Evidence for another revision does not authorize this merge (spec-k8s/04 GAP-003).',
  ];
  return redactText(lines.join('\n'));
}
