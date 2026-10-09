import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { feedback, manuscript, methods, methodsId, paperId, reviewId, study, studyId } from '../../examples/research-content.js';
import { decidePaper, previewResearch, releaseResearch, researchPayloadDigest, savePaper, saveReview, saveSource } from '../../src/domains/research/research.js';
import type { Actor } from '../../src/domains/research/models.js';
export { feedback, manuscript, methods, methodsId, paperId, reviewId, study, studyId };
export const sourceAuthor: Actor = { actorId: 'agent:source-author', actorKind: 'agent' };
export const paperAuthor: Actor = { actorId: 'agent:paper-author', actorKind: 'agent' };
export const citedWorksEditor: Actor = { actorId: 'human:cited-works-editor', actorKind: 'human' };
export const peer: Actor = { actorId: 'human:peer-reviewer', actorKind: 'human' };
export const editor: Actor = { actorId: 'human:journal-editor', actorKind: 'human' };
export const publisher: Actor = { actorId: 'human:journal-publisher', actorKind: 'human' };
export const owner: Actor = { actorId: 'human:journal-owner', actorKind: 'human' };
export const reader: Actor = { actorId: 'agent:public-reader', actorKind: 'agent' };
export const sweep: Actor = { actorId: 'agent:sweep', actorKind: 'agent' };
export async function withWorkspace(run: (root: string) => Promise<void>) { const root = await mkdtemp(join(tmpdir(), 'gap-research-test-')); try { await run(root); } finally { await rm(root, { recursive: true, force: true }); } }
export function entry(artifact: { artifactId: string; artifactVersion: number; payload: unknown }) { return { artifactId: artifact.artifactId, artifactVersion: artifact.artifactVersion, payloadDigest: researchPayloadDigest(artifact.payload) }; }
export async function release(root: string, artifact: { artifactId: string; artifactVersion: number }, actor: Actor) { const p = await previewResearch({ ...artifact, actor }, root); return releaseResearch({ artifactId: artifact.artifactId, artifactVersion: artifact.artifactVersion, actor, confirmation: p.confirmation, expectedCurrentVersion: p.expectedCurrentVersion }, root); }
export async function approve(root: string, artifact: { artifactId: string; artifactVersion: number }) { const p = await previewResearch({ ...artifact, actor: editor }, root); return decidePaper({ artifactId: artifact.artifactId, artifactVersion: artifact.artifactVersion, actor: editor, decision: 'approve', confirmation: p.approvalConfirmation }, root); }
export async function prepared(root: string) {
  const source = await saveSource({ artifactId: studyId, payload: study(), actor: sourceAuthor }, root); await release(root, source, citedWorksEditor);
  const method = await saveSource({ artifactId: methodsId, payload: methods, actor: citedWorksEditor }, root); await release(root, method, citedWorksEditor);
  const draft = await savePaper({ artifactId: paperId, payload: manuscript([entry(source), entry(method)]), actor: paperAuthor }, root);
  const review = await saveReview({ artifactId: reviewId, actor: peer, payload: { manuscript: { ...entry(draft), profile: draft.profile }, reviewer: 'Fictional Peer Reviewer', recommendation: 'revise', feedback } }, root); await release(root, review, publisher);
  const revised = await savePaper({ artifactId: paperId, payload: manuscript([entry(source), entry(method), entry(review)], true), actor: paperAuthor }, root);
  return { source, method, draft, review, revised };
}
export async function published(root: string) { const records = await prepared(root); await approve(root, records.revised); const proof = await release(root, records.revised, publisher); return { ...records, proof }; }
