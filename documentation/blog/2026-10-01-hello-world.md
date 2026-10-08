---
slug: hello-world
title: Hello World
description: How work on agent-assisted communications led us to the Governed Artifact Protocol, and where we hope the community will take it.
authors: [davidhamilton, aharvard]
---

Every organization is a machine for making decisions.

People propose, argue, approve, and release. Then, mostly, the “art of deciding” disappears into corners of the business that are hard to trace without human involvement. What survives is the artifact: the email, the policy, the post. The reasoning that produced it often evaporates into meetings, chat threads, and memory. We accept it because humans could, if pressed, reconstruct the story. Ask the author. Dig through the thread. Find the person who remembers why.

<!-- truncate -->

But that workflow doesn’t match agentic realities today. When software drafts, edits, and releases content, there is no author to ask. The chat history is long, machine-generated, and often not even retained. The one place context reliably lived, a human head, is no longer in the loop. And the organizations that move fastest with agents are too often the ones that lose this context fastest, because with fewer handoffs, there are fewer humans to reconstruct the increasing amount of stories inside an organization.

## Our hypothesis

One of the hardest problems agentic workflows present is authorization and traceability. Proper authorization enables teams to move quickly while still preserving intent or regulatory needs. Simple traceability allows everyone to inspect what was done, why, and how decisions were made. These are not new problems. Societies have spent millennia building institutions to record who decided what and on what authority. We just have to rebuild them for a world where the decider might be a model, and the record has to survive a handoff between systems.

That's the problem we kept running into at Block, and it started with something mundane: how do you find and understand the communications a large organization sends? We built agents that searched across codebases for email triggers, then connected those triggers to sending platforms and templates. What we found wasn't just emails. It was context, approvals, rules, decisions, scattered everywhere except with the message itself.

## From email to something bigger

We then asked: what would a CMS look like if you worked with it through conversation instead of an editing interface? An agent could find a template, propose a change, and move it through review. That part worked. The harder question was everything around the message. Which version was approved? What rules governed it? What happens to that context when the content moves to another system?

The more we looked, the more this stopped feeling like an email problem or a CMS problem. A blog post, a support response, a policy summary, a ticket: all of these pass between people, agents, and applications. And every handoff is a chance to separate the content from the decisions that shaped it.

## Introducing GAP

So we're developing the [Governed Artifact Protocol (GAP)](/intro/what-is-gap) to keep those connections with the content.

GAP is a set of records that travel with what you release: an exact content version, the rules that govern its shape, and the decision that authorizes its release. A receiving system can use those records to check what was released and who authorized it, according to its own trust configuration.

The future we see is context designed into the workflow. This enables recording as decisions happen, and makes content available when it moves between systems. You should be able to ask "Which version am I looking at? What was it based on? Who authorized its release?" and get the answer from the record, not from reconstructing a chat history or someone's memory.

## Humans and agents, together

We're particularly interested in how humans and agents split the work. An agent might draft many versions or prepare a review. A human might approve the release. In another workflow, an agent might be the configured authority. The application decides who holds each role and when a human decision is required. GAP gives those decisions an exact subject and a record that travels with the released content. The handoff becomes explicit and checkable, while each team stays in control of its own policy.

## Where this stands

The [current specification](/specification/working-draft) is a draft. It defines the release boundary and the records around it. It does not prescribe an interface, a transport, or how content is delivered after release. Our [local demos](/domains) test the draft in different domains. They're a way to find gaps in the model, not evidence that it works across organizations and platforms.

## Help us test the idea

We're looking for internal and external projects willing to try this structure against real workflows:

- Where does context get lost today?
- Which decisions need to remain visible after a handoff?
- Does carrying these records make the next person's (or agent's) work clearer, or is it overhead the workflow can't support?

If you have a workflow in mind, use the [evaluation guide](/domains/evaluation-guide) to test it. Read the [draft](/specification/working-draft), [file an issue](https://github.com/block/governed-artifact-protocol/blob/main/CONTRIBUTING.md#file-an-issue) when a rule is unclear, or join the [Block open source Discord](https://discord.gg/block-opensource) to discuss the approach. We want the next version of GAP to reflect what others learn when content crosses the boundaries we haven't tested yet.
