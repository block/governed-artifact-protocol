---
title: "Run the demos"
slug: /domains/run-the-demos
sidebar_label: "Run the demos"
description: "Start the GAP demo: one local MCP server that hosts the blog website CMS, the issue tracking app, and the research journal, then follow a walkthrough with your agent client."
---

One local [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server hosts the three [domain applications](./index.mdx): the blog website CMS, the issue tracking app, and the research journal. Each application stores its data in its own JSON workspace and makes its actions available as tools. MCP lets an AI agent call those tools; GAP also works with other interfaces.

You run the server on your computer, connect an AI agent through its client, and follow a walkthrough in plain conversation. Everything runs in one process written by one team, so the demo shows the lifecycle and its records within one system. Checking records between separately built systems is still to come. [How the demos work](./how-the-demos-work.mdx) explains the interface and returned records.

:::note[Things to know]

- The demo runs on your computer for one user. It is not a production system.
- You play the roles in the walkthrough by telling the agent who you are acting as. The agent uses the participant configured for that role, and the application checks that participant's permissions.
- Choosing a role does not sign you in or verify your identity. The demo's permission checks and audience labels do not protect access to the local files.
- The examples use made-up data. Use fictional content when you try your own examples.

:::

## What you need

- Node.js 22 or later and pnpm 10.33 or later.
- A client that supports MCP over Streamable HTTP, connected to an AI agent you can talk to.
- About ten minutes for the first walkthrough.

## Start the server

From a clone of the repository:

```bash
pnpm install
```

```bash
pnpm --dir demo mcp
```

Keep the terminal open. The server prints its endpoint, normally `http://localhost:42424/mcp`, a health check at `/healthz`, and the applications it hosts with their tool counts. On first start it creates a workspace for each application under `demo/.local-workspace/<application>/workspace.json` from checked-in seed data. Later starts preserve whatever you did.

The server accepts local connections only, over unencrypted HTTP, and rejects requests whose Host header is not a loopback name. Three environment variables change where it listens and writes:

- `GAP_MCP_PORT` is the TCP port, `42424` by default.
- `GAP_MCP_HOST` is the interface, `localhost` by default. Only `localhost`, `127.0.0.1`, and `::1` are accepted.
- `GAP_WORKSPACE` is the directory that holds the workspaces, `demo/.local-workspace` by default. Point it somewhere new for an independent copy of the demo data.

## Connect a client

Copy the printed MCP address into your client's connection settings and select Streamable HTTP. The client then lists every tool of every application. Each description ends with the application the tool belongs to and the lifecycle steps and release decisions it declares, so the agent can tell the applications apart without you explaining. The [tool reference](./how-the-demos-work.mdx#tool-reference) is the same list, generated from the same code.

## Follow a walkthrough

Every domain page has a walkthrough: one conversation, with the messages to send in order and what to expect after each. They are independent, and your data stays between runs.

- [Blog website](./blog-website/demo.mdx): draft English and Spanish versions of a post for the US and Mexico, record a rejection and an approval, then publish and read it back with its proof. Try the language rules, including a request that uses the fallback language.
- [Issue tracking](./issue-tracking/demo.mdx): create a ticket that the team can read immediately, revise a working copy, save those edits as one version, and mark the ticket complete.
- [Research publishing](./research/demo.mdx): release fictional sources, revise a gummy-worm recall paper after peer feedback and a source correction, then publish once with separate signed editor and publisher decisions. Verify the publication and its source proofs.

After a walkthrough, use the [evaluation guide](./evaluation-guide.md) to consider how GAP fits your application and the work needed to implement and maintain it.

## Reset a workspace

Normal startup never resets data. Each walkthrough ends with the message that resets its own application; the agent calls `reset_demo_workspace` with the application's ID and an explicit confirmation, and `all` resets every application. To start clean while keeping your current data, point `GAP_WORKSPACE` at a new directory instead.

## Stop or troubleshoot

Press Ctrl+C in the server terminal to stop the demo. Restarting keeps your data.

| Problem | What to do |
| --- | --- |
| The port is already in use. | Stop the other process or set a different `GAP_MCP_PORT`. |
| No tools appear in the client. | Check that the server is still running, use the exact printed address, and select Streamable HTTP. |
| A request is refused with 403. | The client's Host header doesn't match the server's. Connect through `localhost` or `127.0.0.1` (or `[::1]` if you set `GAP_MCP_HOST=::1`), on the printed port. |
| A save is refused because of a lock. | The walkthroughs' save actions refuse overlapping writes with a lock directory beside the workspace file, such as `workspace.json.bug-lock`. A crash can leave one behind: stop the server and check the workspace before removing it. Run one server process at a time. |
| You want a clean run without losing your data. | Point `GAP_WORKSPACE` at a new directory instead of resetting. |
