> [!WARNING]
> **Draft.** GAP has no published specification version yet. Draft content can change without notice.

# Examples

This page shows what GAP artifacts and their related records look like, using fictional examples of blog posts, issue tickets, and research papers.

## Blog posts

The CMS example releases one monarch migration post with four locale variants. A reviewer agent rejected version 1, an editor then approved that same version, and a publisher authorized its release. The proof carries both decisions. The profile requires US English and Mexican Spanish and declares same-country fallback for optional US Spanish and Mexican English. The demo tests both fallback paths with a post containing only the two required locales. Read [GAP for a blog CMS](../../../documentation/docs/domains/blog-website.mdx) for the full editorial workflow.

## Issue tracking

A requester's “Create ticket” action creates, authorizes, and releases version 1 of a bug ticket in one operation under this application's permissions. The assignee then adds an acceptance criterion and moves the ticket from To do to In progress. Saving that working copy creates, authorizes, and releases version 2; the intermediate edits are not GAP records. Read [GAP for issue tracking](../../../documentation/docs/domains/issue-tracking.mdx) for the application workflow.

## Research publishing

This fictional research project follows gummy worms aboard the spaceship Sugar Comet and asks whether floating listeners remember stories better. The new paper builds on two previously published fictional papers: a study that measured how fast floating gummy worms tell stories, and a methods paper that defines a recall test. Each answers a different question from the new paper. The cited papers, peer-review report, and editor notes are separate artifacts with distinct profiles. Every character, setting, number, and credited research group is invented demonstration content.

### Published paper

The paper is what readers receive. Its submitted version 1 receives an editorial rejection; version 2 narrows the conclusion after peer feedback. Both remain unpublished drafts. During review, the source study is corrected from 40 to 45 seconds, and the author captures that correction in version 3's background section.

The editor approves exact version 3, and a separate publisher authorizes its release. This is the paper's only publication. Its sections show numbered citations to the prior papers, and its bibliography lists their titles, authors, journal names, and publication years; its [dependency set](../README.md#dependency-set) pins their exact released versions and the review report. The published content includes separate responses to the peer's comment and editor's note.

### Previously published study

The fictional 2024 study in the Fictional Journal of Orbital Confectionery measured story pace only; it did not test recall. It is entry [1] in the new paper's bibliography, cited as background. Version 1 reports 40 seconds for floating groups; corrected version 2 reports 45 seconds. Both report 60 seconds for groups with gravity.

The cited-works editor releases the corrected study before the paper is published. The final paper pins study version 2, while earlier manuscript versions preserve their original version 1 reference.

### Previously published methods paper

The fictional 2023 paper in the Fictional Journal of Story Metrics defines the Jellybean Quiz, ten questions scored from 0 to 10, which the new paper uses as its method. It is entry [2] in the new paper's bibliography. The demo represents this prior publication as independently released source content with its own artifact ID and profile pin. Other papers could reuse its exact released version without copying its wording into their content models.

### Peer-review report

The report names exact manuscript version 1 and quotes the conclusion section that overstates the results. It points out that the paper's own recall scores are nearly equal and that the faster pace comes from the earlier study, and asks the author to limit the conclusion to what the synthetic comparison measured.

The peer-review card shows the original conclusion beside the comment and links to manuscript version 1. Its manuscript reference is domain content rather than a dependency-set entry, so it can discuss an unpublished draft. The publisher releases the report; releasing it releases feedback, not the paper. Revised manuscript versions then pin the report and respond to its comment.

### Editor notes

Editor notes use the `research-editor-notes` profile, separate from the `research-peer-review` profile. This note names manuscript version 2 and quotes the background passage still citing 40 seconds. The editor asks the author to use the corrected 45-second figure and source version before publication.

The note card links to that exact original passage. The final manuscript pins the released notes and records an editor response. The publisher releases the notes, which shares feedback; approval remains a separate signed authority decision over the final manuscript.

### Publication evidence

Every authority decision carries an Ed25519 signature. The two trust-store files are reader configuration, not evidence supplied by the proof: the journal store trusts the publisher to release papers, reports, and notes, and the cited-works store trusts the cited-works editor to release sources. Each source has its own proof to check under the cited-works store. Read [GAP for research publishing](../../../documentation/docs/domains/research.mdx) for the models, permissions, and workflow.
