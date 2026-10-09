/**
 * The GAP lifecycle as data.
 *
 * The protocol defines six lifecycle steps across three planes, and three
 * further decisions an authority can record in the release plane (a release
 * approval, a release rejection, and a release withdrawal). An application
 * groups these into its own actions; see application.ts. This module only
 * names the steps so an action can say which ones it performs, and so the
 * documentation site and an MCP client can show that.
 *
 * Nothing here enforces a step. Each domain module under ../domains still
 * applies the draft's requirements itself; this is a vocabulary, not a rule
 * engine.
 */

export type Plane = 'configuration' | 'authoring' | 'release';

export type Role = 'author' | 'authority' | 'implementation' | 'consumer';

export type StepId =
  | 'propose-profile'
  | 'ratify-profile'
  | 'create-version'
  | 'authorize-release'
  | 'release'
  | 'verify'
  | 'approve-release'
  | 'reject-release'
  | 'withdraw-release';

export type Step = {
  id: StepId;
  /** The six numbered steps of the draft's Lifecycle section, or a decision record an authority may add. */
  kind: 'lifecycle' | 'decision';
  /** 1 to 6 for lifecycle steps; absent for decisions. */
  number?: number;
  title: string;
  /** Short verb phrase used inside tool descriptions, e.g. "authorize". */
  label: string;
  /** Two or three words for a chip on the documentation site, e.g. "Authorize". */
  chip: string;
  /** One plain sentence saying what the step is, for lists on the documentation site. */
  gloss: string;
  plane: Plane;
  /** The protocol role that performs the step. */
  role: Role;
  /** Heading anchor in specification/draft/README.md. */
  anchor: string;
  summary: string;
};

export const PLANES: Record<Plane, { title: string; summary: string }> = {
  configuration: { title: 'Configuration', summary: 'Proposed and ratified profile revisions.' },
  authoring: { title: 'Authoring', summary: 'Immutable artifact versions, each pinned to one ratified revision.' },
  release: { title: 'Release', summary: 'Release approvals and rejections, the exact authorization, the released version, the consumer boundary, and any withdrawal.' },
};

export const STEPS: readonly Step[] = [
  {
    id: 'propose-profile', kind: 'lifecycle', number: 1, title: 'Propose a profile', label: 'propose a profile', chip: 'Propose a profile',
    plane: 'configuration', role: 'author', anchor: '1-propose-a-profile',
    gloss: 'Say what fields the content must follow.',
    summary: 'An Author proposes a profile revision: the fields, types, and limits content must follow. A proposal grants nothing.',
  },
  {
    id: 'ratify-profile', kind: 'lifecycle', number: 2, title: 'Ratify the exact profile revision', label: 'ratify a profile revision', chip: 'Ratify a revision',
    plane: 'configuration', role: 'authority', anchor: '2-ratify-the-exact-profile-revision',
    gloss: 'Approve one exact profile revision.',
    summary: 'A configured Authority approves one exact profile revision, bound to its digest. Content can be authored against it afterwards.',
  },
  {
    id: 'create-version', kind: 'lifecycle', number: 3, title: 'Draft immutable artifact versions', label: 'create a version', chip: 'Create a version',
    plane: 'authoring', role: 'author', anchor: '3-draft-immutable-artifact-versions',
    gloss: 'Save an immutable version of the content.',
    summary: 'An Author creates an immutable artifact version pinned to a ratified revision. It is a draft until released.',
  },
  {
    id: 'authorize-release', kind: 'lifecycle', number: 4, title: 'Authorize one exact version', label: 'authorize', chip: 'Authorize',
    plane: 'release', role: 'authority', anchor: '4-authorize-one-exact-version',
    gloss: 'Permit release of one exact version.',
    summary: 'A configured Authority authorizes one exact stored version, bound to its subject digest.',
  },
  {
    id: 'release', kind: 'lifecycle', number: 5, title: 'Commit the release transition', label: 'release', chip: 'Release',
    plane: 'release', role: 'implementation', anchor: '5-commit-the-release-transition',
    gloss: 'Make the authorized version available to readers.',
    summary: 'The Implementation makes the authorized version available through the consumer boundary, atomically with its authorization.',
  },
  {
    id: 'verify', kind: 'lifecycle', number: 6, title: 'Read and verify', label: 'read and verify', chip: 'Read and verify',
    plane: 'release', role: 'consumer', anchor: '6-read-and-verify',
    gloss: 'Read it back and check its proof.',
    summary: 'A Consumer reads a released version and checks its release proof against its own trust configuration.',
  },
  {
    id: 'approve-release', kind: 'decision', title: 'Record a release approval', label: 'record a release approval', chip: 'Approval',
    plane: 'release', role: 'authority', anchor: 'release-approval',
    gloss: 'Record that a version is approved for release, before it is authorized.',
    summary: 'A configured approval authority records that one exact version is approved for release. It releases nothing.',
  },
  {
    id: 'reject-release', kind: 'decision', title: 'Record a release rejection', label: 'record a release rejection', chip: 'Rejection',
    plane: 'release', role: 'authority', anchor: 'release-rejection',
    gloss: 'Record that a version is not approved, before it is authorized.',
    summary: 'A configured approval authority records that one exact version is not approved. It releases, withdraws, and blocks nothing.',
  },
  {
    id: 'withdraw-release', kind: 'decision', title: 'Withdraw a released version', label: 'withdraw a release', chip: 'Withdrawal',
    plane: 'release', role: 'authority', anchor: 'release-withdrawal',
    gloss: 'Record that a released version should no longer be relied on.',
    summary: 'A configured withdrawal authority records that a released version should no longer be relied on. The release and its proof do not change.',
  },
];

const byId = new Map(STEPS.map((step) => [step.id, step]));

export function step(id: StepId): Step {
  const found = byId.get(id);
  if (!found) throw new Error(`unknown lifecycle step or release decision: ${id}`);
  return found;
}

export function isStepId(value: unknown): value is StepId {
  return typeof value === 'string' && byId.has(value as StepId);
}

/**
 * One or two sentences for a tool description, so an MCP client sees which
 * lifecycle steps a tool performs and which release decisions it records:
 * "GAP lifecycle steps: 4 authorize, 5 release." or
 * "GAP release decisions: record a release approval." The three decisions are
 * never called steps.
 */
export function describeSteps(ids: readonly StepId[]): string {
  if (ids.length === 0) return 'Performs no GAP lifecycle step and records no release decision.';
  const all = ids.map(step);
  const steps = all.filter((s) => s.kind === 'lifecycle').map((s) => `${s.number} ${s.label}`);
  const decisions = all.filter((s) => s.kind === 'decision').map((s) => s.label);
  const parts: string[] = [];
  if (steps.length > 0) parts.push(`GAP lifecycle steps: ${steps.join(', ')}.`);
  if (decisions.length > 0) parts.push(`GAP release decisions: ${decisions.join(', ')}.`);
  return parts.join(' ');
}
