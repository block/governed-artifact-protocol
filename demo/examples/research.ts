/** Reproducible fictional gummy-worm recall-paper records, generated exclusively through this domain's actions. */
import { decidePaper, previewResearch, readResearch, releaseResearch, researchPayloadDigest, researchWorkflow, savePaper, saveReview, saveEditorNotes, saveSource, withdrawResearch } from '../src/domains/research/research.js';
import type { Actor, Reference } from '../src/domains/research/models.js';
import { feedback, editorFeedback, editorNotesId, manuscript, methods, methodsId, paperId, reviewId, study, studyId } from './research-content.js';
import type { ExampleSet } from './records.js';
const sourceAuthor: Actor = { actorId: 'agent:source-author', actorKind: 'agent' };
const paperAuthor: Actor = { actorId: 'agent:paper-author', actorKind: 'agent' };
const citedWorksEditor: Actor = { actorId: 'human:cited-works-editor', actorKind: 'human' };
const peer: Actor = { actorId: 'human:peer-reviewer', actorKind: 'human' };
const editor: Actor = { actorId: 'human:journal-editor', actorKind: 'human' };
const publisher: Actor = { actorId: 'human:journal-publisher', actorKind: 'human' };
const at = (time: string) => () => time;
export async function researchExamples(root: string): Promise<ExampleSet> {
  const entry = (a: { artifactId: string; artifactVersion: number; payload: unknown }): Reference => ({ artifactId: a.artifactId, artifactVersion: a.artifactVersion, payloadDigest: researchPayloadDigest(a.payload) });
  const release = async (a: { artifactId: string; artifactVersion: number }, actor: Actor, time: string) => {
    const p = await previewResearch({ ...a, actor }, root);
    return releaseResearch({ artifactId: a.artifactId, artifactVersion: a.artifactVersion, actor, confirmation: p.confirmation, expectedCurrentVersion: p.expectedCurrentVersion }, root, at(time));
  };
  const approve = async (a: { artifactId: string; artifactVersion: number }, time: string) => {
    const p = await previewResearch({ ...a, actor: editor }, root);
    return decidePaper({ ...a, actor: editor, decision: 'approve', confirmation: p.approvalConfirmation }, root, at(time));
  };
  const s1 = await saveSource({ artifactId: studyId, actor: sourceAuthor, payload: study() }, root);
  const s1Proof = await release(s1, citedWorksEditor, '2026-10-08T09:00:00Z');
  const m1 = await saveSource({ artifactId: methodsId, actor: citedWorksEditor, payload: methods }, root);
  const m1Proof = await release(m1, citedWorksEditor, '2026-10-08T09:15:00Z');
  const p1 = await savePaper({ artifactId: paperId, actor: paperAuthor, payload: manuscript([entry(s1), entry(m1)]) }, root);
  const p1Preview = await previewResearch({ ...p1, actor: editor }, root);
  const rejection = await decidePaper({ ...p1, actor: editor, decision: 'reject', confirmation: p1Preview.rejectionConfirmation, reason: 'The conclusion claims better recall, but the results report nearly equal scores, and the faster pace comes from the earlier study.' }, root, at('2026-10-08T10:00:00Z'));
  const r1 = await saveReview({ artifactId: reviewId, actor: peer, payload: { manuscript: { ...entry(p1), profile: p1.profile }, reviewer: 'Fictional Peer Reviewer', recommendation: 'revise', feedback } }, root);
  const r1Proof = await release(r1, publisher, '2026-10-08T11:00:00Z');
  const p2 = await savePaper({ artifactId: paperId, actor: paperAuthor, payload: manuscript([entry(s1), entry(m1), entry(r1)], true) }, root);
  const s2 = await saveSource({ artifactId: studyId, actor: sourceAuthor, payload: study(true) }, root);
  const s2Proof = await release(s2, citedWorksEditor, '2026-10-09T09:00:00Z');
  const notes = await saveEditorNotes({ artifactId: editorNotesId, actor: editor, payload: {
    manuscript: { ...entry(p2), profile: p2.profile }, editor: 'Fictional Journal Editor', feedback: editorFeedback,
  } }, root);
  const notesProof = await release(notes, publisher, '2026-10-09T10:00:00Z');
  const p3 = await savePaper({ artifactId: paperId, actor: paperAuthor, payload: manuscript([entry(s2), entry(m1), entry(r1), entry(notes)], true, true) }, root);
  const approval3 = await approve(p3, '2026-10-09T13:00:00Z');
  const p3Proof = await release(p3, publisher, '2026-10-09T14:00:00Z');
  // Separate protocol coverage: this fixture is not a publication in the gummy-worm recall walkthrough.
  const fixtureId = 'paper:withdrawal-coverage';
  const fixtureReviewId = 'review:withdrawal-coverage';
  const fixtureTitle = 'Withdrawal conformance fixture';
  const fixtureDraft = await savePaper({ artifactId: fixtureId, actor: paperAuthor,
    payload: { ...manuscript([entry(s2), entry(m1)], false, true), title: fixtureTitle } }, root);
  const fixtureReview = await saveReview({ artifactId: fixtureReviewId, actor: peer, payload: {
    manuscript: { ...entry(fixtureDraft), profile: fixtureDraft.profile }, reviewer: 'Fictional Conformance Reviewer', recommendation: 'revise', feedback,
  } }, root);
  const fixtureReviewProof = await release(fixtureReview, publisher, '2026-10-10T09:00:00Z');
  const fixturePayload = manuscript([entry(s2), entry(m1), entry(fixtureReview)], true, true);
  fixturePayload.title = fixtureTitle;
  fixturePayload.reviewResponses[0].reviewArtifactId = fixtureReviewId;
  const fixturePaper = await savePaper({ artifactId: fixtureId, actor: paperAuthor, payload: fixturePayload }, root);
  const fixtureApproval = await approve(fixturePaper, '2026-10-10T10:00:00Z');
  const fixtureProof = await release(fixturePaper, publisher, '2026-10-10T11:00:00Z');
  const withdrawn = await withdrawResearch({ ...fixturePaper, actor: publisher, reason: 'Synthetic fixture for checking withdrawal binding and evidence preservation.' }, root, at('2026-10-10T12:00:00Z'));
  const [withdrawnProof] = await readResearch({ artifactId: fixtureId, artifactVersion: fixturePaper.artifactVersion }, root);
  return { set: 'research', files: {
    'profile-revision_source.json': s1Proof.profile,
    'profile-revision_paper.json': p3Proof.profile,
    'profile-revision_review.json': r1Proof.profile,
    'profile-revision_editor-notes.json': notesProof.profile,
    ...records('study-1', s1, s1Proof), ...records('study-2', s2, s2Proof),
    ...records('methods-1', m1, m1Proof), ...records('review-1', r1, r1Proof), ...records('editor-notes-1', notes, notesProof),
    'artifact-version_paper-1.json': p1, 'release-rejection_paper-1.json': rejection,
    'artifact-version_paper-2.json': p2,
    ...records('paper-3', p3, p3Proof), 'release-approval_paper-3.json': approval3,
    'artifact-version_withdrawal-paper-1.json': fixtureDraft,
    ...records('withdrawal-review-1', fixtureReview, fixtureReviewProof),
    ...records('withdrawal-paper-2', fixturePaper, fixtureProof), 'release-approval_withdrawal-paper-2.json': fixtureApproval,
    'release-withdrawal_withdrawal-paper-2.json': withdrawn.withdrawal,
    'release-proof-withdrawn_withdrawal-paper-2.json': withdrawnProof,
    'trust-store_journal.json': researchWorkflow().trustStores.journal,
    'trust-store_cited-works.json': researchWorkflow().trustStores['cited-works'],
  } };
}
function records(name: string, artifact: unknown, proof: { authorization: unknown; release: unknown }) {
  return { [`artifact-version_${name}.json`]: artifact, [`release-authorization_${name}.json`]: proof.authorization, [`release_${name}.json`]: proof.release, [`release-proof_${name}.json`]: proof };
}
