import { copyFile, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { localWorkspacePath, seedPath as demoSeedPath } from '../../gap/workspace.js';

export const applicationId = 'issue-tracking';
const seedPath = demoSeedPath(applicationId);

export function workspacePath(root?: string): string {
  return localWorkspacePath(applicationId, root);
}

export async function initializeWorkspace(root?: string): Promise<string> {
  const destination = workspacePath(root);
  await mkdir(dirname(destination), { recursive: true });
  try {
    await copyFile(seedPath, destination, 1 /* COPYFILE_EXCL */);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  await readWorkspace(root);
  return destination;
}

export async function resetWorkspace(root?: string): Promise<string> {
  const destination = workspacePath(root);
  await rm(destination, { force: true });
  return initializeWorkspace(root);
}

export async function readWorkspace(root?: string): Promise<Record<string, unknown>> {
  const destination = workspacePath(root);
  const parsed = JSON.parse(await readFile(destination, 'utf8')) as unknown;
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error(`workspace must contain one JSON object: ${destination}`);
  }
  return parsed as Record<string, unknown>;
}

export async function writeWorkspace(value: Record<string, unknown>, root?: string): Promise<void> {
  const destination = workspacePath(root);
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp-${process.pid}-${crypto.randomUUID()}`;
  const handle = await open(temporary, 'wx', 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, destination);
}
