---
slug: what-should-travel-with-an-agents-summary
title: "What should travel with an agent’s summary?"
description: "An agent’s summary should stay traceable after it leaves the conversation that produced it. What has to stay attached, who does the recovery work today, and how we propose to test it."
authors: [davidhamilton]
draft: true
---

We want an agent’s summary to remain traceable after it leaves the conversation that produced it. Another agent may use it to prepare work the original author never sees. The later agent needs references that identify the exact sources and release decisions behind the summary.

<!-- truncate -->

Consider a fictional journal that publishes a paper about gummy worms telling each other stories aboard the spaceship Sugar Comet. Its reference study says the zero-gravity circle averaged 48 seconds of story delivery time. An agent summarizes the paper, preserving its qualification that shorter story delivery time does not establish better listener recall. Later, another agent receives that summary and uses it to draft a literature overview.

The second agent may never see the original paper or its sources. The person reading the overview may not know a summary was involved at all.

Now the fictional study corrects its invented figure for story delivery time to 52 seconds.

We need to find work that still depends on the earlier source. Searching for “48 seconds” may find some of it. It will not reliably tell us which source each piece used, which version was authorized, or whether the wording changed along the way.

## What stays attached?

GAP, the Governed Artifact Protocol, proposes a shared set of records that travel with released content. In this example, the summary would carry:

- **Its identity and version**, so we can distinguish it from a later edit.
- **Its field rules**, so another tool knows the structure it must check.
- **References to its source versions**, so we can look up the particular source version it used.
- **Its release decision**, so we can check who permitted this version to be made available.

We call this a packet as a way to explain what belongs together. It does not contain every source or the whole conversation. The receiving application still needs access to the sources, a way to find them, and rules about whom to trust.

If it cannot reach a source, it should report that the check is unresolved. A reference gives us a place to investigate; it is not evidence that the investigation happened.

## Who does the recovery work?

Without those connections, the next person may need to ask the summary’s author, search earlier conversations, or compare documents by hand. The source owner may have to answer the same question for several teams. Someone reviewing the final instructions may need to reconstruct several earlier steps.

Agents can perform those steps before a person reviews the result. A summary becomes input to another summary, a draft response, or a proposed action. We want the application to record the exact source versions while it knows which material was used, rather than leave each recipient to infer them afterward.

Research on multi-agent systems gives a concrete reason to examine these handoffs. Cemri and colleagues describe a coding task in which one agent labeled output as an example, while another treated it as evidence that tests had passed ([Appendix N.8](https://arxiv.org/html/2503.13657v3#A14.SS8)). The study also identifies agents ignoring information they received. Carrying records is therefore only part of the problem. The receiving system has to check and use them.

That study does not test GAP. GAP does not prove that tests ran, that a summary is accurate, or that new instructions are safe to act on.

## What we can show today

The [research publishing demonstration](/domains/research) records which study, methods-paper, and peer-report versions a paper used. A source correction during review becomes a new source version. The final manuscript captures that corrected version before its single publication, while the earlier drafts preserve the sources they used.

That runs in one local workspace. The second agent and the later instructions in this post describe a handoff we propose to test, not a connected system we have demonstrated. Source references are optional in GAP; this example requires them.

## What we want to test next

Ask a second agent to draft instructions from the summary in two fresh sessions. In one, provide only the summary text. In the other, provide the summary with its records. Keep the tools, source access, and time available the same. Use fictional content and do not carry out the instructions.

Can it identify the version it received? Can it find the sources that version used? Does it report an inaccessible source as unknown? Then release the corrected fictional study and run the check again. Can it identify which work needs review?

We should also count extra lookups, questions to people, and unsupported claims. Repeating the trials matters. A convincing answer in one session is not evidence of reliability.

Then compare the release proof with existing links and metadata. We need to learn whether GAP reduces recovery work or adds records people cannot maintain. Measure whether recipients can identify the version they received, trace its sources, and question its release evidence.

[Look inside the example packet](/intro/anatomy-of-gap) · [Read the broader thesis](/intro/why-gap) · [Run the demo](/domains/run-the-demos)
