---
title: Why GAP?
slug: /intro/why-gap
sidebar_label: Why GAP?
description: What gets lost when content moves between tools, people, and AI agents, and what GAP keeps with it.
---

Content can arrive with version history, provenance, or review records. It can also arrive as text alone, leaving the receiver without the context needed to judge it. Decisions such as which rules apply, which sources were used, or which version is ready for release may remain in another tool, a review thread, or someone’s memory.

Whoever receives it may then be unable to answer questions like these:

- Was this exact version authorized to go out? It could be a draft someone saved, a copy edited after it was authorized, or a version that was later withdrawn.
- Why does it say this? The text alone doesn't show what it was based on or why it changed.

GAP defines the records an application must keep and deliver with a release. Think of them as a context packet: the content stays connected to its rules, declared source references, and release decisions. The formal record is a [release proof](anatomy-of-gap.mdx#the-release-proof), which the receiving application checks.

## What it looks like in practice

An AI agent receives a fictional paper on whether floating gummy worms remember stories better. Its background cites an earlier study: floating gummy worms finish a story in 40 seconds. Another version of the paper says 45 seconds.

The text alone cannot tell the receiver whether the source study changed, the paper copied a number incorrectly, or somebody edited the released text. A bibliography link to the latest study would not establish which version the author actually used.

With GAP, each manuscript version pins its exact source baseline. The earlier drafts name study version 1, which contains the invented 40-second figure. During review, the study is corrected to 45 seconds. The final manuscript pins corrected study version 2, receives its own editor approval, and is published once with authorization over that exact content. The receiver can distinguish the authorized publication from earlier drafts.

A reference identifies the exact source version without including its content or granting access to it. The [research publishing guide](../domains/research.mdx) follows this workflow on entirely fictional data.

## What the usual tools show

Version history, review threads, and links already answer some of these questions, as long as everything stays in one tool:

| What the receiver has | What it shows | What's missing |
| --- | --- | --- |
| A copy of the text | What it says | Whether this exact version was authorized |
| A text comparison | 40 became 45 | Did the source change, or was the paper wrong? |
| A link to the source | What the source says today | What it said when the paper was written |
| A review thread | What reviewers said | Which exact version they approved |
| A release history | Which versions went out | Which exact version was authorized and what it was based on |

Some applications already connect these records. GAP defines a common record format and verification rules so another application can check the release evidence it receives.

## Why AI agents raise the stakes

An AI agent’s context depends on its client, session, and available tools. It may receive a file or answer without the review history available to its author. With only the text, it can repeat old advice, undo a deliberate change, or pass along a draft nobody authorized.

With GAP, an agent can check before it acts. Is this version authorized? Has it been withdrawn? What was it based on? And a team can let an agent write as much as it likes while keeping release in the hands of whoever it chooses.

Next, [Anatomy of GAP](anatomy-of-gap.mdx) describes the parts of GAP and what each one tells the receiver. To test whether GAP helps your own work, use the [evaluation guide](../domains/evaluation-guide.md).
