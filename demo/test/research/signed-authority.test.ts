import assert from 'node:assert/strict';
import { readFile, readdir, rm } from 'node:fs/promises';
import test from 'node:test';
import { verifyReleaseProof } from '../../src/domains/research/verify.js';
import { canonical, digest, signAsAuthority, trustStore } from '../../src/domains/research/signing.js';
import { decidePaper, previewResearch, readResearch, savePaper, withdrawResearch } from '../../src/domains/research/research.js';
import { readWorkspace, writeWorkspace } from '../../src/domains/research/workspace.js';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { approve, citedWorksEditor, editor, owner, paperAuthor, paperId, published, publisher, release, withWorkspace } from './fixtures.js';
const clone = structuredClone;
const copied = <T>(value: T): T => JSON.parse(JSON.stringify(value));

test('a reader verifies copied proof bytes and reader-configured trust after the producing workspace is deleted', () => withWorkspace(async root => {
  const { proof } = await published(root); const bytes = copied(proof); const store = copied(trustStore('journal'));
  await rm(root, { recursive: true, force: true });
  const result = verifyReleaseProof(bytes, store);
  assert.equal(result.status, 'verified');
  assert.deepEqual(result.signedBy, { ratification: owner.actorId, authorization: publisher.actorId, approvals: [editor.actorId] });
  assert.match(result.claim, /not any downstream outcome/);
}));

test('a later release and withdrawal preserve the earlier signed proof independently', () => withWorkspace(async root => {
  const { proof, revised } = await published(root); const earlier = copied(proof);
  const later = await savePaper({ artifactId: paperId, payload: { ...revised.payload, title: 'A later title' } as any, actor: paperAuthor }, root);
  await approve(root, later); await release(root, later, publisher); await withdrawResearch({ ...later, actor: publisher }, root);
  assert.deepEqual((await readResearch({ artifactId: paperId, artifactVersion: revised.artifactVersion }, root))[0], earlier);
  await rm(root, { recursive: true, force: true });
  assert.equal(verifyReleaseProof(earlier, copied(trustStore('journal'))).status, 'verified');
}));

test('changed content, stripped or substituted signatures, and missing or narrower trust are rejected', () => withWorkspace(async root => {
  const { proof } = await published(root);
  for (const [tamper, error] of [
    [(p: any, _s: any) => { p.release.payload.title = 'Changed'; }, /payload digest does not recompute/],
    [(p: any, _s: any) => { delete p.authorization.authoritySignature; }, /authorize-release record carries no authority signature/],
    [(p: any, _s: any) => { delete p.profile.ratification.authoritySignature; }, /ratification carries no authority signature/],
    [(p: any, _s: any) => { delete p.approvals[0].authoritySignature; }, /approve-release record carries no authority signature/],
    [(p: any, _s: any) => { p.authorization.authoritySignature = p.approvals[0].authoritySignature; }, /signer ID differs from the record actor/],
    [(p: any, _s: any) => { p.authorization.authoritySignature.signerId = editor.actorId; }, /signer ID differs from the record actor/],
    [(p: any, _s: any) => { p.authorization.authoritySignature = { ...p.approvals[0].authoritySignature, signerId: publisher.actorId }; }, /does not verify over the exact subject/],
    [(_p: any, s: any) => { delete s[publisher.actorId]; }, /not in configured trust/],
    [(_p: any, s: any) => { s[publisher.actorId].publicKey = s[editor.actorId].publicKey; }, /does not verify over the exact subject/],
    [(_p: any, s: any) => { s[editor.actorId].actions = ['reject-release']; }, /not trusted for this action/],
    [(p: any, _s: any) => { p.approvals[0].artifactVersion += 1; }, /approve-release subject digest does not recompute/],
    [(p: any, _s: any) => { p.approvals.push(p.approvals[0]); }, /duplicate approval/],
  ] as const) {
    const p = copied(proof); const s = copied(trustStore('journal')); tamper(p, s);
    assert.throws(() => verifyReleaseProof(p, s), error);
  }
}));

test('a release pin must name the embedded profile ID, revision, and digest exactly', () => withWorkspace(async root => {
  const { proof } = await published(root);
  assert.deepEqual(proof.release.profile, { profileId: proof.profile.profileId, revision: proof.profile.revision, digest: proof.profile.digest });
  for (const tamper of [
    (p: any) => { p.release.profile.digest = `sha256:${'0'.repeat(64)}`; },
    (p: any) => { p.release.profile.revision = 2; },
    (p: any) => { p.release.profile.profileId = 'research-source'; },
    (p: any) => { p.release.profile.revision = 2; p.authorization.profile.revision = 2; },
  ]) {
    const p = copied(proof); tamper(p);
    assert.throws(() => verifyReleaseProof(p, trustStore('journal')), /release pin does not match the embedded profile/);
  }
}));

test('signed approval and rejection use different domains; rejection preserves its subject and does not substitute for approval', () => withWorkspace(async root => {
  const { prepared } = await import('./fixtures.js'); const { revised } = await prepared(root);
  const p = await previewResearch({ ...revised, actor: editor }, root);
  await decidePaper({ ...revised, actor: editor, decision: 'reject', confirmation: p.rejectionConfirmation, reason: 'Awaiting an editorial check.' }, root);
  await approve(root, revised); const proof = await release(root, revised, publisher);
  assert.equal(verifyReleaseProof(copied(proof), copied(trustStore('journal'))).status, 'verified');
  assert.notEqual(proof.approvals?.[0]?.authoritySignature.signature, proof.rejections?.[0]?.authoritySignature.signature);
  const changed: any = copied(proof); changed.approvals[0].authoritySignature = changed.rejections[0].authoritySignature;
  assert.throws(() => verifyReleaseProof(changed, trustStore('journal')), /does not verify/);
  const missing: any = copied(proof); delete missing.authorization;
  assert.throws(() => verifyReleaseProof(missing, trustStore('journal')), /unexpected record fields/);
  // The served records keep the draft's wire shape.
  const schema = JSON.parse(await readFile(new URL('../../../specification/draft/schemas/core.schema.json', import.meta.url), 'utf8'));
  const ajv = new Ajv2020({ strict: true, allowUnionTypes: true, allErrors: true, validateFormats: false }); ajv.addSchema(schema);
  for (const [ref, value] of [['ReleaseProof', proof], ['ReleaseApproval', proof.approvals?.[0]], ['ReleaseRejection', proof.rejections?.[0]], ['ReleaseAuthorization', proof.authorization]] as const) {
    const validator = ajv.getSchema(`${schema.$id}#/$defs/${ref}`)!;
    assert(validator(value), `${ref}: ${JSON.stringify(validator.errors)}`);
  }
}));

test('a signed withdrawal verifies alone or beside the original proof, without establishing a replacement', () => withWorkspace(async root => {
  const { revised, proof } = await published(root);
  const withdrawn = await withdrawResearch({ ...revised, actor: publisher, reason: 'Source correction requires review.' }, root);
  assert.deepEqual(withdrawn.release, proof.release); assert.deepEqual(withdrawn.approvals, proof.approvals);
  assert.equal(verifyReleaseProof(copied(withdrawn), trustStore('journal')).status, 'withdrawn');
  const standalone = { withdrawal: withdrawn.withdrawal };
  const result = verifyReleaseProof(copied(standalone), trustStore('journal'));
  assert.deepEqual(result.signedBy, { withdrawal: publisher.actorId }); assert.match(result.claim, /only that the release is withdrawn/);
  for (const p of [copied(withdrawn), copied(standalone)] as any[]) {
    p.withdrawal.authoritySignature = proof.authorization.authoritySignature;
    assert.throws(() => verifyReleaseProof(p, trustStore('journal')), /does not verify/);
  }
}));

test('boundary refuses stored signatures that no longer verify and signing requires a configured action key', () => withWorkspace(async root => {
  await published(root); const workspace = await readWorkspace(root);
  (workspace.research as any).authorizations.find((a: any) => a.artifactId === paperId).authoritySignature.signature = 'invalid';
  await writeWorkspace(workspace, root); await assert.rejects(readResearch({ artifactId: paperId }, root), /integrity/);
  assert.throws(() => signAsAuthority('ratify-profile', editor.actorId, `sha256:${'0'.repeat(64)}`), /no configured signing key/);
}));

test('unknown contract semantics and correctly re-signed but contract-invalid payloads fail independent verification', () => withWorkspace(async root => {
  const { proof } = await published(root);
  const changed: any = copied(proof); changed.release.payload.title = '';
  changed.authorization.payloadDigest = digest('governed-artifact.payload.v1', changed.release.payload);
  const { artifactId, artifactVersion, payloadDigest, profile } = changed.authorization;
  changed.authorization.authorizationSubjectDigest = digest('governed-artifact.authorization-subject.v1', { artifactId, artifactVersion, payloadDigest, profile });
  changed.authorization.authoritySignature = signAsAuthority('authorize-release', publisher.actorId, changed.authorization.authorizationSubjectDigest);
  changed.approvals = [];
  assert.throws(() => verifyReleaseProof(changed, trustStore('journal')), /pinned contract/);
  const unknown: any = copied(proof); unknown.profile.payloadContract.$contractLanguage = 'unknown/1';
  unknown.profile.digest = digest('governed-artifact.profile-revision.draft', { profileId: unknown.profile.profileId, revision: unknown.profile.revision, payloadContract: unknown.profile.payloadContract });
  unknown.profile.ratification.authoritySignature = signAsAuthority('ratify-profile', owner.actorId, unknown.profile.digest);
  unknown.release.profile.digest = unknown.profile.digest;
  assert.throws(() => verifyReleaseProof(unknown, trustStore('journal')), /unknown contract/);
}));

test('decision reasons are optional and outside signatures; malformed reasons and record shapes are refused', () => withWorkspace(async root => {
  const { proof } = await published(root); const p: any = copied(proof);
  p.authorization.reason = 'Publication approved for the fictional journal.';
  assert.equal(verifyReleaseProof(p, trustStore('journal')).subjectDigest, proof.authorization.authorizationSubjectDigest);
  for (const [tamper, error] of [
    [(p: any) => { p.authorization.reason = ' '; }, /a reason must be a non-blank string/],
    [(p: any) => { p.authorization.reason = { text: 'not a string' }; }, /a reason must be a non-blank string/],
    [(p: any) => { p.authorization.authorizedAt = 'yesterday'; }, /RFC 3339 timestamp/],
    [(p: any) => { p.authorization.authoritySignature.signature += '='; }, /malformed base64url/],
    [(p: any) => { p.release.profile.extra = true; }, /unexpected record fields/],
    [(p: any) => { p.release.payload.dependencySet.entries[0].extra = true; }, /unexpected record fields/],
  ] as const) { const bad: any = copied(proof); tamper(bad); assert.throws(() => verifyReleaseProof(bad, trustStore('journal')), error); }
}));

test('the consumer verifier modules import no filesystem, signing keys, or deployment permission table', async () => {
  for (const name of ['verify', 'authority']) {
    const source = await readFile(new URL(`../../src/domains/research/${name}.ts`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /from ['"](?:node:fs|\.\/signing|\.\/workspace|\.\/research)/);
    assert.doesNotMatch(source, /createPrivateKey|signAsAuthority|demo-authority-keys/);
  }
  assert.equal(canonical({ b: 1, a: 2 }), '{"a":2,"b":1}');
});

test('each trust context trusts one release authority, so a paper released by anyone but the publisher fails', () => withWorkspace(async root => {
  const { proof, source } = await published(root);
  const [sourceProof] = await readResearch({ artifactId: source.artifactId, artifactVersion: source.artifactVersion }, root);
  assert.equal(verifyReleaseProof(copied(sourceProof), trustStore('cited-works')).status, 'verified');
  assert.throws(() => verifyReleaseProof(copied(sourceProof), trustStore('journal')), /not in configured trust/);
  assert.throws(() => verifyReleaseProof(copied(proof), trustStore('cited-works')), /not in configured trust/);
  // A correctly signed authorization by the cited-works editor, who is trusted to release sources, is refused for a paper.
  const resigned: any = copied(proof);
  resigned.authorization.authorizedBy = citedWorksEditor;
  resigned.authorization.authoritySignature = signAsAuthority('authorize-release', citedWorksEditor.actorId, proof.authorization.authorizationSubjectDigest);
  assert.throws(() => verifyReleaseProof(resigned, trustStore('journal')), /not in configured trust/);
  for (const signer of [editor, citedWorksEditor]) assert(!trustStore('journal')[signer.actorId]?.actions.includes('authorize-release'), signer.actorId);
}));

test('every maintained research proof verifies from its own JSON and the published reader trust store for its context', async () => {
  const directory = new URL('../../../specification/draft/examples/research/', import.meta.url);
  const stores = { journal: JSON.parse(await readFile(new URL('trust-store_journal.json', directory), 'utf8')), 'cited-works': JSON.parse(await readFile(new URL('trust-store_cited-works.json', directory), 'utf8')) };
  for (const name of (await readdir(directory)).filter(name => name.startsWith('release-proof'))) {
    const proof = JSON.parse(await readFile(new URL(name, directory), 'utf8'));
    const store = proof.profile.profileId === 'research-source' ? stores['cited-works'] : stores.journal;
    assert.equal(verifyReleaseProof(proof, store).status, proof.withdrawal ? 'withdrawn' : 'verified', name);
  }
});
