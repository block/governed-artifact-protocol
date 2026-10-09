/**
 * Applications and their actions.
 *
 * The draft says GAP defines requirements for lifecycle steps, not for
 * application actions, and that an application chooses how to group steps into
 * actions (specification/draft/README.md, "Application actions and lifecycle
 * steps"). This module makes that grouping explicit in code:
 *
 *   - an ApplicationAction is one thing a participant can do (one MCP tool),
 *     declaring which lifecycle steps it performs and which release
 *     decisions it records, possibly none;
 *   - a GapApplication is a domain (a blog CMS, an issue tracker, ...) that owns
 *     a set of actions, organizes them into groups a reader can follow, and
 *     keeps its own local workspace.
 *
 * The step and authority logic stays inside each domain module. This layer
 * only describes, validates, and exposes; it is the first step towards an SDK
 * that would also carry the records themselves.
 */
import type { ZodRawShape, z } from 'zod';
import { isStepId, step, type StepId } from './lifecycle.js';

/** What an action receives besides its input. */
export type ActionContext = {
  /** Root directory for every application's local workspace. Defaults to demo/.local-workspace. */
  workspaceRoot?: string;
};

export type ActionDefinition<Shape extends ZodRawShape = ZodRawShape> = {
  /** MCP tool name: lower-case letters, digits, and underscores. Unique across the whole server. */
  name: string;
  /** Short human title, e.g. "Save a blog post". */
  title: string;
  /** The tool description an MCP client shows. Say what the action does and does not do. */
  description: string;
  /** Which of the application's groups this action belongs to. */
  group: string;
  /** Lifecycle steps this action performs and release decisions it records, in order. Empty when it does neither (reads, previews, working copies, checks). */
  steps: readonly StepId[];
  /** Input fields as a zod raw shape. */
  input: Shape;
  run: (input: z.output<z.ZodObject<Shape>>, context: ActionContext) => unknown;
};

/** An action with its input type erased, as an application stores it. */
export type ApplicationAction = Omit<ActionDefinition<ZodRawShape>, 'run'> & {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the exact input type lives on the ActionDefinition that produced this action
  run: (input: any, context: ActionContext) => unknown;
};

export type ActionGroup = {
  /** Heading a reader sees, e.g. "Blog post walkthrough". */
  name: string;
  summary: string;
};

export type ApplicationWorkspace = {
  /** Create the local workspace from seed data if it does not exist. Never destroys user data. */
  initialize: (root?: string) => Promise<string>;
  /** Replace the local workspace with seed data. Destructive; only ever run on explicit request. */
  reset: (root?: string) => Promise<string>;
};

export type ApplicationDefinition = {
  /** Stable identifier, also the workspace subdirectory: lower-case letters, digits, and hyphens. */
  id: string;
  title: string;
  summary: string;
  /** Site paths for the domain guide and the demo walkthrough, when they exist. */
  docs?: { guide?: string; walkthrough?: string };
  groups: readonly ActionGroup[];
  actions: readonly ApplicationAction[];
  workspace: ApplicationWorkspace;
};

export type GapApplication = ApplicationDefinition & {
  /** Actions in group order, then declaration order. */
  actionsByGroup: () => Array<ActionGroup & { actions: ApplicationAction[] }>;
};

const TOOL_NAME = /^[a-z][a-z0-9_]*$/;
const APPLICATION_ID = /^[a-z][a-z0-9-]*$/;

export function defineAction<Shape extends ZodRawShape>(definition: ActionDefinition<Shape>): ApplicationAction {
  if (!TOOL_NAME.test(definition.name)) throw new Error(`action name must match ${TOOL_NAME}: ${definition.name}`);
  if (!definition.title.trim()) throw new Error(`action ${definition.name} needs a title`);
  if (!definition.description.trim()) throw new Error(`action ${definition.name} needs a description`);
  if (!definition.group.trim()) throw new Error(`action ${definition.name} needs a group`);
  const seen = new Set<string>();
  for (const id of definition.steps) {
    if (!isStepId(id)) throw new Error(`action ${definition.name} names an unknown lifecycle step or release decision: ${String(id)}`);
    if (seen.has(id)) throw new Error(`action ${definition.name} lists ${step(id).kind === 'decision' ? 'release decision' : 'lifecycle step'} ${id} twice`);
    seen.add(id);
  }
  return definition as ApplicationAction;
}

export function defineApplication(definition: ApplicationDefinition): GapApplication {
  if (!APPLICATION_ID.test(definition.id)) throw new Error(`application id must match ${APPLICATION_ID}: ${definition.id}`);
  if (definition.groups.length === 0) throw new Error(`application ${definition.id} needs at least one group`);
  const groupNames = new Set<string>();
  for (const group of definition.groups) {
    if (groupNames.has(group.name)) throw new Error(`application ${definition.id} declares group ${JSON.stringify(group.name)} twice`);
    groupNames.add(group.name);
  }
  const actionNames = new Set<string>();
  for (const action of definition.actions) {
    if (actionNames.has(action.name)) throw new Error(`application ${definition.id} declares action ${action.name} twice`);
    actionNames.add(action.name);
    if (!groupNames.has(action.group)) throw new Error(`application ${definition.id}: action ${action.name} names an undeclared group ${JSON.stringify(action.group)}`);
  }
  for (const group of definition.groups) {
    if (!definition.actions.some((action) => action.group === group.name)) throw new Error(`application ${definition.id}: group ${JSON.stringify(group.name)} has no actions`);
  }
  return {
    ...definition,
    actionsByGroup: () => definition.groups.map((group) => ({ ...group, actions: definition.actions.filter((action) => action.group === group.name) })),
  };
}
