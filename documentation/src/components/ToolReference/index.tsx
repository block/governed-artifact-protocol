import React from "react";
import Link from "@docusaurus/Link";
import manifest from "@site/src/data/tools.json";
import { StepList, Steps, type StepData } from "@site/src/components/Step";
import s from "./styles.module.css";

/**
 * The demo's tools, organized by application and group, with the GAP
 * lifecycle steps and release decisions each one declares. The data is the demo's own manifest
 * (demo/src/manifest.ts), written to src/data/tools.json by the sync script,
 * so this page can never list a tool the server does not register.
 */


/*
 * The manifest's descriptions are plain strings, because MCP clients show
 * them as-is. On this page the identifiers in them read as code: tool names
 * (snake_case), field names (camelCase), and locale tags.
 */
const IDENTIFIER = /(\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b|\b[a-z]+(?:[A-Z][a-zA-Z0-9]*)+\b|\b[a-z]{2}-[A-Z]{2}\b)/g;

function Prose({ text }: { text: string }): React.JSX.Element {
  const parts = text.split(IDENTIFIER);
  return <>{parts.map((part, i) => (i % 2 === 1 ? <code key={i}>{part}</code> : part))}</>;
}

type Action = {
  name: string;
  title: string;
  description: string;
  steps: string[];
  inputSchema: { properties?: Record<string, JsonSchema>; required?: string[] };
};

type JsonSchema = {
  type?: string | string[];
  description?: string;
  enum?: unknown[];
  const?: unknown;
  format?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  minItems?: number;
  maxItems?: number;
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  additionalProperties?: boolean | JsonSchema;
  propertyNames?: JsonSchema;
};

type Application = {
  id: string;
  title: string;
  summary: string;
  docs?: { guide?: string; walkthrough?: string };
  groups: { name: string; summary: string; actions: Action[] }[];
};

type Manifest = {
  server: { name: string; version: string; instructions: string };
  planes: Record<string, { title: string; summary: string }>;
  steps: StepData[];
  applications: Application[];
};

const data = manifest as Manifest;
/** One line describing a JSON Schema fragment, the way a reader scans an input table. */
function describeSchema(schema: JsonSchema, depth = 0): string {
  if (schema.const !== undefined) return `exactly ${JSON.stringify(schema.const)}`;
  if (schema.enum) return schema.enum.map((value) => JSON.stringify(value)).join(" | ");
  const union = schema.anyOf ?? schema.oneOf;
  if (union) return union.map((option) => describeSchema(option, depth + 1)).join(" or ");
  const type = Array.isArray(schema.type) ? schema.type.join(" | ") : schema.type;
  if (type === "array") {
    const items = schema.items ? describeSchema(schema.items, depth + 1) : "any";
    const bounds = [schema.minItems !== undefined ? `min ${schema.minItems}` : "", schema.maxItems !== undefined ? `max ${schema.maxItems}` : ""].filter(Boolean).join(", ");
    return `array of ${items}${bounds ? ` (${bounds})` : ""}`;
  }
  if (type === "object" || schema.properties) {
    if (schema.properties && depth < 2) {
      const fields = Object.entries(schema.properties).map(([name, field]) => `${name}${schema.required?.includes(name) ? "" : "?"}: ${describeSchema(field, depth + 1)}`);
      return `{ ${fields.join("; ")} }`;
    }
    if (schema.propertyNames || schema.additionalProperties) return "object keyed by string";
    return "object";
  }
  if (type === "string") {
    const bounds = [schema.minLength ? `min ${schema.minLength}` : "", schema.maxLength ? `max ${schema.maxLength}` : "", schema.format ?? ""].filter(Boolean).join(", ");
    return `string${bounds ? ` (${bounds})` : ""}`;
  }
  if (type === "integer" || type === "number") {
    // zod emits the safe-integer range for every integer; that is not a domain bound.
    const bounds = [
      schema.minimum !== undefined && schema.minimum !== Number.MIN_SAFE_INTEGER ? `min ${schema.minimum}` : "",
      schema.exclusiveMinimum !== undefined ? `greater than ${schema.exclusiveMinimum}` : "",
      schema.maximum !== undefined && schema.maximum !== Number.MAX_SAFE_INTEGER ? `max ${schema.maximum}` : "",
    ]
      .filter(Boolean)
      .join(", ");
    return `${type}${bounds ? ` (${bounds})` : ""}`;
  }
  return type ?? "any";
}

function Inputs({ action }: { action: Action }): React.JSX.Element {
  const properties = Object.entries(action.inputSchema.properties ?? {});
  if (properties.length === 0) return <p className={s.noInput}>No input.</p>;
  const required = new Set(action.inputSchema.required ?? []);
  return (
    <table className={s.inputs}>
      <thead>
        <tr>
          <th>Field</th>
          <th>Type</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>
        {properties.map(([name, schema]) => (
          <tr key={name}>
            <td>
              <code>{name}</code>
              {required.has(name) ? "" : <span className={s.optional}> optional</span>}
            </td>
            <td className={s.type}>{describeSchema(schema)}</td>
            <td>{schema.description ? <Prose text={schema.description} /> : ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Tool({ action, applicationId }: { action: Action; applicationId: string }): React.JSX.Element {
  const id = `${applicationId}-${action.name}`;
  return (
    <details className={s.tool} id={id}>
      <summary className={s.toolSummary}>
        <span className={s.toolHead}>
          <code className={s.toolName}>{action.name}</code>
          <span className={s.toolTitle}>{action.title}</span>
        </span>
        <Steps ids={action.steps} />
      </summary>
      <div className={s.toolBody}>
        <p>
          <Prose text={action.description} />
        </p>
        <Inputs action={action} />
        <p className={s.permalink}>
          <a href={`#${id}`}>Link to this tool</a>
        </p>
      </div>
    </details>
  );
}

/** What the labels on the tools mean: the same list of steps and decisions the GAP for… page shows, from the same table. */
export function StepLegend(): React.JSX.Element {
  return (
    <div className={s.legend}>
      <p>
        Beside each tool is a label for every lifecycle step it performs and every release decision it records, linking to that step in the specification. A tool with no
        label reads, previews, edits a working copy, or checks.
      </p>
      <StepList kind="lifecycle" />
      <p>Release decisions are records an authority adds beside the steps, not steps of their own, so their labels carry a diamond.</p>
      <StepList kind="decision" />
    </div>
  );
}

/** The tools of one application, by group. The page supplies the application heading so the site can link to it. */
export default function ToolReference({ application: id }: { application: string }): React.JSX.Element {
  const application = data.applications.find((candidate) => candidate.id === id);
  if (!application) throw new Error(`ToolReference: the demo manifest has no application ${JSON.stringify(id)}`);
  return (
    <section className={s.application}>
      <p className={s.appSummary}>
        <Prose text={application.summary} />
      </p>
      {application.docs?.guide || application.docs?.walkthrough ? (
        <p className={s.appLinks}>
          {application.docs.guide ? <Link to={application.docs.guide}>Domain guide</Link> : null}
          {application.docs.guide && application.docs.walkthrough ? " · " : null}
          {application.docs.walkthrough ? <Link to={application.docs.walkthrough}>Walkthrough</Link> : null}
        </p>
      ) : null}
      {application.groups.map((group) => (
        <div key={group.name} className={s.group}>
          <h3 id={`${application.id}-${group.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>{group.name}</h3>
          <p className={s.groupSummary}>
            <Prose text={group.summary} />
          </p>
          <div className={s.tools}>
            {group.actions.map((action) => (
              <Tool key={action.name} action={action} applicationId={application.id} />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
