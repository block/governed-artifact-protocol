# Contributing to the Governed Artifact Protocol

Thank you for your interest in GAP. This page covers how to set up, check, and propose changes. [AGENTS.md](AGENTS.md) covers the judgment calls that apply to anyone, human or agent, who changes the repository, and it applies to contributions too.

## Set up

You need Node.js 24 (see `.nvmrc`) and pnpm 10.33 or later. From the repository root:

```bash
pnpm install
```

## Check your change

Run the checks that cover what you touched before you open a pull request:

```bash
pnpm check:specification      # anything under specification/
pnpm typecheck:demo           # anything under demo/
pnpm test:demo
pnpm docs:build               # any page the documentation site renders
```

The docs build fails on broken links. See [documentation/README.md](documentation/README.md) for how the site is assembled.

The example records in `specification/draft/examples/` are generated from the demo applications by the scenarios in `demo/examples/`. If your change alters what an application records, run `pnpm examples:generate` and commit the rewritten files. `pnpm examples:check`, which `pnpm test:demo` also runs, fails while the examples and the applications differ.

## Propose a change

- **Specification changes** go through the [protocol](specification/draft/README.md). Keep the draft, schemas, examples, and conformance manifest consistent in the same pull request.
- **Demo changes.** The domains under `demo/src/domains/` stay independent: do not copy lifecycle, authority, policy, or verification logic between them. The shared layer in `demo/src/gap/` describes actions and the steps they perform; it does not perform steps. A new domain also gets a "GAP for …" page and a walkthrough under `documentation/docs/`; see [How the demo is built](demo/ARCHITECTURE.md).
- **Domain pages** ("GAP for …") and their walkthroughs are authored on the documentation site under `documentation/docs/domains/`, not as READMEs beside the code. Records on those pages come from `specification/draft/examples/` through the `Record` component.
- **Wire identity changes** (the `governed-artifact.*` digest domains) are contracts. Keep them in their own pull request, separate from documentation restructuring.

Open a pull request against `main`. Describe the problem before the fix, and say which checks you ran. A code owner listed in [CODEOWNERS](CODEOWNERS) reviews every change.

## File an issue

- Use the **Specification problem** template for a gap, ambiguity, or missing capability an implementation hit in the draft.
- Use the **Bug report** template for a reproducible defect in the demo.

For questions and discussion that are not issues, join the [Block open source Discord](https://discord.gg/block-opensource).

## Code of conduct and governance

This project follows the [Block Open Source Code of Conduct](https://github.com/block/.github/blob/main/CODE_OF_CONDUCT.md) and [Block Open Source Governance](GOVERNANCE.md). Contributions are licensed under the [Apache License, Version 2.0](LICENSE).
