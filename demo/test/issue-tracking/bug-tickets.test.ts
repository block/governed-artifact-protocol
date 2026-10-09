import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { currentTickets, saveTicket, ticketHistory } from '../../src/domains/issue-tracking/bug-tickets.js';
import { discardTicketWorkingCopy, getTicketWorkingCopy, saveTicketChanges, stageTicketChanges } from '../../src/domains/issue-tracking/working-copies.js';
import { readWorkspace, writeWorkspace } from '../../src/domains/issue-tracking/workspace.js';

const actor = { actorId: 'human:workflow-owner', actorKind: 'human' as const };
const payload = { title: 'Fix subtraction', description: 'Synthetic calculator issue', acceptanceCriteria: [], status: 'to_do' as const };
async function withWorkspace(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'gap-bug-'));
  try { await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}
test('bug ticket history survives restart and concurrent or invalid saves cannot replace it', () => withWorkspace(async (root) => {
  const first = await saveTicket({ artifactId: 'ticket:test', expectedVersion: 0, payload, actor }, root);
  assert.deepEqual(Object.keys(first).sort(), ['authorization', 'profile', 'release']);
  const storedFirst = ((await readWorkspace(root)) as any).bugTickets.history[0];
  assert.deepEqual(Object.keys(storedFirst).sort(), ['artifact', 'authorization', 'profile', 'release']);
  assert.deepEqual(({ profile: storedFirst.profile, authorization: storedFirst.authorization, release: storedFirst.release }), first);
  assert.deepEqual(storedFirst.artifact.payload, payload);
  assert.deepEqual(storedFirst.artifact.authoredBy, actor);
  const input = { artifactId: 'ticket:test', expectedVersion: 1, payload: { ...payload, status: 'in_progress' as const }, actor };
  const outcomes = await Promise.allSettled([saveTicket(input, root), saveTicket(input, root)]);
  assert.equal(outcomes.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal((await ticketHistory('ticket:test', root)).length, 2);
  assert.deepEqual((await ticketHistory('ticket:test', root))[0], first);
  const before = await readWorkspace(root);
  await assert.rejects(saveTicket({ ...input, expectedVersion: 2, payload: { ...payload, title: 'x'.repeat(5001) } }, root));
  await assert.rejects(saveTicket({ ...input, expectedVersion: 2, payload: { ...payload, status: 'done' } }, root), /completion/);
  assert.deepEqual(await readWorkspace(root), before);
  assert.equal((await currentTickets(root))[0]!.release.artifactVersion, 2);
}));
test('bug ticket reads reject forged evidence and ambiguous local current selections', () => withWorkspace(async (root) => {
  await saveTicket({ artifactId: 'ticket:test', expectedVersion: 0, payload, actor }, root);
  const original = await readWorkspace(root);
  for (const tamper of [
    (state: any) => { state.history[0].release.payload.status = 'done'; },
    (state: any) => { state.history[0].authorization.authorizedBy.actorId = 'agent:unknown'; },
    (state: any) => { state.history[0].authorization.reason = ''; },
    (state: any) => { state.history[0].authorization.reason = { checked: true }; },
    (state: any) => { state.history[0].authorization.note = 'free text outside the reason field'; },
    (state: any) => { state.history[0].artifact.profile.digest = 'sha256:old-domain'; },
    (state: any) => { state.history[0].artifact.payload.title = 'Tampered internal version'; },
    (state: any) => { state.history[0].extra = state.history[0].artifact; },
    (state: any) => { state.selections.push(state.selections[0]); },
  ]) {
    const changed = structuredClone(original) as any; tamper(changed.bugTickets); await writeWorkspace(changed, root);
    await assert.rejects(currentTickets(root));
    await assert.rejects(ticketHistory('ticket:test', root));
  }
}));

const requester = { actorId: 'agent:requester', actorKind: 'agent' as const };
const assignee = { actorId: 'agent:assignee', actorKind: 'agent' as const };
const staged = { ...payload, acceptanceCriteria: ['Subtracting 2 from 5 must display 3.'], status: 'in_progress' as const };

test('a working copy changes in place, is never a version, and is not readable as the ticket; saving it creates exactly one immutable version', () => withWorkspace(async (root) => {
  const first = await saveTicket({ artifactId: 'ticket:wc', expectedVersion: 0, payload, actor }, root);
  const iterations = [{ ...staged, title: 'Fix subtraction (draft wording)' }, { ...staged, title: 'Fix subtraction (second wording)' }, staged];
  let view;
  for (const [index, content] of iterations.entries()) {
    view = await stageTicketChanges({ artifactId: 'ticket:wc', expectedVersion: 1, payload: content, actor: assignee }, root);
    assert.equal(view.workingCopy.saveCount, index + 1);
    assert.equal(view.workingCopy.baseVersion, 1);
  }
  assert.deepEqual(Object.keys(view!.workingCopy).sort(), ['artifactId', 'baseVersion', 'heldBy', 'payload', 'saveCount', 'updatedAt']);
  assert.deepEqual(view!.changes, ['acceptanceCriteria', 'status']);
  assert.equal(view!.stale, false);
  assert.deepEqual(await getTicketWorkingCopy('ticket:wc', root), view);
  // The ticket itself has not changed: the working copy is not a version, not in history, and not readable as the ticket.
  assert.deepEqual(await currentTickets(root), [first]);
  assert.deepEqual(await ticketHistory('ticket:wc', root), [first]);
  for (const read of [await currentTickets(root), await ticketHistory('ticket:wc', root)]) assert.doesNotMatch(JSON.stringify(read), /display 3|wording/);
  const second = await saveTicketChanges({ artifactId: 'ticket:wc', actor: assignee }, root);
  assert.equal(second.release.artifactVersion, 2);
  assert.deepEqual(second.release.payload, staged);
  assert.deepEqual(await ticketHistory('ticket:wc', root), [first, second]); // three stagings, one version, and no intermediate wording anywhere
  assert.doesNotMatch(JSON.stringify(await ticketHistory('ticket:wc', root)), /wording/);
  await assert.rejects(getTicketWorkingCopy('ticket:wc', root), /no working copy/);
  assert.deepEqual((await readWorkspace(root)).bugWorkingCopies, []);
  await assert.rejects(saveTicket({ artifactId: 'ticket:wc', expectedVersion: 1, payload: staged, actor: assignee }, root), /stale/);
}));

test('staging a working copy confers no authority: a create-only actor can stage but cannot save, and unknown actors cannot stage', () => withWorkspace(async (root) => {
  const first = await saveTicket({ artifactId: 'ticket:wc', expectedVersion: 0, payload, actor }, root);
  const view = await stageTicketChanges({ artifactId: 'ticket:wc', expectedVersion: 1, payload: staged, actor: requester }, root);
  assert.deepEqual(view.workingCopy.heldBy, requester);
  await assert.rejects(saveTicketChanges({ artifactId: 'ticket:wc', actor: requester }, root), /update authority/);
  assert.deepEqual(await ticketHistory('ticket:wc', root), [first]);
  assert.equal((await getTicketWorkingCopy('ticket:wc', root)).workingCopy.saveCount, 1);
  await assert.rejects(stageTicketChanges({ artifactId: 'ticket:wc', expectedVersion: 1, payload: staged, actor: { actorId: 'agent:unknown', actorKind: 'agent' } }, root), /configured participant/);
  await assert.rejects(stageTicketChanges({ artifactId: 'ticket:missing', expectedVersion: 1, payload: staged, actor: assignee }, root), /unknown ticket/);
  await assert.rejects(stageTicketChanges({ artifactId: 'ticket:wc', expectedVersion: 1, payload: { ...staged, extra: true } as any, actor: assignee }, root), /unknown properties/);
  const second = await saveTicketChanges({ artifactId: 'ticket:wc', actor: assignee }, root);
  assert.equal(second.authorization.authorizedBy.actorId, assignee.actorId);
}));

test('working-copy validation is advisory; the version is validated as created, so an invalid working copy cannot become a version', () => withWorkspace(async (root) => {
  await saveTicket({ artifactId: 'ticket:wc', expectedVersion: 0, payload, actor }, root);
  const invalid = await stageTicketChanges({ artifactId: 'ticket:wc', expectedVersion: 1, payload: { ...staged, title: '' }, actor: assignee }, root);
  assert.equal(invalid.validation.valid, false);
  assert.ok(invalid.validation.problems.length > 0);
  const before = JSON.stringify((await readWorkspace(root)).bugTickets);
  await assert.rejects(saveTicketChanges({ artifactId: 'ticket:wc', actor: assignee }, root), /nonempty and bounded/);
  assert.equal(JSON.stringify((await readWorkspace(root)).bugTickets), before);
  assert.equal((await getTicketWorkingCopy('ticket:wc', root)).workingCopy.saveCount, 1);
  const partial = await stageTicketChanges({ artifactId: 'ticket:wc', expectedVersion: 1, payload: { status: 'in_progress' }, actor: assignee }, root);
  assert.equal(partial.validation.valid, false);
  await assert.rejects(saveTicketChanges({ artifactId: 'ticket:wc', actor: assignee }, root), /requires exactly/);
  const fixed = await stageTicketChanges({ artifactId: 'ticket:wc', expectedVersion: 1, payload: staged, actor: assignee }, root);
  assert.deepEqual(fixed.validation, { valid: true, problems: [] });
  assert.equal((await saveTicketChanges({ artifactId: 'ticket:wc', actor: assignee }, root)).release.artifactVersion, 2);
}));

test('a stale working copy fails closed and completion through a working copy still needs the check description', () => withWorkspace(async (root) => {
  await saveTicket({ artifactId: 'ticket:wc', expectedVersion: 0, payload, actor }, root);
  await stageTicketChanges({ artifactId: 'ticket:wc', expectedVersion: 1, payload: { ...staged, title: 'Staged before the direct save' }, actor: assignee }, root);
  const second = await saveTicket({ artifactId: 'ticket:wc', expectedVersion: 1, payload: staged, actor: assignee }, root);
  const stale = await getTicketWorkingCopy('ticket:wc', root);
  assert.equal(stale.stale, true);
  assert.equal(stale.currentVersion, 2);
  await assert.rejects(saveTicketChanges({ artifactId: 'ticket:wc', actor: assignee }, root), /stale/);
  assert.deepEqual((await currentTickets(root))[0], second);
  await assert.rejects(stageTicketChanges({ artifactId: 'ticket:wc', expectedVersion: 1, payload: staged, actor: assignee }, root), /stale/);
  assert.deepEqual(await discardTicketWorkingCopy({ artifactId: 'ticket:wc', actor: assignee }, root), { artifactId: 'ticket:wc', discarded: true });
  await assert.rejects(getTicketWorkingCopy('ticket:wc', root), /no working copy/);
  await assert.rejects(discardTicketWorkingCopy({ artifactId: 'ticket:wc', actor: assignee }, root), /no working copy/);
  await stageTicketChanges({ artifactId: 'ticket:wc', expectedVersion: 2, payload: { ...staged, status: 'done' }, actor: assignee }, root);
  await assert.rejects(saveTicketChanges({ artifactId: 'ticket:wc', actor: assignee }, root), /completion/);
  assert.equal((await ticketHistory('ticket:wc', root)).length, 2);
  const third = await saveTicketChanges({ artifactId: 'ticket:wc', actor: assignee, completionEvidence: 'Synthetic check: 5 minus 2 displayed 3.' }, root);
  assert.equal(third.release.payload.status, 'done');
  assert.equal((await ticketHistory('ticket:wc', root)).length, 3);
  // The check description travels with the proof as the authorization's reason; a save without one records no reason.
  assert.equal(third.authorization.reason, 'Synthetic check: 5 minus 2 displayed 3.');
  assert.equal('reason' in second.authorization, false);
  assert.deepEqual((await ticketHistory('ticket:wc', root))[2], third, 'the stored authorization with its reason verifies on read');
}));
test('completion evidence is refused on any save that does not mark the ticket done, directly or from a working copy, and records nothing', () => withWorkspace(async (root) => {
  const refused = /completion evidence applies only to a save that marks the ticket done/;
  await assert.rejects(saveTicket({ artifactId: 'ticket:evidence', expectedVersion: 0, payload, actor, completionEvidence: 'Synthetic check: nothing to check yet.' }, root), refused);
  assert.deepEqual(await currentTickets(root), []);
  const first = await saveTicket({ artifactId: 'ticket:evidence', expectedVersion: 0, payload, actor }, root);
  const before = await readWorkspace(root);
  for (const completionEvidence of ['Synthetic check: started on the fix.', '']) {
    await assert.rejects(saveTicket({ artifactId: 'ticket:evidence', expectedVersion: 1, payload: staged, actor: assignee, completionEvidence }, root), refused);
  }
  assert.deepEqual(await readWorkspace(root), before);
  await stageTicketChanges({ artifactId: 'ticket:evidence', expectedVersion: 1, payload: staged, actor: assignee }, root);
  const withCopy = await readWorkspace(root);
  await assert.rejects(saveTicketChanges({ artifactId: 'ticket:evidence', actor: assignee, completionEvidence: 'Synthetic check: started on the fix.' }, root), refused);
  assert.deepEqual(await readWorkspace(root), withCopy, 'the refused save keeps the working copy and records no version or check');
  const second = await saveTicketChanges({ artifactId: 'ticket:evidence', actor: assignee }, root);
  assert.equal('reason' in second.authorization, false);
  assert.deepEqual((await readWorkspace(root)).bugCompletionChecks, []);
  // A save that marks the ticket done still requires the evidence, stores it as the reason, and records one completion check.
  const third = await saveTicket({ artifactId: 'ticket:evidence', expectedVersion: 2, payload: { ...staged, status: 'done' }, actor: assignee, completionEvidence: 'Synthetic check: 5 minus 2 displayed 3.' }, root);
  assert.equal(third.authorization.reason, 'Synthetic check: 5 minus 2 displayed 3.');
  assert.deepEqual((await readWorkspace(root)).bugCompletionChecks, [{ artifactId: 'ticket:evidence', artifactVersion: 3, actor: assignee, evidence: 'Synthetic check: 5 minus 2 displayed 3.' }]);
  assert.deepEqual(await ticketHistory('ticket:evidence', root), [first, second, third]);
}));
test('creating a ticket under an ID that already has a release reports the collision; every other version mismatch is stale; neither changes anything', () => withWorkspace(async (root) => {
  const collision = /ticket already exists: choose a new ticket ID, or read and update the existing ticket/;
  const staleOnly = (error: Error) => /stale ticket: read current content before saving/.test(error.message) && !collision.test(error.message);
  await assert.rejects(saveTicket({ artifactId: 'ticket:missing', expectedVersion: 1, payload: staged, actor: assignee }, root), staleOnly);
  await saveTicket({ artifactId: 'ticket:taken', expectedVersion: 0, payload, actor: requester }, root);
  await saveTicket({ artifactId: 'ticket:taken', expectedVersion: 1, payload: staged, actor: assignee }, root);
  const before = await readWorkspace(root);
  for (const creator of [requester, actor]) await assert.rejects(saveTicket({ artifactId: 'ticket:taken', expectedVersion: 0, payload: { ...payload, title: 'A different bug' }, actor: creator }, root), collision);
  for (const expectedVersion of [1, 3]) await assert.rejects(saveTicket({ artifactId: 'ticket:taken', expectedVersion, payload: staged, actor: assignee }, root), staleOnly);
  assert.deepEqual(await readWorkspace(root), before);
  assert.equal((await ticketHistory('ticket:taken', root)).length, 2);
}));
test('stored release authorizations carry only core schema fields, including every required one', () => withWorkspace(async (root) => {
  await saveTicket({ artifactId: 'ticket:test', expectedVersion: 0, payload, actor }, root);
  const { properties, required } = JSON.parse(await readFile(new URL('../../../specification/draft/schemas/core.schema.json', import.meta.url), 'utf8')).$defs.ReleaseAuthorization;
  const stored = ((await readWorkspace(root)) as any).bugTickets.history[0].authorization;
  assert.deepEqual(Object.keys(stored).filter((key) => !(key in properties)), [], 'no application-local field is stored on the authorization');
  assert.deepEqual((required as string[]).filter((key) => !(key in stored)), [], 'every required field is stored');
  assert.ok('authorizationSubjectDigest' in stored, 'this implementation stores the optional subject digest');
  assert.equal('authoritySignature' in stored, false, 'this implementation records attributed authority and carries no signature');
  assert.equal('reason' in stored, false, 'a save without completion evidence records no reason');
}));
