/**
 * The issue tracking app as a GAP application. "Create ticket" and "Save changes"
 * each create, authorize, and release a version in one action; working copies
 * perform no lifecycle step. The lifecycle logic is in bug-tickets.ts
 * and working-copies.ts; this file only declares the
 * actions and their inputs.
 */
import { z } from 'zod';
import { defineAction, defineApplication } from '../../gap/index.js';
import { currentTickets, bugPolicy, saveTicket, ticketHistory } from './bug-tickets.js';
import { discardTicketWorkingCopy, getTicketWorkingCopy, saveTicketChanges, stageTicketChanges } from './working-copies.js';
import { applicationId, initializeWorkspace, resetWorkspace } from './workspace.js';

const actor = z.object({
  actorId: z.string().min(1).describe('Configured participant ID, for example agent:requester or agent:assignee.'),
  actorKind: z.enum(['human', 'agent']),
}).strict();
const artifactId = z.string().min(1).max(200);
const artifactVersion = z.number().int().positive();

const bugPayload = z.object({
  title: z.string().min(1).max(5000),
  description: z.string().min(1).max(5000),
  acceptanceCriteria: z.array(z.string().min(1).max(5000)).max(20),
  status: z.enum(['to_do', 'in_progress', 'done']),
}).strict();
const stagedPayload = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  acceptanceCriteria: z.array(z.string()).optional(),
  status: z.enum(['to_do', 'in_progress', 'done']).optional(),
}).strict().describe('Staged bug-ticket content. It may be incomplete or out of bounds while you iterate; the response reports validation against the pinned content model, and only a valid working copy can be saved.');
const completionEvidence = z.string().min(1).max(5000).describe('A description of the check performed, recorded as the authorization reason. Send it only when marking the ticket Done; a save with any other status that includes it is refused.');

const BUG = 'Bug ticket walkthrough';
const WORKING = 'Working copies';

export const issueTrackingApplication = defineApplication({
  id: applicationId,
  title: 'Issue tracking',
  summary: 'An issue tracking app where creating or saving a ticket creates, authorizes, and releases a version in one action, and an assignee can iterate on a working copy first.',
  docs: { guide: '/domains/issue-tracking', walkthrough: '/domains/issue-tracking/demo' },
  groups: [
    { name: BUG, summary: 'The bug ticket walkthrough: inspect the workflow, create a ticket, update or complete it, and read the current ticket or its history.' },
    { name: WORKING, summary: 'Stage and iterate on a working copy before saving. A working copy is application state, not a GAP record.' },
  ],
  workspace: { initialize: initializeWorkspace, reset: resetWorkspace },
  actions: [
    defineAction({
      name: 'get_ticket_workflow', title: 'Inspect the ticket workflow', group: BUG, steps: [],
      description: 'Discover the pre-ratified bug-ticket content model and configured create, update, and completion permissions for the guide workflow. Local actor attribution is not authentication.',
      input: {},
      run: () => bugPolicy,
    }),
    defineAction({
      name: 'create_ticket', title: 'Create a ticket', group: BUG, steps: ['create-version', 'authorize-release', 'release'],
      description: 'Create, authorize, and release a To do bug ticket in one application action. Use the configured requester actor. The request to create supplies authorization; there is no separate approval interaction.',
      input: { artifactId, payload: bugPayload, actor },
      run: (input, { workspaceRoot }) => saveTicket({ ...input, expectedVersion: 0 }, workspaceRoot),
    }),
    defineAction({
      name: 'update_ticket', title: 'Update or complete a ticket', group: BUG, steps: ['create-version', 'authorize-release', 'release'],
      description: 'Update, authorize, and release the next immutable bug-ticket version immediately using configured update authority. Carry expectedVersion from the last read; stale updates fail. Send completionEvidence only when marking the ticket Done: completing requires it, and any other save that includes it is refused. Preserve earlier content and proofs.',
      input: { artifactId, expectedVersion: artifactVersion, payload: bugPayload, actor, completionEvidence: completionEvidence.optional() },
      run: (input, { workspaceRoot }) => saveTicket(input, workspaceRoot),
    }),
    defineAction({
      name: 'list_current_tickets', title: 'List current tickets', group: BUG, steps: ['verify'],
      description: 'Read verified bug-ticket releases selected by the application-local save ledger. Current selection is not portable GAP supersession.',
      input: {},
      run: (_input, { workspaceRoot }) => currentTickets(workspaceRoot),
    }),
    defineAction({
      name: 'get_ticket_history', title: 'Read a ticket’s history', group: BUG, steps: ['verify'],
      description: 'Read every exact released bug-ticket version and its proof, preserving earlier payloads, criteria, and status.',
      input: { artifactId },
      run: ({ artifactId }, { workspaceRoot }) => ticketHistory(artifactId, workspaceRoot),
    }),

    defineAction({
      name: 'stage_ticket_changes', title: 'Stage a working copy', group: WORKING, steps: [],
      description: 'Stage or replace a mutable working copy of one released ticket to iterate on before saving. The payload replaces the whole working copy, so send every field you want to keep, copied from the version you read. A working copy is not an artifact version and not a GAP record: staging creates no version, no authorization, and no release, and the ticket and its history do not change. Any configured participant may stage; staging grants no authority to save. Carry expectedVersion from the last read. The response reports validation against the pinned content model and the fields that differ from the current version.',
      input: { artifactId, expectedVersion: artifactVersion, payload: stagedPayload, actor },
      run: (input, { workspaceRoot }) => stageTicketChanges(input, workspaceRoot),
    }),
    defineAction({
      name: 'get_ticket_working_copy', title: 'Read a working copy', group: WORKING, steps: [],
      description: 'Read the staged working copy for one ticket with its validation result, the fields that differ from the current released version, and whether it is stale. This is not a read of the ticket: the working copy is not an artifact version and has no release evidence.',
      input: { artifactId },
      run: ({ artifactId }, { workspaceRoot }) => getTicketWorkingCopy(artifactId, workspaceRoot),
    }),
    defineAction({
      name: 'discard_ticket_working_copy', title: 'Discard a working copy', group: WORKING, steps: [],
      description: 'Discard the staged working copy for one ticket. Nothing is created and the ticket does not change.',
      input: { artifactId, actor },
      run: (input, { workspaceRoot }) => discardTicketWorkingCopy(input, workspaceRoot),
    }),
    defineAction({
      name: 'save_ticket_changes', title: 'Save a working copy as a version', group: WORKING, steps: ['create-version', 'authorize-release', 'release'],
      description: 'Save the staged working copy: create, authorize, and release the next immutable bug-ticket version from it in one application action, using configured update authority, then remove the working copy. Fails if the working copy is missing, invalid, or stale. Send completionEvidence only when marking the ticket Done: completing requires it, and any other save that includes it is refused.',
      input: { artifactId, actor, completionEvidence: completionEvidence.optional() },
      run: (input, { workspaceRoot }) => saveTicketChanges(input, workspaceRoot),
    }),
  ],
});
