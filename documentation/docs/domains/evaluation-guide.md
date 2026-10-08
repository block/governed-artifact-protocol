---
title: Evaluation guide
slug: /domains/evaluation-guide
sidebar_label: Evaluation guide
description: "Consider how GAP fits your workflow, what it adds to your existing tools, and the work needed to implement and maintain it."
---

Governed Artifact Protocol (GAP) keeps content connected to the rules it follows, the sources it used, and the decisions made about it, so whoever receives it can check how it came to be. Evaluating it means considering what those records would add to your existing tools and what they would cost to produce and maintain. If your tools already preserve and verify the same information with less work, GAP may add little.

Start with one kind of content and one handoff. The [domain guides](./index.mdx) show three ways to map a workflow; any of them is a starting point, and none is required.

## Map your workflow

Write down the content, rules, participants, and actions you already have before choosing GAP records. The [anatomy of GAP](../intro/anatomy-of-gap.mdx) explains the records; the [working draft](../specification/draft/README.md) defines their exact requirements.

| Part of your workflow | Question to answer | Possible GAP mapping |
| --- | --- | --- |
| Content | What exact unit will another person or system receive? What changes should create another version of it? | An artifact with a stable identity and immutable versions. For example, one support answer or one notice, rather than an entire conversation. |
| Rules | Which fields, types, and limits can the implementation actually validate? Who approves changes to those rules? | A profile and its ratified revisions. Each content version references the exact profile revision used to create it. Editorial judgment and review policy remain application concerns. |
| Sources | Which governed content did the author actually use? Can the receiver identify and obtain each source's proof? | Exact dependency references when needed. Referencing a released source neither verifies that source nor authorizes a new answer based on it. |
| Roles | Who may propose, draft, ratify, approve, authorize, withdraw, and consume? | Application permissions mapped to Author, Authority, and Consumer. A person or an AI agent may hold more than one role; drafting alone grants no authority. |
| Actions | When does your application create a version? When does that version become available to consumers? | Actions mapped to lifecycle steps and optional release decisions. A save can combine creation, authorization, and release; a working-copy edit performs none. |
| Consumer boundary | Where must drafts stop? What will the receiving system check, and which authorities will it trust? | A release boundary and a verifier. Authentication, source access, current-release selection, and downstream-use permission need explicit application policies. |

For a software customer-support answer, for example, the support owner could approve the answer's required fields; a specialist or an AI agent could draft it under that profile; a configured reviewer could authorize its release; and the reply tool could verify the released answer before presenting it. Decide separately whether that tool may send a reply and who checks accuracy and fit. A verified answer is not proof of a sent reply.

As you work through this mapping, consider what your application already provides, what you would need to build, and which decisions are still open. Questions such as who may read content or authorize its release will shape how you try GAP in your application.

## Estimate implementation cost

Estimate both the work of producing GAP records and the checks your application must perform before accepting or releasing content. The local demos are evaluation code: they create and verify records within one application, but do not yet exchange them between independently built systems. A production implementation needs the work below, and adopting the draft includes following its changes.

| Work to estimate | Questions for your implementation |
| --- | --- |
| Content modeling and integration | Can your tools preserve stable identities, immutable versions, references to exact profile revisions and the source versions actually used? Where must existing save or review actions change? |
| Validation and release | Who implements the profile's validation rules, verifies digests and decisions, and ensures authorization and release succeed or fail together? How will you test that consumers cannot retrieve drafts or incomplete releases? |
| Storage and retrieval | How will you preserve earlier records and proofs, resolve one exact version unambiguously, and handle concurrent updates, backups, and failures? |
| Authority and trust | How are participants authenticated and their permissions configured? If using signatures, who manages signing keys and the consumer's trusted keys and actions? |
| Consumer integration | Which receiving tools can verify records and retrieve dependencies? Do the tools interpret profile rules and identifiers consistently, and can they access the referenced sources? |
| Review experience | Can a reviewer see the exact content version and profile revision they are being asked to approve? How will missing evidence, changed sources, withdrawn releases, and rejected requests be explained and resolved? |

Estimate effort for the smallest useful handoff and compare it with improving your existing metadata or API. Do not assume the demo's local actor names, JSON storage, or seeded keys are adequate controls for another environment. You also need to decide how systems exchange records, authenticate participants, manage keys, and discover the current release. The draft leaves those choices to implementations.

## Plan for ongoing maintenance

Beyond the initial implementation, the application and its records will need ongoing maintenance:

| Area | Ongoing work |
| --- | --- |
| Content and profile changes | Maintain the fields and validation rules, decide when older content needs review, and preserve each version's reference to its original profile revision. |
| Authority and trust | Maintain permissions, trusted keys and actions, and procedures for personnel changes or compromised keys. GAP does not standardize key discovery, rotation, or revocation. |
| Source maintenance | Keep proofs retrievable where access permits, run any drift checks, and resolve missing sources. A new source version does not automatically rewrite or withdraw dependent content. |
| Release policy | Decide what counts as current, when to withdraw an exact release, and how corrections reach consumers without overwriting earlier records. |
| Privacy and access | Review what references and digests disclose, restrict access where needed, and keep content from traveling further than intended. |
| Exceptions and evaluation | Decide how urgent work proceeds when evidence is missing, without describing unverified content as verified. Track support work, refusals of valid content, and unsupported claims alongside any reduction in lookups. |

[Read the specification](../specification/draft/README.md) for the exact rules. [Report a problem](https://github.com/block/governed-artifact-protocol/blob/main/CONTRIBUTING.md#file-an-issue) if a step or rule is unclear.
