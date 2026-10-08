> [!WARNING]
> **Draft.** GAP has no published specification version yet. Draft content can change without notice.

# Core requirements

These requirements summarize the rules in the [protocol](../README.md). A rule is listed here when implementations built independently of each other have to agree on it to rely on each other's records. Each has a stable identifier you can cite in issues, tests, and discussions. The draft's sections refine them, and a requirement stated in the draft but not listed here still applies.

Numbers are assigned in the order requirements are added, and a number is never reused. A requirement that is merged into another, or dropped from the draft, is retired rather than deleted: it keeps its number, and its entry says why it was retired and names any requirement that replaces it, so a citation of it still leads somewhere. A number identifies a requirement; it doesn't rank it or place it in the lifecycle. For example, `GAP-CORE-015` covers how profile revisions are numbered, which happens before anything is released, but it was added after the rules about releases.

The coverage for each requirement names test files or validation scripts and describes the assertions they contain. The notes identify limits and gaps; a citation does not mean every part of the requirement has been tested. A requirement that no executable check covers says so, and its notes describe any related checks.

<!-- BEGIN CORE REQUIREMENTS -->

1. **Separated authority** (`GAP-CORE-001`): Proposal and drafting MUST NOT confer ratification or release authority.
2. **Exact authority decision** (`GAP-CORE-002`): Each ratification, release approval, release rejection, release authorization, and release withdrawal MUST record a configured authority's decision for the exact subject digest. A decision for another subject MUST NOT be reused.
3. **Immutable history** (`GAP-CORE-003`): Ratified profile revisions and artifact versions MUST NOT change in place.
4. **Exact profile pin** (`GAP-CORE-004`): Every artifact version MUST name one profile ID, revision, and digest.
5. **Bounded payload** (`GAP-CORE-005`): An artifact version's payload MUST satisfy its pinned profile contract before the version is stored or considered for authorization.
6. **Exact authorization** (`GAP-CORE-006`): Release authorization MUST bind artifact ID, artifact version, payload digest, and exact profile pin.
7. **Atomic release** (`GAP-CORE-007`): Authorization evidence and release output MUST become visible as one recoverable logical transition.
8. **Released-only reads** (`GAP-CORE-008`): Consumers MUST NOT retrieve drafts through the release boundary.
9. **Independent verification** (`GAP-CORE-009`): A release proof MUST contain enough evidence to verify its records against configured trust without relying on a description of the workflow.
10. **Fail closed** (`GAP-CORE-010`): Missing, malformed, incomplete, ambiguous, or mismatched records and evidence MUST be rejected.
11. **Outcome boundary** (`GAP-CORE-011`): A release, and any reason recorded with a decision about it, MUST NOT be represented as proof of downstream execution, delivery, or content correctness.
12. **Dependency baseline** (`GAP-CORE-012`): Dependency sets MUST preserve the exact source baseline in the authorized payload. Verification MUST identify the intended source system and apply the trust configured for that source. Drift checks MUST NOT change the baseline or report unresolved dependencies as verified.
13. **Additive decisions** (`GAP-CORE-013`): A release withdrawal or release rejection MUST add a record and preserve existing records unchanged, including the artifact version, its authorization, and its release proof. A withdrawal MUST NOT make another version current. A rejection MUST NOT release, withdraw, or alter anything, or by itself prevent a later decision on the same subject.
14. **Preserved releases** (`GAP-CORE-014`): A released version's evidence is its release proof and every approval, rejection, and withdrawal recorded for its subject. That evidence MUST be preserved unchanged and MUST remain verifiable without relying on any later release. Releasing a later version, recording a withdrawal, or ratifying a later profile revision MUST NOT alter or delete it.
15. **Sequential revisions** (`GAP-CORE-015`): A profile's ratified revisions MUST be numbered 1, 2, 3, and so on, each number ratified once and none skipped. An implementation MUST refuse to ratify a proposal unless its revision is one greater than the highest ratified revision of that profile, or 1 if none is ratified.

<!-- END CORE REQUIREMENTS -->

## About this coverage

[`core-requirements.json`](core-requirements.json) repeats this list and records, for each requirement, which tests in this repository exercise it.

`pnpm check:specification` confirms that the identifiers run from `GAP-CORE-001` with none missing, that the list on this page matches the manifest, and that every cited test file exists. It does not confirm that a cited test still exercises the requirement; that is maintained by hand.

This is evidence about this repository's own implementations. A conformance suite that someone else could run against an independent implementation is [deferred](../../../DEFERRED.md).
