import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { initializeWorkspace, readWorkspace, resetWorkspace, workspacePath, writeWorkspace } from '../../src/domains/research/workspace.js';
import { withWorkspace } from './fixtures.js';
test('startup seeds new workspaces and preserves existing user state', () => withWorkspace(async root => {
  await initializeWorkspace(root); const data = await readWorkspace(root);
  assert.equal(data.application, 'research'); data.note = 'keep me'; await writeWorkspace(data, root);
  await initializeWorkspace(root); assert.equal((await readWorkspace(root)).note, 'keep me');
  assert.doesNotMatch(await readFile(workspacePath(root), 'utf8'), /\.tmp-/);
}));
test('explicit reset changes only the research workspace', () => withWorkspace(async root => {
  await initializeWorkspace(root); await writeFile(join(root, 'unrelated.txt'), 'keep');
  const data = await readWorkspace(root); data.note = 'reset me'; await writeWorkspace(data, root);
  await resetWorkspace(root); assert.equal((await readWorkspace(root)).note, undefined);
  assert.equal(await readFile(join(root, 'unrelated.txt'), 'utf8'), 'keep');
}));
