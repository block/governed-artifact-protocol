import { copyFile, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { localWorkspacePath, seedPath as demoSeedPath } from '../../gap/workspace.js';
import type { Actor, ProfilePin } from './domain.js';

export const applicationId = 'cms';
const seedPath = demoSeedPath(applicationId);
export function workspacePath(root?: string): string { return localWorkspacePath(applicationId, root); }
export async function initializeWorkspace(root?: string): Promise<string> {
  const destination = workspacePath(root); await mkdir(dirname(destination), { recursive: true });
  try { await copyFile(seedPath, destination, 1); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  const current = await readWorkspace(root); const migrated = await migrateWorkspace(current);
  if (migrated !== current) await writeWorkspace(migrated, root); return destination;
}
async function migrateWorkspace(value: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (value.workspaceFormat !== 'local-reference-v1' || value.application !== 'cms') return value;
  let changed = false; const next = { ...value };
  const ensure = async (key: string) => {
    if (next[key] === undefined) { next[key] = (await seed())[key]; changed = true; }
    else if (!Array.isArray(next[key])) throw new Error(`workspace ${key} must be an array`);
  };
  await ensure('profileProposals'); await ensure('profileRatificationAuthorities');
  await ensure('releaseApprovalAuthorities'); await ensure('approvals'); await ensure('rejections');
  const proposals = next.profileProposals as unknown[];
  for (const seededProposal of (await seed()).profileProposals as any[]) {
    if (!proposals.some((proposal: any) => proposal?.profileId === seededProposal.profileId && proposal?.revision === seededProposal.revision)) {
      next.profileProposals = [...(next.profileProposals as unknown[]), structuredClone(seededProposal)]; changed = true;
    }
  }
  if (next.releaseAuthorityPolicies === undefined) {
    if (!Array.isArray(next.profiles)) throw new Error('workspace profiles must be an array');
    next.releaseAuthorityPolicies = next.profiles.flatMap((profile: any) => {
      const pin: ProfilePin = { profileId: profile.profileId, revision: profile.revision, digest: profile.digest };
      const policies: Array<{ profile: ProfilePin; authority: Actor; audiences: string[] }> = [
        { profile: pin, authority: { actorId: '*', actorKind: 'human' }, audiences: ['public', 'members', 'internal'] },
        { profile: pin, authority: { actorId: 'agent:local-publisher', actorKind: 'agent' }, audiences: ['public', 'members', 'internal'] },
      ]; return policies;
    }); changed = true;
  } else if (!Array.isArray(next.releaseAuthorityPolicies)) throw new Error('workspace releaseAuthorityPolicies must be an array');
  return changed ? next : value;
}
let seedCache: Promise<Record<string, unknown>> | undefined;
function seed() { return seedCache ??= readFile(seedPath, 'utf8').then((text) => JSON.parse(text) as Record<string, unknown>); }
export async function resetWorkspace(root?: string): Promise<string> { const destination = workspacePath(root); await rm(destination, { force: true }); return initializeWorkspace(root); }
export async function readWorkspace(root?: string): Promise<Record<string, unknown>> { const destination = workspacePath(root); const parsed = JSON.parse(await readFile(destination, 'utf8')) as unknown; if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error(`workspace must contain one JSON object: ${destination}`); return parsed as Record<string, unknown>; }
export async function writeWorkspace(value: Record<string, unknown>, root?: string): Promise<void> {
  const destination = workspacePath(root); await mkdir(dirname(destination), { recursive: true }); const temporary = `${destination}.tmp-${process.pid}-${crypto.randomUUID()}`; const handle = await open(temporary, 'wx', 0o600);
  try { await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8'); await handle.sync(); } finally { await handle.close(); }
  await rename(temporary, destination);
}
