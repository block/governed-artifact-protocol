/**
 * The GAP demo server: one MCP server that hosts every application in
 * src/domains, plus two tools of its own (describe_demo and
 * reset_demo_workspace). Start it with `pnpm mcp` from demo/, or import
 * createDemoServer / startMcpHttpServer from tests and other tooling.
 *
 * GAP is transport-independent. MCP over plain loopback HTTP is only how this
 * demo lets an agent client call application actions.
 */
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import { isIP } from 'node:net';
import { pathToFileURL } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { cmsApplication } from './domains/cms/application.js';
import { issueTrackingApplication } from './domains/issue-tracking/application.js';
import { researchApplication } from './domains/research/application.js';
import { buildManifest, defineAction, defineApplication, registerApplication, type GapApplication, type Manifest } from './gap/index.js';

export const serverInfo = { name: 'GAP demo', version: '0.1.0' } as const;
export const disclosure = 'Evaluation only: local JSON storage is not production-ready, multi-user, or a production security boundary. Synthetic data only; never use real privileged, confidential, personal, regulated, or production information.';
export const defaultPort = 42424;
export const defaultHost = 'localhost';

/** The domains this demo hosts, in the order the documentation presents them. */
export const domainApplications: readonly GapApplication[] = [cmsApplication, issueTrackingApplication, researchApplication];

const applicationIds = domainApplications.map((application) => application.id) as [string, ...string[]];

export const instructions = [
  disclosure,
  `This server hosts ${domainApplications.length} GAP applications, each with its own tools and local workspace: ${domainApplications.map((application) => `${application.title} (${application.id})`).join(', ')}.`,
  'Every tool description ends with the application it belongs to, the GAP lifecycle steps it performs, and the release decisions it records; call describe_demo to see the tools grouped by application. MCP transport and caller identity grant no GAP or workflow authority.',
].join(' ');

/** Tools that belong to the server rather than to one application. */
export const demoApplication = defineApplication({
  id: 'demo',
  title: 'Demo server',
  summary: 'Tools about the demo itself: what it hosts, and how to reset an application’s local workspace.',
  docs: { walkthrough: '/domains/run-the-demos' },
  groups: [{ name: 'Demo server', summary: 'Discover the applications and reset local state.' }],
  workspace: {
    initialize: async (root) => { for (const application of domainApplications) await application.workspace.initialize(root); return root ?? ''; },
    reset: async (root) => { for (const application of domainApplications) await application.workspace.reset(root); return root ?? ''; },
  },
  actions: [
    defineAction({
      name: 'describe_demo', title: 'Describe the demo', group: 'Demo server', steps: [],
      description: 'List the applications this server hosts, their tools grouped the way the documentation presents them, and the GAP lifecycle steps and release decisions each tool declares. Read this first to find the tools for the domain you are working in.',
      input: {},
      run: () => describeDemo(),
    }),
    defineAction({
      name: 'reset_demo_workspace', title: 'Reset a demo workspace', group: 'Demo server', steps: [],
      description: 'Explicitly reset one application’s local demo workspace, or every application’s, to checked-in synthetic seed data. This destroys that application’s state and is never run during normal startup. Only call it when the human asks to discard the demo data.',
      input: { application: z.enum([...applicationIds, 'all']), confirm: z.literal('reset synthetic demo workspace') },
      run: async ({ application }, { workspaceRoot }) => {
        const targets = application === 'all' ? domainApplications : domainApplications.filter((candidate) => candidate.id === application);
        const workspaces: Record<string, string> = {};
        for (const target of targets) workspaces[target.id] = await target.workspace.reset(workspaceRoot);
        return { reset: true, workspaces };
      },
    }),
  ],
});

export const applications: readonly GapApplication[] = [...domainApplications, demoApplication];

/** The full manifest: server, planes, steps, and every tool with its input schema. The documentation site renders this. */
export function manifest(): Manifest {
  return buildManifest({ ...serverInfo, instructions }, applications);
}

/** What describe_demo returns: the manifest without input schemas, which a client already has from tools/list. */
export function describeDemo() {
  const full = manifest();
  return {
    server: full.server,
    steps: full.steps.map(({ id, kind, number, title, plane, role }) => ({ id, kind, ...(number ? { number } : {}), title, plane, role })),
    applications: full.applications.map((application) => ({
      ...application,
      groups: application.groups.map((group) => ({ ...group, actions: group.actions.map(({ name, title, steps }) => ({ name, title, steps })) })),
    })),
  };
}

export function createDemoServer(workspaceRoot?: string): McpServer {
  const server = new McpServer({ ...serverInfo }, { instructions });
  const registered = new Set<string>();
  for (const application of applications) registerApplication(server, application, { workspaceRoot }, registered);
  return server;
}

const loopbackHosts = new Map([
  ['localhost', '127.0.0.1'],
  ['127.0.0.1', '127.0.0.1'],
  ['::1', '::1'],
]);

export function resolveLoopbackHost(host: string): string {
  const normalized = host.trim().toLowerCase().replace(/^\[|\]$/g, '');
  const bindHost = loopbackHosts.get(normalized);
  if (!bindHost) throw new Error(`GAP_MCP_HOST must be a loopback host (localhost, 127.0.0.1, or ::1); received ${host}`);
  return bindHost;
}

function requestHostMatches(requestHost: string | undefined, configuredHost: string, port: number): boolean {
  if (!requestHost) return false;
  try {
    const parsed = new URL(`http://${requestHost}`);
    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    const expectedPort = parsed.port ? Number(parsed.port) : 80;
    if (expectedPort !== port) return false;
    if (configuredHost === '::1') return hostname === '::1';
    return hostname === 'localhost' || hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

export function parsePort(value: string): number {
  const port = Number.parseInt(value, 10);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`GAP_MCP_PORT must be an integer from 0 to 65535; received ${value}`);
  return port;
}

export type ServerOptions = { port?: number; host?: string; workspaceRoot?: string };

export async function startMcpHttpServer(options: ServerOptions = {}): Promise<HttpServer> {
  const port = options.port ?? defaultPort;
  const bindHost = resolveLoopbackHost(options.host ?? defaultHost);
  const { workspaceRoot } = options;
  await demoApplication.workspace.initialize(workspaceRoot);
  const httpServer = createHttpServer(async (request, response) => {
    const address = httpServer.address();
    const listeningPort = typeof address === 'object' && address ? address.port : port;
    if (!requestHostMatches(request.headers.host, bindHost, listeningPort)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    if (request.url === '/healthz') {
      if (request.method !== 'GET') response.writeHead(405).end('Method not allowed');
      else response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify({ status: 'ok', transport: 'http', service: 'gap-demo', applications: domainApplications.map((application) => application.id) }));
      return;
    }
    if (request.url !== '/mcp') {
      response.writeHead(404).end('Not found');
      return;
    }
    if (request.method !== 'POST') {
      response.writeHead(405, { allow: 'POST', 'content-type': 'application/json' }).end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }
    const server = createDemoServer(workspaceRoot);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    response.on('close', () => { void transport.close(); void server.close(); });
    try {
      await server.connect(transport);
      await transport.handleRequest(request, response);
    } catch (error) {
      console.error(error);
      if (!response.headersSent) response.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'MCP request failed' }));
    }
  });
  return await new Promise((resolveServer, reject) => {
    httpServer.listen(port, bindHost, () => resolveServer(httpServer));
    httpServer.once('error', reject);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = parsePort(process.env.GAP_MCP_PORT ?? String(defaultPort));
  const host = process.env.GAP_MCP_HOST ?? defaultHost;
  const workspaceRoot = process.env.GAP_WORKSPACE;
  const server = await startMcpHttpServer({ port, host, workspaceRoot });
  const address = server.address();
  const listeningPort = typeof address === 'object' && address ? address.port : port;
  const bare = host.replace(/^\[|\]$/g, '');
  const displayHost = isIP(bare) === 6 ? `[${bare}]` : host;
  console.error(`${serverInfo.name} — one local MCP server for every GAP application in this repository`);
  console.error(disclosure);
  console.error(`MCP endpoint: http://${displayHost}:${listeningPort}/mcp`);
  console.error(`Health check: http://${displayHost}:${listeningPort}/healthz`);
  for (const application of domainApplications) console.error(`  ${application.title}: ${application.actions.length} tools (${application.id})`);
  console.error('Plain HTTP; loopback only; synthetic data only; the server rejects non-loopback hosts and is structurally unusable off-box.');
}
