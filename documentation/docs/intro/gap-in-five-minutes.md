---
title: GAP in five minutes
slug: /intro/gap-in-five-minutes
description: The whole protocol as one sentence, four rules, and one move made twice.
---

GAP is a receipt for content. It shows that **this exact content**, written under **this exact approved template**, was released by **someone allowed to release it**, and it lets whoever receives the content check the receipt.

The rest of this page builds that sentence up in layers. Each layer is complete on its own, so you can stop at any of them.

## The problem

People and AI agents produce content quickly, and it moves between tools. Somewhere along the way the answers to three questions get left behind: what was approved, who approved it, and whether this is still the same text. GAP keeps those answers with the content.

## Five words

You need only five words to follow GAP:

| Word | What it is |
| --- | --- |
| [Profile](../specification/draft/README.md#profile) | The template for one kind of content: its fields, their types, and their limits. |
| [Version](../specification/draft/README.md#artifact-version) | One saved, frozen copy of a piece of content, written under one exact profile revision. |
| Authority | A person or an AI agent allowed to make a decision, such as approving a profile or releasing a version. |
| [Release](../specification/draft/README.md#release) | The decision that lets one exact version out to the people and AI agents who use it. |
| [Proof](../specification/draft/README.md#release-proof) | What travels with released content so a receiver can check it. |

## Four rules

1. **Nothing is edited.** Every change creates a new, numbered record. Earlier records stay exactly as they were.
2. **Every decision names exactly what it covers.** A decision points at its subject by a fingerprint, called a [digest](../specification/draft/README.md#digests). Approving version 3 says nothing about version 4.
3. **Only an authority can decide.** Writing content does not give you permission to release it. An application can give one participant both permissions or keep them apart.
4. **The receiver can check the proof.** Its software recomputes the fingerprints to confirm that the content, its template, and the decisions belong together and that nothing was altered. When decisions are [signed](../specification/draft/README.md#authority-signature), the receiver can check them against keys it already trusts, without asking the system that sent them.

Most of the [specification](../specification/draft/README.md) explains how to follow these four rules faithfully.

## One move, made twice

GAP has one move: **someone proposes an exact thing, and an authority approves that exact thing.** It happens once for the template and once for the content.

| | Propose | Approve |
| --- | --- | --- |
| **The template** | An author proposes a profile revision. | An authority ratifies that revision. |
| **The content** | An author saves a version under a ratified profile. | An authority authorizes that exact version for release. |

The application then releases the authorized version, and the receiver checks its proof. Together those are the six [lifecycle](lifecycle.mdx) steps.

## What you add when you need it

Every release has a profile, a version, an authorization, and a proof. The other parts apply the same move to more situations, and an application uses them when its work calls for them:

- **[Approvals and rejections](../specification/draft/README.md#release-approval)** record reviewers' opinions of an exact version. Neither one releases anything.
- **[Withdrawal](../specification/draft/README.md#release-withdrawal)** records that an exact release should no longer be relied on.
- **[Dependencies](../specification/draft/README.md#dependency-set)** name the exact released versions of other content that a version used, by version and fingerprint. A profile decides whether it uses them.
- **[Signatures](../specification/draft/README.md#authority-signature)** let a receiver check a decision without access to the system that recorded it.

## Records are added, never changed

A version never becomes released, and a release never becomes withdrawn. Each decision adds a new record that points at an earlier one:

- Saving creates a version.
- Releasing adds an authorization and a release that point at that version.
- Withdrawing adds a withdrawal that points at that release.

The version, its release, and its withdrawal all stay on record. To learn where a version stands, read the records that point at it.

## If you know software releases

Much of GAP has a counterpart in how code is released. These are comparisons, not equivalences; [Related work](related-work.md) covers where the systems differ.

| GAP | Software release |
| --- | --- |
| Profile revision | A schema version |
| Version | A commit |
| Release authorization | A maintainer's signed tag |
| Release proof | A published package with its provenance |
| Dependency set | A lockfile |
| Withdrawal | Yanking a package: it stays published, with a notice added |

## What a valid proof tells you

A valid proof tells you that an authority released this exact content under this exact template. It does not tell you that the content is accurate, that every source was declared, or what happened to the content after release.

## Go deeper

- [What is GAP?](what-is-gap.md) and [Anatomy of GAP](anatomy-of-gap.mdx) describe each part.
- [Lifecycle](lifecycle.mdx) walks through the six steps.
- The [domain guides](../domains/index.mdx) show a blog, an issue tracker, and a research journal using GAP on made-up data.
- The [working draft](../specification/draft/README.md) holds every rule.
