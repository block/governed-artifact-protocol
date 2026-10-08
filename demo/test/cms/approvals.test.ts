import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  approvePost, loadCmsWorkspace, previewAuthorization, previewProfileRatification, previewReleaseApproval,
  listRejections, proposeBlogModel, publishPost, ratifyProfile, readRelease, rejectPost, saveBlogPost, verifyReleaseProof,
} from '../../src/domains/cms/cms.js';
import { authorizationSubjectDigest, payloadDigest, type Actor, type ReleaseProof } from '../../src/domains/cms/domain.js';
import { writeWorkspace } from '../../src/domains/cms/workspace.js';

const writer: Actor = { actorId: 'agent:writer', actorKind: 'agent' };
const editor: Actor = { actorId: 'human:editor', actorKind: 'human' };
const publisher: Actor = { actorId: 'human:publisher', actorKind: 'human' };
const reviewer: Actor = { actorId: 'agent:local-reviewer', actorKind: 'agent' };
const localPublisher: Actor = { actorId: 'agent:local-publisher', actorKind: 'agent' };
const mexicoContent = { headline: 'Visitas de invierno a los santuarios de la monarca', body: 'Consulta las fechas de apertura de los santuarios antes de planear una visita de invierno en México.' };

const post = 'blog-post:approval-test';

async function temporaryWorkspace(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'gap-cms-approvals-'));
  try { await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}

/** Ratify the blog model and save two drafts of one post. */
async function drafted(root: string) {
  await proposeBlogModel({ actorId: 'agent:content-designer', actorKind: 'agent' }, root);
  const model = await previewProfileRatification('blog-post', 1, root);
  await ratifyProfile({ profileId: 'blog-post', revision: 1, ratifiedBy: { actorId: 'human:content-model-owner', actorKind: 'human' }, confirmation: model.confirmation }, root);
  const base = { artifactId: post, author: 'Grounds staff', date: '2026-09-03T09:30:00Z', audience: 'public' as const, authoredBy: writer };
  await saveBlogPost({ ...base, expectedVersion: 0, content: { 'es-MX': mexicoContent, 'en-US': { headline: 'The fall count', body: 'Volunteers walk the same three transects every morning from late September through October and write down what they see. It takes about an hour.' } } }, root);
  await saveBlogPost({ ...base, expectedVersion: 1, content: { 'es-MX': mexicoContent, 'en-US': { headline: 'Help us count the monarchs, starting the second Saturday in September', body: 'Volunteers walk the same three transects every morning from late September through October. Orientation is the second Saturday in September, by the prairie beds.' } } }, root);
}
async function approved(root: string, version: number, approvedBy = editor) {
  const preview = await previewReleaseApproval(post, version, root);
  return approvePost({ artifactId: post, artifactVersion: version, approvedBy, confirmation: preview.confirmation, approvedAt: '2026-08-26T09:00:00.000Z' }, root);
}
async function published(root: string, version: number, authorizedBy = publisher) {
  const preview = await previewAuthorization(post, version, root);
  return publishPost({ artifactId: post, artifactVersion: version, authorizedBy, confirmation: preview.confirmation, authorizedAt: '2026-08-26T09:30:00.000Z' }, root);
}

test('a byline date must name a moment that exists, not one Date.parse would round', () => temporaryWorkspace(async (root) => {
  await drafted(root);
  const content = { 'es-MX': mexicoContent, 'en-US': { headline: 'Another', body: 'Another body.' } };
  const base = { artifactId: 'blog-post:dates', author: 'Grounds staff', audience: 'public' as const, authoredBy: writer, content };
  for (const date of ['2026-02-30T09:30:00Z', '2100-02-29T09:30:00Z', '2026-10-26T24:00:00Z', '2026-10-26T09:30:00+25:00', '2026-10-26', '2026-10-26 09:30:00Z']) {
    await assert.rejects(() => saveBlogPost({ ...base, expectedVersion: 0, date }, root), /real moment/, date);
  }
  const saved = await saveBlogPost({ ...base, expectedVersion: 0, date: '2026-02-28T09:30:00.250-06:00' }, root);
  assert.equal((saved.payload as { date: string }).date, '2026-02-28T09:30:00.250-06:00');
  // Years 0 through 99 are real Gregorian years here, not the 1900s that Date.UTC would read them as.
  const early = await saveBlogPost({ ...base, artifactId: 'blog-post:year-zero', expectedVersion: 0, date: '0000-02-29T09:30:00Z' }, root);
  assert.equal((early.payload as { date: string }).date, '0000-02-29T09:30:00Z');
}));

test('approval binds the stored subject and releases nothing', () => temporaryWorkspace(async (root) => {
  await drafted(root);
  const preview = await previewReleaseApproval(post, 1, root);
  assert.match(preview.confirmation, /^APPROVE blog-post:approval-test v1 sha256:/);
  const approval = await approved(root, 1);
  assert.deepEqual(
    { artifactId: approval.artifactId, artifactVersion: approval.artifactVersion, payloadDigest: approval.payloadDigest, profile: approval.profile, authorizationSubjectDigest: approval.authorizationSubjectDigest },
    { artifactId: preview.artifactId, artifactVersion: preview.artifactVersion, payloadDigest: preview.payloadDigest, profile: preview.profile, authorizationSubjectDigest: preview.authorizationSubjectDigest },
  );
  assert.equal(approval.authorizationSubjectDigest, authorizationSubjectDigest(approval));
  assert.deepEqual(approval.approvedBy, editor);
  const workspace = await loadCmsWorkspace(root);
  assert.equal(workspace.approvals.length, 1);
  assert.equal(workspace.authorizations.length, 0);
  assert.equal(workspace.releases.length, 0);
  await assert.rejects(() => readRelease(post, 'public', root), /release not found/);
  await assert.rejects(() => approved(root, 1), /already recorded/);
  assert.equal((await loadCmsWorkspace(root)).approvals.length, 1);
}));

test('approval requires a configured approver and the exact APPROVE confirmation', () => temporaryWorkspace(async (root) => {
  await drafted(root);
  const preview = await previewReleaseApproval(post, 1, root);
  await assert.rejects(() => approvePost({ artifactId: post, artifactVersion: 1, approvedBy: writer, confirmation: preview.confirmation }, root), /not configured to approve/);
  await assert.rejects(() => approvePost({ artifactId: post, artifactVersion: 1, approvedBy: editor, confirmation: 'APPROVE something else' }, root), /does not exactly match/);
  const authorize = await previewAuthorization(post, 1, root);
  await assert.rejects(() => approvePost({ artifactId: post, artifactVersion: 1, approvedBy: editor, confirmation: authorize.confirmation }, root), /does not exactly match/);
  await assert.rejects(() => publishPost({ artifactId: post, artifactVersion: 1, authorizedBy: publisher, confirmation: preview.confirmation }, root), /does not exactly match/);
  assert.equal((await loadCmsWorkspace(root)).approvals.length, 0);
}));

test('approval confers no release authority and release authority confers no approval authority', () => temporaryWorkspace(async (root) => {
  await drafted(root);
  await approved(root, 1, reviewer);
  await assert.rejects(() => published(root, 1, reviewer), /not configured to authorize release/);
  await assert.rejects(() => approved(root, 1, localPublisher), /not configured to approve/);
  const workspace = await loadCmsWorkspace(root);
  assert.equal(workspace.approvals.length, 1);
  assert.equal(workspace.releases.length, 0);
  const proof = await published(root, 1, localPublisher);
  assert.deepEqual(proof.approvals?.map((item) => item.approvedBy), [reviewer]);
}));

test('publish refuses without a release approval that binds the stored subject', () => temporaryWorkspace(async (root) => {
  await drafted(root);
  await assert.rejects(() => published(root, 2), /requires a release approval/);
  await approved(root, 1);
  await assert.rejects(() => published(root, 2), /requires a release approval/);
  // Rewriting stored bytes under the approved version is outside GAP; the approval no longer binds what would be released.
  const workspace = await loadCmsWorkspace(root);
  (workspace.artifacts.find((item) => item.artifactId === post && item.artifactVersion === 1)!.payload as any).body = 'Rewritten after approval.';
  await writeWorkspace(workspace, root);
  await assert.rejects(() => published(root, 1), /does not bind the stored artifact version/);
  const after = await loadCmsWorkspace(root);
  assert.equal(after.authorizations.length, 0);
  assert.equal(after.releases.length, 0);
}));

test('the proof carries the approval, names both actors, and verifies', () => temporaryWorkspace(async (root) => {
  await drafted(root);
  const approval = await approved(root, 2);
  const proof = await published(root, 2);
  assert.deepEqual(proof.approvals, [approval]);
  assert.deepEqual(proof.authorization.authorizedBy, publisher);
  assert.deepEqual(proof.approvals![0]!.approvedBy, editor);
  assert.equal(proof.approvals![0]!.authorizationSubjectDigest, proof.authorization.authorizationSubjectDigest);
  assert.deepEqual(verifyReleaseProof(proof), { valid: true, artifactId: post, artifactVersion: 2 });
  assert.deepEqual(await readRelease(post, 'public', root), proof);
  const { approvals, ...stripped } = proof;
  assert.equal(approvals!.length, 1);
  assert.equal(verifyReleaseProof(stripped as ReleaseProof).valid, true);
}));

test('approval tampering fails closed in verification', () => temporaryWorkspace(async (root) => {
  await drafted(root);
  await approved(root, 2);
  const proof = await published(root, 2);
  const mutate = (change: (approval: any) => void) => { const copy = structuredClone(proof); change(copy.approvals![0]!); return copy; };
  assert.throws(() => verifyReleaseProof(mutate((a) => { a.artifactVersion = 1; })), /approval does not bind/);
  assert.throws(() => verifyReleaseProof(mutate((a) => { a.payloadDigest = `sha256:${'0'.repeat(64)}`; })), /approval does not bind/);
  assert.throws(() => verifyReleaseProof(mutate((a) => { a.authorizationSubjectDigest = `sha256:${'0'.repeat(64)}`; })), /subject digest does not match/);
  assert.throws(() => verifyReleaseProof(mutate((a) => { a.profile.digest = `sha256:${'1'.repeat(64)}`; })), /approval does not bind/);
  assert.throws(() => verifyReleaseProof(mutate((a) => { a.evidence = 'rendered page reviewed'; })), /release approval fields must be exactly/);
  assert.throws(() => verifyReleaseProof(mutate((a) => { a.approvedBy.actorKind = 'service'; })), /well-formed actor/);
  assert.throws(() => verifyReleaseProof(mutate((a) => { a.approvedAt = 'not-a-date'; })), /approvedAt must be an RFC 3339 date-time/);
  assert.throws(() => verifyReleaseProof(mutate((a) => { a.approvedAt = ''; })), /approvedAt must be an RFC 3339 date-time/);
  const duplicated = structuredClone(proof) as any; duplicated.approvals = [duplicated.approvals[0], structuredClone(duplicated.approvals[0])];
  assert.throws(() => verifyReleaseProof(duplicated), /approvals must be unique/);
  const notArray = structuredClone(proof) as any; notArray.approvals = notArray.approvals[0];
  assert.throws(() => verifyReleaseProof(notArray), /approvals must be an array/);
  assert.equal(verifyReleaseProof(proof).valid, true);
}));

test('store-backed reads fail closed on stored approvals that do not bind or whose approver is unconfigured', () => temporaryWorkspace(async (root) => {
  await drafted(root);
  await approved(root, 2);
  await published(root, 2);
  const workspace = await loadCmsWorkspace(root);
  const forged = structuredClone(workspace);
  forged.approvals[0]!.payloadDigest = payloadDigest({ audience: 'public', author: 'Other', content: { 'es-MX': mexicoContent, 'en-US': { headline: 'Other', body: 'Other' } }, date: '2026-09-03T09:30:00Z' });
  forged.approvals[0]!.authorizationSubjectDigest = authorizationSubjectDigest(forged.approvals[0]!);
  await writeWorkspace(forged, root);
  await assert.rejects(() => readRelease(post, 'public', root), /does not bind the stored artifact version/);
  const unconfigured = structuredClone(workspace);
  unconfigured.releaseApprovalAuthorities = unconfigured.releaseApprovalAuthorities.filter((item) => item.authority.actorKind !== 'human');
  await writeWorkspace(unconfigured, root);
  await assert.rejects(() => readRelease(post, 'public', root), /not a configured approval authority/);
  await writeWorkspace(workspace, root);
  assert.equal((await readRelease(post, 'public', root)).approvals?.length, 1);
}));

test('approval is refused once the version is released', () => temporaryWorkspace(async (root) => {
  await drafted(root);
  await approved(root, 2);
  const proof = await published(root, 2);
  await assert.rejects(() => approved(root, 2, reviewer), /already released/);
  assert.equal((await loadCmsWorkspace(root)).approvals.length, 1);
  assert.deepEqual(await readRelease(post, 'public', root), proof);
  // Version 1 was never released, so it can still be approved; approval of one version says nothing about another.
  await approved(root, 1, reviewer);
  assert.equal((await loadCmsWorkspace(root)).approvals.length, 2);
  assert.deepEqual(await readRelease(post, 'public', root), proof);
}));

test('verification requires RFC 3339 timestamps on the ratification and authorization as well', () => temporaryWorkspace(async (root) => {
  await drafted(root);
  await approved(root, 2);
  const proof = await published(root, 2);
  const withAuthorizedAt = structuredClone(proof); withAuthorizedAt.authorization.authorizedAt = 'yesterday';
  assert.throws(() => verifyReleaseProof(withAuthorizedAt), /authorizedAt must be an RFC 3339 date-time/);
  const withRatifiedAt = structuredClone(proof); withRatifiedAt.profile.ratification.ratifiedAt = '2026-08-26';
  assert.throws(() => verifyReleaseProof(withRatifiedAt), /ratifiedAt must be an RFC 3339 date-time/);
  assert.equal(verifyReleaseProof(proof).valid, true);
}));

// --- decision reasons (draft, Primitives): attributed text beside the actor, outside every digest ---
const ratifyReason = 'The model supports English and Spanish for readers in the US and Mexico, requiring US English and Mexican Spanish, with fallback within each country.';
const approveReason = 'The headline is thin, but sign-ups close soon and I want this up before the weekend. We can fix it in the next version.';
const publishReason = 'Approved by the editor and scheduled ahead of the September orientation.';

test('ratification, approval, and authorization each carry an optional reason that changes no digest', () => temporaryWorkspace(async (root) => {
  await proposeBlogModel({ actorId: 'agent:content-designer', actorKind: 'agent' }, root);
  const model = await previewProfileRatification('blog-post', 1, root);
  const owner = { actorId: 'human:content-model-owner', actorKind: 'human' as const };
  const ratified = await ratifyProfile({ profileId: 'blog-post', revision: 1, ratifiedBy: owner, confirmation: model.confirmation, reason: ratifyReason }, root);
  assert.equal(ratified.profile.ratification.reason, ratifyReason);
  assert.equal(ratified.profile.digest, model.subjectDigest, 'ratification is outside the profile digest, so the reason changes no pin');
  await saveBlogPost({ artifactId: post, expectedVersion: 0, author: 'Grounds staff', date: '2026-09-03T09:30:00Z', audience: 'public', authoredBy: writer, content: { 'es-MX': mexicoContent, 'en-US': { headline: 'The fall count', body: 'Volunteers walk the same three transects every morning from late September through October and write down what they see. It takes about an hour.' } } }, root);
  const approvalPreview = await previewReleaseApproval(post, 1, root);
  const approval = await approvePost({ artifactId: post, artifactVersion: 1, approvedBy: editor, confirmation: approvalPreview.confirmation, reason: approveReason }, root);
  assert.equal(approval.reason, approveReason);
  assert.equal(approval.authorizationSubjectDigest, approvalPreview.authorizationSubjectDigest);
  assert.equal(authorizationSubjectDigest(approval), approval.authorizationSubjectDigest, 'the subject digest covers the four subject fields only');
  const publishPreview = await previewAuthorization(post, 1, root);
  const proof = await publishPost({ artifactId: post, artifactVersion: 1, authorizedBy: publisher, confirmation: publishPreview.confirmation, reason: publishReason }, root);
  assert.equal(proof.authorization.reason, publishReason);
  assert.equal(proof.authorization.authorizationSubjectDigest, publishPreview.authorizationSubjectDigest);
  assert.equal(proof.approvals![0]!.reason, approveReason);
  assert.equal(proof.profile.ratification.reason, ratifyReason);
  assert.deepEqual(verifyReleaseProof(proof), { valid: true, artifactId: post, artifactVersion: 1 });
  assert.deepEqual(await readRelease(post, 'public', root), proof);
  // Stripping every reason leaves a proof that still verifies with the same digests: a reason is not part of any binding.
  const stripped = structuredClone(proof) as any;
  delete stripped.authorization.reason; delete stripped.approvals[0].reason; delete stripped.profile.ratification.reason;
  assert.deepEqual(verifyReleaseProof(stripped), { valid: true, artifactId: post, artifactVersion: 1 });
  assert.equal(stripped.authorization.authorizationSubjectDigest, proof.authorization.authorizationSubjectDigest);
  assert.equal(stripped.profile.digest, proof.profile.digest);
}));

test('a decision without a reason is complete, and a blank or oversized reason is refused before anything is recorded', () => temporaryWorkspace(async (root) => {
  await drafted(root);
  const approval = await approved(root, 2);
  assert.equal('reason' in approval, false);
  const preview = await previewAuthorization(post, 2, root);
  for (const reason of ['', '   ', 'x'.repeat(5001)]) {
    await assert.rejects(() => publishPost({ artifactId: post, artifactVersion: 2, authorizedBy: publisher, confirmation: preview.confirmation, reason }, root), /authorization reason must be a non-blank string of at most 5000 characters/);
    const approvalPreview = await previewReleaseApproval(post, 1, root);
    await assert.rejects(() => approvePost({ artifactId: post, artifactVersion: 1, approvedBy: editor, confirmation: approvalPreview.confirmation, reason }, root), /approval reason must be a non-blank string/);
  }
  const workspace = await loadCmsWorkspace(root);
  assert.equal(workspace.approvals.length, 1);
  assert.equal(workspace.releases.length, 0);
  const proof = await published(root, 2);
  assert.equal('reason' in proof.authorization, false);
  assert.equal(verifyReleaseProof(proof).valid, true);
  await proposeBlogModel({ actorId: 'agent:content-designer', actorKind: 'agent' }, root).catch(() => undefined);
  const model = await previewProfileRatification('blog-post', 1, root);
  await assert.rejects(() => ratifyProfile({ profileId: 'blog-post', revision: 2, ratifiedBy: { actorId: 'human:content-model-owner', actorKind: 'human' }, confirmation: model.confirmation, reason: '' }, root), /ratification reason must be a non-blank string/);
}));

test('verification accepts a reason only as bounded plain text on each decision record and gives it no other meaning', () => temporaryWorkspace(async (root) => {
  await drafted(root);
  await approved(root, 2);
  const proof = await published(root, 2);
  const mutate = (change: (copy: any) => void) => { const copy = structuredClone(proof) as any; change(copy); return copy as ReleaseProof; };
  // Present and well-formed: accepted on all three records at once.
  assert.equal(verifyReleaseProof(mutate((p) => { p.authorization.reason = publishReason; p.approvals[0].reason = approveReason; p.profile.ratification.reason = ratifyReason; })).valid, true);
  // Malformed: rejected wherever it appears.
  assert.throws(() => verifyReleaseProof(mutate((p) => { p.authorization.reason = ''; })), /authorization reason must be a non-blank string/);
  assert.throws(() => verifyReleaseProof(mutate((p) => { p.authorization.reason = { reviewed: true }; })), /authorization reason must be a non-blank string/);
  assert.throws(() => verifyReleaseProof(mutate((p) => { p.authorization.reason = 'x'.repeat(5001); })), /authorization reason must be a non-blank string/);
  assert.throws(() => verifyReleaseProof(mutate((p) => { p.approvals[0].reason = ' '; })), /release approval reason must be a non-blank string/);
  assert.throws(() => verifyReleaseProof(mutate((p) => { p.profile.ratification.reason = 7; })), /profile ratification reason must be a non-blank string/);
  // A reason is the only optional field: other free text is still an unknown field.
  assert.throws(() => verifyReleaseProof(mutate((p) => { p.authorization.note = publishReason; })), /authorization fields must be exactly/);
  assert.throws(() => verifyReleaseProof(mutate((p) => { p.profile.ratification.rationale = ratifyReason; })), /profile ratification fields must be exactly/);
  assert.equal(verifyReleaseProof(proof).valid, true);
}));

const rejectReason = 'The headline names the feature but not what the reader can do with it.';
async function rejected(root: string, version: number, rejectedBy = editor, reason: string | undefined = rejectReason) {
  return rejectPost({ artifactId: post, artifactVersion: version, rejectedBy, reason: reason as string, rejectedAt: '2026-08-26T08:30:00.000Z' }, root);
}

test('a rejection binds the stored subject like an approval, requires a reason here, and changes no lifecycle state', () => temporaryWorkspace(async (root) => {
  await drafted(root);
  const preview = await previewReleaseApproval(post, 1, root);
  const rejection = await rejected(root, 1);
  assert.deepEqual(
    { artifactId: rejection.artifactId, artifactVersion: rejection.artifactVersion, payloadDigest: rejection.payloadDigest, profile: rejection.profile, authorizationSubjectDigest: rejection.authorizationSubjectDigest },
    { artifactId: preview.artifactId, artifactVersion: preview.artifactVersion, payloadDigest: preview.payloadDigest, profile: preview.profile, authorizationSubjectDigest: preview.authorizationSubjectDigest },
  );
  assert.equal(rejection.authorizationSubjectDigest, authorizationSubjectDigest(rejection), 'the subject digest recomputes from the four subject fields; the reason is outside it');
  assert.deepEqual(rejection.rejectedBy, editor);
  assert.equal(rejection.reason, rejectReason);
  assert.deepEqual(Object.keys(rejection).sort(), ['artifactId', 'artifactVersion', 'authorizationSubjectDigest', 'payloadDigest', 'profile', 'reason', 'rejectedAt', 'rejectedBy']);
  const workspace = await loadCmsWorkspace(root);
  assert.equal(workspace.rejections.length, 1);
  assert.equal(workspace.approvals.length, 0);
  assert.equal(workspace.authorizations.length, 0);
  assert.equal(workspace.releases.length, 0);
  assert.deepEqual(workspace.artifacts.map((item) => item.artifactVersion), [1, 2], 'no version is created or changed');
  await assert.rejects(() => readRelease(post, 'public', root), /release not found/, 'nothing is released');
  assert.deepEqual(await listRejections(post, root), [rejection]);
  // Local policy: a reason is required and must be plain bounded text. GAP leaves it optional.
  await assert.rejects(() => rejectPost({ artifactId: post, artifactVersion: 2, rejectedBy: editor } as any, root), /rejection requires a reason/);
  for (const reason of ['', '   ', 'x'.repeat(5001)]) await assert.rejects(() => rejected(root, 2, editor, reason), /rejection reason must be a non-blank string/);
  await assert.rejects(() => rejected(root, 2, writer), /not configured to approve/, 'the same configured approval authority is required');
  await assert.rejects(() => rejected(root, 1), /already recorded/, 'one rejection per actor per version');
  await assert.rejects(() => rejected(root, 9), /artifact version not found/);
  assert.equal((await loadCmsWorkspace(root)).rejections.length, 1, 'refusals record nothing');
  // A rejection blocks nothing: the same authority may still approve the same exact version, and the reviewer may still approve it too.
  const approval = await approved(root, 1);
  assert.equal(approval.authorizationSubjectDigest, rejection.authorizationSubjectDigest);
  await approved(root, 1, reviewer);
}));

test('the proof carries every rejection of its subject beside the approvals, and a verified rejection does not invalidate the release', () => temporaryWorkspace(async (root) => {
  await drafted(root);
  await rejected(root, 1, editor, 'Version 1 is superseded by the revised headline.');
  await rejected(root, 2, reviewer);
  await approved(root, 2);
  const proof = await published(root, 2);
  assert.equal(proof.approvals?.length, 1);
  assert.equal(proof.rejections?.length, 1, 'the rejection of the released version travels with the proof');
  assert.equal('rejections' in proof && proof.rejections![0]!.artifactVersion, 2, 'the rejection of version 1 is another subject and is not carried');
  assert.deepEqual(proof.rejections![0]!.rejectedBy, reviewer);
  assert.equal(proof.rejections![0]!.reason, rejectReason);
  assert.equal(proof.rejections![0]!.authorizationSubjectDigest, proof.authorization.authorizationSubjectDigest);
  assert.equal(verifyReleaseProof(proof).valid, true);
  assert.deepEqual(await readRelease(post, 'public', root), proof, 'the boundary serves the same proof, rejections included');
  const mutate = (change: (copy: any) => void) => { const copy = structuredClone(proof) as any; change(copy); return copy as ReleaseProof; };
  // Verification checks the binding and the shape, then gives the rejection no other meaning.
  assert.throws(() => verifyReleaseProof(mutate((p) => { p.rejections[0].artifactVersion = 1; })), /release rejection subject verification failed: rejection does not bind/);
  assert.throws(() => verifyReleaseProof(mutate((p) => { p.rejections[0].payloadDigest = payloadDigest({ tampered: true }); })), /release rejection subject verification failed/);
  assert.throws(() => verifyReleaseProof(mutate((p) => { p.rejections[0].authorizationSubjectDigest = `sha256:${'2'.repeat(64)}`; })), /subject digest does not match the authorization/);
  assert.throws(() => verifyReleaseProof(mutate((p) => { p.rejections[0].rejectedBy = writer; p.rejections[0].rejectedBy = { actorId: '', actorKind: 'human' }; })), /release rejection authority/);
  assert.throws(() => verifyReleaseProof(mutate((p) => { p.rejections[0].reason = ''; })), /release rejection reason must be a non-blank string/);
  assert.throws(() => verifyReleaseProof(mutate((p) => { p.rejections[0].note = rejectReason; })), /release rejection fields must be exactly/);
  assert.throws(() => verifyReleaseProof(mutate((p) => { p.rejections = p.rejections[0]; })), /release proof rejections must be an array/);
  assert.throws(() => verifyReleaseProof(mutate((p) => { p.rejections = [p.rejections[0], structuredClone(p.rejections[0])]; })), /release proof rejections must be unique/);
  assert.throws(() => verifyReleaseProof(mutate((p) => { p.rejections[0].rejectedAt = 'yesterday'; })), /release rejection rejectedAt must be an RFC 3339 date-time/);
  // A rejection without a reason is complete in GAP terms even though this CMS never records one.
  assert.equal(verifyReleaseProof(mutate((p) => { delete p.rejections[0].reason; })).valid, true);
  assert.equal(verifyReleaseProof(mutate((p) => { delete p.rejections; })).valid, true, 'a proof without rejections is complete');
}));

test('rejection is refused once the version is released, and stored rejections that do not bind fail closed on read', () => temporaryWorkspace(async (root) => {
  await drafted(root);
  await approved(root, 2);
  await published(root, 2);
  await assert.rejects(() => rejected(root, 2), /already released; a rejection is not a withdrawal/);
  await rejected(root, 1);
  assert.equal((await readRelease(post, 'public', root)).rejections, undefined, 'the rejection of version 1 does not appear in the proof of version 2');
  const workspace = await loadCmsWorkspace(root);
  const stray = { ...structuredClone(workspace.rejections[0]!), artifactVersion: 2 };
  await writeWorkspace({ ...workspace, rejections: [...workspace.rejections, stray] }, root);
  await assert.rejects(() => readRelease(post, 'public', root), /stored release rejection does not bind/);
  const unconfigured = { ...structuredClone(workspace.rejections[0]!), artifactVersion: 2, payloadDigest: (await previewReleaseApproval(post, 2, root)).payloadDigest, authorizationSubjectDigest: (await previewReleaseApproval(post, 2, root)).authorizationSubjectDigest, rejectedBy: writer };
  await writeWorkspace({ ...workspace, rejections: [...workspace.rejections, unconfigured] }, root);
  await assert.rejects(() => readRelease(post, 'public', root), /stored release rejection names an actor who is not a configured approval authority/);
}));
