# How the demo is built

The demo is a small TypeScript workspace in [`demo/`](https://github.com/block/governed-artifact-protocol/tree/main/demo) with three layers. The domains hold the lifecycle code. The MCP server hosts them. Between the two sits an application layer that describes every tool in GAP's terms, which lifecycle steps it performs and which release decisions it records, and the documentation is generated from those descriptions.

## Lifecycle steps as data

The six lifecycle steps and the three release decisions live in one file, [`demo/src/gap/lifecycle.ts`](https://github.com/block/governed-artifact-protocol/blob/main/demo/src/gap/lifecycle.ts). Each entry has a number, a title, the plane and role the specification gives it, a link to its section, and a one-sentence summary. Everything else in the demo reads from that file, and so do the step labels on this site, so a step is named the same way everywhere. The [tool reference](../documentation/docs/domains/how-the-demos-work.mdx#lifecycle-steps-and-release-decisions) lists them.

## Actions declare their steps

GAP defines the lifecycle steps. It does not say what an application should offer its users. Grouping steps into actions is the application's job ([application actions and lifecycle steps](../specification/draft/README.md#application-actions-and-lifecycle-steps)), and [`demo/src/gap/application.ts`](https://github.com/block/governed-artifact-protocol/blob/main/demo/src/gap/application.ts) is where the demo writes that grouping down.

An **action** is one thing a participant can do: a name, a title, a description, the group it belongs to, its input fields, the function that runs it, and the list of lifecycle steps it performs and release decisions it records. The list may be empty: reads, previews, working copies, and checks perform no step and record no decision. It may hold several: publishing a blog post authorizes and releases; creating a ticket creates a version, authorizes it, and releases it.

An **application** is a domain: an ID, a title, the groups a reader follows its actions in, the actions themselves, and how to initialize or reset its local workspace. Defining one validates the whole: every action names a declared group, every group has an action, every step is a real step, and no name repeats.

```ts
defineAction({
  name: 'publish_post',
  title: 'Publish a version',
  group: 'Blog post walkthrough',
  steps: ['authorize-release', 'release'],
  description: 'Publish the exact saved blog-post version …',
  input: { artifactId: z.string().min(1), artifactVersion: z.number().int().positive(), /* … */ },
  run: (input, { workspaceRoot }) => publishPost(input, workspaceRoot),
});
```

This layer describes and exposes. It performs no lifecycle step itself: the step logic, the authority checks, and the verifiers stay inside each domain's own modules, written independently of one another. That limit is deliberate.

> [!NOTE]
> **No SDK yet.** GAP does not ship an SDK for defining actions. This layer belongs to the demo, and an application today writes its own. If enough applications want a shared one, this is where it would start.

## One server, many applications

[`demo/src/gap/mcp.ts`](https://github.com/block/governed-artifact-protocol/blob/main/demo/src/gap/mcp.ts) turns an application into MCP tools, one per action. Each description ends with the application and the steps and decisions the action declares, and the same facts travel in the tool's `_meta`, so a client can group tools by domain without parsing prose.

[`demo/src/server.ts`](https://github.com/block/governed-artifact-protocol/blob/main/demo/src/server.ts) registers every application on one loopback HTTP server, refuses to start if two applications share a tool name, initializes every workspace, and adds the two server tools listed under [Demo server](../documentation/docs/domains/how-the-demos-work.mdx#demo) in the tool reference.

The same module builds a **manifest**: every application, group, and tool with its JSON input schema and steps. The documentation site runs [`demo/src/manifest.ts`](https://github.com/block/governed-artifact-protocol/blob/main/demo/src/manifest.ts) during its sync step and renders the result as the [tool reference](../documentation/docs/domains/how-the-demos-work.mdx). Generation keeps the reference aligned with the tool declarations. Tests still need to check that those declarations match behavior.

## The domains

Each domain lives in `demo/src/domains/<id>/` with its own lifecycle, authority, storage, and verification modules, a seed workspace in `demo/seed/<id>/`, and tests in `demo/test/<id>/`. Its `application.ts` is the one file that touches the layer above: it imports the domain's functions and declares them as actions. What each domain demonstrates is on its page in [Domains](../documentation/docs/domains/index.mdx). The "Older" groups in the tool reference keep earlier tools the walkthroughs no longer use; they still work and their records are separate.

## Add a domain

1. Create `demo/src/domains/<id>/` with the domain's own modules. Do not import lifecycle, authority, or verification logic from another domain. Each domain reads the specification on its own, and that is how the demo finds gaps in it.
2. Add a seed workspace under `demo/seed/<id>/workspace.json` and a `workspace.ts` that uses the shared path helpers in `demo/src/gap/workspace.ts`, so the workspace lands under `demo/.local-workspace/<id>/`.
3. Write `application.ts` with `defineApplication`: choose groups a reader can follow, declare each action with the steps it performs and the decisions it records, and point `docs.guide` and `docs.walkthrough` at the pages you will write.
4. Register the application in `demo/src/server.ts`. The server refuses duplicate tool names at startup, and the test suite checks that every lifecycle step and release decision is still demonstrated by some tool.
5. Write the pages from the [template](https://github.com/block/governed-artifact-protocol/blob/main/documentation/docs/domains/_template.mdx): an explainer at `documentation/docs/domains/<id>.mdx` and a walkthrough at `documentation/docs/domains/<id>/demo.mdx`. Add the domain to `documentation/sidebars.ts`, and add a heading with `<ToolReference application="<id>" />` under it to the tool reference page. The tools themselves are read from the manifest.

## Checks

From the repository root, with Node.js 22 or later:

```bash
pnpm typecheck:demo
```

```bash
pnpm test:demo
```

The tests cover each domain's lifecycle, the application layer's validation, the manifest, and the server end to end over HTTP. `pnpm check:specification` confirms that the conformance manifest's evidence still points at real test files, and `pnpm docs:build` fails on a broken link.
