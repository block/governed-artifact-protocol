import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { initializeWorkspace, readWorkspace, resetWorkspace, writeWorkspace } from '../../src/domains/issue-tracking/workspace.js';

test('first run seeds local JSON and later runs preserve user data', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gap-local-reference-'));
  try {
    await initializeWorkspace(root);
    const initial = await readWorkspace(root);
    assert.equal(initial.deploymentMode, 'local-evaluation');
    assert.equal(initial.productionReady, false);

    const changed = { ...initial, userValue: 'preserved' };
    await writeWorkspace(changed, root);
    await initializeWorkspace(root);
    assert.equal((await readWorkspace(root)).userValue, 'preserved');
    assert.doesNotMatch(await readFile(join(root, 'issue-tracking', 'workspace.json'), 'utf8'), /\.tmp-/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('explicit reset replaces only application state and preserves unrelated workspace files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gap-local-reference-'));
  try {
    await initializeWorkspace(root);
    await writeFile(join(root, 'unrelated.txt'), 'keep me');
    await writeWorkspace({ ...(await readWorkspace(root)), userValue: 'remove me' }, root);
    await resetWorkspace(root);
    assert.equal(await readFile(join(root, 'unrelated.txt'), 'utf8'), 'keep me');
    assert.equal((await readWorkspace(root)).userValue, undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
