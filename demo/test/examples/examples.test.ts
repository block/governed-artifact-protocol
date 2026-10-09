import assert from 'node:assert/strict';
import { cp, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { checkExamples, generateExamples } from '../../examples/generate.js';
import { compareSet, examplesRoot, formatRecord, formatSet, hasDrift, summarize, writeSet } from '../../examples/records.js';
import { paperId, studyId } from '../../examples/research-content.js';

// The specification's example record sets are generated from the demo applications. This is the
// check that fails when a change to an application, a seed, or a profile drifts from them.

test('the committed specification examples are exactly what the demo applications produce', async () => {
  const drifts = await checkExamples();
  assert.equal(drifts.some(hasDrift), false, `${summarize(drifts)}\n\nRun pnpm examples:generate, review the diff, and commit it.`);
});

test('the gummy-worm recall example completes revisions before its only publication; withdrawal uses a separate subject', async () => {
  const research = (await generateExamples()).find((set) => set.set === 'research')!;
  const files = research.files as Record<string, any>;
  const publications = Object.entries(files).filter(([name, record]) =>
    name.startsWith('release_') && record.artifactId === paperId);
  assert.deepEqual(publications.map(([name]) => name), ['release_paper-3.json']);
  for (const record of Object.values(files)) {
    assert.equal(record.artifactId === paperId && 'withdrawnAt' in record, false);
    assert.equal(record.release?.artifactId === paperId && 'withdrawal' in record, false);
  }
  assert.equal(files['artifact-version_paper-2.json'].payload.dependencySet.entries.find((entry: any) => entry.artifactId === studyId).artifactVersion, 1);
  const published = files['release-proof_paper-3.json'];
  assert.equal(published.release.payload.dependencySet.entries.find((entry: any) => entry.artifactId === studyId).artifactVersion, 2);
  const approval = published.approvals[0];
  assert(files['release-authorization_review-1.json'].authorizedAt < approval.approvedAt);
  assert(files['release-authorization_study-2.json'].authorizedAt < approval.approvedAt);
  assert(approval.approvedAt < published.authorization.authorizedAt);
  assert.equal(files['release-withdrawal_withdrawal-paper-2.json'].artifactId, 'paper:withdrawal-coverage');
});

test('generation is deterministic and leaves the default workspace alone', async () => {
  const defaultRoot = await mkdtemp(join(tmpdir(), 'gap-examples-default-'));
  const previous = process.env.GAP_WORKSPACE;
  process.env.GAP_WORKSPACE = defaultRoot;
  try {
    const bytes = async () => (await generateExamples()).map((set) => [set.set, formatSet(set)]);
    assert.deepEqual(await bytes(), await bytes());
    assert.deepEqual(await readdir(defaultRoot), [], 'scenarios run in their own scratch directory, never the default workspace');
  } finally {
    if (previous === undefined) delete process.env.GAP_WORKSPACE; else process.env.GAP_WORKSPACE = previous;
    await rm(defaultRoot, { recursive: true, force: true });
  }
});

test('check mode names every changed, missing, and unproduced file, and write mode deletes nothing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gap-examples-drift-'));
  try {
    await cp(join(examplesRoot, 'issue-tracking'), join(root, 'issue-tracking'), { recursive: true });
    const generated = (await generateExamples()).find((set) => set.set === 'issue-tracking');
    assert.ok(generated);
    const directory = join(root, 'issue-tracking');
    const authorization = JSON.parse(await readFile(join(directory, 'release-authorization_new-ticket.json'), 'utf8'));
    authorization.authorizedAt = '2026-08-27T10:00:00Z';
    await writeFile(join(directory, 'release-authorization_new-ticket.json'), formatRecord(authorization));
    await rm(join(directory, 'release_new-ticket.json'));
    await writeFile(join(directory, 'release_retired.json'), '{}\n');

    const drift = await compareSet(generated, root);
    assert.deepEqual(drift.added, ['release_new-ticket.json']);
    assert.deepEqual(drift.unproduced, ['release_retired.json']);
    const changed = drift.changed.find((item) => item.file === 'release-authorization_new-ticket.json');
    assert.ok(changed, summarize([drift]));
    assert.match(changed.details.join('\n'), /\.authorizedAt: committed "2026-08-27T10:00:00Z", generated "2026-08-26T10:00:00Z"/);

    await writeSet(generated, root);
    const after = await compareSet(generated, root);
    assert.deepEqual([after.changed, after.added, after.unproduced], [[], [], ['release_retired.json']], 'write mode rewrites what differs and leaves unproduced files for a person to remove');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
