/**
 * Where an application's local files live.
 *
 * Every application in the demo keeps one JSON workspace under a shared root:
 * <root>/<application id>/workspace.json. The root is GAP_WORKSPACE when set,
 * otherwise demo/.local-workspace. Seed data is read-only and lives in
 * demo/seed/<application id>/.
 *
 * Only paths are shared. How each application reads, migrates, and writes its
 * workspace stays in that application's own workspace module.
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The demo package directory, from src/gap or dist/gap alike. */
export const demoRoot = fileURLToPath(new URL('../..', import.meta.url));

export function defaultWorkspaceRoot(): string {
  return process.env.GAP_WORKSPACE ?? resolve(demoRoot, '.local-workspace');
}

/** Path of one application's workspace file under the given (or default) root. */
export function localWorkspacePath(applicationId: string, root?: string): string {
  return resolve(root ?? defaultWorkspaceRoot(), applicationId, 'workspace.json');
}

/** Path of a checked-in seed file for one application. */
export function seedPath(applicationId: string, file = 'workspace.json'): string {
  return resolve(demoRoot, 'seed', applicationId, file);
}
