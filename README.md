# Governed Artifact Protocol

[![Specification status: draft, no published version yet](https://img.shields.io/badge/specification-draft-orange)][draft] [![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue)](LICENSE)

Content moves between tools, people, and AI agents. The answers to "what was this based on?" and "who signed off on it?" usually stay behind, in a review thread, an agent session, or someone's memory. When an AI agent receives content through a file, a copied answer, or another tool, its available context may differ from the context in which that content was created.

**Governed Artifact Protocol (GAP)** defines how applications keep content connected to its rules, source references, and release decisions. Those records travel with each released version as a release proof. A person or an AI agent receiving it can check which version was released, who authorized it, and which sources it names, without recreating the original workflow. Checking a source's own content requires retrieving it under the receiver's own access and trust rules.

GAP is for people building and operating applications where a person or an AI agent creates, authorizes, or consumes structured content. Each application chooses its interface, storage, permissions, and review policy.

**GAP is a working draft, with no published specification version yet.** The demos test it on synthetic data.

**Quick links:** [Documentation][docs] · [Working draft][draft] · [Run the demos][run-demos]

## Start here

The guides below offer a reading path from the ideas to the records and working applications. They live on the [documentation site][docs], with diagrams and interactive record viewers; their sources are under [`documentation/docs/`](documentation/docs/).

| To… | Start with… |
| --- | --- |
| Understand the idea | [What is GAP?][what-is-gap] and [Why GAP?][why-gap] |
| Understand the records | [Anatomy of GAP][anatomy] |
| Follow the steps and map them to your tools | [Lifecycle][lifecycle] and [Application actions][actions] |
| Explore possible uses | [Case studies][case-studies] and [Domain guides][domains] |
| Consider GAP for your own work | [Evaluation guide][evaluation] |
| Implement or check the rules | [Working draft][draft] and [Requirements and coverage][conformance] |

## How GAP works

An **artifact** is structured content, such as a blog post, a ticket, or a summary. A **profile** defines its fields, types, and limits. Every saved artifact version is immutable and pins the exact ratified profile revision it follows. When it names governed sources, its dependency set identifies the exact released versions used.

The [protocol's lifecycle][draft-lifecycle] has six steps:

1. **Propose a profile:** an Author defines the rules for a kind of content.
2. **Ratify the revision:** an Authority approves that exact set of rules for use.
3. **Create a version:** an Author saves immutable content checked against those rules.
4. **Authorize the version:** an Authority permits release of that exact content and profile pin.
5. **Release:** the implementation makes the version available across the consumer boundary, atomically with its authorization.
6. **Read and verify:** a Consumer checks the release proof against configured trust.

A person or an AI agent can hold any of these [roles][draft-roles], and one participant can hold several. Applications map familiar actions such as Save and Publish onto one or more steps, keeping every step's required checks. A preview or working-copy edit performs none.

A **release proof** connects the released payload, profile revision and ratification, and release authorization. Separate approval and rejection decisions can record review before release; neither releases content. A withdrawal adds a decision about an exact released version while preserving its existing records. Later edits need their own authorization, and changed sources do not automatically rewrite or withdraw dependent content.

Consumers recompute digests and check that the records belong together. With signed decisions and their own trust store, they can also independently verify which trusted authorities made those decisions. Referenced sources have their own proofs and access rules. Verification establishes what was authorized and released; content accuracy, downstream delivery, and permission to use the content still need application checks.

GAP is transport-independent. Applications choose how to exchange records, select current releases, and manage access and signing keys. The draft's [scope and boundaries][draft-scope] describe these choices.

## Explore applications

The [case studies][case-studies] explore two fictional handoffs: a help desk checking an answer before using it in a customer reply, and a product team checking that an in-app notice matches the version authorized for release. They illustrate possible uses and remaining judgment calls, without requiring a demo. They describe no real deployment or measured results.

Three independently written demo applications exercise the draft in different domains. Comparing their interpretations exposes unclear rules and gaps in coverage. Each guide links to a walkthrough; on the documentation site, it also renders the maintained example records:

| Domain | What it demonstrates |
| --- | --- |
| [Blog website][blog-website] | Save, review, and publish are separate actions. A multilingual post keeps approval and rejection decisions and their reasons with its release. |
| [Issue tracking][issue-tracking] | One Save can create, authorize, and release a ticket version when the actor holds the required permissions. Working-copy edits stay separate. |
| [Research publishing][research] | A fictional paper on gummy worms telling stories in zero gravity pins its cited papers, peer review, and editor notes. Revisions and a source correction precede signed editorial approval and one final publication. |

All three run in one local, single-user Model Context Protocol (MCP) server on synthetic data, using JSON workspaces. Each walkthrough is a conversation with an AI agent connected to that server. GAP itself is transport-agnostic; MCP is the demos' chosen interface. No database, cloud account, or internal service is required. The demos are evaluation code with partial requirement coverage; they do not provide production security boundaries or demonstrate exchange between independently built systems.

[Run the demos][run-demos] explains setup. [How the demos work][demo-tools] lists the application tools and the steps and decisions each performs. For implementation details, see [`demo/README.md`](demo/README.md) and [the demo architecture](demo/ARCHITECTURE.md). The [evaluation guide][evaluation] helps map your own workflow and estimate implementation and maintenance work.

## Specification and reference

The [working draft][draft] is the source of truth. Schemas, examples, guides, and demos support it and add no protocol requirements. The documentation site renders these pages from their sources under [`specification/`](specification/).

| Resource | What it contains |
| --- | --- |
| [Specification overview][specification] | Draft status and supporting material |
| [Concepts][draft-concepts] | Definitions, record formats, and their rules |
| [Record schemas][schemas] | JSON definitions for checking record fields and types |
| [Example records][examples] | Maintained fictional records from all three domains |
| [Requirements and coverage][conformance] | Core requirements, executable evidence, and coverage limits |
| [Open questions](DEFERRED.md) | Deferred design questions and when to revisit them |

Project posts are on the [blog][blog]. To run or work on the site locally, see [`documentation/README.md`](documentation/README.md).

## Project resources

| Resource                                                       | Description                                              |
| -------------------------------------------------------------- | -------------------------------------------------------- |
| [CODEOWNERS](CODEOWNERS)                                       | Project lead(s) and default reviewers                    |
| [CONTRIBUTING.md](CONTRIBUTING.md)                             | How to set up, check, and propose changes                |
| [GOVERNANCE.md](GOVERNANCE.md)                                 | Project governance                                       |
| [LICENSE](LICENSE)                                             | Apache License, Version 2.0                              |
| [Report a specification problem](.github/ISSUE_TEMPLATE/spec-problem.md) | A gap or ambiguity an implementation hit in the draft |
| [Report a bug](.github/ISSUE_TEMPLATE/bug-report.md)           | A reproducible defect in the demo                        |

[docs]: https://block.github.io/governed-artifact-protocol/
[draft]: https://block.github.io/governed-artifact-protocol/specification/working-draft
[draft-concepts]: https://block.github.io/governed-artifact-protocol/specification/working-draft#concepts
[draft-lifecycle]: https://block.github.io/governed-artifact-protocol/specification/working-draft#lifecycle
[draft-roles]: https://block.github.io/governed-artifact-protocol/specification/working-draft#roles-and-authority
[draft-scope]: https://block.github.io/governed-artifact-protocol/specification/working-draft#scope-and-boundaries
[specification]: https://block.github.io/governed-artifact-protocol/specification
[schemas]: https://block.github.io/governed-artifact-protocol/specification/record-schemas
[examples]: https://block.github.io/governed-artifact-protocol/specification/example-records
[conformance]: https://block.github.io/governed-artifact-protocol/specification/requirements-and-coverage
[what-is-gap]: https://block.github.io/governed-artifact-protocol/intro/what-is-gap
[why-gap]: https://block.github.io/governed-artifact-protocol/intro/why-gap
[anatomy]: https://block.github.io/governed-artifact-protocol/intro/anatomy-of-gap
[lifecycle]: https://block.github.io/governed-artifact-protocol/intro/lifecycle
[actions]: https://block.github.io/governed-artifact-protocol/intro/application-actions
[case-studies]: https://block.github.io/governed-artifact-protocol/case-studies
[domains]: https://block.github.io/governed-artifact-protocol/domains
[evaluation]: https://block.github.io/governed-artifact-protocol/domains/evaluation-guide
[blog-website]: https://block.github.io/governed-artifact-protocol/domains/blog-website
[issue-tracking]: https://block.github.io/governed-artifact-protocol/domains/issue-tracking
[research]: https://block.github.io/governed-artifact-protocol/domains/research
[run-demos]: https://block.github.io/governed-artifact-protocol/domains/run-the-demos
[demo-tools]: https://block.github.io/governed-artifact-protocol/domains/how-the-demos-work
[blog]: https://block.github.io/governed-artifact-protocol/blog
