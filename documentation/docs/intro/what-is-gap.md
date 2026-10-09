---
title: What is GAP?
slug: /intro/what-is-gap
description: GAP keeps content connected to its rules, sources, and decisions, from the first draft to a checked release.
---

Governed Artifact Protocol (GAP) is a shared set of rules for how applications create, review, and release content. An application following GAP records the rules each version follows, any source references it declares, and the decisions made about its release. It delivers those records with released content so a person or an AI agent can check them.

## The artifact is the content

An [artifact](../specification/draft/README.md#artifact) is content that can be written down as structured data: a blog post, a ticket, a summary, or a set of records.

Each saved change creates a new [version](../specification/draft/README.md#artifact-version). Earlier versions never change, preserving an exact record of their content.

## Release requires authorization

A new version stays inside the application as a draft. A person or an AI agent with permission must authorize that exact version for [release](../specification/draft/README.md#release) before the application makes it available to consumers.

For example, an editor authorizes version 1 of a post. If the writer changes its headline and saves version 2, the application must obtain authorization for version 2 before releasing it. The earlier decision still covers version 1.

Writing and authorizing are separate permissions. An application can assign both to the same participant or keep them apart. It can also require a reviewer’s approval before authorization. [Application actions](application-actions.mdx) shows how these decisions fit actions such as Save, Approve, and Publish.

## The proof travels with the content

A [release proof](../specification/draft/README.md#release-proof) connects the released content to its records:

- The **profile** defines the content’s fields and constraints. Its **ratification** approves that exact revision of the rules.
- The **release authorization** permits release of that exact content version.
- **Approvals and rejections**, when included, record reviewers’ decisions about the version. Neither releases it.
- A **withdrawal**, if recorded by the release boundary, accompanies any proof that boundary continues to serve.
- A **dependency set**, when the profile calls for one, identifies exact released source versions. Each source has its own proof and access rules.

The receiving application checks that these records belong together and that the content matches what was authorized. Signed decisions can also be checked against keys the receiver trusts. These checks establish the recorded release evidence; they do not establish the content’s accuracy or a complete account of how it was created.

## Applications do the work

You use GAP through an application. The application maps its actions to GAP’s lifecycle steps, checks permissions, and records the results. One action can combine several steps: saving a ticket in the issue tracking demo creates a version, authorizes it, and releases it together. The blog demo separates saving from publishing.

[Application actions](application-actions.mdx) explains these mappings. The interface can be a web page, an API, or tools an AI agent calls.

## Applications choose the workflow

GAP specifies what each lifecycle step must check and record. Applications choose their content models, participant permissions, review requirements, storage, delivery, and actions. The [domain guides](../domains/index.mdx) show how a blog website, issue tracker, and research journal apply those rules to different workflows.

Next, [Why GAP?](why-gap.md) follows one piece of content through a change and shows what its records tell the next reader.
