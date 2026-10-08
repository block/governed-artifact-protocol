/**
 * The demo's application layer: lifecycle steps as data, actions that declare
 * the steps they perform and decisions they record, applications that group actions, and the MCP
 * exposure of all three. Domain modules import from here; the server composes
 * applications with it.
 */
export { PLANES, STEPS, describeSteps, isStepId, step } from './lifecycle.js';
export type { Plane, Role, Step, StepId } from './lifecycle.js';
export { defineAction, defineApplication } from './application.js';
export type { ActionContext, ActionDefinition, ActionGroup, ApplicationAction, ApplicationDefinition, ApplicationWorkspace, GapApplication } from './application.js';
export { buildManifest, registerApplication, toolDescription, toolResult } from './mcp.js';
export type { Manifest, ManifestAction, ManifestApplication, ToolResult } from './mcp.js';
export { defaultWorkspaceRoot, demoRoot, localWorkspacePath, seedPath } from './workspace.js';
