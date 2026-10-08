# Governed Artifact Protocol

[![Specification status: draft, no published version yet](https://img.shields.io/badge/specification-draft-orange)](specification/draft/README.md) [![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue)](LICENSE)

People and systems pass content to other people and systems without the exact version, the profile that defines it, the sources it used, or the decision that authorized its release. The recipient must reconstruct those facts from other tools and conversations or act without them.

**Governed Artifact Protocol (GAP)** defines records for released structured content. A release proof connects one content version to its profile revision, release authorization, and any declared source references. Consumers can verify which version was released and who authorized it without recreating the original workflow. They can verify a referenced source only when they can retrieve it under their own access and trust rules.

GAP is for people building and operating applications where a person or an AI agent creates, authorizes, or consumes structured content. Each application chooses its interface, storage, permissions, and review policy.

**GAP is a working draft, with no published specification version yet.** The demos test it on synthetic data.

**Quick links:** [Documentation][docs] · [Working draft](specification/draft/README.md) · [Run the demos][run-demos]

## Start here

The guides below offer a reading path from the ideas to the records and working applications. These links open their repository sources under [`documentation/docs/`](documentation/docs/). To read them with diagrams and interactive record viewers, [run the documentation site locally][docs].

| To… | Start with… |
| --- | --- |
| Understand the idea | [What is GAP?][what-is-gap] and [Why GAP?][why-gap] |
| Understand the records | [Anatomy of GAP][anatomy] |
| Follow the steps and map them to your tools | [Lifecycle][lifecycle] and [Application actions][actions] |
| Explore possible uses | [Case studies][case-studies] and [Domain guides][domains] |
| Consider GAP for your own work | [Evaluation guide][evaluation] |
| Implement or check the rules | [Working draft](specification/draft/README.md) and [Requirements and coverage](specification/draft/conformance/README.md) |

## How GAP works

An **artifact** is structured content, such as a blog post, a ticket, or a summary. A **profile** defines its fields, types, and limits. Every saved artifact version is immutable and pins the exact ratified profile revision it follows. When it names governed sources, its dependency set identifies the exact released versions used.

The [protocol's lifecycle](specification/draft/README.md#lifecycle) has six steps:

1. **Propose a profile:** an Author defines the rules for a kind of content.
2. **Ratify the revision:** an Authority approves that exact set of rules for use.
3. **Create a version:** an Author saves immutable content checked against those rules.
4. **Authorize the version:** an Authority permits release of that exact content and profile pin.
5. **Release:** the implementation makes the version available across the consumer boundary, atomically with its authorization.
6. **Read and verify:** a Consumer checks the release proof against configured trust.

A person or an AI agent can hold any of these [roles](specification/draft/README.md#roles-and-authority), and one participant can hold several. Applications map familiar actions such as Save and Publish onto one or more steps, keeping every step's required checks. A preview or working-copy edit performs none.

A **release proof** connects the released payload, profile revision and ratification, and release authorization. Separate approval and rejection decisions can record review before release; neither releases content. A withdrawal adds a decision about an exact released version while preserving its existing records. Later edits need their own authorization, and changed sources do not automatically rewrite or withdraw dependent content.

Consumers recompute digests and check that the records belong together. With signed decisions and their own trust store, they can also independently verify which trusted authorities made those decisions. Referenced sources have their own proofs and access rules. Verification establishes what was authorized and released; content accuracy, downstream delivery, and permission to use the content still need application checks.

GAP is transport-independent. Applications choose how to exchange records, select current releases, and manage access and signing keys. The draft's [scope and boundaries](specification/draft/README.md#scope-and-boundaries) describe these choices.

## Explore applications

The [case studies][case-studies] explore two fictional handoffs: a help desk checking an answer before using it in a customer reply, and a product team checking that an in-app notice matches the version authorized for release. They illustrate possible uses and remaining judgment calls, without requiring a demo. They describe no real deployment or measured results.

Three independently written demo applications exercise the draft in different domains. Comparing their interpretations exposes unclear rules and gaps in coverage. Each guide links to a walkthrough; on the documentation site, it also renders the maintained example records:

| Domain | What it demonstrates |
| --- | --- |
| [Blog website][blog-website] | Save, review, and publish are separate actions. A multilingual post keeps approval and rejection decisions and their reasons with its release. |
| [Issue tracking][issue-tracking] | One Save can create, authorize, and release a ticket version when the actor holds the required permissions. Working-copy edits stay separate. |
| [Research publishing][research] | A fictional paper on gummy worms telling stories in zero gravity pins its cited papers, peer review, and editor notes. Revisions and a source correction precede signed editorial approval and one final publication. |

All three run in one local, single-user Model Context Protocol (MCP) server on synthetic data, using JSON workspaces. GAP itself is transport-agnostic; MCP is the demos' chosen interface. No database, cloud account, or internal service is required. The demos are evaluation code with partial requirement coverage; they do not provide production security boundaries or demonstrate exchange between independently built systems.

[Run the demos][run-demos] explains setup. [How the demos work][demo-tools] lists the application tools and the steps and decisions each performs. For implementation details, see [`demo/README.md`](demo/README.md) and [the demo architecture](demo/ARCHITECTURE.md). The [evaluation guide][evaluation] helps map your own workflow and estimate implementation and maintenance work.

## Specification and reference

The [working draft](specification/draft/README.md) is the source of truth. Schemas, examples, guides, and demos support it and add no protocol requirements.

| Resource | What it contains |
| --- | --- |
| [Specification overview](specification/README.md) | Draft status and supporting material |
| [Concepts](specification/draft/README.md#concepts) | Definitions, record formats, and their rules |
| [Record schemas](specification/draft/schemas/README.md) | JSON definitions for checking record fields and types |
| [Example records](specification/draft/examples/README.md) | Maintained fictional records from all three domains |
| [Requirements and coverage](specification/draft/conformance/README.md) | Core requirements, executable evidence, and coverage limits |
| [Open questions](DEFERRED.md) | Deferred design questions and when to revisit them |

Project posts live under [`documentation/blog/`][blog]. To run or work on the site locally, see [`documentation/README.md`](documentation/README.md).

## Project resources

| Resource                                                       | Description                                              |
| -------------------------------------------------------------- | -------------------------------------------------------- |
| [CODEOWNERS](CODEOWNERS)                                       | Project lead(s) and default reviewers                    |
| [CONTRIBUTING.md](CONTRIBUTING.md)                             | How to set up, check, and propose changes                |
| [GOVERNANCE.md](GOVERNANCE.md)                                 | Project governance                                       |
| [LICENSE](LICENSE)                                             | Apache License, Version 2.0                              |
| [Report a specification problem](.github/ISSUE_TEMPLATE/spec-problem.md) | A gap or ambiguity an implementation hit in the draft |
| [Report a bug](.github/ISSUE_TEMPLATE/bug-report.md)           | A reproducible defect in the demo                        |

[docs]: documentation/README.md
[what-is-gap]: documentation/docs/intro/what-is-gap.md
[why-gap]: documentation/docs/intro/why-gap.md
[anatomy]: documentation/docs/intro/anatomy-of-gap.mdx
[lifecycle]: documentation/docs/intro/lifecycle.mdx
[actions]: documentation/docs/intro/application-actions.mdx
[case-studies]: documentation/docs/case-studies/index.mdx
[domains]: documentation/docs/domains/index.mdx
[evaluation]: documentation/docs/domains/evaluation-guide.md
[blog-website]: documentation/docs/domains/blog-website.mdx
[issue-tracking]: documentation/docs/domains/issue-tracking.mdx
[research]: documentation/docs/domains/research.mdx
[run-demos]: documentation/docs/domains/run-the-demos.md
[demo-tools]: documentation/docs/domains/how-the-demos-work.mdx
[blog]: documentation/blog/
