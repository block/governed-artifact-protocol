import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createArtifactVersion, authorizeAndRelease, loadCmsWorkspace, previewAuthorization, readRelease, verifyReleaseProof } from '../../src/domains/cms/cms.js';
import { authorizationSubjectDigest, LOCAL_CONTRACT_LIMITS, payloadDigest, profileDigest, type ArticlePayload, type ReleaseProof } from '../../src/domains/cms/domain.js';
import { writeWorkspace } from '../../src/domains/cms/workspace.js';

const payload: ArticlePayload = { audience: 'public', body: 'A governed article body.', title: 'Governed article' };

async function temporaryWorkspace(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'gap-cms-'));
  try { await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}

async function authored(root: string, version = 1, value = payload) {
  return createArtifactVersion({
    profileId: 'cms.article',
    artifactId: 'article:welcome', artifactVersion: version, payload: value,
    authoredBy: { actorId: 'agent:writer', actorKind: 'agent' },
  }, root);
}

async function released(root: string): Promise<ReleaseProof> {
  await authored(root);
  const preview = await previewAuthorization('article:welcome', 1, root);
  return authorizeAndRelease({
    artifactId: 'article:welcome', artifactVersion: 1,
    authorizedBy: { actorId: 'person:local-editor', actorKind: 'human' },
    confirmation: preview.confirmation,
    authorizedAt: '2026-08-26T12:00:00.000Z',
  }, root);
}

test('authors immutable bounded versions pinned to the seeded ratified profile', () => temporaryWorkspace(async (root) => {
  const first = await authored(root);
  const second = await authored(root, 2, { ...payload, title: 'Correction' });
  assert.equal(first.profile.digest, second.profile.digest);
  assert.equal((await loadCmsWorkspace(root)).artifacts.length, 2);
  await assert.rejects(() => authored(root), /already exists/);
  await assert.rejects(() => authored(root, 3, { ...payload, title: '' }), /string length bounds/);
  await assert.rejects(() => authored(root, 3, { ...payload, extra: 'not allowed' } as unknown as ArticlePayload), /fields must be exactly/);
}));

test('drafts remain outside the release boundary and exact confirmation gates release', () => temporaryWorkspace(async (root) => {
  await authored(root);
  await assert.rejects(() => readRelease('article:welcome', 'public', root), /release not found/);
  await assert.rejects(() => authorizeAndRelease({
    artifactId: 'article:welcome', artifactVersion: 1,
    authorizedBy: { actorId: 'person:local-editor', actorKind: 'human' }, confirmation: 'AUTHORIZE something else',
  }, root), /does not exactly match/);
  const workspace = await loadCmsWorkspace(root);
  assert.equal(workspace.authorizations.length, 0);
  assert.equal(workspace.releases.length, 0);
}));

test('authorization and release persist together and proof bindings verify independently', () => temporaryWorkspace(async (root) => {
  const proof = await released(root);
  assert.deepEqual(verifyReleaseProof(proof), { valid: true, artifactId: 'article:welcome', artifactVersion: 1 });
  const restarted = await readRelease('article:welcome', 'public', root);
  assert.deepEqual(restarted, proof);
  const workspace = await loadCmsWorkspace(root);
  assert.equal(workspace.authorizations.length, 1);
  assert.equal(workspace.releases.length, 1);
  await assert.rejects(async () => authorizeAndRelease({
    artifactId: 'article:welcome', artifactVersion: 1,
    authorizedBy: { actorId: 'person:local-editor', actorKind: 'human' },
    confirmation: (await previewAuthorization('article:welcome', 1, root)).confirmation,
  }, root), /already has its one supported release/);
}));

test('configured agent authority can release but an unconfigured agent cannot', () => temporaryWorkspace(async (root) => {
  await authored(root);
  const preview = await previewAuthorization('article:welcome', 1, root);
  await assert.rejects(() => authorizeAndRelease({
    artifactId: 'article:welcome', artifactVersion: 1,
    authorizedBy: { actorId: 'agent:writer', actorKind: 'agent' }, confirmation: preview.confirmation,
  }, root), /not configured to authorize release/);
  const proof = await authorizeAndRelease({
    artifactId: 'article:welcome', artifactVersion: 1,
    authorizedBy: { actorId: 'agent:local-publisher', actorKind: 'agent' }, confirmation: preview.confirmation,
  }, root);
  assert.equal(proof.authorization.authorizedBy.actorKind, 'agent');
  assert.deepEqual(verifyReleaseProof(proof), { valid: true, artifactId: 'article:welcome', artifactVersion: 1 });
}));

test('release reads require the exact application audience label', () => temporaryWorkspace(async (root) => {
  await released(root);
  await assert.rejects(() => readRelease('article:welcome', 'members', root), /not found for audience/);
  assert.equal(((await readRelease('article:welcome', 'public', root)).release.payload as any).audience, 'public');
}));

test('verification fails closed on payload, profile pin, and subject tampering', () => temporaryWorkspace(async (root) => {
  const proof = await released(root);
  const payloadMutation = structuredClone(proof);
  (payloadMutation.release.payload as any).body = 'Tampered';
  assert.throws(() => verifyReleaseProof(payloadMutation), /payload digest/);
  const pinMutation = structuredClone(proof);
  pinMutation.release.profile.revision = 2;
  assert.throws(() => verifyReleaseProof(pinMutation), /profile pin/);
  const subjectMutation = structuredClone(proof);
  subjectMutation.authorization.authorizationSubjectDigest = `sha256:${'0'.repeat(64)}`;
  assert.throws(() => verifyReleaseProof(subjectMutation), /authorization subject/);
  const embeddedPolicy = { ...proof, releaseAuthorityPolicy: { profile: proof.release.profile, authority: proof.authorization.authorizedBy, audiences: ['public'] } };
  assert.throws(() => verifyReleaseProof(embeddedPolicy), /release proof fields must be exactly/);
  const unknownField = structuredClone(proof) as ReleaseProof & { ignored?: string };
  unknownField.ignored = 'must fail closed';
  assert.throws(() => verifyReleaseProof(unknownField), /release proof fields must be exactly/);
}));

test('proof omits local policy; standalone bindings do not confer authority', () => temporaryWorkspace(async (root) => {
  const proof = await released(root);
  assert.deepEqual(Object.keys(proof).sort(), ['authorization', 'profile', 'release']);
  const workspace = await loadCmsWorkspace(root);
  workspace.releaseAuthorityPolicies = [];
  await writeWorkspace(workspace, root);
  assert.equal(verifyReleaseProof(proof).valid, true, 'standalone verification checks bindings, not trust');
  await assert.rejects(() => readRelease(proof.release.artifactId, 'public', root), /current local policy/);
}));

test('incomplete persisted release pairs fail closed', () => temporaryWorkspace(async (root) => {
  const proof = await released(root);
  const workspace = await loadCmsWorkspace(root);
  await writeWorkspace({ ...workspace, authorizations: [] }, root);
  await assert.rejects(() => readRelease(proof.release.artifactId, 'public', root), /incomplete or ambiguous/);
}));

test('store-backed reads reject coordinated release and authorization tampering', () => temporaryWorkspace(async (root) => {
  await released(root);
  const workspace = await loadCmsWorkspace(root);
  (workspace.releases[0]!.payload as any).title = 'Coordinated forgery';
  workspace.authorizations[0]!.payloadDigest = payloadDigest(workspace.releases[0]!.payload);
  workspace.authorizations[0]!.authorizationSubjectDigest = authorizationSubjectDigest(workspace.authorizations[0]!);
  await writeWorkspace(workspace, root);

  await assert.rejects(() => readRelease('article:welcome', 'public', root), /immutable artifact binding/);
}));

test('verification rejects unknown and malformed profile contract semantics', () => temporaryWorkspace(async (root) => {
  const unknown = await released(root);
  (unknown.profile.payloadContract as unknown as Record<string, unknown>).unsupported = true;
  unknown.profile.digest = profileDigest(unknown.profile);
  unknown.release.profile.digest = unknown.profile.digest;
  unknown.authorization.profile.digest = unknown.profile.digest;
  unknown.authorization.authorizationSubjectDigest = authorizationSubjectDigest(unknown.authorization);
  assert.throws(() => verifyReleaseProof(unknown), /payload contract fields must be exactly/);

  const malformed = await readRelease('article:welcome', 'public', root);
  (malformed.profile.payloadContract.fields.title as any).maxLength = 0;
  malformed.profile.digest = profileDigest(malformed.profile);
  malformed.release.profile.digest = malformed.profile.digest;
  malformed.authorization.profile.digest = malformed.profile.digest;
  malformed.authorization.authorizationSubjectDigest = authorizationSubjectDigest(malformed.authorization);
  assert.throws(() => verifyReleaseProof(malformed), /inverted string bounds/);
}));

test('profile proposals remain non-authoritative until exact configured-human ratification', () => temporaryWorkspace(async (root) => {
  const { proposeProfile, previewProfileRatification, ratifyProfile, createArtifactVersion } = await import('../../src/domains/cms/cms.js');
  const contract = {
    type: 'object' as const, additionalProperties: false as const,
    fields: {
      audience: { type: 'string' as const, enum: ['public'] },
      name: { type: 'string' as const, minLength: 1, maxLength: 20 },
    }, required: ['audience', 'name'],
  };
  await proposeProfile({ profileId: 'cms.card', revision: 1, payloadContract: contract, proposedBy: { actorId: 'agent:designer', actorKind: 'agent' } }, root);
  await assert.rejects(() => createArtifactVersion({ artifactId: 'card:1', artifactVersion: 1, profileId: 'cms.card', payload: { audience: 'public', name: 'One' }, authoredBy: { actorId: 'agent:writer', actorKind: 'agent' } }, root), /ratified profile not found/);
  const preview = await previewProfileRatification('cms.card', 1, root);
  await assert.rejects(() => ratifyProfile({ profileId: 'cms.card', revision: 1, ratifiedBy: { actorId: 'agent:publisher', actorKind: 'agent' }, confirmation: preview.confirmation }, root), /attributed to a human/);
  await assert.rejects(() => ratifyProfile({ profileId: 'cms.card', revision: 1, ratifiedBy: { actorId: 'person:editor', actorKind: 'human' }, confirmation: 'wrong' }, root), /does not exactly match/);
  const ratified = await ratifyProfile({ profileId: 'cms.card', revision: 1, ratifiedBy: { actorId: 'person:editor', actorKind: 'human' }, confirmation: preview.confirmation }, root);
  assert.equal(ratified.profile.digest, preview.subjectDigest);
  const artifact = await createArtifactVersion({ artifactId: 'card:1', artifactVersion: 1, profileId: 'cms.card', payload: { audience: 'public', name: 'One' }, authoredBy: { actorId: 'agent:writer', actorKind: 'agent' } }, root);
  assert.equal(artifact.profile.digest, preview.subjectDigest);
  await assert.rejects(() => proposeProfile({ profileId: 'cms.card', revision: 1, payloadContract: contract, proposedBy: { actorId: 'agent:designer', actorKind: 'agent' } }, root), /already exists/);
}));

test('local contract capabilities permit 1000-item profile bounds and report larger bounds precisely', () => temporaryWorkspace(async (root) => {
  const { proposeProfile } = await import('../../src/domains/cms/cms.js');
  const contract = (maxItems: number) => ({
    type: 'object' as const, additionalProperties: false as const,
    fields: {
      audience: { type: 'string' as const, enum: ['public'] },
      images: { type: 'array' as const, minItems: 1, maxItems, items: { type: 'string' as const, minLength: 1, maxLength: 20 } },
    }, required: ['audience', 'images'],
  });
  const accepted = await proposeProfile({ profileId: 'cms.large-gallery', revision: 1, payloadContract: contract(LOCAL_CONTRACT_LIMITS.maxArrayItems), proposedBy: { actorId: 'agent:designer', actorKind: 'agent' } }, root);
  assert.equal((accepted.payloadContract.fields.images as any).maxItems, 1_000);
  await assert.rejects(() => proposeProfile({ profileId: 'cms.too-large', revision: 1, payloadContract: contract(1_001), proposedBy: { actorId: 'agent:designer', actorKind: 'agent' } }, root), /local maximum of 1000/);
}));

test('proposal conflicts explain the valid immutable-proposal workflow', () => temporaryWorkspace(async (root) => {
  const { proposeProfile } = await import('../../src/domains/cms/cms.js');
  const contract = {
    type: 'object' as const, additionalProperties: false as const,
    fields: { audience: { type: 'string' as const, enum: ['public'] }, title: { type: 'string' as const, maxLength: 20 } },
    required: ['audience', 'title'],
  };
  await proposeProfile({ profileId: 'cms.pending', revision: 1, payloadContract: contract, proposedBy: { actorId: 'agent:designer', actorKind: 'agent' } }, root);
  await assert.rejects(() => proposeProfile({ profileId: 'cms.pending', revision: 2, payloadContract: contract, proposedBy: { actorId: 'agent:designer', actorKind: 'agent' } }, root), /inspect and ratify it before proposing revision 2, or use a different profileId/);
  await assert.rejects(() => proposeProfile({ profileId: 'cms.pending', revision: 1, payloadContract: contract, proposedBy: { actorId: 'agent:designer', actorKind: 'agent' } }, root), /inspect it with get_profile_proposal and ratify it/);
}));

test('every profile proposal is kept unchanged, and ratification takes only the next revision number', () => temporaryWorkspace(async (root) => {
  const { listProfileProposals, previewProfileRatification, proposeProfile, ratifyProfile } = await import('../../src/domains/cms/cms.js');
  const contract = {
    type: 'object' as const, additionalProperties: false as const,
    fields: { audience: { type: 'string' as const, enum: ['public'] }, title: { type: 'string' as const, maxLength: 20 } },
    required: ['audience', 'title'],
  };
  const designer = { actorId: 'agent:designer', actorKind: 'agent' as const };
  const ratify = async (revision: number) => ratifyProfile({ profileId: 'cms.numbered', revision, ratifiedBy: { actorId: 'person:editor', actorKind: 'human' }, confirmation: (await previewProfileRatification('cms.numbered', revision, root)).confirmation }, root);
  const proposalsOf = async () => (await listProfileProposals(root)).filter((proposal) => proposal.profileId === 'cms.numbered');
  await assert.rejects(() => proposeProfile({ profileId: 'cms.numbered', revision: 2, payloadContract: contract, proposedBy: designer }, root), /must use next revision 1/);
  const first = await proposeProfile({ profileId: 'cms.numbered', revision: 1, payloadContract: contract, proposedBy: designer }, root);
  await ratify(1);
  assert.deepEqual(await proposalsOf(), [first], 'ratification keeps the proposal, unchanged');
  // This CMS refuses a proposal that skips a number when it is made; one written to the store directly must still not be ratified.
  const skipped = { ...structuredClone(first), revision: 3 };
  const workspace = await loadCmsWorkspace(root);
  await writeWorkspace({ ...workspace, profileProposals: [...workspace.profileProposals, skipped] }, root);
  await assert.rejects(() => ratify(3), /can ratify only its next revision 2, not revision 3/);
  assert.deepEqual(await proposalsOf(), [first, skipped], 'a refused ratification deletes no proposal');
  assert.deepEqual((await loadCmsWorkspace(root)).profiles.filter((profile) => profile.profileId === 'cms.numbered').map((profile) => profile.revision), [1]);
}));

test('seeded gallery proposal completes generic authoring, configured release, and verification', () => temporaryWorkspace(async (root) => {
  const { previewProfileRatification, ratifyProfile, createArtifactVersion } = await import('../../src/domains/cms/cms.js');
  const preview = await previewProfileRatification('cms.image-gallery', 1, root);
  await ratifyProfile({ profileId: 'cms.image-gallery', revision: 1, ratifiedBy: { actorId: 'person:local-editor', actorKind: 'human' }, confirmation: preview.confirmation }, root);
  await createArtifactVersion({ artifactId: 'gallery:launch', artifactVersion: 1, profileId: 'cms.image-gallery', authoredBy: { actorId: 'agent:curator', actorKind: 'agent' }, payload: {
    audience: 'public', title: 'Launch gallery', images: [
      { assetRef: 'asset:hero', assetDigest: `sha256:${'1'.repeat(64)}`, altText: 'A launch banner', caption: 'Hero image' },
      { assetRef: 'asset:detail', assetDigest: `sha256:${'2'.repeat(64)}`, altText: 'A product detail', caption: '' },
    ],
  } }, root);
  const auth = await previewAuthorization('gallery:launch', 1, root);
  const proof = await authorizeAndRelease({ artifactId: 'gallery:launch', artifactVersion: 1, authorizedBy: { actorId: 'agent:local-publisher', actorKind: 'agent' }, confirmation: auth.confirmation }, root);
  assert.deepEqual(verifyReleaseProof(proof), { valid: true, artifactId: 'gallery:launch', artifactVersion: 1 });
  assert.equal(((proof.release.payload as any).images[0]).assetRef, 'asset:hero');
  const tampered = structuredClone(proof); (tampered.release.payload as any).images.reverse();
  assert.throws(() => verifyReleaseProof(tampered), /payload digest/);
}));

test('seeded gallery ExternalDependencyPin proposal verifies exact canonical bytes larger than 3.5 MB under candidate semantics', () => temporaryWorkspace(async (root) => {
  const { inspectGalleryExternalDependencies, previewProfileRatification, ratifyProfile, verifyGalleryExternalDependency } = await import('../../src/domains/cms/cms.js');
  const bytes = Buffer.alloc(4 * 1024 * 1024, 0xa5);
  const contentDigest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  const preview = await previewProfileRatification('cms.external-image-gallery', 1, root);
  await ratifyProfile({ profileId: 'cms.external-image-gallery', revision: 1, ratifiedBy: { actorId: 'person:local-editor', actorKind: 'human' }, confirmation: preview.confirmation }, root);
  await createArtifactVersion({ artifactId: 'gallery:pins', artifactVersion: 1, profileId: 'cms.external-image-gallery', profileRevision: 1, authoredBy: { actorId: 'agent:curator', actorKind: 'agent' }, payload: {
    audience: 'public', title: 'Pinned gallery', images: [{ asset: { ref: 'cid:binary', contentDigest }, altText: 'Binary fixture', caption: '' }],
  } }, root);
  const auth = await previewAuthorization('gallery:pins', 1, root);
  const proof = await authorizeAndRelease({ artifactId: 'gallery:pins', artifactVersion: 1, authorizedBy: { actorId: 'agent:local-publisher', actorKind: 'agent' }, confirmation: auth.confirmation }, root);
  assert.equal(inspectGalleryExternalDependencies(proof).dependencies[0]!.status, 'unverified');
  assert.equal(verifyGalleryExternalDependency(proof, 0, bytes.toString('base64')).dependency.status, 'verified');
  assert.throws(() => verifyGalleryExternalDependency(proof, 0, Buffer.from([0, 1, 2, 4, 255]).toString('base64')), /content digest verification failed/);
  assert.throws(() => verifyGalleryExternalDependency(proof, 1, bytes.toString('base64')), /imageIndex/);
  assert.throws(() => verifyGalleryExternalDependency(proof, 0, 'not base64'), /canonical base64/);
}));

test('profile discovery fails closed on duplicate ratified revisions', () => temporaryWorkspace(async (root) => {
  const workspace = await loadCmsWorkspace(root);
  await writeWorkspace({ ...workspace, profiles: [...workspace.profiles, structuredClone(workspace.profiles[0]!)] }, root);
  const { readProfileRevision } = await import('../../src/domains/cms/cms.js');
  await assert.rejects(() => readProfileRevision('cms.article', 1, root), /ambiguous ratified profile/);
}));

test('released authored content deterministically produces an independently verifiable governed render', () => temporaryWorkspace(async (root) => {
  const { previewProfileRatification, ratifyProfile, renderReleasedArticle, verifyRenderedArtifact } = await import('../../src/domains/cms/cms.js');
  const sourceProof = await released(root);
  const renderInput = {
    sourceArtifactId: 'article:welcome', sourceAudience: 'public' as const, renderedArtifactId: 'render:welcome', renderedArtifactVersion: 1,
    authoredBy: { actorId: 'agent:local-renderer', actorKind: 'agent' as const },
  };
  // The seed carries cms.rendered-article only as a proposal; the walkthrough ratifies it before rendering.
  await assert.rejects(() => renderReleasedArticle(renderInput, root), /ratified profile not found: cms\.rendered-article/);
  assert.equal((await loadCmsWorkspace(root)).artifacts.some((item) => item.artifactId === 'render:welcome'), false, 'a refused render stores nothing');
  const profilePreview = await previewProfileRatification('cms.rendered-article', 1, root);
  await ratifyProfile({ profileId: 'cms.rendered-article', revision: 1, ratifiedBy: { actorId: 'person:local-editor', actorKind: 'human' }, confirmation: profilePreview.confirmation }, root);

  const rendered = await renderReleasedArticle(renderInput, root);
  assert.equal(rendered.sourceDependency.status, 'verified');
  assert.equal((rendered.artifact.payload as any).source.payloadDigest, sourceProof.authorization.payloadDigest);
  assert.match((rendered.artifact.payload as any).renderedContent, /<h1>Governed article<\/h1>/);
  await assert.rejects(() => readRelease('render:welcome', 'public', root), /release not found/);

  const renderPreview = await previewAuthorization('render:welcome', 1, root);
  const renderedProof = await authorizeAndRelease({
    artifactId: 'render:welcome', artifactVersion: 1, authorizedBy: { actorId: 'agent:local-publisher', actorKind: 'agent' }, confirmation: renderPreview.confirmation,
  }, root);
  const verification = verifyRenderedArtifact(renderedProof, sourceProof);
  assert.equal(verification.valid, true);
  assert.equal(verification.renderedArtifactId, 'render:welcome');
  assert.deepEqual(verification.sourceDependency.pin, { artifactId: 'article:welcome', artifactVersion: 1, payloadDigest: sourceProof.authorization.payloadDigest });
  assert.equal(verification.verificationClassification.releaseProofs.semantics, 'normative-gap-core');
  assert.equal(verification.sourceDependency.semantics, 'candidate-not-normative');
  assert.equal(verification.transformation.semantics, 'implementation-local');
  assert.equal(verification.displayOutcome, 'not-performed-or-proved');

  const wrongSource = structuredClone(sourceProof);
  wrongSource.release.artifactId = 'article:other';
  wrongSource.authorization.artifactId = 'article:other';
  wrongSource.authorization.authorizationSubjectDigest = authorizationSubjectDigest(wrongSource.authorization);
  assert.throws(() => verifyRenderedArtifact(renderedProof, wrongSource), /dependency pin does not match/);

  const tamperedRender = structuredClone(renderedProof);
  (tamperedRender.release.payload as any).renderedContent = '<h1>Different bytes</h1>';
  tamperedRender.authorization.payloadDigest = payloadDigest(tamperedRender.release.payload);
  tamperedRender.authorization.authorizationSubjectDigest = authorizationSubjectDigest(tamperedRender.authorization);
  assert.throws(() => verifyRenderedArtifact(tamperedRender, sourceProof), /deterministic local transformation/);
}));
