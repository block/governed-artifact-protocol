> [!WARNING]
> **Draft.** GAP has no published specification version yet. Draft content can change without notice.

# Governed Artifact Protocol (GAP)

> The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in BCP 14 ([RFC 2119](https://www.rfc-editor.org/rfc/rfc2119), [RFC 8174](https://www.rfc-editor.org/rfc/rfc8174)) when, and only when, they appear in all capitals, as shown here. Text outside these keyworded requirements is explanatory.

## Abstract

Governed Artifact Protocol (GAP) defines records and lifecycle rules for releasing structured content under an approved content model. Each artifact version identifies the profile revision it follows. Release requires authorization for that version's content and profile revision.

A release proof carries the released content, its profile revision, and its authorization. Consumers verify these records against configured trust. When the decisions carry authority signatures, a consumer can verify them using the proof and its own trust store, without access to the system that recorded them.

GAP is transport-independent, so applications choose how people and AI agents work with records. That could mean MCP tool calls, a REST API, or a user interface. Applications also choose where records are stored, whether in a database, files, or another storage system.

## Contents

- [Scope and boundaries](#scope-and-boundaries) — what the protocol does and does not standardize
- [Lifecycle](#lifecycle) — required behavior from profile proposal to verified release
- [Roles and authority](#roles-and-authority) — participants, permissions, and application actions
- [Concepts](#concepts) — definitions, record formats, and their rules
- [Protocol requirements](#protocol-requirements) — core requirements with stable identifiers
- [Conformance](#conformance) — what the executable checks demonstrate, and what is deferred

## Scope and boundaries

GAP defines the records and rules needed to:

- approve an exact profile revision for use, through [ratification](#ratification);
- create immutable artifact versions that follow that revision;
- authorize and release an exact artifact version;
- record that an exact released version has been [withdrawn](#release-withdrawal);
- attach an authority's signature to the exact decision it made; and
- let consumers check the release and its signed decisions against the authorities they trust.

A valid release establishes which content was authorized and made available to consumers. It does not establish what happened afterward, such as whether a website displayed that content or a message was sent.

The reference implementations show ways to use these rules. Their application-specific choices do not add requirements to the protocol.

This draft leaves the following choices and behaviors outside the protocol:

- **Interfaces and storage**
  - How systems agree on a way to exchange records.
  - How records are stored across systems, copied, and kept in sync.
- **Application workflows**
  - Application roles and permissions, who reviews content, and how applications score policy checks.
  - Whether release requires a separate approval, and evidence of what an approver reviewed beyond the exact version, content, and profile revision covered by the decision.
  - How applications manage editable working copies and which actions create artifact versions.
- **Reading and using content**
  - Who can access content and which records they can see.
  - What happens after release, including running an action, displaying content, or delivering it.
  - How applications identify locales, choose a fallback, or deliver content for one locale. [Locale variants](#locale-variants) within a payload still follow the profile's rules.
- **Managing change**
  - How applications discover released versions, choose the current one, or record that content corrects or replaces earlier content. [Withdrawal](#release-withdrawal) is defined, but it does not correct content or select a replacement.
  - How artifacts move to newer profile revisions, or when profiles expire or are retired.
- **Signing keys and trust**
  - How signing keys are discovered, rotated, or revoked, and how authority is delegated.
  - How a signed decision is restricted to a particular deployment or audience.

Governance of an eventual standard also remains open. [`DEFERRED.md`](../../DEFERRED.md) records the deferred design questions and when to revisit them.

## Lifecycle

The six lifecycle steps are grouped into three planes. Configuration establishes an approved content model, authoring creates versions under that model, and release covers authorization, release, and consumer verification.

Lifecycle requirements apply even when an application [combines steps in one action](#application-actions-and-lifecycle-steps). [Concepts](#concepts) defines the records each step uses; [Anatomy of GAP](../../documentation/docs/intro/anatomy-of-gap.mdx) introduces how they fit together.

<figure class="gap-diagram-figure" aria-labelledby="figure-lifecycle-title">
<header class="gap-diagram-header">
<h3 id="figure-lifecycle-title" class="gap-diagram-title">The GAP lifecycle</h3>
<p>Six steps across the three planes</p>
</header>

![The six lifecycle steps across the configuration, authoring, and release planes. Propose and ratify a profile revision in configuration, create an immutable draft version in authoring, then authorize, release, and verify in release.](diagrams/lifecycle.svg)

<figcaption>
<p>Steps 1–2 establish configuration, step 3 covers authoring, steps 4–5 complete release, and step 6 verifies the released content.</p>
<p>An application action may perform several steps; each step’s requirements still apply.</p>
</figcaption>
</figure>

### 1. Propose a profile

A profile describes what content is allowed: its fields, their types, and their limits. These rules form its [payload contract](#payload-contract). For example, a blog post profile could require a headline and body and limit the headline's length.

An author submits these rules in a write-once [profile proposal](#profile-proposal), with a stable profile ID and the next revision number. The next revision is one greater than the highest ratified revision of that profile, or 1 if no revision of it is ratified. When it receives a proposal, an implementation MUST refuse one that names any other revision. Proposal MUST NOT grant ratification authority or advance discovery of the ratified profile head.

Revision numbers are allocated by ratification, not by proposal. Several proposals MAY name the same revision; the first one ratified takes that number ([step 2](#2-ratify-the-exact-profile-revision)). An implementation MAY accept fewer proposals than this allows, for example only one unratified proposal per profile at a time, as the CMS reference implementation does. That restriction is local policy.

An implementation MUST preserve every profile proposal it records, unchanged, whether the proposal is later ratified, still pending, abandoned, or declined. Ratifying a proposal, or ratifying another proposal for the same revision, MUST NOT alter or delete any recorded proposal.

### 2. Ratify the exact profile revision

The implementation previews the exact proposal and its profile digest. Ratification MUST require a decision from a configured authority for that exact digest. The ratification MAY carry that authority's [authority signature](#authority-signature) over the profile digest. An implementation MUST verify a signature against its configured trust before recording it.

An implementation MUST refuse to ratify a proposal unless, when the ratification is recorded, the proposal's revision is exactly one greater than the highest ratified revision of that profile, or 1 if none is ratified ([GAP-CORE-015](conformance/README.md#gap-core-015)). Once a proposal is ratified for a revision number, no other proposal that names that number can be ratified; its author can propose the change again under the next revision. A proposal that is not ratified, whether it is pending, abandoned, or declined, does not consume its revision number, and no artifact version can pin it ([step 3](#3-draft-immutable-artifact-versions)).

A ratified [profile revision](#profile-revision) is immutable. Discovery MAY derive the current head as the highest valid ratified revision. Advancing the head MUST NOT change existing artifact pins.

### 3. Draft immutable artifact versions

An author creates an [artifact version](#artifact-version) with a positive version number, a JSON payload, and an exact [profile pin](#profile-pin). The pin MUST reference a ratified profile revision. An implementation MUST NOT create an artifact version under a proposed, unknown, or mismatched revision. The payload MUST satisfy the pinned contract before it is stored or considered for authorization. Draft versions MUST NOT be readable through the release boundary.

An implementation MUST NOT accept a payload unless it can establish that the payload satisfies the [pinned contract](#payload-contract).

Multiple immutable draft versions can share an artifact ID. Creating a later draft MUST NOT overwrite an earlier draft or imply that either version is released.

Before creating a version, an application MAY hold a mutable [working copy](#working-copy). A working copy is not a GAP record. It MUST NOT be readable through the release boundary, and it MUST NOT be the subject of an authorization preview or decision. Those decisions refer to stored artifact versions.

Creating a version from a working copy performs this step and makes the version immutable. The payload MUST satisfy the pinned contract as created, regardless of any earlier validation of the working copy. Applications choose when to create versions: on every save, for example, or when a person or an AI agent requests review.

### 4. Authorize one exact version

The implementation previews the artifact identity, version, payload, payload digest, profile pin, and authorization subject digest. The acting participant MUST be a configured authority for release authorization in this deployment. [Release authorization](#release-authorization) MUST bind all of the previewed values.

The payload digest and authorization subject digest MUST be computed from the stored artifact version, not from the request that produced it, including when one application action creates and authorizes the version. A decision for another subject, artifact version, payload, or profile MUST be rejected. Authorization covers the complete stored payload, including all [locale variants](#locale-variants).

The authorization MAY carry the authority's [authority signature](#authority-signature) over the previewed subject digest. An implementation MUST verify a signature against its configured trust before recording it.

**Release approval.** Before authorization, an application MAY record a [release approval](#release-approval) of the same previewed subject. The acting participant MUST be a configured authority for release approval in this deployment. The approval MUST bind the artifact ID, artifact version, payload digest, and profile pin computed from the stored artifact version and MUST carry the authorization subject digest computed from them. It MAY carry the approver's [authority signature](#authority-signature) over that digest under the approval's own signing domain.

An approval MUST NOT release anything and MUST NOT confer release authority. Release still requires authorization by a configured release authority. Application policy determines whether an approval is required and who can give it. When policy requires one, the implementation MUST establish from the stored version that an approval binds the exact subject being authorized, and an approval of another subject MUST NOT satisfy it.

**Release rejection.** An application MAY record a [release rejection](#release-rejection) of the same previewed subject: a configured approval authority's decision that the version is not approved. A rejection follows the same binding and signature rules as an approval, and MAY carry the rejecting authority's signature under the `reject-release` domain. It MUST NOT release, withdraw, or alter anything, and it MUST NOT by itself prevent a later approval or authorization of the same subject. Application policy determines whether a rejected subject may proceed. Any later decision still requires its own authority check.

### 5. Commit the release transition

Accepting valid authorization atomically records the authorization and the [release](#release). A crash MUST NOT expose a partial release as valid. Cancellation, invalid authorization, or conflicting output MUST produce no new release.

A release proof MAY carry the release approvals recorded for the same subject. An implementation MUST NOT carry an approval whose subject differs from the authorization's. Approvals are recorded when made. The atomicity requirement applies to the authorization and release; recording an approval alone does not make the version readable through the release boundary.

An implementation MAY release successive versions of the same artifact. Every released version and its release evidence MUST be preserved. A version's release evidence is its [release proof](#release-proof) and every approval, rejection, and withdrawal recorded for its subject. Releasing a later version, recording a withdrawal, or ratifying a later profile revision MUST NOT alter or delete any record in a released version's evidence, and each released version's evidence MUST remain verifiable under [step 6](#6-read-and-verify) without relying on any later release ([GAP-CORE-014](conformance/README.md#gap-core-014)).

Application policy determines [which released version is current](#current-release-selection). An application MAY expose only the release it treats as current at any interface, including its release boundary; doing so does not violate preservation. A release-proof lookup MUST resolve one exact released version and MUST NOT select among several ambiguously. This draft does not require an implementation to retrieve an earlier release by exact version or to let callers discover the released versions of an artifact; both questions are [deferred](../../DEFERRED.md#versioned-release-proof-lookup). Portable discovery of the current release and resolution of concurrent updates also remain open; see [`DEFERRED.md`](../../DEFERRED.md).

**Withdrawal.** A configured authority MAY withdraw one exact released version by recording a [release withdrawal](#release-withdrawal). The acting participant MUST be a configured authority for withdrawal in this deployment. The withdrawal MAY carry that authority's [authority signature](#authority-signature) over the same subject digest under the withdrawal's own signing domain.

A withdrawal adds a record. The released version, its authorization, and its release proof MUST remain preserved and unchanged ([GAP-CORE-013](conformance/README.md#gap-core-013)). A release boundary that has recorded a withdrawal MUST NOT serve that release's proof without the withdrawal; it MAY serve the withdrawal alone or refuse to serve the release. Withdrawal does not correct or supersede content, or select another version as current. [Current release selection](#current-release-selection) remains application policy.

### 6. Read and verify

A consumer reads a [release proof](#release-proof) containing the released payload, exact profile revision, and authorization.

<figure class="gap-diagram-figure" aria-labelledby="figure-release-boundary-title">
<header class="gap-diagram-header">
<h3 id="figure-release-boundary-title" class="gap-diagram-title">What crosses the release boundary</h3>
<p>Only the authorized, released version reaches a consumer, as a release proof</p>
</header>

![Inside the implementation, working copies, unratified proposals, and draft artifact versions stay behind the release boundary. Only the authorized, released version crosses it, as a release proof that carries any approvals and any withdrawal, and the consumer accepts it only after recomputing digests and verifying the authorization against configured trust. After withdrawal, the boundary may return only the withdrawal record or refuse the release. If it returns the proof, the withdrawal must accompany it; the original released records stay preserved.](diagrams/release-boundary.svg)

<figcaption>
<p>Only the authorized, released version crosses the release boundary, and it crosses as a release proof.</p>
<p>The consumer verifies the proof itself; it does not rely on the implementation’s earlier acceptance.</p>
<p>A withdrawal marks the version as no longer current. The boundary may stop serving its content, return the withdrawal alone, or serve the proof with the withdrawal attached.</p>
</figcaption>
</figure>

Verification MUST:

1. validate record shapes and exact references;
2. recompute profile and payload digests;
3. verify authorization subject binding;
4. verify the authorization against configured trust;
5. reject drafts, incomplete pairs, unknown semantics, tampering, and ambiguous lookup;
6. verify that every carried release approval or release rejection, and any release withdrawal, binds the identical subject as the authorization;
7. when verifying against a trust store, verify the [authority signature](#authority-signature) on the ratification, the authorization, every carried approval or rejection, and any withdrawal, and reject a decision record that carries none.

Rules 1 through 6 check the records and their binding. They rely on the implementation to have checked each actor's authority. Under rule 7, the consumer checks every decision's signature against the keys and actions in its own [trust store](#trust-store).

Under rule 7, stripping a signature MUST NOT turn a signed proof into an acceptable attributed one. A consumer without a trust store verifies rules 1 through 6 and MUST NOT report the proof as independently verified.

When a proof carries approvals or rejections, verification MUST check that each one's `artifactId`, `artifactVersion`, `payloadDigest`, and `profile` equal the authorization's and that its `authorizationSubjectDigest` equals the subject digest recomputed from the authorization, rejecting the proof on any mismatch. A proof without a release authorization MUST be rejected whatever approvals or rejections it carries.

A verified rejection records that a configured authority declined the subject. It does not invalidate the release or establish that the content is incorrect.

A [release withdrawal](#release-withdrawal) that binds a different subject is mismatched evidence and MUST be rejected under rule 5; rejecting it does not make the release current again. A consumer that receives a withdrawal it cannot verify, including one served without the proof, MUST NOT report it as verified and MUST NOT treat the release it names as current. A consumer that verifies a withdrawal MUST NOT treat the release as current. Verifying a withdrawal establishes that the release is withdrawn, not that another version has taken its place.

A valid release proves what entered GAP's consumer boundary. It does not prove downstream execution, rendering, ticket mutation, message delivery, locale selection, or another domain outcome. A decision's [reason](#reason) states the authority's explanation. It is not evidence of these outcomes, content correctness, or what the authority reviewed.

A payload may reference other artifacts or external content by identifier, version, or digest. Its release proof covers those references as part of the payload. It does not establish that the referenced content exists, matches the digest, or was governed or released. A consumer relying on that content needs to obtain and check its evidence separately. The [dependency set](#dependency-set) rules define how to capture and verify direct governed dependencies using their own release proofs. Retrieval and external-content references remain outside that definition.

## Roles and authority

GAP names three roles: [Author](#author), [Authority](#authority), and [Consumer](#consumer). A participant can hold more than one role when the application grants the required permissions. The implementation is the software that checks those permissions and carries out the lifecycle.

The detailed requirements are in [Lifecycle](#lifecycle) and [Concepts](#concepts).

### Protocol roles

#### Author

An author proposes profile revisions and creates artifact versions. A person or an AI agent can be an author. An application can grant Author permission to every participant; the implementation still checks that permission and records the acting participant. Proposal and drafting MUST NOT confer ratification or release authority ([GAP-CORE-001](conformance/README.md#gap-core-001)).

An artifact version's `authoredBy` names the participant who performed [step 3](#3-draft-immutable-artifact-versions) for that version, in the same sense that `authorizedBy` names the participant who performed [step 4](#4-authorize-one-exact-version). It attributes the action; it is not a byline. Its `actorKind` describes that acting participant, not who produced the content. Attributing the content to the people or AI agents who produced it is a claim about the content. It belongs in the payload, in fields the pinned [payload contract](#payload-contract) defines, where the payload digest and every decision about the version cover it. A payload can carry that attribution as identifiers an application resolves for display. As with any reference in a payload, the release proof covers the identifier bytes, not what they resolve to; see [step 6](#6-read-and-verify).

#### Authority

An authority is a participant configured to ratify profiles, approve or reject versions for release, authorize releases, or withdraw released versions. Each action requires its own permission. A person or an AI agent can hold these permissions.

#### Consumer

A consumer reads released content and verifies its evidence against configured trust. This can be an application or an AI agent, or a person using software that performs the checks. The consumer role grants neither authoring nor decision authority. Consumers MUST NOT retrieve drafts through the release boundary ([GAP-CORE-008](conformance/README.md#gap-core-008)). [Read and verify](#6-read-and-verify) specifies the checks.

<a id="implementation"></a>

#### The implementation

The implementation validates records, checks permissions, stores evidence, and exposes the release boundary. It enforces the lifecycle requirements when participants act. Running those checks does not give the implementation authority to make decisions of its own.

The implementation enforces the rules itself, even when a client has already checked them. A release proof MUST carry enough evidence to verify without relying on a description of the workflow ([GAP-CORE-009](conformance/README.md#gap-core-009)).

<figure class="gap-diagram-figure" aria-labelledby="figure-roles-title">
<header class="gap-diagram-header">
<h3 id="figure-roles-title" class="gap-diagram-title">Who acts at each step</h3>
<p>Protocol roles and the implementation across the lifecycle</p>
</header>

![Who acts at each lifecycle step. Authors propose a profile and create versions, authorities ratify the revision and authorize the version, the implementation commits the release, and consumers read and verify. An authority may also approve a version before authorization or withdraw a release afterwards; each record binds the same exact subject. The implementation enforces every step.](diagrams/roles.svg)

<figcaption>
<p>Permission to author never implies authority. One participant may hold both when configured.</p>
<p>The implementation validates records and checks permissions at every step; it holds no authority of its own.</p>
<p>Dashed: optional approval and withdrawal records.</p>
</figcaption>
</figure>

### Authority and permission

The application's owner or administrator configures who may make each kind of decision. Before recording one, the implementation checks that the participant has permission for that action. Every decision record MUST record a configured authority's decision for the exact subject digest. A decision for another subject MUST NOT be reused ([GAP-CORE-002](conformance/README.md#gap-core-002)).

Each decision record identifies the participant who made the decision. A consumer can check the record's shape, digests, and references, but relies on the implementation to have checked the participant's authority. An actor's name or a recorded [reason](#reason) cannot replace that permission check.

<a id="required-demonstrations"></a>

A decision can also carry an [authority signature](#authority-signature), made with the authority's signing key over the decision's subject digest. A consumer checks it against its own [trust store](#trust-store): a list of signing keys and the actions each signer is trusted to perform. This lets the consumer verify the decision without access to the producing system. The implementation still checks the participant's permission, records their identity, and verifies the signature against its own trust before storing it. The consumer verifies the signature independently.

Application policy determines whether an action requires a person or can be authorized by an AI agent. In either case, release authorization MUST bind artifact ID, artifact version, payload digest, and exact profile pin ([GAP-CORE-006](conformance/README.md#gap-core-006)).

Payload labels such as `public`, `members`, or `internal` describe application access policy. GAP does not enforce that policy or establish that the content was kept confidential.

### Application roles

Applications define roles such as writer, editor, requester, assignee, or administrator, and map their permissions to GAP roles. A CMS editor might both author content and authorize its release. An issue tracker might give a requester both permissions for their own tickets. The implementation checks the required permission before each lifecycle step.

Administrative access does not itself grant authority to ratify, approve, reject, authorize, or withdraw. Administrators who make those decisions need the same explicit configuration as other participants. Consumers cannot infer authority from an application role name, an actor kind, or an actor ID prefix.

### Application actions and lifecycle steps

An application action is an interaction such as “Save a draft,” “Publish,” or “Create ticket,” offered through a button, command, or tool call. An action can perform one lifecycle step, several steps, or none.

For example, an issue tracker's “Save changes” action can create, authorize, and release a version when the participant has the required permissions. A CMS can use separate actions for editorial review and publication. An authoring tool can save a mutable working copy repeatedly and create an artifact version only when the author chooses “Submit for review.”

The same rules apply to combined actions:

- Each step satisfies its lifecycle requirements, including payload validation ([GAP-CORE-005](conformance/README.md#gap-core-005)), exact authorization ([GAP-CORE-006](conformance/README.md#gap-core-006)), and atomic release ([GAP-CORE-007](conformance/README.md#gap-core-007)).
- Authorization binds the version as stored. [Step 4](#4-authorize-one-exact-version) requires digests computed from stored records, including when the action also creates the version.
- If a step fails, no release results. The application can retain an already-created version as a draft or discard it. Consumers MUST NOT retrieve it through the release boundary ([GAP-CORE-008](conformance/README.md#gap-core-008)).
- Saving a [working copy](#working-copy) performs no lifecycle step and creates no GAP record. Creating a version from it performs [step 3](#3-draft-immutable-artifact-versions), including validation of the version as created.
- One action can record approval and authorization when the participant has both permissions. Each decision independently binds the stored version and satisfies its own requirements.

Authorization records permission to release a version. It does not establish that an independent review took place. An application can record a separate [release approval](#release-approval) to attribute a review decision. Approval, rejection, and their recorded reasons do not establish content correctness or what the authority reviewed. A release MUST NOT be represented as proof of any downstream outcome ([GAP-CORE-011](conformance/README.md#gap-core-011)).

Checks such as drift comparisons, history comparisons, and rendering perform no lifecycle step. Released records MUST NOT change in place ([GAP-CORE-003](conformance/README.md#gap-core-003)). A finding can lead a participant to create and release a new version through the lifecycle.

<a id="terminology"></a><a id="core-structures"></a>

## Concepts

The interfaces use TypeScript notation to describe JSON records. Implementations can use any programming language. The [core schema](schemas/README.md) expresses these record formats as JSON Schema.

Positive integers identify revisions and versions. Identifiers are stable within an implementation's namespace. Verifiers MUST reject unknown fields in every record that carries trust, so that a writer and a verifier cannot assign different meaning to ignored data.

### Artifact

An artifact is a versioned piece of structured JSON content governed by a profile. It could represent a blog post, a ticket, or a research paper, and a person or an AI agent can create it. The artifact ID connects its versions. Creating content does not grant permission to release it.

### Profile

A profile defines the content model for one type of artifact: its required fields, data types, and limits. A blog post profile could require a headline and body; a ticket profile could require a description and acceptance criteria. Ratifying a profile revision establishes that its content model may be used; it does not approve every artifact created from it.

#### Payload contract

The payload contract is the part of a profile that states which payloads are allowed: their fields, types, and bounds.

A contract language defines how those rules are written and interpreted. For example, JSON Schema provides terms for declaring required fields and data types. Implementations need to understand the language and version used by a contract to check content against it.

A payload contract MAY declare its language in the reserved top-level member `$contractLanguage`. Its value is a non-empty string identifying an exact language and version, such as `json-schema/draft-2020-12` or a local identifier such as `cms.local/1`. A profile MUST NOT use this member for domain content. The profile digest covers it as part of the contract.

When the pinned contract declares `$contractLanguage`, an implementation MUST fail closed unless it implements exactly that language and version. Without that declaration, implementations need a shared, preconfigured interpretation of the contract; portability between implementations is not guaranteed. GAP fixes the contract's bytes through the profile digest but leaves the choice of contract language to applications. A standardized minimum contract vocabulary remains an open question.

<a id="profileproposal"></a>

#### Profile proposal

A profile proposal is the write-once record an author submits for ratification.

```ts
type ProfileProposal = {
  profileId: string;
  revision: number;
  proposedBy: Actor;
  payloadContract: JsonObject;
};
```

`revision` is the number the proposal would take if ratified. [Step 1](#1-propose-a-profile) defines which number that is, and [step 2](#2-ratify-the-exact-profile-revision) refuses a proposal whose number another ratification has already taken. The ratified revisions of a profile are therefore numbered 1, 2, 3, and so on, each number ratified once and none skipped.

Ratification binds the proposal's profile digest, which covers the profile ID, revision, and payload contract but not `proposedBy`. Proposals that name the same revision with different contracts have different digests, and the authority ratifies one exact digest. Proposals with identical contracts have the same digest, so ratifying either one records the same revision.

<a id="profilerevision"></a>

### Profile revision

A profile revision is one immutable version of a profile. Changing the content model requires a new revision. Earlier revisions retain their meaning, and existing artifact versions stay linked to the revisions they were created under.

```ts
type ProfileRevision = {
  profileId: string;
  revision: number;
  digest: Sha256Digest;
  ratification: {
    ratifiedAt: string;
    actorId: string;
    actorKind: "agent" | "human";
    reason?: string;
    authoritySignature?: AuthoritySignature;
  };
  payloadContract: JsonObject;
};
```

#### Ratification

Ratification is a configured authority's decision to approve one exact profile revision for use. It makes the revision available for authoring. Artifact versions still need their own release authorization, and existing versions stay pinned to their earlier profile revisions. [Step 2](#2-ratify-the-exact-profile-revision) states the requirements.

The ratification record carries the decision time and the actor who made it, MAY carry a [reason](#reason), and, when signed, carries that authority's [authority signature](#authority-signature) over the profile digest.

<a id="profilepin"></a>

### Profile pin

A profile pin identifies the exact profile revision an artifact version follows: the profile ID, the revision number, and the profile digest. The pin preserves the relationship between content and its governing definition. Ratifying a later profile revision does not move an existing artifact version to that revision.

```ts
type ProfilePin = {
  profileId: string;
  revision: number;
  digest: Sha256Digest;
};
```

<a id="artifactversion"></a>

### Artifact version

An artifact version is one immutable record of an artifact's content: the payload, a pin to the exact profile revision it follows, and the actor who created it. Edits produce new versions instead of replacing earlier records. Authorization and approval apply to one exact version, so a decision about an earlier draft does not cover later changes. [Step 3](#3-draft-immutable-artifact-versions) states the validation requirements.

```ts
type ArtifactVersion = {
  artifactId: string;
  artifactVersion: number;
  profile: ProfilePin;
  authoredBy: Actor;
  payload: Payload;
};
```

`artifactVersion` is a positive integer so that the versions of one artifact are ordered: "a later version" is well defined for successive releases, dependency pins, and history without a separate ordering rule, and one integer names one version of one artifact for as long as the record exists. An implementation whose versions have opaque identities projects a per-artifact integer sequence into its GAP records and keeps that mapping fixed. The opaque identity stays local and is not a GAP field.

This blog post is one complete artifact version, exactly as the CMS reference implementation stores it: a public garden's post about seeing monarchs, with English and Spanish versions for readers in the US and Mexico. The full example set, with its ratified profile revision, release rejection, release approval, release authorization, release, and release proof, is the `*_four-locale-post.json` files in [`examples/cms/`](examples/cms/), and `pnpm check:specification` recomputes every digest in it.

```json
{
  "artifactId": "blog-post:monarch-migration",
  "artifactVersion": 1,
  "profile": {
    "profileId": "blog-post",
    "revision": 1,
    "digest": "sha256:e35800ae49f6649be07f9c95a4168ac468095de71974cf05ea7edcfe4016e61c"
  },
  "authoredBy": {
    "actorId": "agent:writer",
    "actorKind": "agent"
  },
  "payload": {
    "audience": "public",
    "author": "Grounds staff",
    "content": {
      "en-US": {
        "headline": "Following the monarch migration",
        "body": "The monarchs passing through our public garden are on their way to the mountain forests of central Mexico, where they spend the winter. In the garden, they stop to feed on nectar before continuing south.\n\nVolunteers record sightings along the garden paths. These observations help us follow the migration from year to year.\n\nIn the US, visit our garden during the autumn migration to see monarchs on their journey south. Check current opening dates and visitor guidance before planning your visit."
      },
      "es-US": {
        "headline": "Siguiendo la migración de las monarcas",
        "body": "Las monarcas que pasan por nuestro jardín público van rumbo a los bosques de montaña del centro de México, donde pasan el invierno. En el jardín, se detienen para alimentarse de néctar antes de continuar hacia el sur.\n\nUn grupo de voluntarios registra los avistamientos en los senderos del jardín. Estas observaciones nos ayudan a seguir la migración de un año a otro.\n\nEn Estados Unidos, visita nuestro jardín durante la migración de otoño para observar a las monarcas en su viaje hacia el sur. Consulta las fechas de apertura y las recomendaciones para visitantes antes de planear tu visita."
      },
      "en-MX": {
        "headline": "Following the monarch migration",
        "body": "The monarchs passing through our public garden are on their way to the mountain forests of central Mexico, where they spend the winter. In the garden, they stop to feed on nectar before continuing south.\n\nVolunteers record sightings along the garden paths. These observations help us follow the migration from year to year.\n\nIn Mexico, visit the monarch sanctuaries in Michoacán and the State of Mexico during winter to see the overwintering colonies. Check current opening dates and visitor guidance before planning your visit."
      },
      "es-MX": {
        "headline": "Siguiendo la migración de las monarcas",
        "body": "Las monarcas que pasan por nuestro jardín público van rumbo a los bosques de montaña del centro de México, donde pasan el invierno. En el jardín, se detienen para alimentarse de néctar antes de continuar hacia el sur.\n\nUn grupo de voluntarios registra los avistamientos en los senderos del jardín. Estas observaciones nos ayudan a seguir la migración de un año a otro.\n\nEn México, visita los santuarios de la monarca en Michoacán y el Estado de México durante el invierno para observar las colonias que pasan allí la temporada. Consulta las fechas de apertura y las recomendaciones para visitantes antes de planear tu visita."
      }
    },
    "date": "2026-10-26T09:30:00Z"
  }
}
```

The payload's `author` field is the post's byline: content the profile defines and the payload digest covers. `authoredBy` names the participant who created the version, here an AI agent; see [Author](#author).

<a id="draft"></a>

#### Drafts and working copies

A draft is an artifact version that has not been released. It can be available to authors and reviewers within an application, but it is not readable through the release boundary. A draft is still immutable: revising it creates another artifact version.

<a id="working-copy"></a>

A working copy is content an application holds while a person or an AI agent edits it, before creating an artifact version. The application can change it in place and validate it against a ratified profile revision's contract to help the author. Validation alone creates no artifact version.

Working copies are outside GAP: they have no protocol-defined schema or digest and do not appear in release proofs or GAP history. Creating an artifact version from a working copy is [step 3](#3-draft-immutable-artifact-versions); the resulting version is immutable. The application chooses which action creates it, such as "Save" or "Submit for review".

<a id="payload-type"></a>

### Payload

The payload is the JSON object containing an artifact version's content. Its domain fields are defined by the governing profile. The name `dependencySet` is reserved at the payload's top level for a [dependency set](#dependency-set); a profile can require it when its content depends on other artifacts, or omit it for content without dependencies. The complete object, including any dependency set, MUST satisfy its pinned payload contract, and the payload digest covers all of it.

```ts
type Payload = JsonObject & {
  dependencySet?: DependencySet;
};
```

#### Locale variants

An artifact version can contain content in several locales. Its profile contract defines where that content lives in the payload, which locales are allowed and which are required, and any fallback when a requested locale is absent. A profile that keys content by locale SHOULD identify each locale with a BCP 47 language tag ([RFC 5646](https://www.rfc-editor.org/rfc/rfc5646)) so implementations agree on which locale a key names.

The payload digest covers every locale the version contains, and release authorization covers the whole version. An implementation MUST NOT represent a release authorization as covering some locales of a version and not others, and MUST NOT release a subset of a version's locales as that version. GAP defines no protocol-level locale identity, per-locale digest, or partial authorization.

Adding, removing, or changing a locale's content creates a new artifact version. Changing the profile's locale structure or allowed locales creates a new profile revision; versions pinned to the earlier revision remain unchanged. An application that needs to deliver or verify one locale independently governs it as a separate artifact under its own profile.

After verification, the consumer selects the locale to deliver using the profile's rules. If the requested locale is absent, any fallback can select only content in the released payload. This delivery selection is outside the claim boundary of [step 6](#6-read-and-verify): a release proves that the exact set of authored locales entered the release boundary. It does not prove that any locale was selected, displayed, or delivered.

The [`examples/cms/`](examples/cms/) set contains a four-locale post. Its profile requires US English and Mexican Spanish, with same-country fallback for the other language. The [CMS locale tests](../../demo/test/cms/locale.test.ts) exercise that fallback with a post containing only those two required variants.

<a id="dependency-sets"></a><a id="dependencyset"></a><a id="dependencyentry"></a><a id="distributed-context"></a><a id="drift"></a><a id="dependency-capture-and-drift"></a>

### Dependency set

A dependency set records the exact released versions of source artifacts used to create an artifact version. The artifact that uses those sources is the parent. Each entry identifies a source artifact, its version, and the digest of its payload. The digest is a fingerprint for checking content; it does not contain the source itself.

The set preserves which sources the parent used. A consumer can verify each source using its own release proof, and an application can compare the captured versions with its current releases to detect changes, called drift.

#### Dependency entries

```ts
type DependencyEntry = {
  artifactId: string;
  artifactVersion: number;
  payloadDigest: Sha256Digest;
};
type DependencySet = {
  entries: DependencyEntry[];
};
```

Profiles that use dependency sets MUST declare the optional top-level `dependencySet` field and its bounds in the payload contract; a profile MAY require the field. The field belongs inside `payload`. The payload digest and release authorization cover both the content and its dependency set. Changing an entry MUST create a new parent artifact version and require authorization for that version before release.

A dependency set MUST contain at most one entry per source artifact ID and MUST be ordered by artifact ID in ascending UTF-16 code-unit order. Each entry MUST name a nonempty artifact ID, a positive safe-integer version, and a payload digest under the digest rules.

The set records direct governed dependencies. Multiple versions of one source, external sources, and transitive closure are outside this draft's scope. The governing profile is identified by the profile pin, not duplicated as an entry. Other separately released material can be a dependency; see [Other governed content](#configuration-other-than-the-profile).

#### Capturing sources

The application captures entries from the exact source releases actually used when preparing the artifact version. Resolving a newer source at save time MUST NOT silently replace the source that informed the content; the author prepares a new version against the changed source instead.

A dependency set does not prove that the parent's content faithfully represents its sources or that every relevant source was declared.

#### Source context

A source may be governed in another system, with its own release evidence and trust rules. The application MUST establish an unambiguous source context for each dependency: which source system its artifact ID refers to and which trust rules apply. Transport context or application configuration MAY supply it.

When a record moves between systems, the receiving application MUST preserve or unambiguously recover the intended source context before verifying the dependency and MUST NOT assume that the system serving the parent owns its dependencies. An unknown or ambiguous source context MUST leave the dependency unverified. GAP does not prescribe a URI scheme or a record field for carrying this context.

#### Verifying dependencies

To report a dependency as verified, a consumer MUST resolve the pinned source's own release proof within that source context, verify it under these rules and that context's configured trust, and require its artifact ID, version, and payload digest to match the entry exactly. Any mismatch MUST fail the check, and an unresolved or inaccessible source MUST NOT be reported as verified.

The parent's release establishes that its dependency entries were authorized as part of its payload. Each source needs its own verification.

#### Detecting drift

Drift is a difference between the source versions a parent captured and the source releases the application currently selects. The application selects a [current release](#current-release-selection) according to its own policy. A newer draft or higher version number alone does not make a source current.

A newly selected source version is a signal to review the parent. Different bytes at the same immutable source version are an integrity failure. A missing or inaccessible source leaves the check unresolved; it does not show that nothing changed.

Drift findings are derived comparisons and MUST NOT mutate released artifacts or their dependency sets. The application decides when to run checks, who sees findings, and what follows. A participant with the required permissions can prepare a new version with a fresh dependency set and seek authorization for it. Earlier versions retain their content, dependencies, and evidence.

#### Access and disclosure

A dependency entry does not grant access to its source. Identifiers and digests may themselves be sensitive, so a profile should include only references suitable for the parent's readers. Removing a reference from a released payload breaks its digest; a redacted view requires a separately governed representation.

<a id="configuration-other-than-the-profile"></a>

#### Other governed content

Reusable material such as a standard disclosure, content block, brand tokens, or variable definition can be governed as an artifact. The application authors versions under that artifact's own profile, releases them through the lifecycle, and records the exact released version in the parent's dependency set. The same identity, digest, verification, and drift rules apply as for any other dependency.

The configuration plane holds profiles only. The profile pin is the only pin GAP defines outside the dependency set; GAP defines no separate pin kind or digest for other configuration records.

A profile MAY instead carry such references as domain content inside the payload, in profile-defined members. The release proof establishes that those reference bytes entered the release boundary as part of the exact released payload, as described in [step 6](#6-read-and-verify). A payload-carried reference MUST NOT be reported as a verified dependency; only a dependency-set entry checked under [Verifying dependencies](#verifying-dependencies) can be.

<a id="actor"></a><a id="actor-type"></a>

### Actors

An actor identifies the participant on whose behalf a record was created. It contains a stable actor ID and an actor kind of `human` or `agent`. These fields alone do not establish identity or authority; see [Authority and permission](#authority-and-permission).

```ts
type Actor = {
  actorId: string;
  actorKind: "agent" | "human";
};
```

<a id="decision-record"></a>

### Decision records

A decision record captures a configured authority's decision about one exact subject: a [ratification](#ratification), a [release approval](#release-approval), a [release rejection](#release-rejection), a [release authorization](#release-authorization), or a [release withdrawal](#release-withdrawal).

<a id="reason"></a><a id="decision-reasons"></a>

#### Reasons

Every decision record MAY carry a reason: the authority's plain-language explanation of why it made the decision. The reason travels with the record so reviewers and auditors can read that explanation alongside who decided and when. Like the actor fields, it attributes a statement to the authority. It does not establish what the authority reviewed, whether the content is correct, or any downstream outcome ([GAP-CORE-011](conformance/README.md#gap-core-011)).

A verifier checks that a reason, when present, is a string with at least one non-whitespace character and gives it no other meaning. An implementation bounds the length of the reasons it stores; GAP fixes no limit.

No digest domain covers a reason. Including or omitting it changes no profile digest, payload digest, authorization subject digest, or pin. A decision record without a reason is complete.

<a id="releaseapproval"></a>

### Release approval

A release approval records a configured authority's decision that one exact artifact version is approved for release. It is separate from [release authorization](#release-authorization): approval alone releases nothing and confers no release authority. [Step 4](#4-authorize-one-exact-version) defines the authority and approval checks.

The approval binds the artifact ID and version, payload digest, and profile pin. It MUST carry the authorization subject digest computed from those fields. A recorded approval is immutable and cannot be reused for a different version, payload, or profile.

The record names the approving actor in `approvedBy` and MAY carry a [reason](#reason) and that actor's [authority signature](#authority-signature) over the subject digest under the `approve-release` domain. A [release proof](#release-proof) can carry approvals recorded for its subject.

Evidence of what the approver reviewed beyond the approved subject remains [outside this draft](../../DEFERRED.md#approval-evidence-beyond-the-subject).

```ts
type ReleaseApproval = {
  artifactId: string;
  artifactVersion: number;
  payloadDigest: Sha256Digest;
  profile: ProfilePin;
  approvedAt: string;
  approvedBy: Actor;
  reason?: string;
  authorizationSubjectDigest: Sha256Digest;
  authoritySignature?: AuthoritySignature;
};
```

<a id="releaserejection"></a>

### Release rejection

A release rejection records a configured approval authority's decision that one exact artifact version is not approved for release. The same authority governs [approvals](#release-approval) and rejections.

The rejection binds the artifact ID and version, payload digest, and profile pin. It MUST carry the authorization subject digest computed from those fields. The record names the deciding actor in `rejectedBy`, MAY carry a [reason](#reason), and MAY carry that actor's [authority signature](#authority-signature) over the subject digest under the `reject-release` domain. A reason helps the author understand what prompted the rejection. An implementation MAY require one, as the CMS reference implementation does.

A rejection MUST NOT release, withdraw, or alter anything and MUST NOT by itself prevent a later approval or authorization of the same subject ([GAP-CORE-013](conformance/README.md#gap-core-013)). It grants and removes no authority. A draft stays a draft; a rejection of a released version is not a [withdrawal](#release-withdrawal). [Step 4](#4-authorize-one-exact-version) defines the decision rules.

A rejection records the authority's decision, without establishing that the content is incorrect. Likewise, approval does not establish correctness ([GAP-CORE-011](conformance/README.md#gap-core-011)). [Release proof](#release-proof) defines which rejections travel with a release, and [step 6](#6-read-and-verify) defines how consumers verify them.

```ts
type ReleaseRejection = {
  artifactId: string;
  artifactVersion: number;
  payloadDigest: Sha256Digest;
  profile: ProfilePin;
  rejectedAt: string;
  rejectedBy: Actor;
  reason?: string;
  authorizationSubjectDigest: Sha256Digest;
  authoritySignature?: AuthoritySignature;
};
```

<a id="releaseauthorization"></a>

### Release authorization

Release authorization is a configured authority's decision to permit release of one exact artifact version. It binds the artifact ID and version, payload digest, and profile pin, covering both the content and the exact profile revision it follows. A decision for a different version, payload, or profile cannot authorize this release. [Step 4](#4-authorize-one-exact-version) defines the required checks.

The record names the authority's actor in `authorizedBy`, MAY carry a [reason](#reason), MAY carry the authorization subject digest defined in [Digests](#digests), and MAY carry that actor's [authority signature](#authority-signature) over the subject digest under the `authorize-release` domain.

```ts
type ReleaseAuthorization = {
  artifactId: string;
  artifactVersion: number;
  payloadDigest: Sha256Digest;
  profile: ProfilePin;
  authorizedAt: string;
  authorizedBy: Actor;
  reason?: string;
  authorizationSubjectDigest?: Sha256Digest;
  authoritySignature?: AuthoritySignature;
};
```

<a id="release-type"></a>

### Release

Release is the transition that makes an authorized artifact version available to read-only consumers. The implementation records the authorization and the release together so a partially completed operation cannot appear as a valid release. Release establishes which content was authorized and made available; it does not establish that a website displayed it, a message was delivered, or another application acted on it. [Step 5](#5-commit-the-release-transition) states the transition requirements.

```ts
type Release = {
  artifactId: string;
  artifactVersion: number;
  profile: ProfilePin;
  payload: Payload;
};
```

#### Release boundary

The release boundary is the read-only interface through which consumers obtain released artifact versions and their proofs. Unratified proposals, draft artifact versions, and working copies are never readable through it. Whatever the application exposes to authors and reviewers internally is outside the boundary.

#### Current release selection

Current release selection is the application's policy for choosing which released version of an artifact to treat as current. GAP preserves every released version and its evidence. The implementation documents its selection policy; GAP does not define one or treat a later release as superseding an earlier one.

Withdrawing the selected release does not select another ([GAP-CORE-013](conformance/README.md#gap-core-013)). The application documents what it serves afterward, and a consumer MUST NOT infer that an earlier released version has become current.

<a id="releasewithdrawal"></a>

### Release withdrawal

Release withdrawal is a configured authority's decision that one exact released version is no longer to be treated as current by the release boundary or consumers.

The withdrawal binds the artifact ID and version, payload digest, and profile pin, together with their [authorization subject digest](#digests). These identify the same subject as the [release authorization](#release-authorization), so the withdrawal applies only to that version.

The record carries the decision time and the authority's actor in `withdrawnBy` and MAY carry a [reason](#reason). A reason helps readers understand why a release they may rely on was withdrawn. When signed, the record carries that actor's [authority signature](#authority-signature) over the subject digest under the `withdraw-release` domain. Consumers can verify a signed withdrawal independently, just as they can a signed release authorization.

The withdrawn version remains an immutable released version. Its authorization and release proof are preserved like those of every released version; an application that reads releases by exact version can still return it, carrying the withdrawal. Withdrawal does not correct or supersede its content or select another version as current. The application defines what the boundary serves afterward through its [current release selection](#current-release-selection) policy; an earlier version does not automatically become current.

[Step 5](#5-commit-the-release-transition) defines how a boundary records and serves a withdrawal. [Step 6](#6-read-and-verify) defines how consumers verify it.

```ts
type ReleaseWithdrawal = {
  artifactId: string;
  artifactVersion: number;
  payloadDigest: Sha256Digest;
  profile: ProfilePin;
  withdrawnAt: string;
  withdrawnBy: Actor;
  reason?: string;
  authorizationSubjectDigest: Sha256Digest;
  authoritySignature?: AuthoritySignature;
};
```

### Release proof

A release proof brings together the released content, its exact profile revision, and its authorization. Consumers verify these records against their configured trust using the checks in [step 6](#6-read-and-verify).

When every decision in a proof carries an [authority signature](#authority-signature), a consumer with a [trust store](#trust-store) can verify those decisions without access to the implementation that recorded them.

A proof MAY carry the [release approvals](#release-approval) and [release rejections](#release-rejection) recorded for the same subject. Step 6 requires each to bind the identical subject as the authorization. A proof that carries any approval MUST also carry every rejection recorded for that subject, so the approval cannot be presented without the recorded rejections.

```ts
type ReleaseProof = {
  release: Release;
  profile: ProfileRevision;
  authorization: ReleaseAuthorization;
  approvals?: ReleaseApproval[];
  rejections?: ReleaseRejection[];
  withdrawal?: ReleaseWithdrawal;
};
```

When a withdrawal has been recorded, the proof MAY carry it in `withdrawal`; a boundary that has recorded one MUST NOT serve the proof without it. See [Release withdrawal](#release-withdrawal).

<figure class="gap-diagram-figure" aria-labelledby="figure-records-title">
<header class="gap-diagram-header">
<h3 id="figure-records-title" class="gap-diagram-title">How the records reference each other</h3>
<p>Core structures across the three planes</p>
</header>

![ProfileProposal becomes an immutable ProfileRevision through ratification of its exact digest. ArtifactVersion pins that revision by profile ID, revision, and digest. ReleaseAuthorization binds the artifact identity, version, payload digest, and profile pin, and the atomic release transition produces the Release. Optional ReleaseApproval records, zero or more, and an optional ReleaseWithdrawal, at most one, bind the same authorization subject digest and travel in the release proof.](diagrams/records.svg)

<figcaption>
<p>Artifact versions pin an exact profile revision. Release decisions bind an exact artifact version and its profile pin.</p>
<p>Approvals are recorded before authorization and a withdrawal after release. Neither changes the authorization or the release; both travel in the release proof. A withdrawal names one released version and leaves it immutable.</p>
<p>Ratification, release authorization, approval, and withdrawal record the configured authority that decided.</p>
<p>Dashed links: the same subject, which step 6 checks.</p>
</figcaption>
</figure>

<a id="primitives"></a><a id="json-values-and-digests"></a>

### JSON types

A JSON value is any JSON scalar, array, or object. A JSON object is a collection of named fields whose values are JSON values. A digest is a SHA-256 fingerprint prefixed with `sha256:`; [Digests](#digests) defines the bytes it covers.

```ts
type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;
type JsonObject = { [key: string]: JsonValue };
type Sha256Digest = `sha256:${string}`;
```

<a id="digest-construction"></a>

### Digests

A digest is a fingerprint computed from content. It cannot be decoded to recover the original payload. Someone can, however, hash a guessed payload and compare the result, making short or predictable payloads easier to identify. A digest does not encrypt content or provide confidentiality; applications must consider this when sharing digests of restricted content.

Canonical JSON means the RFC 8785 JSON Canonicalization Scheme, restricted to strings, booleans, null, safe integers, arrays, and objects, encoded as UTF-8. Non-integer numbers and integers outside JavaScript's safe range are rejected. SHA-256 input is an ASCII domain line, one line-feed byte (`0A`), then the canonical JSON bytes.

```ts
// canonical() is the RFC 8785 JSON of a value as UTF-8 bytes; sha256() renders the hash as "sha256:" + lowercase hex.
function digest(domain: string, value: JsonValue): Sha256Digest {
  return sha256(concat(utf8(domain + "\n"), canonical(value)));
}

const profileDigest = digest("governed-artifact.profile-revision.draft", profileSemantics);
const payloadDigest = digest("governed-artifact.payload.v1", payload);
const authorizationSubjectDigest = digest("governed-artifact.authorization-subject.v1", subject);
```

The profile semantics are the profile ID, revision, and payload contract. Ratification is outside them, so recording a ratification does not change the profile digest or any pin.

Release approval, rejection, authorization, and withdrawal share the same subject format: the canonical object containing exactly `artifactId`, `artifactVersion`, `payloadDigest`, and `profile` (the profile pin). Consumers recompute its digest from the authorization and release records and compare each carried approval, rejection, or withdrawal against it, as required by [step 6](#6-read-and-verify).

An [authority signature](#authority-signature) signs a statement containing the signer ID and subject digest. [Signing](#signing) defines that statement's canonical bytes and action-specific domain line.

The `governed-artifact.*` domain strings are GAP's wire identity. The full name avoids collisions; bare `gap.*` domains are not valid. Verifiers MUST fail closed on domains or structures they do not understand.

<a id="signed-authority-evidence"></a><a id="authoritysignature"></a><a id="authorityaction"></a>

### Authority signature

An authority signature lets a consumer verify that the holder of a trusted signing key signed one exact decision. It binds the signer, the action, and the subject of the decision. The consumer can check it without access to the implementation that recorded the decision. Each of the five authority decisions can carry a signature.

The [actor](#actor) identifies the participant recorded as making the decision. The signer uses that same actor ID, paired with a signing key. A consumer trusts the signer for an action only through its own [trust store](#trust-store), which lists the signer's public key and trusted actions.

```ts
type AuthorityAction =
  | "ratify-profile"
  | "approve-release"
  | "reject-release"
  | "authorize-release"
  | "withdraw-release";
type AuthoritySignature = {
  signerId: string;
  signature: string; // unpadded base64url of exactly 64 bytes
};
```

#### Signing

Signatures use Ed25519 ([RFC 8032](https://www.rfc-editor.org/rfc/rfc8032)), the only supported algorithm. There is no algorithm field or negotiation.

A ratification signs a statement containing the profile digest. A release approval, rejection, authorization, or withdrawal signs a statement containing the authorization subject digest defined in [Digests](#digests). Each statement also names the signer.

Here, a domain is a cryptographic label that keeps bytes used for one purpose separate from bytes used for another. This technique is called domain separation. It is independent of the application domains in the demo and is not a website address.

The signed bytes begin with a fixed string identifying the action, called its domain line, followed by one line-feed byte and the statement's canonical JSON:

```ts
type Statement = {
  signerId: string;
  subjectDigest: Sha256Digest; // the profile digest, or the authorization subject digest
};

function signedBytes(action: AuthorityAction, statement: Statement): Uint8Array {
  return concat(utf8(`governed-artifact.authority.${action}.ed25519.v1\n`), canonical(statement));
}

const bytes = signedBytes(action, { signerId, subjectDigest });
const signature = base64url(ed25519.sign(bytes, privateKey)); // unpadded; exactly 64 bytes
```

The five domains are:

```ts
const signatureDomains: Record<AuthorityAction, string> = {
  "ratify-profile": "governed-artifact.authority.ratify-profile.ed25519.v1",
  "approve-release": "governed-artifact.authority.approve-release.ed25519.v1",
  "reject-release": "governed-artifact.authority.reject-release.ed25519.v1",
  "authorize-release": "governed-artifact.authority.authorize-release.ed25519.v1",
  "withdraw-release": "governed-artifact.authority.withdraw-release.ed25519.v1",
};
```

The domain separates the actions: an approval signature cannot authorize a release, a rejection signature cannot serve as an approval, and an authorization signature cannot withdraw a release. The subject digest binds the signature to the exact revision, version, payload, and profile it covers. The signer ID prevents the signature from being relabelled as another signer's.

Keys and signatures are carried as unpadded base64url ([RFC 4648 section 5](https://www.rfc-editor.org/rfc/rfc4648#section-5)); a decoder MUST reject padding, other alphabets, and values that do not decode to exactly 32 bytes for a key or 64 bytes for a signature.

Adding a signature leaves the record's identity unchanged. The signature is outside every digest GAP defines, so it changes no profile digest, payload digest, subject digest, or pin. The signed and unsigned records identify the same revision or version.

#### Recording

`signerId` MUST equal the actor ID of the record it is on: `ratification.actorId`, `approvedBy.actorId`, `rejectedBy.actorId`, `authorizedBy.actorId`, or `withdrawnBy.actorId`. Before recording a decision that carries a signature, the implementation MUST verify it against its own configured trust store as described under [Verifying](#verifying) and MUST NOT record a signature that does not verify.

The deployment decides who holds signing keys and how signatures are requested. An authority's client can sign and submit the statement, or the deployment can hold keys for its configured authorities. The research reference implementation holds checked-in demonstration keys. GAP cannot detect whether someone used a trusted key without permission.

<a id="truststore"></a>

#### Trust store

A trust store lists one Ed25519 public key per signer and the actions that signer is trusted to perform. The consumer configures it independently of the records it receives. This configuration stays outside the release proof, and a consumer MUST NOT take a key or a trusted action from the proof it is verifying.

This draft supports one static key per signer. Key discovery, several active keys, rotation, revocation, delegation, and binding a decision to one deployment or audience are deferred (see [`DEFERRED.md`](../../DEFERRED.md#authority-key-lifecycle-and-distributed-trust)).

```ts
type TrustStore = {
  [signerId: string]: {
    publicKey: string; // unpadded base64url of exactly 32 bytes
    actions: AuthorityAction[];
  };
};
```

#### Verifying

To verify one authority signature for an action, a verifier MUST, failing closed at the first step that does not hold:

1. require the signature record to carry exactly `signerId` and `signature`;
2. require `signerId` to equal the record's actor ID;
3. resolve `signerId` to exactly one trust store entry whose `actions` include this action;
4. decode that entry's public key and the signature strictly;
5. recompute the subject digest from the record's own fields: the profile digest for a ratification, or the authorization subject digest from `artifactId`, `artifactVersion`, `payloadDigest`, and `profile` for the other four; and
6. verify the Ed25519 signature over the signed bytes for this action, this signer, and the recomputed digest.

A verified signature establishes that the holder of the trusted key signed that decision over exactly that subject. It does not establish:

- when the decision was made: `ratifiedAt`, `approvedAt`, `rejectedAt`, `authorizedAt`, and `withdrawnAt` are the implementation's unsigned times;
- what the signer reviewed beyond the subject;
- which deployment or audience the signer decided for; or
- whether the key was in the right hands.

The consumer repeats the verification independently of the implementation's earlier check. [Step 6](#6-read-and-verify) states when a consumer requires signatures and what it may report.

## Protocol requirements

The core requirements summarize the rules of this draft. Each has a stable identifier, such as `GAP-CORE-001`. They are listed, with their current test coverage, on the [core requirements](conformance/README.md) page. The sections above refine them; where a section states a requirement not listed there, that requirement still applies.

<a id="conformance-evidence"></a>

## Conformance

The reference implementations each exercise their own reading of this draft, and `pnpm check:specification` validates the schemas, examples, and [core requirements](conformance/README.md) that live beside it. Those checks are evidence for this draft. They are not a portable conformance suite; see [`DEFERRED.md`](../../DEFERRED.md) for that and for the other questions intentionally left out of this draft.
