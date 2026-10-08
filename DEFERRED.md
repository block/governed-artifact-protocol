# Deferred design questions

This ledger preserves questions intentionally excluded from the current Governed Artifact Protocol draft and its reference implementations. Entries are not requirements or scheduled work. Revisit an entry when its trigger occurs or when the maintainers decide to take it up; then resolve it from concrete examples and remove it from this file.

## Authority key lifecycle and distributed trust

- **Why deferred:** The draft's [authority signature](specification/draft/README.md#authority-signature) fixes Ed25519, one static key per configured signer, and verification against one consumer-configured trust store that names each signer's key and trusted actions. It was adopted from an earlier, heavier design (recoverable at commit `d2ff271`) after dropping the server-issued single-use challenge, the audience identifier, and the expiry: the subject digest already binds the exact bytes, and the records a signature attests are immutable, so replay produces the same decision or a refused duplicate. Key discovery, multiple active keys, rotation, revocation, delegation, distributed trust stores, and binding a decision to one deployment or audience were left out.
- **Decide later:** Key discovery, rotation with multiple active keys, revocation semantics and ordering, whether a signed statement should name the deployment or audience it was made for, and verification when the consumer's trust store is not the implementation's.
- **Revisit when:** A deployment must rotate or revoke an authority key without invalidating verifiable history, a consumer must verify against an independently managed trust store, or a real workflow needs the same signer's decision in one deployment not to count in another.
- **Known constraint:** Key lifecycle changes must not alter which artifact, payload, and profile revision an authorization binds or any existing signed statement; verifiers must fail closed on keys or evidence they cannot resolve in configured trust; and an implementation's acceptance of evidence is never itself proof.

## Explicit protocol versioning and negotiation

- **Why deferred:** There is only one draft record and digest format.
- **Decide later:** What declares a version, which component negotiates it, compatibility rules, and migration behavior.
- **Revisit when:** A second incompatible format or independently evolving implementation exists.
- **Known constraint:** Every verifier must fail closed on semantics it does not understand.

## Approval evidence beyond the subject

- **Why deferred:** The draft now defines a release approval that binds the same subject as the release authorization. In the workflow that triggered it, the approver also decided over evidence outside the subject (digests of rendered outputs and acknowledged drift findings). GAP has no portable way to carry that evidence or bind a decision to it, and binding it would need a new digest domain, which this repository changes only in a dedicated pull request.
- **Decide later:** Whether a decision record may carry a domain-separated evidence digest over an implementation-defined evidence object, how that object is carried with a proof, and how a consumer establishes what an approval covered without reading it as a claim about downstream outcomes.
- **Revisit when:** A consumer of a shared release proof needs to check that the evidence bytes it holds are the ones an approver saw, and the maintainers take up the wire-domain change.
- **Known constraint:** Evidence binding must not change the subject digest, any profile digest, payload digest, or pin; verifiers must fail closed on evidence they cannot resolve; and evidence is never proof of a downstream outcome (GAP-CORE-011).

## Assessment and review routing

- **Why deferred:** The draft requires a configured authority’s authorization but does not classify risk or route review.
- **Decide later:** How assessments and policy evidence influence review routing or bounded release eligibility.
- **Revisit when:** An example needs review routing or automatic-release eligibility.
- **Known constraint:** Assessment is evidence, not authority; it cannot substitute for configured authority authorization or an independently verified grant.

## Bounded or delegated authority grants

- **Why deferred:** The current draft proves exact configured-authority ratification and release decisions but does not model a portable, accepted grant for recurring actions; the current demos do not establish generic recurring-grant semantics.
- **Decide later:** A generic grant envelope and verification chain, including exact grantee identity, action/source/target/audience scope, constraints, validity, acceptance and revocation ordering, trust verification, reuse limits, and chaining to the exact resulting release. Domain-specific constraints remain profile semantics.
- **Revisit when:** A real workflow requires interoperable recurring delegation. The CMS context-bound release policy provides one bounded-authority scenario to draw on when that happens.
- **Known constraint:** Access, authorship, routing, confidence, or assessment is never authority. Wrong-scope, unaccepted, not-yet-valid, expired, revoked, signer/trust-mismatched, modified, or reused grants must fail closed, and implementation-specific grants must not masquerade as portable GAP evidence.


## Distributed record stores and replication

- **Why deferred:** Portable digest verification does not require multiple writable stores, and the current examples use one trusted record store.
- **Decide later:** Authority across stores, replication protocol, conflict and ordering rules, and synchronization failure behavior.
- **Revisit when:** A second independent store actually needs to hold GAP records.
- **Known constraint:** Distribution must preserve exact record bytes and fail-closed verification.

## Artifact lineage and supersession

- **Why deferred:** The research demo corrects source content through successive versions, but no implemented example carries portable correction or supersession relationships. Withdrawal of one exact release without a replacement is now defined in the draft ([Release withdrawal](specification/draft/README.md#release-withdrawal)); this entry covers only correction and supersession.
- **Decide later:** Amendment and supersession references, lineage verification, and how consumers discover the current record without erasing history.
- **Revisit when:** The first real correction workflow needs linked released artifacts.
- **Known constraint:** A correction must not mutate already-authorized content in place, and a withdrawal must not be read as a correction, a supersession, or a selection of another version.

## Versioned release-proof lookup

- **Why deferred:** The draft requires every released version and its release evidence to be [preserved](specification/draft/README.md#5-commit-the-release-transition), and a release-proof lookup to resolve one exact released version and never select among several ambiguously. It does not require an implementation to return an earlier release, and an application may expose only the release it treats as current. The draft also does not standardize how a caller names a version or discovers the released versions of an artifact. The demo applications answer this locally. The [research publishing walkthrough](documentation/docs/domains/research/demo.mdx#5-correct-a-source-during-review) releases two versions of its source study, and its `read_research` tool distinguishes an exact historical read, which passes `artifactVersion`, from a selected-version read, which omits it and returns the version the application treats as current. The [issue tracking walkthrough](documentation/docs/domains/issue-tracking/demo.mdx) releases successive ticket versions the same way. Those are application choices, not a portable contract.
- **Decide later:** Two questions. Exact-version retrieval: whether an implementation must return the proof for an earlier release when a caller names its exact version, and whether release-proof identity always includes the artifact version in a portable lookup. Discovery: how callers discover the released versions of one artifact, and how a consumer learns which version an application selects as current without that selection being mistaken for a protocol rule.
- **Revisit when:** Two independently built implementations need to exchange or resolve proofs for an artifact with more than one released version, or a consumer needs to verify a historical version it did not receive directly from the releasing application.
- **Known constraint:** A proof lookup must resolve one exact authorized release and must never select a version ambiguously. Neither answer may weaken preservation: every released version and its evidence stay preserved and verifiable whether or not an interface returns them. Current-release selection remains an application policy the draft does not standardize.

## Portable conformance suite

- **Why deferred:** The repository’s executable evidence is its own reference-implementation tests and `pnpm check:specification`. Neither can be run against an independent implementation without trusting this repository’s code.
- **Decide later:** The form, location, and coverage of a portable conformance suite that independent implementations can run on their own, including the stateful demonstrations that static examples cannot express: an authority signing with a client-held key, an implementation refusing to record a signature it cannot verify, and a boundary refusing to serve a stored decision whose signature no longer verifies.
- **Revisit when:** An external implementer needs portable conformance evidence, or specification behavior changes in a way prose alone cannot pin down.
- **Known constraint:** `pnpm check:specification` verifies every [authority signature](specification/draft/README.md#authority-signature) in the maintained examples and rejects stripped, altered, cross-action, and untrusted ones, but only over this repository's records and demo keys. A future suite must not turn one implementation’s choices, such as the research deployment holding its authorities' keys, into protocol truth.

## Archiving, hiding, and deletion

- **Why deferred:** The draft defines withdrawal of one released version and requires preservation of released content and evidence. It does not define portable archive, hide, or delete decisions. An application's choice to omit content from its current view is already distinct from withdrawal.
- **Decide later:** Whether these actions need interoperable decision records, what each would mean to a consumer, and how discovery and access policy interact with preserved history.
- **Revisit when:** A concrete workflow needs to communicate one of these decisions across independently built applications.
- **Known constraint:** Local visibility policy must not be mistaken for a GAP withdrawal. Any future decision must preserve the draft's immutable released records and must not silently change the current-release selection rules.
