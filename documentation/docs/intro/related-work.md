---
title: Related work
slug: /intro/related-work
description: Related content-generation systems, provenance models, and attestation standards, and how their scope relates to GAP.
---

GAP addresses concerns also found in content-generation systems, provenance models, and attestation standards. This page acknowledges that work and explains how its scope relates to GAP. It is not an exhaustive survey.

GAP defines records and lifecycle rules for releasing structured content under an approved content model. It binds an immutable content version to its exact profile revision and release authorization. Consumers verify those records against configured trust; signed decisions permit independent verification using the consumer's own trust store. GAP does not establish content correctness or downstream execution.

Inclusion does not imply endorsement, compatibility, or implementation of GAP. The relationships below describe the cited sources, not tested integrations.

## Governed generation workflows

### SAGE

**Sediqin et al., *SAGE: Governed Artifact Generation from Enterprise Guidelines* (2026).** [Paper, version 1](https://arxiv.org/html/2609.17775v1).

SAGE describes a pipeline that converts enterprise guideline documents into operational artifacts through multimodal extraction, a shared versioned rule store, structural and semantic evaluation, consistency checks, and selective human review. It shares GAP's concerns with structured content, versioning, provenance, and controlled release.

SAGE specifies how a particular workflow produces and evaluates content. GAP specifies the records and checks for authorizing exact versions and verifying their release. SAGE's extracted instructions are domain content; a GAP profile defines the shape and constraints of such content. The paper does not specify a portable release-proof contract equivalent to GAP's. A SAGE-style pipeline could use GAP at selected release points, but that integration is not described or demonstrated by the paper.

## Attestations and verification

### in-toto

**in-toto project.** [Attestation Framework](https://github.com/in-toto/attestation/blob/fd2609c16bcb0ac53443e2b4612977f997e8f9a5/spec/README.md), [Statement specification](https://github.com/in-toto/attestation/blob/fd2609c16bcb0ac53443e2b4612977f997e8f9a5/spec/v1/statement.md), and [supply-chain specification](https://github.com/in-toto/specification/blob/6459afd8e94a332e423ba05c2862b534acbe741d/in-toto-spec.md).

in-toto provides structured, authenticated evidence about artifacts and supply-chain activities. An attestation Statement identifies artifact subjects by digest and associates them with a typed predicate. The supply-chain specification also describes expected steps, authorized participants, and verification rules. Its overlap with GAP includes exact artifact identity, attributed evidence, and consumer-side verification.

GAP defines a particular lifecycle for structured content: approve a content model, create immutable versions under it, and authorize and release exact versions. in-toto provides a broader attestation framework and supply-chain verification model. A custom predicate could express related decisions, but these sources do not define GAP's profile and release records. GAP currently uses its own record and signature formats, not the in-toto attestation format.

### SLSA

**SLSA project, specification v1.2.** [Overview](https://slsa.dev/spec/v1.2/about), [provenance](https://slsa.dev/spec/v1.2/provenance), and [Verification Summary Attestation](https://slsa.dev/spec/v1.2/verification_summary).

SLSA defines a framework for improving software supply-chain security, including assurance levels, build provenance, and verification guidance. Its Verification Summary Attestation lets a verifier communicate a policy assessment about an artifact. Like GAP, it distinguishes artifact identity, evidence, and the consumer's trust decisions.

SLSA concerns assurance about software source and build processes. GAP concerns release authorization of structured content and the approved profile revision that content follows. A SLSA assessment and a GAP release authorization make different claims: satisfying an assurance policy does not itself authorize a GAP release, and a valid GAP release does not establish a SLSA level.

### W3C Verifiable Credentials

**W3C, *Verifiable Credentials Data Model v2.0* (2025 Recommendation).** [Specification](https://www.w3.org/TR/2025/REC-vc-data-model-2.0-20250515/).

Verifiable Credentials define a model for issuer claims exchanged among issuers, holders, and verifiers, with mechanisms for securing those claims against tampering. The specification explicitly distinguishes verification from the truth of a claim and leaves reliance decisions to verifier policies. Those distinctions also matter for GAP's release proofs.

GAP defines specific decisions and transitions for structured-content profiles, artifact versions, authorization, release, and withdrawal. Verifiable Credentials provide a general claims model rather than that lifecycle. A credential could express an authorization claim, but using credentials to implement GAP would require an explicit mapping; the current GAP draft does not define one.

## Content and research provenance

### C2PA / Content Credentials

**Coalition for Content Provenance and Authenticity, specification 2.3.** [Technical specification](https://spec.c2pa.org/specifications/specifications/2.3/specs/C2PA_Specification.html) and [explainer](https://spec.c2pa.org/specifications/specifications/2.3/explainer/Explainer.html).

C2PA defines signed provenance manifests for digital content, including assertions about its creation, editing, and ingredients. It binds claims to assets and defines validation and trust mechanisms. Its overlap with GAP includes content-bound evidence that a recipient can verify.

C2PA focuses on content provenance and authenticity. GAP focuses on structured JSON content under approved profiles and the decisions authorizing exact releases. A content-provenance claim is not automatically a release authorization, and a GAP release proof does not reconstruct a content-editing history. Neither should be read as a guarantee that the content is true.

### Nanopublications

**Nanopublication community.** [Overview](https://nanopub.net/), [Nanopublication Guidelines, working draft](https://nanopub.net/guidelines/working_draft/), and [signing and publishing implementation documentation](https://nanopublication.github.io/nanopub-py/publishing/publish-nanopublications/).

Nanopublications package small structured assertions with provenance and publication information in RDF. Their tooling supports signed publications and content-derived trusty URIs. They share GAP's concern that structured content should travel with information about its origin and publication.

Nanopublications organize and publish knowledge assertions. GAP defines an approved content model and exact authorization-and-release lifecycle for structured JSON artifacts. Nanopublication attribution and signing should not be equated with GAP's distinct profile-ratification, approval, and release-authorization decisions. Signing and trusty-URI behavior are documented in the tooling cited here, rather than assumed to be requirements of the minimal graph structure.

### RO-Crate

**Research Object community, RO-Crate Metadata Specification 1.2 (2025 Recommendation).** [Specification](https://www.researchobject.org/ro-crate/specification/1.2/), [introduction](https://www.researchobject.org/ro-crate/specification/1.2/introduction.html), and [profiles](https://www.researchobject.org/ro-crate/specification/1.2/profiles.html).

RO-Crate packages data with JSON-LD metadata describing associated resources, people, software, provenance, and reuse conditions. Domain profiles constrain the expected content and metadata to support reliable creation and consumption. These are relevant precedents for portable context and profile-governed content.

An RO-Crate profile establishes conventions for a class of crates. GAP additionally requires a configured authority's approval of an exact profile revision and exact authorization of a content version before release. The RO-Crate sources describe packaging and metadata conventions rather than GAP's release-proof lifecycle. The two uses of "profile" are related but do not have identical semantics.

## Provenance and signing infrastructure

### W3C PROV

**W3C PROV family (2013).** [Overview](https://www.w3.org/TR/prov-overview/) and [PROV-DM](https://www.w3.org/TR/prov-dm/).

PROV provides a general model for describing entities, activities, agents, derivation, and responsibility. It supports interoperable descriptions of how content came to be and who was involved.

GAP defines specific release records and enforcement rules rather than a general provenance ontology. Its dependency sets pin direct governed source versions; they are not a complete account of every activity or source involved in producing content. A provenance description can complement release evidence but does not itself substitute for release authorization.

### SCITT

**IETF, RFC 9943, *An Architecture for Trustworthy and Transparent Digital Supply Chains* (June 2026).** [RFC](https://www.rfc-editor.org/rfc/rfc9943.html).

SCITT defines an architecture for transparency of single-issuer signed statements using verifiable data structures. It addresses registration, receipts, auditability, and interoperability among transparency services. Its overlap with GAP is verifiable evidence about signed statements that can be checked outside the producing workflow.

GAP defines the meaning and binding of profile and release decisions; it does not require a transparency service. A transparency receipt and a release authorization establish different facts. A future integration could register suitable release statements in a transparency service, but GAP currently defines no SCITT mapping or receipt requirement.

### DSSE

**Secure Systems Lab, *Dead Simple Signing Envelope*, protocol 1.0.2 (2024).** [Signing protocol](https://github.com/secure-systems-lab/dsse/blob/b531b787bb3e5f0c3e1c19cee84da1c5d569b061/protocol.md) and [envelope](https://github.com/secure-systems-lab/dsse/blob/b531b787bb3e5f0c3e1c19cee84da1c5d569b061/envelope.md).

DSSE defines a signing protocol and envelope that authenticate both payload bytes and their declared type. It addresses ambiguity in how a signed payload is interpreted. This is relevant to GAP's use of distinct signing domains for different authority decisions.

DSSE leaves payload semantics and release policy to applications. GAP defines those specific decision records and their verification rules using its own digest domains and signature format. GAP does not currently use DSSE, and DSSE is not a drop-in replacement for the draft's signatures.

## Contributing related work

Add work with a concrete relationship to GAP's records, lifecycle, provenance, or trust model. Cite primary sources and identify the version reviewed when available. Describe the contribution, shared concerns, and differences in scope. Distinguish specified behavior from possible integrations, and do not infer compatibility from similar terminology.

This page is explanatory. It adds no protocol requirements and makes no claim about priority or direct influence on GAP's design.
