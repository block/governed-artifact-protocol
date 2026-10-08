/**
 * The issue tracking example set (specification/draft/examples/issue-tracking): a
 * requester's "Create ticket" creates, authorizes, and releases version 1 of a bug
 * ticket. The assignee stages a working copy that adds an acceptance criterion and moves
 * the ticket to In progress, and saving it creates, authorizes, and releases version 2.
 *
 * Every actor, time, and line of content is fixed here. Every record comes from the
 * tracker's own functions, run against the scratch workspace the generator passes in.
 */
import { saveTicket, ticketHistory, type BugPayload } from '../src/domains/issue-tracking/bug-tickets.js';
import type { Actor } from '../src/domains/issue-tracking/model.js';
import { saveTicketChanges, stageTicketChanges } from '../src/domains/issue-tracking/working-copies.js';
import { readWorkspace } from '../src/domains/issue-tracking/workspace.js';
import type { ExampleSet } from './records.js';

const requester: Actor = { actorId: 'agent:requester', actorKind: 'agent' };
const assignee: Actor = { actorId: 'agent:assignee', actorKind: 'agent' };

const ticketId = 'ticket:subtraction';
const newTicket: BugPayload = {
  title: 'Fix the subtraction button',
  description: 'The calculator adds numbers when subtraction is selected.',
  acceptanceCriteria: [],
  status: 'to_do',
};
const criteriaUpdate: BugPayload = { ...newTicket, acceptanceCriteria: ['Subtracting 2 from 5 must display 3.'], status: 'in_progress' };

export async function issueTrackingExamples(root: string): Promise<ExampleSet> {
  const created = await saveTicket({ artifactId: ticketId, expectedVersion: 0, payload: newTicket, actor: requester }, root, () => '2026-08-26T10:00:00Z');
  await stageTicketChanges({ artifactId: ticketId, expectedVersion: created.release.artifactVersion, payload: criteriaUpdate, actor: assignee }, root);
  await saveTicketChanges({ artifactId: ticketId, actor: assignee }, root, () => '2026-09-11T10:00:00Z');

  // The proofs as a reader receives them: the ticket's history, verified on read.
  const [first, second] = await ticketHistory(ticketId, root);
  if (!first || !second) throw new Error('the issue tracking scenario expected two released versions');
  // The tracker serves proofs, not authored versions. Each authored version (with its authoredBy) is the stored
  // record behind the release boundary, read here from the scratch workspace and never changed.
  const stored = ((await readWorkspace(root)).bugTickets as { history: { artifact: { artifactId: string; artifactVersion: number } }[] }).history;
  const authored = (version: number) => {
    const matches = stored.filter((record) => record.artifact.artifactId === ticketId && record.artifact.artifactVersion === version);
    if (matches.length !== 1) throw new Error(`the issue tracking scenario expected one stored version ${version}`);
    return matches[0]!.artifact;
  };

  return {
    set: 'issue-tracking',
    files: {
      'profile-revision.json': first.profile,
      'artifact-version_new-ticket.json': authored(first.release.artifactVersion),
      'release-authorization_new-ticket.json': first.authorization,
      'release_new-ticket.json': first.release,
      'release-proof_new-ticket.json': first,
      'artifact-version_criteria-update.json': authored(second.release.artifactVersion),
      'release-authorization_criteria-update.json': second.authorization,
      'release_criteria-update.json': second.release,
      'release-proof_criteria-update.json': second,
    },
  };
}
