# GAP demo

One local Model Context Protocol (MCP) server that hosts every GAP demo application: a blog CMS, an issue tracker, and a research journal. Each application declares its actions, the GAP lifecycle steps they perform, and the release decisions they record; the server exposes them as tools.

The documentation site is where the demo is explained: [Run the demo](../documentation/docs/domains/run-the-demos.md) for setup, [Domains](../documentation/docs/domains/index.mdx) for each domain's explainer and walkthrough, and [How the demo is built](ARCHITECTURE.md) for the application layer and how to add a domain.

```sh
pnpm install          # from the repository root
pnpm --dir demo mcp   # starts http://localhost:42424/mcp
```

| Path | What it holds |
| --- | --- |
| `src/gap/` | The application layer: lifecycle steps as data, `defineAction` and `defineApplication`, MCP registration, the manifest, workspace paths. |
| `src/domains/<id>/` | One domain each. Independent lifecycle, authority, storage, and verification code; `application.ts` declares its actions. |
| `src/server.ts` | The server. Registers every application, adds `describe_demo` and `reset_demo_workspace`, serves loopback HTTP. |
| `src/manifest.ts` | Prints the tool manifest as JSON; the documentation site renders it. |
| `seed/<id>/` | Checked-in synthetic seed data; copied to `.local-workspace/<id>/` on first start. |
| `test/` | `node --test` suites per domain, for the `gap/` layer, and for the server. |

> [!NOTE]
> Things to know
>
> - The demo runs on your computer for one user. It is not a production system.
> - You play the roles in the walkthrough by telling the agent who you are acting as. The agent uses the participant configured for that role, and the application checks that participant's permissions.
> - Choosing a role does not sign you in or verify your identity. The demo's permission checks and audience labels do not protect access to the local files.
> - The examples use made-up data. Use fictional content when you try your own examples.
