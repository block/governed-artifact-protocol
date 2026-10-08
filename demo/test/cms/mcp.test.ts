import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { resolveLoopbackHost, startMcpHttpServer } from '../../src/server.js';
import { readWorkspace } from '../../src/domains/cms/workspace.js';

async function withMcp(run: (client: Client, endpoint: URL, workspaceRoot: string) => Promise<void>) {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'gap-cms-mcp-'));
  const server = await startMcpHttpServer({ port: 0, workspaceRoot });
  const address = server.address();
  assert(address && typeof address === 'object');
  const endpoint = new URL(`http://localhost:${address.port}/mcp`);
  const client = new Client({ name: 'cms-test', version: '1.0.0' });
  try {
    await client.connect(new StreamableHTTPClientTransport(endpoint));
    await run(client, endpoint, workspaceRoot);
  } finally {
    await client.close();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(workspaceRoot, { recursive: true, force: true });
  }
}

function structured(result: Awaited<ReturnType<Client['callTool']>>): any {
  assert.equal(result.isError, undefined);
  assert(result.structuredContent);
  const json = JSON.parse(JSON.stringify(result.structuredContent));
  return json.items ?? json;
}

test('plain HTTP MCP is the complete interaction surface for authoring through verification', () => withMcp(async (client, endpoint) => {
  assert.equal(endpoint.protocol, 'http:');
  const tools = await client.listTools();
  const cmsTools = tools.tools.filter((tool) => tool._meta?.['gap/application'] === 'cms');
  assert.deepEqual(cmsTools.map(({ name }) => name).sort(), [
    'authorize_and_release', 'create_artifact_version', 'get_artifact_version', 'get_cms_capabilities', 'get_profile_proposal', 'get_profile_revision', 'get_raw_record', 'get_release_proof',
    'inspect_gallery_external_dependencies', 'list_artifact_versions', 'list_profile_proposals', 'list_profiles', 'list_release_authority_policies', 'list_releases', 'preview_profile_ratification', 'preview_release_authorization', 'propose_profile', 'ratify_profile', 'render_released_article', 'verify_gallery_external_dependency', 'verify_release_proof', 'verify_rendered_artifact',
    'propose_blog_model',
    'save_blog_post',
    'preview_release_approval',
    'approve_post',
    'reject_post',
    'list_post_rejections',
    'publish_post',
    'read_post',
  ].sort());
  const descriptions = new Map(tools.tools.map((tool) => [tool.name, tool.description ?? '']));
  assert.match(descriptions.get('ratify_profile')!, /do not require magic wording/);
  assert.match(descriptions.get('ratify_profile')!, /Application: Blog CMS\. GAP lifecycle steps: 2 ratify a profile revision\./);
  assert.match(descriptions.get('publish_post')!, /GAP lifecycle steps: 4 authorize, 5 release\./);
  assert.match(descriptions.get('preview_release_approval')!, /Performs no GAP lifecycle step and records no release decision\./);
  assert.deepEqual(tools.tools.find((tool) => tool.name === 'publish_post')?._meta, { 'gap/application': 'cms', 'gap/group': 'Blog post walkthrough', 'gap/steps': ['authorize-release', 'release'] });
  assert.match(descriptions.get('authorize_and_release')!, /does not define a current release/);
  assert.match(descriptions.get('get_artifact_version')!, /does not contain or imply release status/);
  const created = structured(await client.callTool({ name: 'create_artifact_version', arguments: {
    artifactId: 'article:mcp', artifactVersion: 1, profileId: 'cms.article',
    payload: { audience: 'public', body: 'Created through an MCP client.', title: 'MCP article' },
    authoredBy: { actorId: 'agent:mcp-writer', actorKind: 'agent' },
  } }));
  assert.equal(created.authoredBy.actorId, 'agent:mcp-writer');
  const capabilities = structured(await client.callTool({ name: 'get_cms_capabilities', arguments: {} }));
  assert.equal(capabilities.contractLanguage.bounds.maxArrayItems, 1_000);
  assert.equal(capabilities.contractLanguage.portability, 'implementation-local');
  assert.match(capabilities.releaseModel, /does not implement|not implemented/);
  const rawArtifact = structured(await client.callTool({ name: 'get_raw_record', arguments: { recordType: 'artifactVersion', artifactId: 'article:mcp', artifactVersion: 1 } }));
  assert.deepEqual(rawArtifact, created);
  assert.equal(structured(await client.callTool({ name: 'list_artifact_versions', arguments: {} }))[0].artifactId, 'article:mcp');
  const profiles = structured(await client.callTool({ name: 'list_profiles', arguments: {} }));
  const exactProfile = structured(await client.callTool({ name: 'get_profile_revision', arguments: { profileId: 'cms.article', revision: profiles[0].revision } }));
  assert.equal(exactProfile.digest, profiles[0].digest);
  const policies = structured(await client.callTool({ name: 'list_release_authority_policies', arguments: {} }));
  assert(policies.some((policy: any) => policy.authority.actorId === 'agent:local-publisher'));
  const preview = structured(await client.callTool({ name: 'preview_release_authorization', arguments: { artifactId: 'article:mcp', artifactVersion: 1 } }));
  await client.callTool({ name: 'authorize_and_release', arguments: { artifactId: 'article:mcp', artifactVersion: 1, authorizedBy: { actorId: 'agent:local-publisher', actorKind: 'agent' }, confirmation: preview.confirmation } });
  assert.equal(structured(await client.callTool({ name: 'list_releases', arguments: { audience: 'members' } })).length, 0);
  assert.equal(structured(await client.callTool({ name: 'list_releases', arguments: { audience: 'public' } }))[0].artifactId, 'article:mcp');
  const proof = structured(await client.callTool({ name: 'get_release_proof', arguments: { artifactId: 'article:mcp', audience: 'public' } }));
  assert.deepEqual(structured(await client.callTool({ name: 'verify_release_proof', arguments: { proof } })), { valid: true, artifactId: 'article:mcp', artifactVersion: 1 });
}));

test('draft reads fail closed over the MCP boundary', () => withMcp(async (client) => {
  await client.callTool({ name: 'create_artifact_version', arguments: {
    artifactId: 'article:draft', artifactVersion: 1, profileId: 'cms.article',
    payload: { audience: 'internal', body: 'Not released.', title: 'Draft' },
    authoredBy: { actorId: 'human:writer', actorKind: 'human' },
  } });
  const missing = await client.callTool({ name: 'get_release_proof', arguments: { artifactId: 'article:draft', audience: 'internal' } });
  assert.equal(missing.isError, true);
  assert.match(JSON.stringify(missing.content), /release not found/);
}));

test('an undeclared input is refused by name and stores nothing', () => withMcp(async (client, _endpoint, workspaceRoot) => {
  const before = await readWorkspace(workspaceRoot);
  const refused = await client.callTool({ name: 'create_artifact_version', arguments: {
    artifactId: 'article:undeclared', artifactVersion: 1, profileId: 'cms.article',
    payload: { audience: 'public', body: 'Carries a field the tool does not declare.', title: 'Undeclared' },
    authoredBy: { actorId: 'agent:writer', actorKind: 'agent' },
    authorizedBy: { actorId: 'agent:local-publisher', actorKind: 'agent' },
  } });
  assert.equal(refused.isError, true);
  assert.match(JSON.stringify(refused.content), /Unrecognized key: \\"authorizedBy\\"/);
  assert.deepEqual(await readWorkspace(workspaceRoot), before);
}));

test('normal startup preserves state and reset requires exact destructive confirmation', () => withMcp(async (client, _endpoint, workspaceRoot) => {
  await client.callTool({ name: 'create_artifact_version', arguments: {
    artifactId: 'article:reset', artifactVersion: 1, profileId: 'cms.article',
    payload: { audience: 'public', body: 'Temporary.', title: 'Reset me' },
    authoredBy: { actorId: 'agent:test', actorKind: 'agent' },
  } });
  assert.equal((await readWorkspace(workspaceRoot)).artifacts instanceof Array, true);
  const rejected = await client.callTool({ name: 'reset_demo_workspace', arguments: { application: 'cms', confirm: 'reset' } });
  assert.equal(rejected.isError, true);
  assert.equal(((await readWorkspace(workspaceRoot)).artifacts as unknown[]).length, 1);
  structured(await client.callTool({ name: 'reset_demo_workspace', arguments: { application: 'cms', confirm: 'reset synthetic demo workspace' } }));
  assert.equal(((await readWorkspace(workspaceRoot)).artifacts as unknown[]).length, 0);
}));

function rawHttp(port: number, hostHeader: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host: '127.0.0.1', port }, () => {
      socket.end(`GET /healthz HTTP/1.1\r\nHost: ${hostHeader}\r\nConnection: close\r\n\r\n`);
    });
    let response = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => { response += chunk; });
    socket.on('end', () => resolve(response));
    socket.on('error', reject);
  });
}

test('loopback host validation fails closed before binding', () => {
  assert.equal(resolveLoopbackHost('localhost'), '127.0.0.1');
  assert.equal(resolveLoopbackHost('127.0.0.1'), '127.0.0.1');
  assert.equal(resolveLoopbackHost('::1'), '::1');
  assert.throws(() => resolveLoopbackHost('0.0.0.0'), /must be a loopback host/);
  assert.throws(() => resolveLoopbackHost('example.com'), /must be a loopback host/);
});

test('Host-header guard rejects DNS-rebinding attempts over raw HTTP', async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'gap-cms-host-'));
  const server = await startMcpHttpServer({ port: 0, workspaceRoot });
  const address = server.address();
  assert(address && typeof address === 'object');
  try {
    assert.match(await rawHttp(address.port, `localhost:${address.port}`), /^HTTP\/1\.1 200 OK/);
    assert.match(await rawHttp(address.port, `attacker.example:${address.port}`), /^HTTP\/1\.1 403 Forbidden/);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test('gallery profile ratification and generic lifecycle run end-to-end over MCP', () => withMcp(async (client) => {
  const proposals = structured(await client.callTool({ name: 'list_profile_proposals', arguments: {} }));
  assert(proposals.some((item: any) => item.profileId === 'cms.image-gallery'));
  const proposal = structured(await client.callTool({ name: 'get_profile_proposal', arguments: { profileId: 'cms.image-gallery', revision: 1 } }));
  assert.equal(proposal.proposedBy.actorKind, 'agent');
  const ratification = structured(await client.callTool({ name: 'preview_profile_ratification', arguments: { profileId: 'cms.image-gallery', revision: 1 } }));
  const rejected = await client.callTool({ name: 'ratify_profile', arguments: { profileId: 'cms.image-gallery', revision: 1, ratifiedBy: { actorId: 'agent:not-authority', actorKind: 'agent' }, confirmation: ratification.confirmation } });
  assert.equal(rejected.isError, true);
  structured(await client.callTool({ name: 'ratify_profile', arguments: { profileId: 'cms.image-gallery', revision: 1, ratifiedBy: { actorId: 'person:local-editor', actorKind: 'human' }, confirmation: ratification.confirmation } }));
  const created = structured(await client.callTool({ name: 'create_artifact_version', arguments: {
    artifactId: 'gallery:mcp', artifactVersion: 1, profileId: 'cms.image-gallery', authoredBy: { actorId: 'agent:curator', actorKind: 'agent' },
    payload: { audience: 'members', title: 'MCP gallery', images: [{ assetRef: 'asset:one', assetDigest: `sha256:${'a'.repeat(64)}`, altText: 'One image', caption: 'First' }] },
  } }));
  assert.equal(created.profile.digest, ratification.subjectDigest);
  const preview = structured(await client.callTool({ name: 'preview_release_authorization', arguments: { artifactId: 'gallery:mcp', artifactVersion: 1 } }));
  structured(await client.callTool({ name: 'authorize_and_release', arguments: { artifactId: 'gallery:mcp', artifactVersion: 1, authorizedBy: { actorId: 'agent:local-publisher', actorKind: 'agent' }, confirmation: preview.confirmation } }));
  const proof = structured(await client.callTool({ name: 'get_release_proof', arguments: { artifactId: 'gallery:mcp', audience: 'members' } }));
  assert.deepEqual(structured(await client.callTool({ name: 'verify_release_proof', arguments: { proof } })), { valid: true, artifactId: 'gallery:mcp', artifactVersion: 1 });
}));

test('gallery ExternalDependencyPins remain unverified until exact bytes independently match', () => withMcp(async (client) => {
  const bytes = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/></svg>', 'utf8');
  const contentDigest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  const ratification = structured(await client.callTool({ name: 'preview_profile_ratification', arguments: { profileId: 'cms.external-image-gallery', revision: 1 } }));
  structured(await client.callTool({ name: 'ratify_profile', arguments: { profileId: 'cms.external-image-gallery', revision: 1, ratifiedBy: { actorId: 'person:local-editor', actorKind: 'human' }, confirmation: ratification.confirmation } }));
  structured(await client.callTool({ name: 'create_artifact_version', arguments: {
    artifactId: 'gallery:external-pins', artifactVersion: 1, profileId: 'cms.external-image-gallery', profileRevision: 1,
    authoredBy: { actorId: 'agent:curator', actorKind: 'agent' },
    payload: { audience: 'public', title: 'External pins', images: [{ asset: { ref: 'asset:circle', contentDigest }, altText: 'A circle', caption: 'Exact SVG bytes' }] },
  } }));
  const preview = structured(await client.callTool({ name: 'preview_release_authorization', arguments: { artifactId: 'gallery:external-pins', artifactVersion: 1 } }));
  structured(await client.callTool({ name: 'authorize_and_release', arguments: { artifactId: 'gallery:external-pins', artifactVersion: 1, authorizedBy: { actorId: 'agent:local-publisher', actorKind: 'agent' }, confirmation: preview.confirmation } }));
  const galleryProof = structured(await client.callTool({ name: 'get_release_proof', arguments: { artifactId: 'gallery:external-pins', audience: 'public' } }));

  const unresolved = structured(await client.callTool({ name: 'inspect_gallery_external_dependencies', arguments: { galleryProof } }));
  assert.equal(unresolved.galleryRelease.semantics, 'normative-gap-core');
  assert.equal(unresolved.dependencySemantics, 'candidate-not-normative');
  assert.equal(unresolved.dependencies[0].status, 'unverified');

  const verified = structured(await client.callTool({ name: 'verify_gallery_external_dependency', arguments: { galleryProof, imageIndex: 0, contentBase64: bytes.toString('base64') } }));
  assert.equal(verified.dependency.status, 'verified');
  assert.equal(verified.dependency.semantics, 'candidate-not-normative');
  assert.equal(verified.dependency.digestInput, 'exact-raw-bytes');
  assert.equal(verified.retrievalOutcome, 'not-proved');
  assert.equal(verified.governanceOutcome, 'external-content-not-governed-by-this-check');

  const mismatch = await client.callTool({ name: 'verify_gallery_external_dependency', arguments: { galleryProof, imageIndex: 0, contentBase64: Buffer.from('tampered').toString('base64') } });
  assert.equal(mismatch.isError, true);
  assert.match(JSON.stringify(mismatch.content), /content digest verification failed/);
}));

test('authored-to-rendered lifecycle runs over MCP with an explicit post-release display boundary', () => withMcp(async (client) => {
  structured(await client.callTool({ name: 'create_artifact_version', arguments: {
    artifactId: 'article:render-source', artifactVersion: 1, profileId: 'cms.article',
    payload: { audience: 'public', body: 'Rendered through a pinned local template.', title: 'Render source' },
    authoredBy: { actorId: 'agent:writer', actorKind: 'agent' },
  } }));
  const sourcePreview = structured(await client.callTool({ name: 'preview_release_authorization', arguments: { artifactId: 'article:render-source', artifactVersion: 1 } }));
  structured(await client.callTool({ name: 'authorize_and_release', arguments: { artifactId: 'article:render-source', artifactVersion: 1, authorizedBy: { actorId: 'agent:local-publisher', actorKind: 'agent' }, confirmation: sourcePreview.confirmation } }));
  const profilePreview = structured(await client.callTool({ name: 'preview_profile_ratification', arguments: { profileId: 'cms.rendered-article', revision: 1 } }));
  structured(await client.callTool({ name: 'ratify_profile', arguments: { profileId: 'cms.rendered-article', revision: 1, ratifiedBy: { actorId: 'person:editor', actorKind: 'human' }, confirmation: profilePreview.confirmation } }));
  const rendered = structured(await client.callTool({ name: 'render_released_article', arguments: {
    sourceArtifactId: 'article:render-source', sourceAudience: 'public', renderedArtifactId: 'render:mcp', renderedArtifactVersion: 1,
    authoredBy: { actorId: 'agent:local-renderer', actorKind: 'agent' },
  } }));
  assert.equal(rendered.sourceDependency.status, 'verified');
  assert.equal(rendered.artifact.profile.profileId, 'cms.rendered-article');
  const renderPreview = structured(await client.callTool({ name: 'preview_release_authorization', arguments: { artifactId: 'render:mcp', artifactVersion: 1 } }));
  structured(await client.callTool({ name: 'authorize_and_release', arguments: { artifactId: 'render:mcp', artifactVersion: 1, authorizedBy: { actorId: 'agent:local-publisher', actorKind: 'agent' }, confirmation: renderPreview.confirmation } }));
  const sourceProof = structured(await client.callTool({ name: 'get_release_proof', arguments: { artifactId: 'article:render-source', audience: 'public' } }));
  const renderedProof = structured(await client.callTool({ name: 'get_release_proof', arguments: { artifactId: 'render:mcp', audience: 'public' } }));
  const verified = structured(await client.callTool({ name: 'verify_rendered_artifact', arguments: { sourceProof, renderedProof } }));
  assert.equal(verified.sourceDependency.status, 'verified');
  assert.equal(verified.verificationClassification.releaseProofs.semantics, 'normative-gap-core');
  assert.equal(verified.verificationClassification.sourceDependency.semantics, 'candidate-not-normative');
  assert.equal(verified.verificationClassification.transformation.semantics, 'implementation-local');
  assert.equal(verified.displayOutcome, 'not-performed-or-proved');
}));

const countContent = { headline: 'The fall count', body: 'Volunteers walk the same three transects every morning from late September through October and write down what they see. It takes about an hour.' };
const revisedCountContent = { headline: 'Help us count the monarchs, starting the second Saturday in September', body: 'Volunteers walk the same three transects every morning from late September through October. Orientation is the second Saturday in September, by the prairie beds.' };

test('guide: approve a blog model, save drafts, reject the first, approve the selected version, and publish it', () => withMcp(async (client) => {
  const call = async (name: string, args: any = {}) => structured(await client.callTool({ name, arguments: args }));
  const writer = { actorId: 'agent:writer', actorKind: 'agent' };
  const editor = { actorId: 'human:editor', actorKind: 'human' };
  const publisher = { actorId: 'human:publisher', actorKind: 'human' };
  const content = { artifactId: 'blog-post:mcp-test', expectedVersion: 0, content: { 'es-MX': countContent, 'en-US': countContent }, author: 'Grounds staff', date: '2026-09-03T09:30:00Z', audience: 'public', authoredBy: writer };
  assert.equal((await client.callTool({ name: 'save_blog_post', arguments: content })).isError, true);
  await call('propose_blog_model', { proposedBy: writer });
  const model = await call('preview_profile_ratification', { profileId: 'blog-post', revision: 1 });
  const ratified = await call('ratify_profile', { profileId: 'blog-post', revision: 1, ratifiedBy: editor, confirmation: model.confirmation, reason: 'The fields match the editorial style guide.' });
  assert.equal(ratified.profile.ratification.reason, 'The fields match the editorial style guide.');
  assert.equal(ratified.profile.digest, model.subjectDigest, 'a ratification reason changes no profile digest');
  const first = await call('save_blog_post', content);
  const second = await call('save_blog_post', { ...content, expectedVersion: 1, content: { 'es-MX': revisedCountContent, 'en-US': revisedCountContent } });
  assert.deepEqual(await call('get_artifact_version', { artifactId: content.artifactId, artifactVersion: 1 }), first);
  assert.equal((await client.callTool({ name: 'save_blog_post', arguments: content })).isError, true);
  assert.equal((await client.callTool({ name: 'get_release_proof', arguments: { artifactId: content.artifactId, audience: 'public' } })).isError, true);
  const reject = { artifactId: content.artifactId, artifactVersion: 1, rejectedBy: editor, reason: 'The headline says there is a count but not that we are asking for volunteers, and the post never says when orientation is.' };
  assert.equal((await client.callTool({ name: 'reject_post', arguments: { ...reject, rejectedBy: writer } })).isError, true, 'writer cannot reject');
  assert.equal((await client.callTool({ name: 'reject_post', arguments: { ...reject, reason: '' } })).isError, true, 'a rejection requires a reason here');
  assert.equal((await client.callTool({ name: 'reject_post', arguments: { artifactId: reject.artifactId, artifactVersion: 1, rejectedBy: editor } })).isError, true, 'a rejection requires a reason here');
  const rejection = await call('reject_post', reject);
  assert.equal(rejection.artifactVersion, 1);
  assert.equal(rejection.reason, reject.reason);
  assert.equal(rejection.authorizationSubjectDigest, (await call('preview_release_approval', { artifactId: content.artifactId, artifactVersion: 1 })).authorizationSubjectDigest, 'a rejection binds the exact stored subject');
  assert.deepEqual(await call('list_post_rejections', { artifactId: content.artifactId }), [rejection]);
  const astral = '😀'.repeat(3000);
  const reviewerRejection = await call('reject_post', { ...reject, rejectedBy: { actorId: 'agent:local-reviewer', actorKind: 'agent' }, reason: astral });
  assert.equal(reviewerRejection.reason, astral, 'the bound counts characters as code points: 3,000 astral characters are 6,000 UTF-16 units and are accepted');
  assert.equal((await call('list_post_rejections', { artifactId: content.artifactId })).length, 2);
  assert.equal((await client.callTool({ name: 'get_release_proof', arguments: { artifactId: content.artifactId, audience: 'public' } })).isError, true, 'rejection releases nothing');
  const preview = await call('preview_release_authorization', { artifactId: content.artifactId, artifactVersion: 2 });
  const publish = { artifactId: content.artifactId, artifactVersion: 2, authorizedBy: publisher, confirmation: preview.confirmation };
  assert.equal((await client.callTool({ name: 'publish_post', arguments: publish })).isError, true, 'publish before approval');
  const approvalPreview = await call('preview_release_approval', { artifactId: content.artifactId, artifactVersion: 2 });
  assert.equal(approvalPreview.authorizationSubjectDigest, preview.authorizationSubjectDigest);
  const approve = { artifactId: content.artifactId, artifactVersion: 2, approvedBy: editor, confirmation: approvalPreview.confirmation, reason: 'The headline asks for volunteers now, and the orientation date is in the body.' };
  assert.equal((await client.callTool({ name: 'approve_post', arguments: { ...approve, approvedBy: writer } })).isError, true, 'writer cannot approve');
  assert.equal((await client.callTool({ name: 'approve_post', arguments: { ...approve, reason: '' } })).isError, true, 'a blank reason is refused');
  assert.equal((await client.callTool({ name: 'approve_post', arguments: { ...approve, reason: ' \t ' } })).isError, true, 'a whitespace-only reason is refused at the tool boundary');
  assert.equal((await client.callTool({ name: 'approve_post', arguments: { ...approve, reason: 'x'.repeat(5001) } })).isError, true, 'the tool applies the same 5,000 character bound as the store');
  const approval = await call('approve_post', approve);
  assert.equal(approval.approvedBy.actorId, 'human:editor');
  assert.equal(approval.reason, 'The headline asks for volunteers now, and the orientation date is in the body.');
  assert.equal(approval.authorizationSubjectDigest, approvalPreview.authorizationSubjectDigest, 'an approval reason changes no subject digest');
  assert.equal((await client.callTool({ name: 'get_release_proof', arguments: { artifactId: content.artifactId, audience: 'public' } })).isError, true, 'approval releases nothing');
  assert.equal((await client.callTool({ name: 'publish_post', arguments: { ...publish, authorizedBy: writer } })).isError, true);
  assert.equal((await client.callTool({ name: 'publish_post', arguments: { ...publish, artifactVersion: 1 } })).isError, true);
  const proof = await call('publish_post', { ...publish, reason: 'Approved by the editor and scheduled ahead of the September orientation.' });
  assert.deepEqual(proof.release.payload, second.payload);
  assert.equal(proof.authorization.authorizedBy.actorId, 'human:publisher');
  assert.equal(proof.authorization.reason, 'Approved by the editor and scheduled ahead of the September orientation.');
  assert.equal(proof.authorization.authorizationSubjectDigest, preview.authorizationSubjectDigest, 'an authorization reason changes no subject digest');
  assert.equal(proof.approvals[0].reason, 'The headline asks for volunteers now, and the orientation date is in the body.');
  assert.equal(proof.approvals[0].approvedBy.actorId, 'human:editor');
  assert.equal('rejections' in proof, false, 'the rejection binds version 1, another subject, so the proof of version 2 does not carry it');
  assert.equal((await call('verify_release_proof', { proof })).valid, true);
  const laterContent = { ...revisedCountContent, body: 'A later draft remains hidden.' };
  const thirdDraft = await call('save_blog_post', { ...content, expectedVersion: 2, content: { 'es-MX': laterContent, 'en-US': laterContent } });
  assert.notDeepEqual(thirdDraft.payload, second.payload, 'the later draft differs from the released version');
  assert.deepEqual(await call('get_release_proof', { artifactId: content.artifactId, audience: 'public' }), proof);
  const later = await call('preview_release_authorization', { artifactId: content.artifactId, artifactVersion: 3 });
  assert.equal((await client.callTool({ name: 'publish_post', arguments: { ...publish, artifactVersion: 3, confirmation: later.confirmation } })).isError, true);
}));
