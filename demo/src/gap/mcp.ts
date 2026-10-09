/**
 * Expose applications over the Model Context Protocol, and describe them.
 *
 * GAP is transport-independent; MCP is only how this demo lets an agent client
 * call application actions. Each action becomes one tool. The tool description
 * ends with the application it belongs to, the lifecycle steps it performs, and the release decisions it records,
 * and the same facts travel in the tool's _meta so a client can group tools
 * by domain. buildManifest() produces the JSON the documentation site renders
 * as the tool reference.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ActionContext, ApplicationAction, GapApplication } from './application.js';
import { PLANES, STEPS, describeSteps, type Step, type StepId } from './lifecycle.js';

export type ToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent: Record<string, unknown>;
};

/** Wrap an action's return value the way every tool in the demo reports it. */
export function toolResult(value: unknown): ToolResult {
  const structuredContent = Array.isArray(value)
    ? { items: value }
    : value !== null && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : { value };
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }], structuredContent };
}

export function toolDescription(application: GapApplication, action: ApplicationAction): string {
  return `${action.description.trim()}\n\nApplication: ${application.title}. ${describeSteps(action.steps)}`;
}

/**
 * The input schema of an action's tool: its declared fields and nothing else.
 * The server validates calls against this schema and the manifest publishes
 * it, so the enforced and advertised schemas come from one definition and
 * cannot drift. A call with an undeclared field fails with an error naming the
 * field and never reaches the action.
 */
function toolInputSchema(action: ApplicationAction) {
  return z.object(action.input).strict();
}

/**
 * Register every action of an application as a tool. `registered` is shared
 * across applications so a name used twice on one server fails at startup
 * instead of silently shadowing another domain's tool.
 */
export function registerApplication(server: McpServer, application: GapApplication, context: ActionContext, registered: Set<string>): void {
  for (const action of application.actions) {
    if (registered.has(action.name)) throw new Error(`tool ${action.name} is registered twice; application ${application.id} must rename it`);
    registered.add(action.name);
    server.registerTool(
      action.name,
      {
        title: action.title,
        description: toolDescription(application, action),
        inputSchema: toolInputSchema(action),
        _meta: { 'gap/application': application.id, 'gap/group': action.group, 'gap/steps': [...action.steps] },
      },
      async (input) => toolResult(await action.run(input, context)),
    );
  }
}

export type ManifestAction = {
  name: string;
  title: string;
  description: string;
  steps: StepId[];
  /** JSON Schema for the tool input, as an MCP client receives it. */
  inputSchema: Record<string, unknown>;
};

export type ManifestApplication = {
  id: string;
  title: string;
  summary: string;
  docs?: { guide?: string; walkthrough?: string };
  groups: Array<{ name: string; summary: string; actions: ManifestAction[] }>;
};

export type Manifest = {
  server: { name: string; version: string; instructions: string };
  planes: typeof PLANES;
  steps: Step[];
  applications: ManifestApplication[];
};

/** Everything a reader needs to browse the tools by application, group, and lifecycle step. */
export function buildManifest(server: Manifest['server'], applications: readonly GapApplication[]): Manifest {
  return {
    server,
    planes: PLANES,
    steps: [...STEPS],
    applications: applications.map((application) => ({
      id: application.id,
      title: application.title,
      summary: application.summary,
      ...(application.docs ? { docs: application.docs } : {}),
      groups: application.actionsByGroup().map((group) => ({
        name: group.name,
        summary: group.summary,
        actions: group.actions.map((action) => ({
          name: action.name,
          title: action.title,
          description: action.description,
          steps: [...action.steps],
          inputSchema: z.toJSONSchema(toolInputSchema(action), { io: 'input' }) as Record<string, unknown>,
        })),
      })),
    })),
  };
}
