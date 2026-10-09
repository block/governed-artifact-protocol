import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { startMcpHttpServer } from '../../src/server.js';
import { readWorkspace } from '../../src/domains/research/workspace.js';
import { entry, feedback, manuscript, methods, citedWorksEditor, methodsId, paperAuthor, paperId, peer, publisher, editor, sourceAuthor, study, studyId, reviewId, sweep } from './fixtures.js';

test('MCP publishes the gummy-worm recall workflow end to end, verifies exported proof, reports drift, and withdraws without rewriting', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gap-research-mcp-'));
  const server = await startMcpHttpServer({ port: 0, workspaceRoot: root });
  const address = server.address(); assert(address && typeof address === 'object');
  const client = new Client({ name: 'research-test', version: '1' });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://localhost:${address.port}/mcp`)));
    async function call(name: string, args: Record<string, unknown> = {}) { const r = await client.callTool({ name, arguments: args }); assert.equal(r.isError, undefined, JSON.stringify(r.content)); return r.structuredContent as any; }
    const tools = (await client.listTools()).tools.filter(t => t._meta?.['gap/application'] === 'research');
    assert.deepEqual(tools.map(t => t.name).sort(), ['approve_research_paper', 'get_research_workflow', 'preview_research_release', 'read_research', 'reject_research_paper', 'release_research',
      'save_research_editor_notes', 'save_research_paper', 'save_research_review', 'save_research_source', 'sweep_research_sources', 'verify_research_proof', 'withdraw_research_paper']);
    assert.deepEqual(tools.find(t => t.name === 'approve_research_paper')?._meta?.['gap/steps'], ['approve-release']);
    const workflow = await call('get_research_workflow'); assert.equal(workflow.profiles.length, 4);
    const bad = await client.callTool({ name: 'save_research_source', arguments: { artifactId: studyId, actor: sourceAuthor, payload: study(), undeclared: true } });
    assert.equal(bad.isError, true); assert.equal(((await readWorkspace(root)).research as any).artifacts.length, 0);
    async function release(artifact: any, actor: any) { const p = await call('preview_research_release', { artifactId: artifact.artifactId, artifactVersion: artifact.artifactVersion, actor }); return call('release_research', { artifactId: artifact.artifactId, artifactVersion: artifact.artifactVersion, actor, confirmation: p.confirmation, expectedCurrentVersion: p.expectedCurrentVersion }); }
    const s = await call('save_research_source', { artifactId: studyId, actor: sourceAuthor, payload: study() }); await release(s, citedWorksEditor);
    const m = await call('save_research_source', { artifactId: methodsId, actor: citedWorksEditor, payload: methods }); await release(m, citedWorksEditor);
    const v1 = await call('save_research_paper', { artifactId: paperId, actor: paperAuthor, payload: manuscript([entry(s), entry(m)]) });
    const draft = await client.callTool({ name: 'read_research', arguments: { artifactId: paperId } }); assert.equal(draft.isError, true);
    const report = await call('save_research_review', { artifactId: reviewId, actor: peer, payload: { manuscript: { ...entry(v1), profile: v1.profile }, reviewer: 'Fictional Peer Reviewer', recommendation: 'revise', feedback } }); await release(report, publisher);
    const v2 = await call('save_research_paper', { artifactId: paperId, actor: paperAuthor, payload: manuscript([entry(s), entry(m), entry(report)], true) });
    const p = await call('preview_research_release', { artifactId: paperId, artifactVersion: v2.artifactVersion, actor: editor });
    await call('approve_research_paper', { artifactId: paperId, artifactVersion: v2.artifactVersion, actor: editor, confirmation: p.approvalConfirmation });
    const proof = await release(v2, publisher);
    const verified = await call('verify_research_proof', { proof, trustStore: workflow.trustStores.journal }); assert.equal(verified.status, 'verified');
    const tampered = structuredClone(proof); tampered.release.payload.title = 'changed';
    assert.equal((await client.callTool({ name: 'verify_research_proof', arguments: { proof: tampered, trustStore: workflow.trustStores.journal } })).isError, true);
    const corrected = await call('save_research_source', { artifactId: studyId, actor: sourceAuthor, payload: study(true) }); await release(corrected, citedWorksEditor);
    const before = structuredClone((await readWorkspace(root)).research as any);
    const findings = await call('sweep_research_sources', { actor: sweep }); assert.equal(findings.items.find((f: any) => f.source.artifactId === studyId).status, 'drift');
    assert.deepEqual((await readWorkspace(root)).research, before, 'the sweep changes no record');
    await call('withdraw_research_paper', { artifactId: paperId, artifactVersion: v2.artifactVersion, actor: publisher, reason: 'Source correction requires editorial review.' });
    const current = await call('read_research', { artifactId: paperId }); assert.deepEqual(Object.keys(current.items[0]), ['withdrawal']);
    const historical = await call('read_research', { artifactId: paperId, artifactVersion: v2.artifactVersion }); assert.deepEqual(historical.items[0].release, proof.release); assert.equal((await call('verify_research_proof', { proof: historical.items[0], trustStore: workflow.trustStores.journal })).status, 'withdrawn');
    const after = (await readWorkspace(root)).research as any;
    for (const key of Object.keys(before).filter(k => k !== 'withdrawals')) assert.deepEqual(after[key], before[key]);
    const wrongReset = await client.callTool({ name: 'reset_demo_workspace', arguments: { application: 'research', confirm: 'reset' } }); assert.equal(wrongReset.isError, true);
    await call('reset_demo_workspace', { application: 'research', confirm: 'reset synthetic demo workspace' });
    assert.equal(((await readWorkspace(root)).research as any).artifacts.length, 0);
  } finally { await client.close(); await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); await rm(root, { recursive: true, force: true }); }
});
