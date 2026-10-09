/** A local journal's source, manuscript, review, and publication actions. Domain code performs every check. */
import { z } from 'zod';
import { defineAction, defineApplication } from '../../gap/index.js';
import { actorSchema as actor, sourceSchema, paperSchema, reviewSchema, editorNotesSchema } from './models.js';
import { researchWorkflow, saveSource, savePaper, saveReview, saveEditorNotes, previewResearch, decidePaper, releaseResearch, readResearch, verifyResearchProof, withdrawResearch, sweepResearch } from './research.js';
import { authorityActions, type TrustStore } from './authority.js';
import { applicationId, initializeWorkspace, resetWorkspace } from './workspace.js';
const id = z.string().min(1).max(200);
const version = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const trustStoreSchema = z.record(z.string().min(1), z.object({ publicKey: z.string().min(1), actions: z.array(z.enum(authorityActions as [string, ...string[]])).min(1) }).strict());
const JOURNAL = 'Gummy-worm recall walkthrough';
export const researchApplication = defineApplication({
  id: applicationId, title: 'Research journal',
  summary: 'A fictional paper asking whether floating gummy worms remember stories better, built on a previously published pace study and a recall-quiz methods paper, with exact citations, distinct peer review and editor notes, a source correction, signed editorial approval, and one final publication.',
  docs: { guide: '/domains/research', walkthrough: '/domains/research/demo' },
  groups: [{ name: JOURNAL, summary: 'Publish a synthetic paper on whether floating gummy worms remember stories better, after peer feedback and editorial approval; preserve the prior work it cites and verify signed records independently.' }],
  workspace: { initialize: initializeWorkspace, reset: resetWorkspace },
  actions: [
    defineAction({ name: 'get_research_workflow', title: 'Inspect the journal workflow', group: JOURNAL, steps: [],
      description: 'Discover pre-ratified source, paper, peer-review, and editor-notes profiles, local journal permissions and publication policy, demonstration key custody, and the journal and cited-works trust stores a reader configures. All studies and results are fictional.', input: {}, run: () => researchWorkflow() }),
    defineAction({ name: 'save_research_source', title: 'Save a study or methods paper', group: JOURNAL, steps: ['create-version'],
      description: 'Save immutable source material: a fictional reference study or reusable methods paper. Both use the source profile and must be released before a paper can pin them. Saving grants no release authority.',
      input: { artifactId: id, payload: sourceSchema, actor }, run: (input, { workspaceRoot }) => saveSource(input, workspaceRoot) }),
    defineAction({ name: 'save_research_paper', title: 'Save a manuscript version', group: JOURNAL, steps: ['create-version'],
      description: 'Save a complete immutable manuscript, bibliography, review responses, and ordered exact dependency set. Local policy requires released study material and one methods paper. Capture the versions actually used; never substitute a newer source. Credited authors belong in payload.authors; actor identifies who saves.',
      input: { artifactId: id, payload: paperSchema, actor }, run: (input, { workspaceRoot }) => savePaper(input, workspaceRoot) }),
    defineAction({ name: 'save_research_review', title: 'Save a peer-review report', group: JOURNAL, steps: ['create-version'],
      description: 'Save one report over the exact stored manuscript identity, payload digest, and profile pin. Section IDs and quotes must match that version. A draft manuscript reference is local domain content, not a dependency-set entry. Recommendation and feedback confer no publication authority.',
      input: { artifactId: id, payload: reviewSchema, actor }, run: (input, { workspaceRoot }) => saveReview(input, workspaceRoot) }),
    defineAction({ name: 'save_research_editor_notes', title: 'Save editor notes', group: JOURNAL, steps: ['create-version'],
      description: 'As configured journal editor, save notes under their own profile over an exact manuscript version and matching section quotes. Releasing notes shares feedback; it does not approve, reject, or publish the manuscript. Notes are distinct from peer-review reports and authority decisions.',
      input: { artifactId: id, payload: editorNotesSchema, actor }, run: (input, { workspaceRoot }) => saveEditorNotes(input, workspaceRoot) }),
    defineAction({ name: 'preview_research_release', title: 'Preview a version for a decision', group: JOURNAL, steps: [],
      description: 'Show the exact stored version, its subject digest, and current release selection. Carry the release, approval, or rejection confirmation for the relevant action as client state after contextual review; do not ask the person to transcribe it. Preview records no decision and releases nothing.',
      input: { artifactId: id, artifactVersion: version, actor }, run: (input, { workspaceRoot }) => previewResearch(input, workspaceRoot) }),
    defineAction({ name: 'approve_research_paper', title: 'Approve a manuscript for publication', group: JOURNAL, steps: ['approve-release'],
      description: 'As configured journal editor, sign approval of the exact previewed manuscript. Local policy requires a released report and responses to each pinned comment. Approval releases nothing and gives no publication authority; later edits require their own approval. A published version cannot be approved again. An optional reason is explanation outside the signed digest.',
      input: { artifactId: id, artifactVersion: version, actor, confirmation: z.string().min(1), reason: z.string().min(1).max(5000).optional() },
      run: (input, { workspaceRoot }) => decidePaper({ ...input, decision: 'approve' }, workspaceRoot) }),
    defineAction({ name: 'reject_research_paper', title: 'Decline a manuscript version', group: JOURNAL, steps: ['reject-release'],
      description: 'As configured journal editor, sign rejection of one exact previewed manuscript. Add a record preserving the manuscript and any earlier decisions. Rejection does not release or withdraw anything and does not itself prevent later approval of the same subject. A published version takes no further decisions; withdraw it instead. A peer recommendation is separate from this authority decision.',
      input: { artifactId: id, artifactVersion: version, actor, confirmation: z.string().min(1), reason: z.string().min(1).max(5000).optional() },
      run: (input, { workspaceRoot }) => decidePaper({ ...input, decision: 'reject' }, workspaceRoot) }),
    defineAction({ name: 'release_research', title: 'Release source material or a report, or publish a paper', group: JOURNAL, steps: ['authorize-release', 'release'],
      description: 'The configured authority signs authorization and releases the exact previewed version in one recoverable local transition. The cited-works editor releases source material; the journal publisher releases review reports, editor notes, and papers, and publishes a paper only after exact editorial approval. Preserve earlier records and append the local current selection. This synthetic demo does not send papers to a journal.',
      input: { artifactId: id, artifactVersion: version, actor, confirmation: z.string().min(1), expectedCurrentVersion: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) },
      run: (input, { workspaceRoot }) => releaseResearch(input, workspaceRoot) }),
    defineAction({ name: 'read_research', title: 'Read released research', group: JOURNAL, steps: ['verify'],
      description: 'Return verified release proofs for selected or exact historical versions. Drafts cannot be read here. A selected withdrawn paper returns its withdrawal alone; an exact read returns the unchanged original proof with the withdrawal attached. All released demonstration content is public.',
      input: { artifactId: id.optional(), artifactVersion: version.optional() }, run: (input, { workspaceRoot }) => readResearch(input, workspaceRoot) }),
    defineAction({ name: 'verify_research_proof', title: 'Verify a proof against reader trust', group: JOURNAL, steps: ['verify'],
      description: 'Check one supplied release proof or standalone withdrawal using its bytes and the reader’s trust store: the journal store for papers, reports, and notes, the cited-works store for sources. Recompute digests, validate the pinned JSON Schema contract, and verify every carried authority signature. Read no workspace or signing keys. Verification establishes release decisions, not research correctness.',
      input: { proof: z.record(z.string(), z.unknown()), trustStore: trustStoreSchema }, run: ({ proof, trustStore }) => verifyResearchProof(proof, trustStore as TrustStore) }),
    defineAction({ name: 'withdraw_research_paper', title: 'Withdraw a published paper version', group: JOURNAL, steps: ['withdraw-release'],
      description: 'As configured publisher, add a signed withdrawal of one exact published paper. Preserve its content, approvals, rejections, authorization, release, and source baseline. Withdrawal selects no replacement. The optional reason explains the decision and is outside its signature.',
      input: { artifactId: id, artifactVersion: version, actor, reason: z.string().min(1).max(5000).optional() }, run: (input, { workspaceRoot }) => withdrawResearch(input, workspaceRoot) }),
    defineAction({ name: 'sweep_research_sources', title: 'Check papers against their pinned sources', group: JOURNAL, steps: [],
      description: 'Compare each published paper baseline with independently verified source releases and local current selections. Return aligned, drift, integrity-failure, or unresolved. Findings change no record, make no claim of scientific correctness, and do not automatically withdraw dependent papers.',
      input: { actor }, run: ({ actor }, { workspaceRoot }) => sweepResearch(actor, workspaceRoot) }),
  ],
});
