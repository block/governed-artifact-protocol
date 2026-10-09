import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { resolveLoopbackHost, startMcpHttpServer } from '../../src/server.js';
import { readWorkspace } from '../../src/domains/issue-tracking/workspace.js';

async function withMcp(run: (client: Client, endpoint: URL, port: number, root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'gap-issue-tracking-mcp-'));
  const server = await startMcpHttpServer({ port: 0, workspaceRoot: root });
  const address = server.address();
  assert(address && typeof address === 'object');
  const endpoint = new URL(`http://127.0.0.1:${address.port}/mcp`);
  const client = new Client({ name: 'issue-tracking-test', version: '1.0.0' });
  try {
    await client.connect(new StreamableHTTPClientTransport(endpoint));
    await run(client, endpoint, address.port, root);
  } finally {
    await client.close();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(root, { recursive: true, force: true });
  }
}

function structured(result: Awaited<ReturnType<Client['callTool']>>): any {
  assert.equal(result.isError, undefined);
  assert(result.structuredContent);
  const parsed = JSON.parse(JSON.stringify(result.structuredContent));
  return parsed.items ?? parsed;
}
function errorText(result: Awaited<ReturnType<Client['callTool']>>): string {
  assert.equal(result.isError, true);
  return (result.content as Array<{ type: string; text?: string }>).map((item) => item.text ?? '').join('\n');
}

test('MCP exposes the current ticket workflow and resets its records', () => withMcp(async (client, endpoint) => {
  assert.equal(endpoint.protocol, 'http:');
  const listed = await client.listTools();
  const issueTools = listed.tools.filter((tool) => tool._meta?.['gap/application'] === 'issue-tracking');
  assert.deepEqual(issueTools.map(({ name }) => name).sort(), [
    'create_ticket', 'get_ticket_history', 'get_ticket_workflow', 'list_current_tickets', 'update_ticket',
    'stage_ticket_changes', 'get_ticket_working_copy', 'discard_ticket_working_copy', 'save_ticket_changes',
  ].sort());

  const first = structured(await client.callTool({ name: 'create_ticket', arguments: {
    artifactId: 'ticket:mcp', actor: { actorId: 'agent:requester', actorKind: 'agent' },
    payload: { title: 'MCP ticket', description: 'Exercise the current ticket workflow.', acceptanceCriteria: [], status: 'to_do' },
  } }));
  assert.deepEqual(structured(await client.callTool({ name: 'list_current_tickets', arguments: {} })), [first]);
  const reset = structured(await client.callTool({ name: 'reset_demo_workspace', arguments: { application: 'issue-tracking', confirm: 'reset synthetic demo workspace' } }));
  assert.equal(reset.reset, true);
  assert.deepEqual(Object.keys(reset.workspaces), ['issue-tracking']);
  assert.deepEqual(structured(await client.callTool({ name: 'list_current_tickets', arguments: {} })), []);
}));

test('an undeclared input is refused by name and records nothing', () => withMcp(async (client, _endpoint, _port, root) => {
  const before = await readWorkspace(root);
  const refused = await client.callTool({ name: 'create_ticket', arguments: {
    artifactId: 'ticket:undeclared', actor: { actorId: 'agent:requester', actorKind: 'agent' },
    payload: { title: 'Undeclared input', description: 'Carries a field the tool does not declare.', acceptanceCriteria: [], status: 'to_do' },
    completionEvidence: 'Verified by hand.',
  } });
  assert.equal(refused.isError, true);
  assert.match(JSON.stringify(refused.content), /Unrecognized key: \\"completionEvidence\\"/);
  assert.deepEqual(await readWorkspace(root), before);
  assert.deepEqual(structured(await client.callTool({ name: 'list_current_tickets', arguments: {} })), []);
}));

function rawHttp(port: number, hostHeader: string, path = '/healthz'): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host: '127.0.0.1', port }, () => {
      socket.end(`GET ${path} HTTP/1.1\r\nHost: ${hostHeader}\r\nConnection: close\r\n\r\n`);
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
  assert.equal(resolveLoopbackHost('[::1]'), '::1');
  assert.throws(() => resolveLoopbackHost('0.0.0.0'), /must be a loopback host/);
  assert.throws(() => resolveLoopbackHost('example.com'), /must be a loopback host/);
});

test('plain HTTP endpoint keeps health, path, method, and raw Host-header defenses', () => withMcp(async (_client, endpoint, port) => {
  const health = await fetch(new URL('/healthz', endpoint));
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok', transport: 'http', service: 'gap-demo', applications: ['cms', 'issue-tracking', 'research'] });
  assert.equal((await fetch(endpoint, { method: 'GET' })).status, 405);
  assert.equal((await fetch(new URL('/missing', endpoint))).status, 404);
  assert.match(await rawHttp(port, `attacker.example:${port}`), /^HTTP\/1\.1 403 Forbidden/);
}));

test('guide: create, save, and complete immediately release exact versions and retain history', () => withMcp(async (client) => {
  const call = async (name: string, args: any = {}) => structured(await client.callTool({ name, arguments: args }));
  const requester = { actorId: 'agent:requester', actorKind: 'agent' };
  const assignee = { actorId: 'agent:assignee', actorKind: 'agent' };
  const artifactId = 'ticket:subtraction';
  const payload = { title: 'Fix the subtraction button', description: 'The calculator adds numbers when subtraction is selected.', acceptanceCriteria: [], status: 'to_do' };
  const policy = await call('get_ticket_workflow');
  assert.equal(policy.profile.profileId, 'bug-ticket');
  const first = await call('create_ticket', { artifactId, payload, actor: requester });
  assert.equal(first.authorization.authorizedBy.actorId, requester.actorId);
  assert.deepEqual(Object.keys(first).sort(), ['authorization', 'profile', 'release']);
  assert.deepEqual((await call('list_current_tickets'))[0], first);
  assert.match(errorText(await client.callTool({ name: 'create_ticket', arguments: { artifactId, payload, actor: requester } })), /ticket already exists: choose a new ticket ID/);
  assert.deepEqual(await call('get_ticket_history', { artifactId }), [first]);
  const revised = { ...payload, acceptanceCriteria: ['Subtracting 2 from 5 must display 3.'], status: 'in_progress' };
  assert.equal((await client.callTool({ name: 'update_ticket', arguments: { artifactId, expectedVersion: 1, payload: revised, actor: requester } })).isError, true);
  assert.match(errorText(await client.callTool({ name: 'update_ticket', arguments: { artifactId, expectedVersion: 1, payload: revised, actor: assignee, completionEvidence: 'Synthetic check: started on the fix.' } })), /completion evidence applies only to a save that marks the ticket done/);
  const second = await call('update_ticket', { artifactId, expectedVersion: 1, payload: revised, actor: assignee });
  assert.equal('reason' in second.authorization, false);
  assert.equal(second.release.artifactVersion, 2);
  assert.equal((await client.callTool({ name: 'update_ticket', arguments: { artifactId, expectedVersion: 1, payload: revised, actor: assignee } })).isError, true);
  assert.equal((await client.callTool({ name: 'update_ticket', arguments: { artifactId, expectedVersion: 2, payload: { ...revised, status: 'done' }, actor: assignee } })).isError, true);
  const third = await call('update_ticket', { artifactId, expectedVersion: 2, payload: { ...revised, status: 'done' }, actor: assignee, completionEvidence: 'Synthetic check: 5 minus 2 displayed 3.' });
  assert.deepEqual(await call('get_ticket_history', { artifactId }), [first, second, third]);
  assert.deepEqual(await call('list_current_tickets'), [third]);
}));

test('guide: an assignee iterates on a working copy, then Save changes creates one version', () => withMcp(async (client) => {
  const call = async (name: string, args: any = {}) => structured(await client.callTool({ name, arguments: args }));
  const requester = { actorId: 'agent:requester', actorKind: 'agent' };
  const assignee = { actorId: 'agent:assignee', actorKind: 'agent' };
  const artifactId = 'ticket:subtraction-working-copy';
  const payload = { title: 'Fix the subtraction button', description: 'The calculator adds numbers when subtraction is selected.', acceptanceCriteria: [], status: 'to_do' };
  const revised = { ...payload, acceptanceCriteria: ['Subtracting 2 from 5 must display 3.'], status: 'in_progress' };
  assert.match((await call('get_ticket_workflow')).workingCopies, /not an artifact version/);
  const first = await call('create_ticket', { artifactId, payload, actor: requester });
  const draft = await call('stage_ticket_changes', { artifactId, expectedVersion: 1, payload: { ...revised, title: '' }, actor: assignee });
  assert.equal(draft.workingCopy.saveCount, 1);
  assert.equal(draft.validation.valid, false);
  assert.equal('artifactVersion' in draft.workingCopy, false);
  const fixed = await call('stage_ticket_changes', { artifactId, expectedVersion: 1, payload: revised, actor: assignee });
  assert.equal(fixed.workingCopy.saveCount, 2);
  assert.equal(fixed.validation.valid, true);
  assert.deepEqual(await call('list_current_tickets'), [first]);
  assert.deepEqual(await call('get_ticket_history', { artifactId }), [first]);
  assert.deepEqual(await call('get_ticket_working_copy', { artifactId }), fixed);
  assert.equal((await client.callTool({ name: 'save_ticket_changes', arguments: { artifactId, actor: requester } })).isError, true);
  assert.match(errorText(await client.callTool({ name: 'save_ticket_changes', arguments: { artifactId, actor: assignee, completionEvidence: 'Synthetic check: started on the fix.' } })), /completion evidence applies only to a save that marks the ticket done/);
  assert.deepEqual(await call('get_ticket_working_copy', { artifactId }), fixed);
  const second = await call('save_ticket_changes', { artifactId, actor: assignee });
  assert.equal('reason' in second.authorization, false);
  assert.deepEqual(Object.keys(second).sort(), ['authorization', 'profile', 'release']);
  assert.equal(second.release.artifactVersion, 2);
  assert.deepEqual(second.release.payload, revised);
  assert.equal((await client.callTool({ name: 'get_ticket_working_copy', arguments: { artifactId } })).isError, true);
  assert.deepEqual(await call('get_ticket_history', { artifactId }), [first, second]);
  assert.equal((await client.callTool({ name: 'stage_ticket_changes', arguments: { artifactId, expectedVersion: 1, payload: revised, actor: assignee } })).isError, true);
}));
