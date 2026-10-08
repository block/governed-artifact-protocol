import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { STEPS } from '../src/gap/index.js';
import { applications, createDemoServer, describeDemo, domainApplications, manifest, parsePort, startMcpHttpServer } from '../src/server.js';

test('the demo hosts three domain applications plus its own tools, with no tool name used twice', () => {
  assert.deepEqual(domainApplications.map((application) => application.id), ['cms', 'issue-tracking', 'research']);
  assert.deepEqual(applications.map((application) => application.id), ['cms', 'issue-tracking', 'research', 'demo']);
  const names = applications.flatMap((application) => application.actions.map((action) => action.name));
  assert.equal(new Set(names).size, names.length, 'every tool name is unique across the server');
  assert.doesNotThrow(() => createDemoServer());
});

test('every lifecycle step and every release decision is performed by at least one tool', () => {
  const performed = new Set(applications.flatMap((application) => application.actions.flatMap((action) => action.steps)));
  for (const step of STEPS) assert(performed.has(step.id), `${step.id} is demonstrated by some tool`);
});

test('the manifest is JSON-safe and lists each application with a guide, a walkthrough, and non-empty groups', () => {
  const built = JSON.parse(JSON.stringify(manifest()));
  assert.equal(built.server.name, 'GAP demo');
  assert.match(built.server.instructions, /Evaluation only/);
  for (const application of built.applications.filter((item: any) => item.id !== 'demo')) {
    assert.match(application.docs.guide, /^\/domains\/[a-z-]+$/);
    assert.match(application.docs.walkthrough, /^\/domains\/[a-z-]+\/demo$/);
    for (const group of application.groups) {
      assert(group.actions.length > 0, `${application.id}/${group.name} is non-empty`);
      for (const action of group.actions) {
        assert.equal(action.inputSchema.type, 'object');
        assert.equal(action.inputSchema.additionalProperties, false, `${action.name} rejects unknown fields`);
      }
    }
  }
  const described = describeDemo();
  assert.equal('inputSchema' in described.applications[0].groups[0].actions[0], false);
});

test('the manifest script prints the same manifest', () => {
  const script = fileURLToPath(new URL('../src/manifest.ts', import.meta.url));
  const printed = JSON.parse(execFileSync(process.execPath, ['--import', 'tsx', script], { encoding: 'utf8', cwd: fileURLToPath(new URL('..', import.meta.url)) }));
  assert.deepEqual(printed, JSON.parse(JSON.stringify(manifest())));
});

test('parsePort accepts a TCP port and nothing else', () => {
  assert.equal(parsePort('0'), 0);
  assert.equal(parsePort('42424'), 42424);
  assert.throws(() => parsePort('70000'), /GAP_MCP_PORT/);
  assert.throws(() => parsePort('http'), /GAP_MCP_PORT/);
});

test('one HTTP server serves every application, initializes each workspace, and resets them separately', async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'gap-demo-'));
  const server = await startMcpHttpServer({ port: 0, workspaceRoot });
  const address = server.address();
  assert(address && typeof address === 'object');
  const client = new Client({ name: 'demo-test', version: '0.0.0' });
  try {
    assert.deepEqual((await readdir(workspaceRoot)).sort(), ['cms', 'issue-tracking', 'research']);
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://localhost:${address.port}/mcp`)));
    const tools = (await client.listTools()).tools;
    const byApplication = new Map<string, number>();
    for (const tool of tools) {
      const application = String(tool._meta?.['gap/application']);
      byApplication.set(application, (byApplication.get(application) ?? 0) + 1);
    }
    assert.deepEqual([...byApplication.keys()].sort(), ['cms', 'demo', 'issue-tracking', 'research']);
    assert.equal(tools.length, applications.reduce((total, application) => total + application.actions.length, 0));
    const described = await client.callTool({ name: 'describe_demo', arguments: {} });
    assert.equal(described.isError, undefined);
    assert.deepEqual((described.structuredContent as any).applications.map((application: any) => application.id), ['cms', 'issue-tracking', 'research', 'demo']);
    const cmsBefore = await client.callTool({ name: 'save_blog_post', arguments: {} });
    assert.equal(cmsBefore.isError, true, 'a CMS tool answers on the shared server');
    const ticket = await client.callTool({ name: 'create_ticket', arguments: {
      artifactId: 'ticket:shared', actor: { actorId: 'agent:requester', actorKind: 'agent' },
      payload: { title: 'Shared server', description: 'One server, three domains.', acceptanceCriteria: [], status: 'to_do' },
    } });
    assert.equal(ticket.isError, undefined, JSON.stringify(ticket.content));
    const wrongConfirm = await client.callTool({ name: 'reset_demo_workspace', arguments: { application: 'issue-tracking', confirm: 'reset' } });
    assert.equal(wrongConfirm.isError, true);
    const unknownApp = await client.callTool({ name: 'reset_demo_workspace', arguments: { application: 'email', confirm: 'reset synthetic demo workspace' } });
    assert.equal(unknownApp.isError, true);
    const reset = await client.callTool({ name: 'reset_demo_workspace', arguments: { application: 'all', confirm: 'reset synthetic demo workspace' } });
    assert.deepEqual(Object.keys((reset.structuredContent as any).workspaces), ['cms', 'issue-tracking', 'research']);
    const tickets = await client.callTool({ name: 'list_current_tickets', arguments: {} });
    assert.deepEqual(tickets.structuredContent, { items: [] });
  } finally {
    await client.close();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});
