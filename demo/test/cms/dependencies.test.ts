import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createArtifactVersion, loadCmsWorkspace, verifyReleaseProof, verifyReleasedDependencies } from '../../src/domains/cms/cms.js';
import { authorizationSubjectDigest, exactPin, payloadDigest, profileDigest, type PayloadContract, type ReleaseProof, type JsonValue } from '../../src/domains/cms/domain.js';
import { writeWorkspace } from '../../src/domains/cms/workspace.js';
const entry = { artifactId: 'decision:a', artifactVersion: 1, payloadDigest: `sha256:${'a'.repeat(64)}` };
function contract(stringField = false): PayloadContract {
  return { type: 'object', additionalProperties: false, required: ['audience', 'dependencySet'], fields: {
    audience: { type: 'string', enum: ['public'] },
    dependencySet: stringField ? { type: 'string', maxLength: 100 } : {
      type: 'object', additionalProperties: false, required: ['entries'], fields: { entries: {
        type: 'array', minItems: 0, maxItems: 10, items: {
          type: 'object', additionalProperties: false, required: ['artifactId', 'artifactVersion', 'payloadDigest'], fields: {
            artifactId: { type: 'string', minLength: 1, maxLength: 100 },
            artifactVersion: { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
            payloadDigest: { type: 'string', format: 'sha256-digest' },
          },
        },
      } },
    },
  } };
}
async function workspace(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'gap-dependencies-'));
  try { await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}
// Consistent hashes ensure malformed sets fail their own checks, not digest checks.
function proof(payload: JsonValue, payloadContract = contract()): ReleaseProof {
  const authority = { actorId: 'person:reviewer', actorKind: 'human' as const };
  const profile = { profileId: 'test.dependencies', revision: 1, payloadContract, digest: '', ratification: { ratifiedAt: '2026-09-10T00:00:00Z', ...authority } };
  profile.digest = profileDigest(profile);
  const pin = exactPin(profile);
  const release = { artifactId: 'summary:a', artifactVersion: 1, payload, profile: pin };
  const authorization = { artifactId: release.artifactId, artifactVersion: 1, payloadDigest: payloadDigest(payload), profile: pin, authorizedAt: '2026-09-10T00:00:00Z', authorizedBy: authority, authorizationSubjectDigest: '' };
  authorization.authorizationSubjectDigest = authorizationSubjectDigest(authorization);
  return { profile, release, authorization };
}
for (const [name, set, stringField] of [
  ['reserved string field', 'not a set', true],
  ['duplicate source IDs', { entries: [entry, { ...entry, artifactVersion: 2 }] }, false],
  ['out-of-order source IDs', { entries: [{ ...entry, artifactId: 'decision:z' }, entry] }, false],
  ['unknown entry field', { entries: [{ ...entry, extra: true }] }, false],
  ['zero source version', { entries: [{ ...entry, artifactVersion: 0 }] }, false],
  ['malformed source digest', { entries: [{ ...entry, payloadDigest: 'invalid' }] }, false],
] as const) {
  test(`authoring and release verification reject ${name}`, () => workspace(async root => {
    const payload = { audience: 'public', dependencySet: structuredClone(set) } as JsonValue;
    const fixture = proof(payload, contract(stringField));
    const data = await loadCmsWorkspace(root); data.profiles.push(fixture.profile); await writeWorkspace(data, root);
    await assert.rejects(() => createArtifactVersion({ profileId: fixture.profile.profileId, artifactId: 'summary:a', artifactVersion: 1, payload, authoredBy: { actorId: 'agent:author', actorKind: 'agent' } }, root), /dependency/i);
    assert.equal((await loadCmsWorkspace(root)).artifacts.length, 0);
    assert.throws(() => verifyReleaseProof(fixture), /dependency/i);
  }));
}
test('release verification accepts an ordered dependency set', () => {
  assert.equal(verifyReleaseProof(proof({ audience: 'public', dependencySet: { entries: [entry, { ...entry, artifactId: 'decision:b' }] } })).valid, true);
});

async function sourceFixture(root: string) {
  const source = proof({ audience: 'public', dependencySet: { entries: [] } });
  source.release.artifactId = 'decision:a';
  source.authorization.artifactId = 'decision:a';
  source.authorization.authorizationSubjectDigest = authorizationSubjectDigest(source.authorization);
  const pin = { artifactId: 'decision:a', artifactVersion: 1, payloadDigest: source.authorization.payloadDigest };
  const parent = proof({ audience: 'public', dependencySet: { entries: [pin] } });
  const data = await loadCmsWorkspace(root);
  data.profiles.push(parent.profile);
  data.releaseAuthorityPolicies.push({ profile: parent.release.profile, authority: parent.authorization.authorizedBy, audiences: ['public'] });
  for (const item of [source, parent]) {
    data.artifacts.push({ ...item.release, authoredBy: { actorId: 'agent:author', actorKind: 'agent' } });
    data.authorizations.push(item.authorization); data.releases.push(item.release);
  }
  await writeWorkspace(data, root);
  return { data, source, parent };
}
test('dependency verification checks a complete released source under local authority policy', () => workspace(async root => {
  const { parent } = await sourceFixture(root);
  const result = await verifyReleasedDependencies('summary:a', 'public', 'public', root);
  assert.equal(result.status, 'verified');
  assert.equal(result.dependencies[0]?.status, 'verified');
  assert.equal(JSON.stringify(result).includes('ratification'), false, 'source proof is not returned');
  assert.equal(verifyReleaseProof(parent).valid, true);
}));
for (const scenario of ['draft', 'missing', 'wrong ID', 'wrong version', 'wrong digest', 'tampered source', 'missing authorization', 'untrusted authority', 'unknown authorization field', 'inaccessible source'] as const) {
  test(`dependency stays unverified for ${scenario}`, () => workspace(async root => {
    const { data, source, parent } = await sourceFixture(root);
    if (scenario === 'draft') data.releases = data.releases.filter(r => r.artifactId !== 'decision:a');
    if (scenario === 'missing') { data.releases = data.releases.filter(r => r.artifactId !== 'decision:a'); data.artifacts = data.artifacts.filter(r => r.artifactId !== 'decision:a'); }
    if (scenario === 'missing authorization') data.authorizations = data.authorizations.filter(r => r.artifactId !== 'decision:a');
    if (scenario === 'untrusted authority') source.authorization.authorizedBy = { actorId: 'person:untrusted', actorKind: 'human' };
    if (scenario === 'unknown authorization field') (source.authorization as any).note = 'approved';
    if (scenario === 'tampered source') (source.release.payload as any).audience = 'internal';
    if (scenario === 'wrong ID' || scenario === 'wrong version' || scenario === 'wrong digest') {
      const pin = (parent.release.payload as any).dependencySet.entries[0];
      if (scenario === 'wrong ID') pin.artifactId = 'decision:another';
      if (scenario === 'wrong version') pin.artifactVersion = 2;
      if (scenario === 'wrong digest') pin.payloadDigest = `sha256:${'b'.repeat(64)}`;
      parent.authorization.payloadDigest = payloadDigest(parent.release.payload);
      parent.authorization.authorizationSubjectDigest = authorizationSubjectDigest(parent.authorization);
    }
    await writeWorkspace(data, root);
    const before = JSON.stringify(await loadCmsWorkspace(root));
    const result = await verifyReleasedDependencies('summary:a', 'public', scenario === 'inaccessible source' ? 'internal' : 'public', root);
    assert.equal(result.status, 'unverified'); assert.equal(result.dependencies[0]?.status, 'unverified');
    assert.equal(JSON.stringify(await loadCmsWorkspace(root)), before, 'verification must not rewrite records');
  }));
}
test('a valid parent alone does not verify an unresolved dependency', () => workspace(async root => {
  const { data, parent } = await sourceFixture(root);
  data.releases = data.releases.filter(r => r.artifactId !== 'decision:a'); await writeWorkspace(data, root);
  assert.equal(verifyReleaseProof(parent).valid, true);
  assert.equal((await verifyReleasedDependencies('summary:a', 'public', 'public', root)).status, 'unverified');
}));
