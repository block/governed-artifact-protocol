import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  BLOG_MODEL_CONTRACT, approvePost, approveRelease, authorizeAndRelease, createArtifactVersion, loadCmsWorkspace, previewAuthorization, previewProfileRatification, previewReleaseApproval, proposeBlogModel,
  proposeProfile, publishPost, ratifyProfile, readPost, readRelease, saveBlogPost, selectLocaleContent, verifyReleaseProof,
} from '../../src/domains/cms/cms.js';
import { BLOG_PROFILE_ID, type BlogPostContent, type LocaleMapRule, type PayloadContract } from '../../src/domains/cms/domain.js';
import { startMcpHttpServer } from '../../src/server.js';

// Locale variants: locale content is payload structure under the profile contract, one
// authorization covers every locale, and locale selection is delivery after verification.

const designer = { actorId: 'agent:content-designer', actorKind: 'agent' as const };
const writer = { actorId: 'agent:writer', actorKind: 'agent' as const };
const editor = { actorId: 'human:editor', actorKind: 'human' as const };
const publisher = { actorId: 'human:publisher', actorKind: 'human' as const };
const owner = { actorId: 'human:content-model-owner', actorKind: 'human' as const };
const example = JSON.parse(await readFile(new URL('../../../specification/draft/examples/cms/artifact-version_four-locale-post.json', import.meta.url), 'utf8'));
const allContent = example.payload.content as Record<'en-US' | 'es-US' | 'en-MX' | 'es-MX', BlogPostContent>;
const { 'en-US': enUS, 'es-US': esUS, 'en-MX': enMX, 'es-MX': esMX } = allContent;
const requiredContent = { 'en-US': enUS, 'es-MX': esMX };
const sortedLocales = ['en-MX', 'en-US', 'es-MX', 'es-US'];
const postId = 'blog-post:monarch-migration';

async function temporaryWorkspace(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'gap-cms-locale-'));
  try { await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}
async function ratifiedBlogModel(root: string) {
  await proposeBlogModel(designer, root);
  const preview = await previewProfileRatification(BLOG_PROFILE_ID, 1, root);
  return ratifyProfile({ profileId: BLOG_PROFILE_ID, revision: 1, ratifiedBy: owner, confirmation: preview.confirmation }, root);
}
async function savePost(root: string, artifactId: string, content: Record<string, BlogPostContent>, expectedVersion = 0) {
  return saveBlogPost({ artifactId, expectedVersion, author: 'Grounds staff', date: '2026-09-15T09:30:00Z', audience: 'public', content, authoredBy: writer }, root);
}
async function publish(root: string, artifactId: string, artifactVersion: number) {
  const approval = await previewReleaseApproval(artifactId, artifactVersion, root);
  await approvePost({ artifactId, artifactVersion, approvedBy: editor, confirmation: approval.confirmation, approvedAt: '2026-09-15T09:00:00.000Z' }, root);
  const preview = await previewAuthorization(artifactId, artifactVersion, root);
  return publishPost({ artifactId, artifactVersion, authorizedBy: publisher, confirmation: preview.confirmation, authorizedAt: '2026-09-15T09:30:00.000Z' }, root);
}
function localeMapContract(content: Record<string, unknown>): PayloadContract {
  const text = { type: 'string' as const, minLength: 1, maxLength: 100 };
  return { type: 'object', additionalProperties: false, required: ['audience', 'content'], fields: {
    audience: { type: 'string', enum: ['public'] },
    content: { type: 'localeMap', allowed: ['en-US', 'es-US', 'en-MX', 'es-MX'], required: ['en-US', 'en-MX'], fallback: { 'es-US': 'en-US', 'es-MX': 'en-MX' }, items: { type: 'object', additionalProperties: false, fields: { body: text }, required: ['body'] }, ...content } as unknown as LocaleMapRule,
  } };
}

test('the blog model declares its locale policy and malformed policies are refused', () => temporaryWorkspace(async (root) => {
  const { profile } = await ratifiedBlogModel(root);
  assert.deepEqual(Object.keys(profile.payloadContract.fields).sort(), ['audience', 'author', 'content', 'date']);
  const content = profile.payloadContract.fields.content as LocaleMapRule;
  assert.equal(content.type, 'localeMap');
  assert.deepEqual(content.allowed, ['en-US', 'es-US', 'en-MX', 'es-MX']);
  assert.deepEqual(content.required, ['en-US', 'es-MX']);
  assert.deepEqual(content.fallback, { 'es-US': 'en-US', 'en-MX': 'es-MX' });
  assert.deepEqual(content.items.required, ['headline', 'body']);
  for (const [name, policy, message] of [
    ['fallback to an optional locale', { allowed: ['en-US', 'en-MX', 'es-MX', 'fr-FR'], fallback: { 'es-MX': 'fr-FR' } }, /fallback must map optional allowed locales to required locales/],
    ['a required locale outside allowed', { required: ['fr-FR'] }, /required must be a non-empty subset of the allowed locales/],
    ['a malformed tag', { allowed: ['en_US', 'es-MX'], required: ['en_US'] }, /syntactically valid BCP 47/],
    ['an empty allowed list', { allowed: [], required: [] }, /allowed must list 1-50/],
  ] as const) {
    await assert.rejects(() => proposeProfile({ profileId: `cms.locale-${name.replaceAll(' ', '-')}`, revision: 1, payloadContract: localeMapContract(policy), proposedBy: designer }, root), message);
  }
  assert.equal((await loadCmsWorkspace(root)).profileProposals.filter((item) => item.profileId.startsWith('cms.locale-')).length, 0);
}));

test('posts satisfy required, allowed, and well-formed locale keys before storage', () => temporaryWorkspace(async (root) => {
  await assert.rejects(() => savePost(root, postId, requiredContent), /blog-post content model is not ratified/);
  await ratifiedBlogModel(root);
  const saved = await savePost(root, postId, allContent);
  assert.equal(saved.artifactVersion, 1);
  assert.deepEqual([saved.profile.profileId, saved.profile.revision], [BLOG_PROFILE_ID, 1]);
  assert.deepEqual(saved.payload, { audience: 'public', author: 'Grounds staff', content: allContent, date: '2026-09-15T09:30:00Z' });
  const minimalPost = await savePost(root, 'blog-post:locale-subset-test', requiredContent);
  assert.deepEqual(Object.keys((minimalPost.payload as { content: object }).content).sort(), ['en-US', 'es-MX']);
  await assert.rejects(() => savePost(root, 'blog-post:spanish-only', { 'es-MX': esMX }), /missing required locale en-US/);
  await assert.rejects(() => savePost(root, 'blog-post:missing-mexico', { 'en-US': enUS, 'en-MX': enMX }), /missing required locale es-MX/);
  await assert.rejects(() => savePost(root, 'blog-post:missing-us', { 'en-MX': enMX, 'es-US': esUS }), /missing required locale en-US/);
  await assert.rejects(() => savePost(root, 'blog-post:french', { ...requiredContent, 'fr-FR': { headline: 'Choisissez votre langue', body: 'Texte.' } }), /fr-FR is not an allowed locale/);
  await assert.rejects(() => savePost(root, 'blog-post:underscore', { en_US: enUS }), /en_US is not an allowed locale/);
  await assert.rejects(() => savePost(root, postId, requiredContent, 0), /stale blog draft/);
  assert.equal((await loadCmsWorkspace(root)).artifacts.length, 2);
}));

test('one authorization covers every locale and a locale subset is not the authorized payload', () => temporaryWorkspace(async (root) => {
  await ratifiedBlogModel(root);
  await savePost(root, postId, allContent);
  await assert.rejects(() => readRelease(postId, 'public', root), /release not found/);
  const proof = await publish(root, postId, 1);
  assert.deepEqual(Object.keys((proof.release.payload as { content: object }).content).sort(), sortedLocales);
  assert.deepEqual(verifyReleaseProof(proof), { valid: true, artifactId: postId, artifactVersion: 1 });
  assert.deepEqual(Object.keys(proof.authorization).sort(), ['artifactId', 'artifactVersion', 'authorizationSubjectDigest', 'authorizedAt', 'authorizedBy', 'payloadDigest', 'profile']);
  assert.equal(proof.approvals?.length, 1);
  assert.deepEqual(Object.keys(proof.approvals![0]!).sort(), ['approvedAt', 'approvedBy', 'artifactId', 'artifactVersion', 'authorizationSubjectDigest', 'payloadDigest', 'profile']);
  for (const locale of sortedLocales) {
    const subset = structuredClone(proof);
    delete (subset.release.payload as { content: Record<string, unknown> }).content[locale];
    assert.throws(() => verifyReleaseProof(subset), ['en-US', 'es-MX'].includes(locale) ? new RegExp(`missing required locale ${locale}`) : /payload digest/, locale);
    const changed = structuredClone(proof);
    (changed.release.payload as { content: Record<string, BlogPostContent> }).content[locale]!.body = 'Changed content.';
    assert.throws(() => verifyReleaseProof(changed), /payload digest/, locale);
  }
  const workspace = await loadCmsWorkspace(root);
  assert.equal(workspace.authorizations.length, 1);
  assert.equal(workspace.releases.length, 1);
}));

test('consumers select a locale after verification and fall back only to declared, authored content', () => temporaryWorkspace(async (root) => {
  await ratifiedBlogModel(root);
  await savePost(root, postId, allContent);
  await assert.rejects(() => readPost({ artifactId: postId, audience: 'public', locale: 'en-US' }, root), /release not found/);
  const proof = await publish(root, postId, 1);
  const english = await readPost({ artifactId: postId, audience: 'public', locale: 'en-US' }, root);
  assert.deepEqual(english, {
    artifactId: postId, artifactVersion: 1, profile: proof.release.profile, audience: 'public', author: 'Grounds staff', date: '2026-09-15T09:30:00Z', headline: enUS.headline, body: enUS.body,
    locale: { requested: 'en-US', delivered: 'en-US', fallbackApplied: false, authorizedLocales: sortedLocales },
    authorizationCoverage: 'entire-payload', displayOutcome: 'not-performed-or-proved', proof,
  });
  const spanish = await readPost({ artifactId: postId, audience: 'public', locale: 'es-MX' }, root);
  assert.deepEqual(spanish.locale, { requested: 'es-MX', delivered: 'es-MX', fallbackApplied: false, authorizedLocales: sortedLocales });
  assert.deepEqual({ headline: spanish.headline, body: spanish.body }, esMX);
  for (const [locale, content] of Object.entries(allContent)) {
    const result = await readPost({ artifactId: postId, audience: 'public', locale }, root);
    assert.deepEqual({ headline: result.headline, body: result.body }, content);
    assert.deepEqual(result.locale, { requested: locale, delivered: locale, fallbackApplied: false, authorizedLocales: sortedLocales });
  }
  await assert.rejects(() => readPost({ artifactId: postId, audience: 'public', locale: 'fr-FR' }, root), /fr-FR is not an allowed locale/);
  await assert.rejects(() => readPost({ artifactId: postId, audience: 'public', locale: 'en_US' }, root), /syntactically valid BCP 47/);
  await assert.rejects(() => readPost({ artifactId: postId, audience: 'members', locale: 'en-US' }, root), /not found for audience/);

  const teaserId = 'blog-post:koi-pond';
  await savePost(root, teaserId, requiredContent);
  await publish(root, teaserId, 1);
  const fallback = await readPost({ artifactId: teaserId, audience: 'public', locale: 'en-MX' }, root);
  assert.deepEqual(fallback.locale, { requested: 'en-MX', delivered: 'es-MX', fallbackApplied: true, authorizedLocales: ['en-US', 'es-MX'] });
  assert.deepEqual({ headline: fallback.headline, body: fallback.body }, esMX);
  assert.equal(fallback.displayOutcome, 'not-performed-or-proved');
  const usFallback = await readPost({ artifactId: teaserId, audience: 'public', locale: 'es-US' }, root);
  assert.deepEqual(usFallback.locale, { requested: 'es-US', delivered: 'en-US', fallbackApplied: true, authorizedLocales: ['en-US', 'es-MX'] });
  assert.deepEqual({ headline: usFallback.headline, body: usFallback.body }, enUS);

  await createArtifactVersion({ artifactId: 'article:plain', artifactVersion: 1, profileId: 'cms.article', payload: { audience: 'public', title: 'Plain', body: 'No locales.' }, authoredBy: writer }, root);
  const articlePreview = await previewAuthorization('article:plain', 1, root);
  const articleProof = await authorizeAndRelease({ artifactId: 'article:plain', artifactVersion: 1, authorizedBy: editor, confirmation: articlePreview.confirmation }, root);
  assert.throws(() => selectLocaleContent(articleProof, 'en-US'), /content field is a localeMap/);
  await assert.rejects(() => readPost({ artifactId: 'article:plain', audience: 'public', locale: 'en-US' }, root), /requires the blog-post content model/);
}));

test('blog actions accept only the ratified blog-post contract they were written for', () => temporaryWorkspace(async (root) => {
  const { profile } = await ratifiedBlogModel(root);
  // A later blog-post revision ratified through the generic tools drops headline from each locale entry.
  const text = { type: 'string' as const, minLength: 1, maxLength: 5000 };
  const contract: PayloadContract = { type: 'object', additionalProperties: false, required: ['audience', 'author', 'content'], fields: {
    audience: { type: 'string', enum: ['public', 'members', 'internal'] }, author: text,
    content: { type: 'localeMap', allowed: ['en-US'], required: ['en-US'], fallback: {}, items: { type: 'object', additionalProperties: false, fields: { body: text }, required: ['body'] } },
  } };
  await proposeProfile({ profileId: BLOG_PROFILE_ID, revision: 2, payloadContract: contract, proposedBy: designer }, root);
  const preview = await previewProfileRatification(BLOG_PROFILE_ID, 2, root);
  await ratifyProfile({ profileId: BLOG_PROFILE_ID, revision: 2, ratifiedBy: owner, confirmation: preview.confirmation }, root);
  const other = 'blog-post:body-only';
  await createArtifactVersion({ artifactId: other, artifactVersion: 1, profileId: BLOG_PROFILE_ID, profileRevision: 2, payload: { audience: 'public', author: 'Grounds staff', content: { 'en-US': { body: 'No headline here.' } } }, authoredBy: writer }, root);
  const approval = { artifactId: other, artifactVersion: 1, approvedBy: editor, confirmation: (await previewReleaseApproval(other, 1, root)).confirmation };
  await assert.rejects(() => approvePost(approval, root), /declares a different one/);
  await approveRelease(approval, root);
  const authorization = { artifactId: other, artifactVersion: 1, authorizedBy: publisher, confirmation: (await previewAuthorization(other, 1, root)).confirmation };
  await assert.rejects(() => publishPost(authorization, root), /declares a different one/);
  await authorizeAndRelease(authorization, root);
  await assert.rejects(() => readPost({ artifactId: other, audience: 'public', locale: 'en-US' }, root), /declares a different one/);
  assert.equal((await readRelease(other, 'public', root)).release.profile.revision, 2);
  // Saving a post still pins the revision that carries the guide's contract, not the highest revision.
  const saved = await savePost(root, postId, requiredContent);
  assert.deepEqual(saved.profile, { profileId: BLOG_PROFILE_ID, revision: 1, digest: profile.digest });
}));

async function withMcp(run: (call: (name: string, args?: Record<string, unknown>) => Promise<any>, raw: Client['callTool'], client: Client) => Promise<void>) {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'gap-cms-locale-mcp-'));
  const server = await startMcpHttpServer({ port: 0, workspaceRoot });
  const address = server.address();
  assert(address && typeof address === 'object');
  const client = new Client({ name: 'cms-locale-test', version: '1.0.0' });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://localhost:${address.port}/mcp`)));
    const call = async (name: string, args: Record<string, unknown> = {}) => {
      const result = await client.callTool({ name, arguments: args });
      assert.equal(result.isError, undefined, JSON.stringify(result.content));
      assert(result.structuredContent);
      const json = JSON.parse(JSON.stringify(result.structuredContent));
      return json.items ?? json;
    };
    await run(call, (request) => client.callTool(request), client);
  } finally {
    await client.close();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(workspaceRoot, { recursive: true, force: true });
  }
}

test('guide: publish a four-locale post and select a locale at delivery over MCP', () => withMcp(async (call, raw, client) => {
  const descriptions = new Map((await client.listTools()).tools.map((tool) => [tool.name, tool.description ?? '']));
  assert.match(descriptions.get('save_blog_post')!, /covers every locale/);
  assert.match(descriptions.get('read_post')!, /not a GAP step/);
  const post = { artifactId: postId, expectedVersion: 0, author: 'Grounds staff', date: '2026-09-15T09:30:00Z', audience: 'public', content: allContent, authoredBy: writer };
  assert.equal((await raw({ name: 'save_blog_post', arguments: post })).isError, true);
  await call('propose_blog_model', { proposedBy: designer });
  const model = await call('preview_profile_ratification', { profileId: BLOG_PROFILE_ID, revision: 1 });
  assert.equal(model.proposal.payloadContract.fields.content.type, 'localeMap');
  await call('ratify_profile', { profileId: BLOG_PROFILE_ID, revision: 1, ratifiedBy: owner, confirmation: model.confirmation });
  const saved = await call('save_blog_post', post);
  assert.equal(saved.artifactVersion, 1);
  const missingMexico = await raw({ name: 'save_blog_post', arguments: { ...post, artifactId: 'blog-post:missing-mexico', content: { 'en-US': enUS, 'en-MX': enMX } } });
  assert.equal(missingMexico.isError, true);
  assert.match(JSON.stringify(missingMexico.content), /missing required locale es-MX/);
  const spanishOnly = await raw({ name: 'save_blog_post', arguments: { ...post, artifactId: 'blog-post:spanish-only', content: { 'es-MX': esMX } } });
  assert.equal(spanishOnly.isError, true);
  assert.match(JSON.stringify(spanishOnly.content), /missing required locale en-US/);
  const french = await raw({ name: 'save_blog_post', arguments: { ...post, artifactId: 'blog-post:french', content: { ...requiredContent, 'fr-FR': esMX } } });
  assert.equal(french.isError, true);
  assert.match(JSON.stringify(french.content), /not an allowed locale/);
  assert.equal((await call('list_artifact_versions')).length, 1);
  assert.equal((await raw({ name: 'read_post', arguments: { artifactId: postId, audience: 'public', locale: 'en-US' } })).isError, true);

  const approval = await call('preview_release_approval', { artifactId: postId, artifactVersion: 1 });
  assert.deepEqual(Object.keys(approval.payload.content).sort(), sortedLocales);
  await call('approve_post', { artifactId: postId, artifactVersion: 1, approvedBy: editor, confirmation: approval.confirmation });
  const preview = await call('preview_release_authorization', { artifactId: postId, artifactVersion: 1 });
  const proof = await call('publish_post', { artifactId: postId, artifactVersion: 1, authorizedBy: publisher, confirmation: preview.confirmation });
  assert.deepEqual(Object.keys(proof.release.payload.content).sort(), sortedLocales);
  assert.equal(proof.approvals.length, 1);
  assert.equal((await call('verify_release_proof', { proof })).valid, true);
  assert.equal((await call('list_releases', { audience: 'public' })).length, 1);

  for (const [locale, content] of Object.entries(allContent)) {
    const result = await call('read_post', { artifactId: postId, audience: 'public', locale });
    assert.deepEqual({ headline: result.headline, body: result.body }, content);
    assert.deepEqual(result.locale, { requested: locale, delivered: locale, fallbackApplied: false, authorizedLocales: sortedLocales });
    assert.equal(result.authorizationCoverage, 'entire-payload');
  }
  const refused = await raw({ name: 'read_post', arguments: { artifactId: postId, audience: 'public', locale: 'fr-FR' } });
  assert.equal(refused.isError, true);
  assert.match(JSON.stringify(refused.content), /not an allowed locale/);

  const teaserId = 'blog-post:koi-pond';
  await call('save_blog_post', { ...post, artifactId: teaserId, content: requiredContent });
  const teaserApproval = await call('preview_release_approval', { artifactId: teaserId, artifactVersion: 1 });
  await call('approve_post', { artifactId: teaserId, artifactVersion: 1, approvedBy: editor, confirmation: teaserApproval.confirmation });
  const teaserPreview = await call('preview_release_authorization', { artifactId: teaserId, artifactVersion: 1 });
  await call('publish_post', { artifactId: teaserId, artifactVersion: 1, authorizedBy: publisher, confirmation: teaserPreview.confirmation });
  for (const [requested, delivered, content] of [['es-US', 'en-US', enUS], ['en-MX', 'es-MX', esMX]] as const) {
    const result = await call('read_post', { artifactId: teaserId, audience: 'public', locale: requested });
    assert.deepEqual(result.locale, { requested, delivered, fallbackApplied: true, authorizedLocales: ['en-US', 'es-MX'] });
    assert.deepEqual({ headline: result.headline, body: result.body }, content);
    assert.equal(result.displayOutcome, 'not-performed-or-proved');
  }
}));

for (const previousModel of ['two-locale', 'four-locale'] as const) test(`upgrading the ${previousModel} blog model preserves profiles, drafts, releases, and fallback policy`, () => temporaryWorkspace(async (root) => {
  const oldContract = structuredClone(BLOG_MODEL_CONTRACT);
  Object.assign(oldContract.fields.content!, previousModel === 'two-locale'
    ? { allowed: ['en-US', 'es-MX'], required: ['en-US'], fallback: { 'es-MX': 'en-US' } }
    : { allowed: ['en-US', 'es-US', 'en-MX', 'es-MX'], required: ['en-US', 'en-MX'], fallback: { 'es-US': 'en-US', 'es-MX': 'en-MX' } });
  await proposeProfile({ profileId: BLOG_PROFILE_ID, revision: 1, proposedBy: designer, payloadContract: oldContract }, root);
  const oldPreview = await previewProfileRatification(BLOG_PROFILE_ID, 1, root);
  const { profile: oldProfile } = await ratifyProfile({ profileId: BLOG_PROFILE_ID, revision: 1, ratifiedBy: owner, confirmation: oldPreview.confirmation }, root);
  if (previousModel === 'two-locale') assert.equal(oldProfile.digest, 'sha256:5f320a57e75bcb9914956d4f7fb3f4872f795fa9340ce9ef3df8dce1478bb20a');
  for (const id of ['blog-post:old-release', 'blog-post:old-draft']) {
    await createArtifactVersion({ artifactId: id, artifactVersion: 1, profileId: BLOG_PROFILE_ID, profileRevision: 1,
      payload: { audience: 'public', author: 'Grounds staff', date: '2026-09-15T09:30:00Z', content: previousModel === 'two-locale' ? { 'en-US': enUS } : { 'en-US': enUS, 'en-MX': enMX } }, authoredBy: writer }, root);
  }
  const originalProof = await publish(root, 'blog-post:old-release', 1);
  const originalArtifacts = (await loadCmsWorkspace(root)).artifacts;
  await assert.rejects(() => savePost(root, postId, allContent), /blog-post content model is not ratified/);
  const proposal = await proposeBlogModel(designer, root);
  assert.equal(proposal.revision, 2);
  const preview = await previewProfileRatification(BLOG_PROFILE_ID, proposal.revision, root);
  await ratifyProfile({ profileId: BLOG_PROFILE_ID, revision: proposal.revision, ratifiedBy: owner, confirmation: preview.confirmation }, root);
  const workspace = await loadCmsWorkspace(root);
  assert.deepEqual(workspace.profiles.find((profile) => profile.profileId === BLOG_PROFILE_ID && profile.revision === 1), oldProfile);
  assert.deepEqual(workspace.artifacts, originalArtifacts);
  const oldRead = await readPost({ artifactId: 'blog-post:old-release', audience: 'public', locale: 'es-MX' }, root);
  assert.deepEqual(oldRead.proof, originalProof);
  assert.equal(oldRead.locale.delivered, previousModel === 'two-locale' ? 'en-US' : 'en-MX', 'historical content still follows its original ratified policy');
  await publish(root, 'blog-post:old-draft', 1);
  const saved = await savePost(root, postId, requiredContent);
  assert.equal(saved.profile.revision, 2);
  await publish(root, postId, 1);
  const newRead = await readPost({ artifactId: postId, audience: 'public', locale: 'en-MX' }, root);
  assert.equal(newRead.locale.delivered, 'es-MX');
  assert.equal(newRead.locale.fallbackApplied, true);
  assert.deepEqual({ headline: newRead.headline, body: newRead.body }, esMX);
}));

test('maintained CMS example matches the executable model and selects each country’s content', async () => {
  const records = JSON.parse(await readFile(new URL('../../../specification/draft/examples/cms/release-proof_four-locale-post.json', import.meta.url), 'utf8'));
  const proof = records;
  assert.deepEqual(proof.profile.payloadContract, BLOG_MODEL_CONTRACT);
  assert.equal(verifyReleaseProof(proof).valid, true);
  for (const requested of ['en-US', 'es-US', 'en-MX', 'es-MX']) {
    const result = selectLocaleContent(proof, requested);
    assert.equal(result.deliveredLocale, requested);
    assert.deepEqual(result.content, proof.release.payload.content[requested]);
  }
});
