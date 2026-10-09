# Working on GAP

Principles for anyone, a person or an AI agent, changing this repository. Commands, scripts, and file layouts live in the code; this page covers the judgment calls the code cannot make for you.

## The specification is the source of truth

- The [protocol](specification/draft/README.md) holds every normative rule. Schemas, examples, conformance evidence, and the demo applications restate or exercise it; when they disagree with the protocol, the protocol is right and the other artifact has a bug.
- Examples and implementations show how a domain uses GAP. They never add requirements.
- GAP is transport-independent. Do not let one interface, storage choice, or implementation habit harden into protocol behavior.
- Do not invent protocol behavior to get unblocked. If the draft does not answer a question, make a local choice, label it as local in the code and docs, and open an issue describing the gap. Protocol changes go through the draft, not through an implementation.

## The demo's domains are independent; its application layer is shared

- Each domain under `demo/src/domains/` is a separate reading of the specification. Do not share or copy lifecycle, authority, policy, or verification logic between them; independent interpretation is how they find gaps in the draft.
- The layer in `demo/src/gap/` is the one thing they share. It names the lifecycle steps, lets an application declare which steps each action performs, and exposes actions as tools. It describes and validates; it never performs a step, checks authority, or verifies a record. Keep it that way until the draft is stable enough for an SDK to carry records.
- Every action declares its lifecycle steps and release decisions honestly, and never calls a decision a step. A read, a preview, a working copy, or a check declares none; an action that authorizes and releases says both. The tool reference on the site is generated from these declarations.
- The demo is a local, single-user demonstration on synthetic data. Say so where a reader could mistake it for something else, and keep it free of databases, cloud accounts, and internal services.
- Immutable records stay immutable. Never mutate a stored GAP record in place, and never overwrite a user's local state on ordinary startup.

## Wire identity is a contract

- The `governed-artifact.*` digest domains are the protocol's identity on the wire. Changing one changes what every record means. Do it deliberately, update every implementation and checked-in record in the same change, and reject records under the old domain rather than adding aliases.
- Keep wire-identity changes and documentation restructuring in separate pull requests.

## Write for people and AI agents

- Plain English. Say what a thing is and what to do with it before saying what it is not.
- Say "a person or an AI agent" when the distinction matters. Roles such as Author and Authority can be held by either; do not contrast a role with an AI agent.
- Name concepts the way the draft does. **Release** is the transition across the consumer boundary; **ticket** is a unit of work in issue tracking; **GAP** is the protocol.
- Each page has one job. The "GAP for…" index navigates, a domain guide explains concepts and roles, the demo setup page gets the server running, and a walkthrough tells you what to say and what to expect.
- Domain guides and walkthroughs are authored on the documentation site under `documentation/docs/domains/`, from the template beside them: the explainer at `<domain>.mdx` and its walkthrough at `<domain>/demo.mdx`. Records on those pages are rendered from `specification/draft/examples/`, never pasted. Repository READMEs point there; they do not duplicate it.

## Diagrams follow the site's design language

The protocol's diagrams in `specification/draft/diagrams/` are plain SVG files, edited by hand. Start a new one by copying an existing file, keep its `<style>` block, and follow these rules:

- Canvas 760 wide, transparent; the docs column is that width, so text renders at true size. Give the root `class="gap-diagram"`, `role="img"`, a `<title>`, and a `<desc>` that says what the diagram shows.
- Colors are the `--gd-*` variables in the `<style>` block. They read the site's tokens (`--gap-ink`, `--gap-muted`, `--gap-line`, `--ifm-color-primary`, …) and fall back to the site's light palette, or its dark palette under `prefers-color-scheme: dark`. Never hard-code a color outside that block.
- Type: Bungee (`gd-disp`) for the title, the lane headings, and step numerals; Karla for everything else. Sizes: 15 title, 12 subtitle and lane headings, 11.5 body, 10.5 secondary lines, 9.5 uppercase tracked kickers. Lane headings are plain headings: Bungee in ink with a muted Karla line under them, no rule or bar of their own. Line height 15.5. Wrap text by hand; about 28 characters fit on a line in a 170px box at 11.5.
- Cards are plain: a `<rect>` with `rx="6"`, surface fill, hairline border (`gd-box`). Dashed (`gd-dash`) means optional. No bars, stripes, or icons on a card.
- Lanes are rule-only tables, like the site's tables: a 2px rule under the header, hairlines between rows, no fills.
- Color means one thing. Vermilion (`gd-ac`, `gd-ln-ac`) is reserved for the release boundary and whatever crosses it, and the alert tone (`gd-x`, `gd-al`) marks a rejection. Everything else is ink and gray: which plane or role a card belongs to is told by its column or lane and by its words, never by color or icons.
- Arrows are open chevrons via the file's `<marker>`; prefix marker and title ids with the diagram's name so several diagrams can share a page.
- No blank lines inside the file: the sync script pastes the markup into a CommonMark page, where a blank line ends the HTML block.

Check the result on the protocol page in both themes (`pnpm --dir documentation start`) and standalone on a dark background, where the fallbacks apply.

## Before you open a pull request

Commit as you go. Make a local commit after each content edit, with a message that says what changed and why, so a regression can be traced to one change and reverted on its own.

Run the tests and type checks for anything you touched (`pnpm test:demo`, `pnpm typecheck:demo`), and `pnpm check:specification` for anything under `specification/`. Keep the draft, schemas, examples, and conformance manifest consistent with each other in the same change. Regenerate the examples with `pnpm examples:generate` rather than editing them by hand. If you changed anything the documentation website renders (`DEFERRED.md`, `CONTRIBUTING.md`, `specification/`, pages under `documentation/docs/`, or a tool declaration in `demo/src/`), run `pnpm docs:build`; it fails on broken links. See [documentation/README.md](documentation/README.md).
