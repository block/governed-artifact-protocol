import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { decidePaper, previewResearch, readResearch, releaseResearch, researchWorkflow, savePaper, saveReview, saveEditorNotes, saveSource, sweepResearch, withdrawResearch } from '../../src/domains/research/research.js';
import { signAsAuthority } from '../../src/domains/research/signing.js';
import { readWorkspace, workspacePath, writeWorkspace } from '../../src/domains/research/workspace.js';
import { approve, editor, entry, feedback, manuscript, citedWorksEditor, paperAuthor, paperId, peer, prepared, published, publisher, reader, release, reviewId, sourceAuthor, study, studyId, sweep, withWorkspace } from './fixtures.js';

import { editorNotesId, editorFeedback, reviewResponse } from '../../examples/research-content.js';

const stateOf = async (root: string) => (await readWorkspace(root)).research as any;

test('peer feedback binds the submitted manuscript; publication requires exact editor approval and separate publisher authority', () => withWorkspace(async root => {
  const { draft, review, revised } = await prepared(root);
  assert.deepEqual(review.payload.manuscript, { ...entry(draft), profile: draft.profile });
  assert.deepEqual(revised.payload.reviewResponses[0], { reviewArtifactId: reviewId, feedbackId: 'comment-1', response: reviewResponse });
  await assert.rejects(readResearch({ artifactId: paperId }, root), /draft is not released/);
  await assert.rejects(release(root, revised, publisher), /exact editorial approval/);
  for (const actor of [paperAuthor, peer, publisher]) {
    const p = await previewResearch({ ...revised, actor }, root);
    await assert.rejects(decidePaper({ ...revised, actor, decision: 'approve', confirmation: p.approvalConfirmation }, root), /editorial authority/);
  }
  await approve(root, revised);
  await assert.rejects(release(root, revised, editor), /publication authority/);
  const proof = await release(root, revised, publisher);
  assert.equal(proof.approvals?.[0]?.approvedBy.actorId, editor.actorId);
  assert.equal(proof.authorization.authorizedBy.actorId, publisher.actorId);
  assert.equal(proof.approvals?.[0]?.authorizationSubjectDigest, proof.authorization.authorizationSubjectDigest);
}));

test('an approval cannot be reused after editing the paper; failed publication preserves every stored record', () => withWorkspace(async root => {
  const { revised } = await prepared(root); await approve(root, revised);
  const next = await savePaper({ artifactId: paperId, payload: { ...revised.payload, title: 'A changed title' } as any, actor: paperAuthor }, root);
  const before = await readFile(workspacePath(root), 'utf8');
  await assert.rejects(release(root, next, publisher), /exact editorial approval/);
  assert.equal(await readFile(workspacePath(root), 'utf8'), before);
}));

test('rejection adds signed evidence without releasing or changing a version and the same subject can later be approved', () => withWorkspace(async root => {
  const { revised } = await prepared(root);
  const before = structuredClone(await stateOf(root));
  const p = await previewResearch({ ...revised, actor: editor }, root);
  const rejected = await decidePaper({ ...revised, actor: editor, decision: 'reject', confirmation: p.rejectionConfirmation, reason: 'Awaiting the editorial source check.' }, root);
  const after = await stateOf(root);
  for (const key of Object.keys(before).filter(k => k !== 'rejections')) assert.deepEqual(after[key], before[key]);
  assert.equal(rejected.authoritySignature.signerId, editor.actorId);
  await assert.rejects(readResearch({ artifactId: paperId }, root), /draft/);
  await approve(root, revised); const proof = await release(root, revised, publisher);
  assert.deepEqual(proof.rejections, [rejected]);
}));

test('a published version refuses later editorial decisions and keeps serving its original proof', () => withWorkspace(async root => {
  const { revised, proof } = await published(root);
  const p = await previewResearch({ ...revised, actor: editor }, root);
  const before = await readFile(workspacePath(root), 'utf8');
  await assert.rejects(decidePaper({ ...revised, actor: editor, decision: 'reject', confirmation: p.rejectionConfirmation, reason: 'Second thoughts after publication.' }, root), /already released/);
  await assert.rejects(decidePaper({ ...revised, actor: editor, decision: 'approve', confirmation: p.approvalConfirmation }, root), /already released/);
  assert.equal(await readFile(workspacePath(root), 'utf8'), before);
  assert.deepEqual((await readResearch({ artifactId: paperId, artifactVersion: revised.artifactVersion }, root))[0], proof);
}));

test('release rejects stale selections, wrong confirmations, replay, and invalid actors without writes', () => withWorkspace(async root => {
  const { revised } = await prepared(root); await approve(root, revised);
  const p = await previewResearch({ ...revised, actor: publisher }, root);
  const input = { ...revised, actor: publisher, confirmation: p.confirmation, expectedCurrentVersion: p.expectedCurrentVersion };
  const before = await readFile(workspacePath(root), 'utf8');
  for (const changed of [{ confirmation: 'wrong' }, { expectedCurrentVersion: 9 }, { actor: reader }, { actor: { actorId: 'unknown', actorKind: 'human' as const } }]) {
    await assert.rejects(releaseResearch({ ...input, ...changed }, root));
    assert.equal(await readFile(workspacePath(root), 'utf8'), before);
  }
  await releaseResearch(input, root);
  const after = await readFile(workspacePath(root), 'utf8');
  await assert.rejects(releaseResearch(input, root), /stale|replay/);
  assert.equal(await readFile(workspacePath(root), 'utf8'), after);
}));

test('invalid manuscript contracts, citations, bibliography links, source pins, and responses save nothing', () => withWorkspace(async root => {
  const { revised } = await prepared(root);
  for (const mutate of [
    (p: any) => { p.title = ''; },
    (p: any) => { p.extra = 'unknown'; },
    (p: any) => { p.sections[0].citations = ['missing']; },
    (p: any) => { p.sections[1].id = p.sections[0].id; },
    (p: any) => { p.bibliography[0].sourceArtifactId = 'study:missing'; },
    (p: any) => { p.bibliography[0].year += 1; },
    (p: any) => { p.bibliography[0].authors = ['Uncredited Author']; },
    (p: any) => { p.bibliography[0].journal = 'Another Journal'; },
    (p: any) => { p.dependencySet.entries.reverse(); },
    (p: any) => { p.dependencySet.entries.push(p.dependencySet.entries[0]); },
    (p: any) => { p.dependencySet.entries[0].payloadDigest = `sha256:${'0'.repeat(64)}`; },
    (p: any) => { p.reviewResponses = []; },
    (p: any) => { p.reviewResponses[0].feedbackId = 'missing'; },
  ]) {
    const payload = structuredClone(revised.payload); mutate(payload);
    const before = await readFile(workspacePath(root), 'utf8');
    await assert.rejects(savePaper({ artifactId: paperId, payload: payload as any, actor: paperAuthor }, root));
    assert.equal(await readFile(workspacePath(root), 'utf8'), before);
  }
}));

test('review references and section quotes are exact domain content; they cannot capture a draft as a governed dependency', () => withWorkspace(async root => {
  const { draft, revised } = await prepared(root);
  for (const mutate of [
    (p: any) => { p.manuscript.payloadDigest = entry(revised).payloadDigest; },
    (p: any) => { p.manuscript.profile.digest = `sha256:${'0'.repeat(64)}`; },
    (p: any) => { p.feedback[0].sectionId = 'missing'; },
    (p: any) => { p.feedback[0].quotedText = 'not in this manuscript'; },
    (p: any) => { p.feedback.push(p.feedback[0]); },
  ]) {
    const payload: any = { manuscript: { ...entry(draft), profile: draft.profile }, reviewer: 'Fictional Peer Reviewer', recommendation: 'revise', feedback: structuredClone(feedback) }; mutate(payload);
    await assert.rejects(saveReview({ artifactId: 'review:invalid', payload, actor: peer }, root));
  }
  const bad = manuscript([entry(draft)], false);
  await assert.rejects(savePaper({ artifactId: 'paper:other', payload: bad, actor: paperAuthor }, root), /missing|baseline/);
}));

test('source corrections and methods revisions cause drift without rewriting historical baselines; missing and altered sources differ', () => withWorkspace(async root => {
  const { source, method, proof, revised, review } = await published(root);
  const original = structuredClone(proof);
  const [originalSource] = await readResearch({ artifactId: studyId, artifactVersion: source.artifactVersion }, root);
  const newer = await saveSource({ artifactId: studyId, payload: study(true), actor: sourceAuthor }, root);
  const beforeDraftSweep = await readFile(workspacePath(root), 'utf8');
  assert((await sweepResearch(sweep, root)).every(f => f.status === 'aligned'), 'a newer draft is not drift');
  assert.equal(await readFile(workspacePath(root), 'utf8'), beforeDraftSweep);
  await release(root, newer, citedWorksEditor);
  assert.deepEqual((await readResearch({ artifactId: studyId, artifactVersion: source.artifactVersion }, root))[0], originalSource, 'releasing study version 2 leaves version 1 readable unchanged');
  const nextMethod = await saveSource({ artifactId: method.artifactId, payload: { ...method.payload, body: `${method.payload.body} Report the correction date.` } as any, actor: citedWorksEditor }, root);
  await release(root, nextMethod, citedWorksEditor);
  const before = await readFile(workspacePath(root), 'utf8');
  const findings = await sweepResearch(sweep, root);
  assert.equal(findings.find(f => f.source.artifactId === studyId)?.status, 'drift');
  assert.equal(findings.find(f => f.source.artifactId === method.artifactId)?.status, 'drift');
  assert.equal(await readFile(workspacePath(root), 'utf8'), before);
  assert.deepEqual((await readResearch({ artifactId: paperId, artifactVersion: revised.artifactVersion }, root))[0], original);
  const oldBaseline = await savePaper({ artifactId: paperId, payload: manuscript([entry(source), entry(method), entry(review)], true), actor: paperAuthor }, root);
  assert.deepEqual(oldBaseline.payload.dependencySet, revised.payload.dependencySet, 'explicit old sources stay old');
  const data = await readWorkspace(root); const state = data.research as any;
  state.releases.find((r: any) => r.artifactId === studyId && r.artifactVersion === 1).payload.body = 'altered immutable source';
  await writeWorkspace(data, root);
  const beforeIntegritySweep = await readFile(workspacePath(root), 'utf8');
  assert.equal((await sweepResearch(sweep, root)).find(f => f.source.artifactId === studyId)?.status, 'integrity-failure');
  assert.equal(await readFile(workspacePath(root), 'utf8'), beforeIntegritySweep);
  state.releases = state.releases.filter((r: any) => !(r.artifactId === studyId && r.artifactVersion === 1));
  await writeWorkspace(data, root);
  const beforeUnresolvedSweep = await readFile(workspacePath(root), 'utf8');
  assert.equal((await sweepResearch(sweep, root)).find(f => f.source.artifactId === studyId)?.status, 'unresolved');
  assert.equal(await readFile(workspacePath(root), 'utf8'), beforeUnresolvedSweep);
}));

test('a later publication and withdrawal preserve the earlier proof; selected reads stop without falling back', () => withWorkspace(async root => {
  const { proof, revised } = await published(root);
  const later = await savePaper({ artifactId: paperId, payload: { ...revised.payload, title: 'A later gummy-worm recall paper version' } as any, actor: paperAuthor }, root);
  await approve(root, later); const laterProof = await release(root, later, publisher);
  const before = structuredClone(await stateOf(root));
  await assert.rejects(withdrawResearch({ ...later, actor: editor }, root), /withdrawal authority/);
  const withdrawn = await withdrawResearch({ ...later, actor: publisher, reason: 'Source correction requires editorial review.' }, root);
  const after = await stateOf(root);
  for (const key of Object.keys(before).filter(k => k !== 'withdrawals')) assert.deepEqual(after[key], before[key]);
  assert.deepEqual(withdrawn.authorization, laterProof.authorization);
  assert.deepEqual(withdrawn.approvals, laterProof.approvals);
  assert.deepEqual((await readResearch({ artifactId: paperId }, root))[0], { withdrawal: withdrawn.withdrawal });
  assert.deepEqual((await readResearch({ artifactId: paperId, artifactVersion: revised.artifactVersion }, root))[0], proof);
  assert.deepEqual((await readResearch({ artifactId: paperId, artifactVersion: later.artifactVersion }, root))[0], withdrawn);
}));

test('malformed, duplicated, mismatched, or untrusted withdrawals fail closed', () => withWorkspace(async root => {
  const { revised } = await published(root); await withdrawResearch({ ...revised, actor: publisher }, root);
  const baseline = structuredClone(await readWorkspace(root));
  for (const mutate of [
    (s: any) => { s.withdrawals[0].artifactVersion += 1; },
    (s: any) => { s.withdrawals[0].withdrawnBy = editor; },
    (s: any) => { s.withdrawals[0].payloadDigest = `sha256:${'0'.repeat(64)}`; },
    (s: any) => { s.withdrawals.push(s.withdrawals[0]); },
    (s: any) => { s.withdrawals[0] = null; },
  ]) {
    const data = structuredClone(baseline); mutate(data.research); await writeWorkspace(data, root);
    await assert.rejects(readResearch({ artifactId: paperId }, root), /withdrawal integrity/);
  }
}));

test('stored decisions must remain verifiable and the publication pair must remain complete', () => withWorkspace(async root => {
  const { revised } = await published(root); const baseline = structuredClone(await readWorkspace(root));
  for (const mutate of [
    (s: any) => { s.approvals[0].artifactId = 'paper:another'; },
    (s: any) => { s.approvals[0].approvedBy = publisher; },
    (s: any) => { s.approvals[0].authoritySignature.signature = 'invalid'; },
    (s: any) => { s.authorizations = s.authorizations.filter((a: any) => a.artifactId !== paperId); },
    (s: any) => { s.artifacts.find((a: any) => a.artifactId === paperId && a.artifactVersion === revised.artifactVersion).payload.title = 'changed'; },
  ]) {
    const data = structuredClone(baseline); mutate(data.research); await writeWorkspace(data, root);
    await assert.rejects(readResearch({ artifactId: paperId }, root), /integrity|missing/);
  }
}));

test('editor notes bind exact text under a separate profile and cannot substitute for peer review', () => withWorkspace(async root => {
  const { revised } = await prepared(root);
  const payload = { manuscript: { ...entry(revised), profile: revised.profile }, editor: 'Fictional Journal Editor', feedback: editorFeedback };
  const before = await readFile(workspacePath(root), 'utf8');
  await assert.rejects(saveEditorNotes({ artifactId: editorNotesId, payload, actor: peer }, root), /drafting permission/);
  await assert.rejects(saveEditorNotes({ artifactId: editorNotesId, payload: { ...payload, feedback: [{ ...editorFeedback[0], quotedText: 'Text that never appeared.' }] }, actor: editor }, root), /does not match/);
  await assert.rejects(saveEditorNotes({ artifactId: editorNotesId, payload: { ...payload, manuscript: { ...payload.manuscript, artifactVersion: 1 } }, actor: editor }, root), /exact manuscript/);
  assert.equal(await readFile(workspacePath(root), 'utf8'), before);
  const notes = await saveEditorNotes({ artifactId: editorNotesId, payload, actor: editor }, root);
  assert.equal(notes.profile.profileId, 'research-editor-notes');
  for (const actor of [peer, editor]) await assert.rejects(release(root, notes, actor), /publication authority/);
  await release(root, notes, publisher);
  const references = revised.payload.dependencySet.entries.filter((reference: any) => reference.artifactId !== reviewId);
  const candidatePayload = manuscript([...references, entry(notes)], true);
  candidatePayload.reviewResponses = [];
  const candidate = await savePaper({ artifactId: paperId, actor: paperAuthor, payload: candidatePayload }, root);
  await assert.rejects(approve(root, candidate), /requires a released review report/);
  const finalPayload = manuscript([...revised.payload.dependencySet.entries, entry(notes)], true);
  finalPayload.editorResponses = [];
  await assert.rejects(savePaper({ artifactId: paperId, actor: paperAuthor, payload: finalPayload }, root), /each pinned editor comment/);
}));

test('every saved version pins its ratified profile by exact ID, revision, and digest', () => withWorkspace(async root => {
  const { source, method, draft, review, revised } = await prepared(root);
  const profiles = researchWorkflow().profiles;
  for (const [artifact, profileId] of [[source, 'research-source'], [method, 'research-source'], [draft, 'research-paper'], [review, 'research-peer-review'], [revised, 'research-paper']] as const) {
    const profile = profiles.find((p: any) => p.profileId === profileId)!;
    assert.deepEqual(artifact.profile, { profileId: profile.profileId, revision: profile.revision, digest: profile.digest }, artifact.artifactId);
  }
}));

test('a correctly signed withdrawal by a trusted key without withdrawal permission fails the read', () => withWorkspace(async root => {
  await published(root); const baseline = structuredClone(await readWorkspace(root));
  const withdrawalOf = (state: any, artifactId: string) => {
    const { artifactId: id, artifactVersion, payloadDigest, profile, authorizationSubjectDigest } = state.authorizations.find((a: any) => a.artifactId === artifactId);
    return { artifactId: id, artifactVersion, payloadDigest, profile, authorizationSubjectDigest, withdrawnBy: publisher, withdrawnAt: '2026-10-08T12:00:00Z',
      authoritySignature: signAsAuthority('withdraw-release', publisher.actorId, authorizationSubjectDigest) };
  };
  // The publisher's key is trusted to withdraw; local policy lets it withdraw papers only.
  const paper = structuredClone(baseline); (paper.research as any).withdrawals.push(withdrawalOf(paper.research, paperId)); await writeWorkspace(paper, root);
  assert.deepEqual(Object.keys((await readResearch({ artifactId: paperId }, root))[0]), ['withdrawal']);
  const report = structuredClone(baseline); (report.research as any).withdrawals.push(withdrawalOf(report.research, reviewId)); await writeWorkspace(report, root);
  await assert.rejects(readResearch({ artifactId: reviewId }, root), /withdrawal integrity/);
  await assert.rejects(readResearch({ artifactId: paperId }, root), /withdrawal integrity/);
}));

test('a stored authorization reason outside the stored bounds fails the read', () => withWorkspace(async root => {
  await published(root); const baseline = structuredClone(await readWorkspace(root));
  const withReason = async (reason: unknown) => {
    const data = structuredClone(baseline); (data.research as any).authorizations.find((a: any) => a.artifactId === paperId).reason = reason; await writeWorkspace(data, root);
  };
  await withReason('x'.repeat(5000)); assert.equal(((await readResearch({ artifactId: paperId }, root))[0] as any).authorization.reason.length, 5000);
  for (const reason of ['', '   ', 'x'.repeat(5001), { text: 'not a string' }]) {
    await withReason(reason);
    await assert.rejects(readResearch({ artifactId: paperId }, root), /integrity/, JSON.stringify(reason).slice(0, 20));
  }
}));

test('a stored rejection that no longer verifies or binds fails the read of its released version', () => withWorkspace(async root => {
  const { revised } = await prepared(root);
  const p = await previewResearch({ ...revised, actor: editor }, root);
  await decidePaper({ ...revised, actor: editor, decision: 'reject', confirmation: p.rejectionConfirmation, reason: 'Awaiting the editorial source check.' }, root);
  await approve(root, revised); await release(root, revised, publisher);
  const baseline = structuredClone(await readWorkspace(root));
  for (const mutate of [
    (s: any) => { s.rejections[0].authoritySignature.signature = s.approvals[0].authoritySignature.signature; },
    (s: any) => { s.rejections[0].authoritySignature = s.approvals[0].authoritySignature; },
    (s: any) => { s.rejections[0].rejectedBy = publisher; },
    (s: any) => { s.rejections[0].payloadDigest = `sha256:${'0'.repeat(64)}`; },
    (s: any) => { s.rejections[0].reason = 'x'.repeat(5001); },
    (s: any) => { s.rejections.push(s.rejections[0]); },
  ]) {
    const data = structuredClone(baseline); mutate(data.research); await writeWorkspace(data, root);
    await assert.rejects(readResearch({ artifactId: paperId }, root), /integrity/);
  }
}));
