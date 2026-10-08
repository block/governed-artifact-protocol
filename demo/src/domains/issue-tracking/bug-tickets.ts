import { createHash } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import { canonicalJson } from './digests.js';
import type { Actor } from './model.js';
import { initializeWorkspace, readWorkspace, workspacePath, writeWorkspace } from './workspace.js';

type Status = 'to_do' | 'in_progress' | 'done';
export type BugPayload = { title: string; description: string; acceptanceCriteria: string[]; status: Status };
type Pin = { profileId: string; revision: number; digest: string };
type Artifact = { artifactId: string; artifactVersion: number; payload: BugPayload; profile: Pin; authoredBy: Actor };
// reason is the optional GAP decision reason (draft, Primitives). On a save that marks the ticket done, this application carries the
// assignee's description of the check performed there, so it travels with the release proof; it is attributed text, not proof that the fix works.
type Authorization = { artifactId: string; artifactVersion: number; payloadDigest: string; profile: Pin; authorizedBy: Actor; authorizedAt: string; reason?: string; authorizationSubjectDigest: string };
export type Proof = { profile: typeof bugProfile; authorization: Authorization; release: Omit<Artifact, 'authoredBy'> };
// The authored immutable version is retained behind the release boundary, not carried in the consumer proof.
type StoredRelease = Proof & { artifact: Artifact };
type State = { history: StoredRelease[]; selections: { artifactId: string; artifactVersion: number; previousVersion: number }[] };
const digest = (domain: string, value: any) => `sha256:${createHash('sha256').update(`${domain}\n${canonicalJson(value)}`).digest('hex')}`;
const payloadDigest = (payload: BugPayload) => digest('governed-artifact.payload.v1', payload);
const textRule = { type: 'string', minLength: 1, maxLength: 5000 };
const semantics = {
  profileId: 'bug-ticket', revision: 1,
  payloadContract: { type: 'object', properties: { title: textRule, description: textRule, acceptanceCriteria: { type: 'array', maxItems: 20, items: textRule }, status: { type: 'string', enum: ['to_do', 'in_progress', 'done'] } }, required: ['title', 'description', 'acceptanceCriteria', 'status'], additionalProperties: false },
};
export const bugProfile = { ...semantics, digest: digest('governed-artifact.profile-revision.draft', semantics), ratification: { actorId: 'human:workflow-owner', actorKind: 'human', ratifiedAt: '2026-09-10T00:00:00.000Z' } };
const pin: Pin = { profileId: bugProfile.profileId, revision: 1, digest: bugProfile.digest };
export const permissions = [
  { actorId: 'agent:requester', actorKind: 'agent', create: true, update: false, complete: false },
  { actorId: 'agent:assignee', actorKind: 'agent', create: false, update: true, complete: true },
  { actorId: 'human:workflow-owner', actorKind: 'human', create: true, update: true, complete: true },
] as const;
export const bugPolicy = { profile: bugProfile, permissions, currentSelection: 'application-local append-only save order with expected-version checks; not portable GAP supersession', evidence: 'local actor attribution, not authenticated or signed authority', workingCopies: 'application-local staging outside GAP records; a working copy is not an artifact version and is never readable as the ticket' };
export function validatePayload(payload: BugPayload) {
  if (!payload || Object.keys(payload).sort().join(',') !== 'acceptanceCriteria,description,status,title') throw new Error('bug ticket payload requires exactly title, description, acceptanceCriteria, status');
  const text = (value: unknown) => typeof value === 'string' && value.trim().length > 0 && [...value].length <= 5000;
  if (!text(payload.title) || !text(payload.description) || !Array.isArray(payload.acceptanceCriteria) || payload.acceptanceCriteria.length > 20 || !payload.acceptanceCriteria.every(text)) throw new Error('bug ticket text must be nonempty and bounded; at most 20 criteria');
  if (!['to_do', 'in_progress', 'done'].includes(payload.status)) throw new Error('invalid ticket status');
}
function subject(artifact: Artifact) { return { artifactId: artifact.artifactId, artifactVersion: artifact.artifactVersion, payloadDigest: payloadDigest(artifact.payload), profile: artifact.profile }; }
function exactKeys(value: object, keys: string[]) {
  if (!value || Object.keys(value).sort().join(',') !== keys.sort().join(',')) throw new Error('malformed bug ticket proof record');
}
function verify(record: StoredRelease): Proof {
  exactKeys(record, ['profile', 'artifact', 'authorization', 'release']);
  const { artifact, profile, authorization, release } = record;
  exactKeys(artifact, ['artifactId', 'artifactVersion', 'payload', 'profile', 'authoredBy']);
  exactKeys(authorization, ['artifactId', 'artifactVersion', 'payloadDigest', 'profile', 'authorizedBy', 'authorizedAt', 'authorizationSubjectDigest', ...('reason' in authorization ? ['reason'] : [])]);
  exactKeys(authorization.authorizedBy, ['actorId', 'actorKind']);
  if ('reason' in authorization && !(typeof authorization.reason === 'string' && authorization.reason.trim().length > 0 && [...authorization.reason].length <= 5000)) throw new Error('malformed bug ticket authorization reason');
  if (typeof artifact.artifactId !== 'string' || !artifact.artifactId.trim() || !Number.isSafeInteger(artifact.artifactVersion) || artifact.artifactVersion < 1 || typeof authorization.authorizedAt !== 'string' || !Number.isFinite(Date.parse(authorization.authorizedAt))) throw new Error('malformed bug ticket identity or authorization time');
  validatePayload(artifact.payload);
  const expected = subject(artifact);
  if (canonicalJson(profile) !== canonicalJson(bugProfile) || canonicalJson(artifact.profile) !== canonicalJson(pin) || canonicalJson(release) !== canonicalJson({ artifactId: artifact.artifactId, artifactVersion: artifact.artifactVersion, payload: artifact.payload, profile: pin }) ||
    Object.entries(expected).some(([key, value]) => canonicalJson((authorization as any)[key]) !== canonicalJson(value as any)) ||
    authorization.authorizationSubjectDigest !== digest('governed-artifact.authorization-subject.v1', expected) ||
    !permissions.some((p) => p.actorId === authorization.authorizedBy.actorId && p.actorKind === authorization.authorizedBy.actorKind && (artifact.artifactVersion === 1 ? p.create : p.update) && (artifact.payload.status !== 'done' || p.complete))) throw new Error('bug ticket release proof failed exact binding or configured authority');
  return structuredClone({ profile, authorization, release });
}
function state(value: Record<string, unknown>): State {
  const data = value.bugTickets as State | undefined;
  if (data === undefined) return { history: [], selections: [] };
  if (!Array.isArray(data.history) || !Array.isArray(data.selections)) throw new Error('invalid bug ticket state');
  return data;
}
function current(data: State, artifactId: string): Proof | undefined {
  let version = 0;
  for (const selection of data.selections.filter((item) => item.artifactId === artifactId)) {
    if (selection.previousVersion !== version || selection.artifactVersion !== version + 1) throw new Error('ambiguous bug ticket current selection');
    const proofs = data.history.filter((item) => item.release.artifactId === artifactId && item.release.artifactVersion === selection.artifactVersion);
    if (proofs.length !== 1) throw new Error('missing or ambiguous selected bug ticket release');
    verify(proofs[0]!); version = selection.artifactVersion;
  }
  if (!version) return undefined;
  return verify(data.history.find((item) => item.release.artifactId === artifactId && item.release.artifactVersion === version)!);
}
export type SaveInput = { artifactId: string; expectedVersion: number; payload: BugPayload; actor: Actor; completionEvidence?: string };
/** Where a save reads the time it records as authorizedAt: the system clock, unless a caller such as the example generator fixes it to reproduce records. */
export type Clock = () => string;
export const systemClock: Clock = () => new Date().toISOString();
/** The selected current release of one ticket, verified, or undefined when the ticket has no release. */
export function selectedRelease(workspace: Record<string, unknown>, artifactId: string): Proof | undefined { return current(state(workspace), artifactId); }
/** Run one write under the workspace save lock. Fails closed on overlapping saves or a stale owner; never guesses ownership. */
export async function withSaveLock<T>(root: string | undefined, run: () => Promise<T>): Promise<T> {
  await initializeWorkspace(root);
  const lock = `${workspacePath(root)}.bug-lock`;
  await mkdir(lock);
  try { return await run(); } finally { await rm(lock, { recursive: true }); }
}
/** Create, authorize, and release the next version of one ticket in memory. Every check runs before anything is added; the caller writes the returned workspace. */
export function commitSave(workspace: Record<string, unknown>, input: SaveInput, now: Clock = systemClock): { workspace: Record<string, unknown>; proof: Proof } {
  if (typeof input.artifactId !== 'string' || !input.artifactId.trim() || input.artifactId.length > 200 || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) throw new Error('invalid ticket identity or expected version');
  validatePayload(input.payload);
  const data = state(workspace);
  const previous = current(data, input.artifactId);
  // A create names expectedVersion 0, so a released ticket under that ID is an ID collision, not stale content.
  if (previous && input.expectedVersion === 0) throw new Error('ticket already exists: choose a new ticket ID, or read and update the existing ticket');
  if ((previous?.release.artifactVersion ?? 0) !== input.expectedVersion) throw new Error('stale ticket: read current content before saving');
  const permission = permissions.find((p) => p.actorId === input.actor.actorId && p.actorKind === input.actor.actorKind);
  if (!permission || !(previous ? permission.update : permission.create)) throw new Error('actor lacks configured ticket update authority');
  const from = previous?.release.payload.status;
  if ((!previous && input.payload.status !== 'to_do') || (from === 'to_do' && !['to_do', 'in_progress'].includes(input.payload.status)) || (from === 'in_progress' && !['in_progress', 'done'].includes(input.payload.status)) || (from === 'done' && input.payload.status !== 'done')) throw new Error('ticket status transition is not permitted');
  // Local policy: completion evidence describes the check behind marking a ticket done, so any other save that carries it is refused
  // rather than recording a completion check, or an authorization reason, for a ticket that is not done.
  if (input.completionEvidence !== undefined && input.payload.status !== 'done') throw new Error('completion evidence applies only to a save that marks the ticket done');
  if (input.payload.status === 'done' && (!permission.complete || typeof input.completionEvidence !== 'string' || !input.completionEvidence.trim() || input.completionEvidence.length > 5000)) throw new Error('completion requires configured authority and a bounded description of the check performed');
  const artifact: Artifact = { artifactId: input.artifactId, artifactVersion: input.expectedVersion + 1, payload: structuredClone(input.payload), profile: structuredClone(pin), authoredBy: structuredClone(input.actor) };
  if (data.history.some((p) => p.artifact.artifactId === artifact.artifactId && p.artifact.artifactVersion === artifact.artifactVersion)) throw new Error('immutable bug ticket version already exists');
  const authorization: Authorization = { ...subject(artifact), authorizedBy: structuredClone(input.actor), authorizedAt: now(), ...(input.completionEvidence ? { reason: input.completionEvidence } : {}), authorizationSubjectDigest: digest('governed-artifact.authorization-subject.v1', subject(artifact)) };
  const record: StoredRelease = { profile: structuredClone(bugProfile), artifact, authorization, release: { artifactId: artifact.artifactId, artifactVersion: artifact.artifactVersion, payload: structuredClone(artifact.payload), profile: structuredClone(pin) } };
  const proof = verify(record);
  data.history.push(record);
  data.selections.push({ artifactId: artifact.artifactId, artifactVersion: artifact.artifactVersion, previousVersion: input.expectedVersion });
  const checks = (workspace.bugCompletionChecks ?? []) as unknown[];
  if (input.completionEvidence) checks.push({ artifactId: artifact.artifactId, artifactVersion: artifact.artifactVersion, actor: input.actor, evidence: input.completionEvidence });
  return { workspace: { ...workspace, bugTickets: data, bugCompletionChecks: checks }, proof };
}
export async function saveTicket(input: SaveInput, root?: string, now: Clock = systemClock): Promise<Proof> {
  return withSaveLock(root, async () => {
    const { workspace, proof } = commitSave(await readWorkspace(root), input, now);
    await writeWorkspace(workspace, root);
    return proof;
  });
}
export async function ticketHistory(artifactId: string, root?: string) {
  await initializeWorkspace(root); const data = state(await readWorkspace(root));
  current(data, artifactId);
  return data.history.filter((p) => p.release.artifactId === artifactId).map(verify);
}
export async function currentTickets(root?: string) {
  await initializeWorkspace(root); const data = state(await readWorkspace(root));
  return [...new Set(data.selections.map((s) => s.artifactId))].map((id) => current(data, id)!);
}
