// Working copies: mutable content a human or agent stages and iterates on before "Save changes"
// creates an artifact version from it. A working copy is application-local state, not a GAP record.
// It has no artifact version, no digest, no authorization, and no place in ticket history, and the
// current and history reads never see it. Saving it is GAP step 3 (plus the authorization and release
// this application performs in the same action); staging and restaging create nothing.
import { commitSave, permissions, selectedRelease, systemClock, validatePayload, withSaveLock, type BugPayload, type Clock, type Proof } from './bug-tickets.js';
import type { Actor } from './model.js';
import { initializeWorkspace, readWorkspace, writeWorkspace } from './workspace.js';

const fields = ['title', 'description', 'acceptanceCriteria', 'status'] as const;
/** Staged content may be incomplete or invalid while the author iterates; validation is reported, not enforced, until the save. */
export type StagedPayload = Partial<{ title: string; description: string; acceptanceCriteria: string[]; status: string }>;
export type WorkingCopy = { artifactId: string; baseVersion: number; payload: StagedPayload; heldBy: Actor; saveCount: number; updatedAt: string };
export type WorkingCopyView = { workingCopy: WorkingCopy; validation: { valid: boolean; problems: string[] }; changes: string[]; currentVersion: number; stale: boolean };

function copies(workspace: Record<string, unknown>): WorkingCopy[] {
  const value = workspace.bugWorkingCopies;
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('invalid working copy state');
  return value as WorkingCopy[];
}
function configured(actor: Actor): void {
  if (!actor || !permissions.some((p) => p.actorId === actor.actorId && p.actorKind === actor.actorKind)) throw new Error('actor is not a configured participant');
}
function identity(artifactId: string): string {
  if (typeof artifactId !== 'string' || !artifactId.trim() || artifactId.length > 200) throw new Error('invalid ticket identity');
  return artifactId;
}
function validation(payload: StagedPayload): WorkingCopyView['validation'] {
  try { validatePayload(payload as BugPayload); return { valid: true, problems: [] }; } catch (error) { return { valid: false, problems: [error instanceof Error ? error.message : String(error)] }; }
}
function view(workspace: Record<string, unknown>, copy: WorkingCopy): WorkingCopyView {
  const current = selectedRelease(workspace, copy.artifactId);
  const currentVersion = current?.release.artifactVersion ?? 0;
  const changes = fields.filter((field) => JSON.stringify(copy.payload[field]) !== JSON.stringify(current?.release.payload[field]));
  return { workingCopy: structuredClone(copy), validation: validation(copy.payload), changes, currentVersion, stale: currentVersion !== copy.baseVersion };
}

/** Stage or replace the working copy for one released ticket. Any configured participant may stage; staging grants no authority to save. */
export async function stageTicketChanges(input: { artifactId: string; expectedVersion: number; payload: StagedPayload; actor: Actor }, root?: string): Promise<WorkingCopyView> {
  return withSaveLock(root, async () => {
    identity(input.artifactId); configured(input.actor);
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) throw new Error('expectedVersion must be the released version the changes are based on');
    if (!input.payload || typeof input.payload !== 'object' || Array.isArray(input.payload)) throw new Error('staged payload must be an object');
    const unknown = Object.keys(input.payload).filter((key) => !(fields as readonly string[]).includes(key));
    if (unknown.length > 0) throw new Error(`staged payload contains unknown properties: ${unknown.join(', ')}`);
    const workspace = await readWorkspace(root);
    const current = selectedRelease(workspace, input.artifactId);
    if (!current) throw new Error('unknown ticket: stage changes against a released ticket');
    if (current.release.artifactVersion !== input.expectedVersion) throw new Error('stale ticket: read current content before staging');
    const existing = copies(workspace).find((copy) => copy.artifactId === input.artifactId);
    const copy: WorkingCopy = { artifactId: input.artifactId, baseVersion: input.expectedVersion, payload: structuredClone(input.payload), heldBy: structuredClone(input.actor), saveCount: (existing?.saveCount ?? 0) + 1, updatedAt: new Date().toISOString() };
    const next = { ...workspace, bugWorkingCopies: [...copies(workspace).filter((item) => item.artifactId !== input.artifactId), copy] };
    await writeWorkspace(next, root);
    return view(next, copy);
  });
}

/** Read the working copy for one ticket with its validation, the fields that differ from the current release, and whether it is stale. */
export async function getTicketWorkingCopy(artifactId: string, root?: string): Promise<WorkingCopyView> {
  await initializeWorkspace(root);
  const workspace = await readWorkspace(root);
  const copy = copies(workspace).find((item) => item.artifactId === identity(artifactId));
  if (!copy) throw new Error('no working copy for this ticket');
  return view(workspace, copy);
}

/** Remove the working copy without creating anything. */
export async function discardTicketWorkingCopy(input: { artifactId: string; actor: Actor }, root?: string): Promise<{ artifactId: string; discarded: true }> {
  return withSaveLock(root, async () => {
    identity(input.artifactId); configured(input.actor);
    const workspace = await readWorkspace(root);
    if (!copies(workspace).some((item) => item.artifactId === input.artifactId)) throw new Error('no working copy for this ticket');
    await writeWorkspace({ ...workspace, bugWorkingCopies: copies(workspace).filter((item) => item.artifactId !== input.artifactId) }, root);
    return { artifactId: input.artifactId, discarded: true };
  });
}

/** "Save changes" from the working copy: create, authorize, and release the next version under the same rules as a direct save, and remove the working copy in the same file replacement. */
export async function saveTicketChanges(input: { artifactId: string; actor: Actor; completionEvidence?: string }, root?: string, now: Clock = systemClock): Promise<Proof> {
  return withSaveLock(root, async () => {
    identity(input.artifactId);
    const workspace = await readWorkspace(root);
    const copy = copies(workspace).find((item) => item.artifactId === input.artifactId);
    if (!copy) throw new Error('no working copy for this ticket');
    const { workspace: saved, proof } = commitSave(workspace, { artifactId: copy.artifactId, expectedVersion: copy.baseVersion, payload: copy.payload as BugPayload, actor: input.actor, completionEvidence: input.completionEvidence }, now);
    await writeWorkspace({ ...saved, bugWorkingCopies: copies(workspace).filter((item) => item.artifactId !== input.artifactId) }, root);
    return proof;
  });
}
