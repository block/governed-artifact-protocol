import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { initializeWorkspace, readWorkspace, resetWorkspace, writeWorkspace } from '../../src/domains/cms/workspace.js';

test('first run seeds local JSON and later runs preserve user data', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gap-local-reference-'));
  try {
    await initializeWorkspace(root);
    const initial = await readWorkspace(root);
    assert.equal(initial.deploymentMode, 'local-evaluation');
    assert.equal(initial.productionReady, false);
    assert.equal((initial.profiles as unknown[]).length, 1);

    const changed = { ...initial, userValue: 'preserved' };
    await writeWorkspace(changed, root);
    await initializeWorkspace(root);
    assert.equal((await readWorkspace(root)).userValue, 'preserved');
    await assert.rejects(() => access(join(root, 'workspace.json.tmp')), /ENOENT/);
    assert.doesNotMatch(await readFile(join(root, 'cms', 'workspace.json'), 'utf8'), /\.tmp-/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('reset replaces only owned state and preserves sibling files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gap-local-reference-'));
  try {
    await initializeWorkspace(root);
    const sibling = join(root, 'keep-me.txt');
    await writeFile(sibling, 'unrelated caller data', 'utf8');
    await writeWorkspace({ ...(await readWorkspace(root)), userValue: 'discarded' }, root);

    await resetWorkspace(root);

    assert.equal(await readFile(sibling, 'utf8'), 'unrelated caller data');
    assert.equal((await readWorkspace(root)).userValue, undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('startup non-destructively and idempotently migrates pre-authority workspaces', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gap-local-reference-'));
  try {
    await initializeWorkspace(root);
    const current = await readWorkspace(root);
    const { profileProposals, profileRatificationAuthorities, releaseAuthorityPolicies, releaseApprovalAuthorities, approvals, ...old } = current;
    await writeWorkspace({ ...old, userValue: 'preserved', artifacts: [{ sentinel: true }] }, root);
    await initializeWorkspace(root);
    const once = await readFile(join(root, 'cms', 'workspace.json'), 'utf8');
    const migrated = JSON.parse(once);
    assert.equal(migrated.userValue, 'preserved');
    assert.deepEqual(migrated.artifacts, [{ sentinel: true }]);
    assert.equal(migrated.profileProposals.length, 3);
    assert(migrated.profileProposals.some((proposal: any) => proposal.profileId === 'cms.rendered-article'));
    assert(migrated.profileProposals.some((proposal: any) => proposal.profileId === 'cms.external-image-gallery' && proposal.revision === 1));
    assert.equal(migrated.profileRatificationAuthorities.length, 1);
    assert.equal(migrated.releaseAuthorityPolicies.length, 2);
    assert.equal(migrated.releaseApprovalAuthorities.length, 2);
    assert(migrated.releaseApprovalAuthorities.every((item: any) => item.profileId === 'blog-post'));
    assert.deepEqual(migrated.approvals, []);
    await initializeWorkspace(root);
    assert.equal(await readFile(join(root, 'cms', 'workspace.json'), 'utf8'), once);
  } finally { await rm(root, { recursive: true, force: true }); }
});
