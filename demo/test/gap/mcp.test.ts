import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildManifest, defineAction, defineApplication, registerApplication, toolDescription, toolResult } from '../../src/gap/index.js';

const noopWorkspace = { initialize: async (root?: string) => root ?? '', reset: async (root?: string) => root ?? '' };
const things = defineApplication({
  id: 'things', title: 'Things', summary: 'A thing store.', docs: { guide: '/domains/things' }, workspace: noopWorkspace,
  groups: [{ name: 'Main', summary: 'Everything.' }],
  actions: [
    defineAction({ name: 'read_thing', title: 'Read', description: 'Reads one thing.', group: 'Main', steps: ['verify'], input: { id: z.string().min(1) }, run: ({ id }, context) => ({ id, root: context.workspaceRoot }) }),
    defineAction({ name: 'list_things', title: 'List', description: 'Lists things.', group: 'Main', steps: [], input: {}, run: () => ['a', 'b'] }),
  ],
});

test('toolResult wraps arrays and primitives so structuredContent is always an object', () => {
  assert.deepEqual(toolResult(['a']).structuredContent, { items: ['a'] });
  assert.deepEqual(toolResult(3).structuredContent, { value: 3 });
  assert.deepEqual(toolResult({ id: 'x' }).structuredContent, { id: 'x' });
  assert.equal(toolResult({ id: 'x' }).content[0].text, JSON.stringify({ id: 'x' }, null, 2));
});

test('a tool description ends with the application and the steps it performs', () => {
  assert.equal(toolDescription(things, things.actions[0]), 'Reads one thing.\n\nApplication: Things. GAP lifecycle steps: 6 read and verify.');
  assert.equal(toolDescription(things, things.actions[1]), 'Lists things.\n\nApplication: Things. Performs no GAP lifecycle step and records no release decision.');
});

test('registerApplication exposes each action as a tool with gap metadata and refuses a second application reusing a name', async () => {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  const registered = new Set<string>();
  registerApplication(server, things, { workspaceRoot: '/tmp/things' }, registered);
  const clash = defineApplication({ ...things, id: 'other', actions: [things.actions[0]] });
  assert.throws(() => registerApplication(server, clash, {}, registered), /tool read_thing is registered twice; application other must rename it/);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await client.connect(clientTransport);
  const tools = (await client.listTools()).tools;
  assert.deepEqual(tools.map((tool) => tool.name).sort(), ['list_things', 'read_thing']);
  assert.deepEqual(tools.find((tool) => tool.name === 'read_thing')?._meta, { 'gap/application': 'things', 'gap/group': 'Main', 'gap/steps': ['verify'] });
  const read = await client.callTool({ name: 'read_thing', arguments: { id: 'x' } });
  assert.deepEqual(read.structuredContent, { id: 'x', root: '/tmp/things' });
  assert.deepEqual((await client.callTool({ name: 'list_things', arguments: {} })).structuredContent, { items: ['a', 'b'] });
  assert.equal((await client.callTool({ name: 'read_thing', arguments: { id: '' } })).isError, true);
  await client.close();
  await server.close();
});

test('a tool refuses an undeclared input before its action runs, as the schema it advertises says', async () => {
  const calls: unknown[] = [];
  const counted = defineApplication({
    ...things,
    actions: [defineAction({ name: 'read_thing', title: 'Read', description: 'Reads one thing.', group: 'Main', steps: [], input: { id: z.string().min(1) }, run: (input) => { calls.push(input); return input; } })],
  });
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  registerApplication(server, counted, {}, new Set());
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await client.connect(clientTransport);
  const [listed] = (await client.listTools()).tools;
  const { $schema: _listedDialect, ...advertised } = listed.inputSchema as Record<string, unknown>;
  const { $schema: _manifestDialect, ...published } = buildManifest({ name: 'test', version: '0.0.0', instructions: 'none' }, [counted]).applications[0].groups[0].actions[0].inputSchema;
  assert.equal(advertised.additionalProperties, false);
  assert.deepEqual(advertised, published, 'tools/list and the manifest advertise the same input schema');
  const refused = await client.callTool({ name: 'read_thing', arguments: { id: 'x', note: 'ignored?' } });
  assert.equal(refused.isError, true);
  assert.match(JSON.stringify(refused.content), /Unrecognized key: \\"note\\"/);
  assert.deepEqual(calls, [], 'the action never sees a call with an undeclared input');
  assert.deepEqual((await client.callTool({ name: 'read_thing', arguments: { id: 'x' } })).structuredContent, { id: 'x' });
  assert.deepEqual(calls, [{ id: 'x' }]);
  await client.close();
  await server.close();
});

test('buildManifest describes applications, groups, actions, and JSON input schemas', () => {
  const manifest = buildManifest({ name: 'test', version: '0.0.0', instructions: 'none' }, [things]);
  assert.equal(manifest.steps.length, 9);
  assert.deepEqual(Object.keys(manifest.planes), ['configuration', 'authoring', 'release']);
  const [application] = manifest.applications;
  assert.deepEqual(application.docs, { guide: '/domains/things' });
  const [group] = application.groups;
  assert.equal(group.name, 'Main');
  const read = group.actions.find((action) => action.name === 'read_thing')!;
  assert.deepEqual(read.steps, ['verify']);
  assert.equal(read.inputSchema.type, 'object');
  assert.deepEqual(read.inputSchema.required, ['id']);
  assert.equal((read.inputSchema.properties as any).id.minLength, 1);
  assert.equal(read.inputSchema.additionalProperties, false);
});
