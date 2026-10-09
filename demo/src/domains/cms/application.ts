/**
 * The blog CMS as a GAP application: its actions, the lifecycle steps and release decisions each
 * performs, and the groups a reader follows them in. The lifecycle, authority,
 * and verification logic is in cms.ts and domain.ts; this file only declares
 * the actions and their inputs.
 */
import { z } from 'zod';
import { defineAction, defineApplication } from '../../gap/index.js';
import {
  createArtifactVersion,
  proposeBlogModel,
  saveBlogPost,
  approvePost,
  previewReleaseApproval,
  publishPost,
  rejectPost,
  listRejections,
  readPost,
  authorizeAndRelease,
  listArtifactVersions,
  listProfileProposals,
  listProfiles,
  listReleaseAuthorityPolicies,
  listReleases,
  inspectGalleryExternalDependencies,
  previewAuthorization,
  previewProfileRatification,
  proposeProfile,
  ratifyProfile,
  readProfileProposal,
  readArtifactVersion,
  readProfileRevision,
  readRelease,
  renderReleasedArticle,
  verifyRenderedArtifact,
  verifyGalleryExternalDependency,
  verifyReleaseProof,
} from './cms.js';
import type { ReleaseProof } from './domain.js';
import { REASON_MAX_CHARACTERS, localCmsCapabilities, validateReason } from './domain.js';
import { applicationId, initializeWorkspace, resetWorkspace } from './workspace.js';

const audience = z.enum(['public', 'members', 'internal']);
const actor = z.object({ actorId: z.string().min(1), actorKind: z.enum(['agent', 'human']) }).strict();
// A decision reason: the authority's plain-language basis, attributed text outside every digest (draft, Primitives).
// The transport applies the domain rule itself, so what the tool accepts is exactly what the store and the verifier accept:
// not blank, and at most REASON_MAX_CHARACTERS characters (counted as code points, not UTF-16 units).
const reason = z.string().superRefine((value, context) => {
  try { validateReason(value, 'reason'); } catch (error) { context.addIssue({ code: 'custom', message: (error as Error).message }); }
}).describe(`plain language, not blank, at most ${REASON_MAX_CHARACTERS} characters`);
const jsonValue = z.json();
const payloadContract = z.record(z.string(), z.unknown());
const profilePin = z.object({ profileId: z.string(), revision: z.number(), digest: z.string() }).strict();
const profile = z.object({
  profileId: z.string(), revision: z.number(), payloadContract, digest: z.string(),
  ratification: z.object({ ratifiedAt: z.string(), actorId: z.string(), actorKind: z.literal('human'), reason: reason.optional() }).strict(),
}).strict();
const authorization = z.object({
  artifactId: z.string(), artifactVersion: z.number(), payloadDigest: z.string(), profile: profilePin,
  authorizedAt: z.string(), authorizedBy: actor, reason: reason.optional(),
  authorizationSubjectDigest: z.string(),
}).strict();
const approval = z.object({
  artifactId: z.string(), artifactVersion: z.number(), payloadDigest: z.string(), profile: profilePin,
  approvedAt: z.string(), approvedBy: actor, reason: reason.optional(),
  authorizationSubjectDigest: z.string(),
}).strict();
const rejection = z.object({
  artifactId: z.string(), artifactVersion: z.number(), payloadDigest: z.string(), profile: profilePin,
  rejectedAt: z.string(), rejectedBy: actor, reason: reason.optional(),
  authorizationSubjectDigest: z.string(),
}).strict();
const release = z.object({ artifactId: z.string(), artifactVersion: z.number(), payload: jsonValue, profile: profilePin }).strict();
const releaseProof = z.object({ profile, authorization, release, approvals: z.array(approval).optional(), rejections: z.array(rejection).optional() }).strict();
const rawRecordSelector = z.discriminatedUnion('recordType', [
  z.object({ recordType: z.literal('profileProposal'), profileId: z.string().min(1), revision: z.number().int().positive() }).strict(),
  z.object({ recordType: z.literal('profileRevision'), profileId: z.string().min(1), revision: z.number().int().positive() }).strict(),
  z.object({ recordType: z.literal('artifactVersion'), artifactId: z.string().min(1), artifactVersion: z.number().int().positive() }).strict(),
  z.object({ recordType: z.literal('releaseProof'), artifactId: z.string().min(1), audience }).strict(),
]);

const BLOG = 'Blog post walkthrough';
const GENERIC = 'Any CMS content model';
const DERIVED = 'Derived content and external dependencies';

export const cmsApplication = defineApplication({
  id: applicationId,
  title: 'Blog CMS',
  summary: 'A content management system for a blog. Writers save drafts, an editor approves or rejects a version, a publisher releases it, and a website reads it back with its proof.',
  docs: { guide: '/domains/blog-website', walkthrough: '/domains/blog-website/demo' },
  groups: [
    { name: BLOG, summary: 'The actions the blog walkthrough uses, from proposing the content model to reading a published post.' },
    { name: GENERIC, summary: 'The lower-level CMS tools the blog actions are built on. They work for any content model: propose and ratify profiles, create versions, authorize and release, read records and proofs.' },
    { name: DERIVED, summary: 'Rendering a released article into a new draft, and checking external image pins. These exercise a non-normative dependency candidate.' },
  ],
  workspace: { initialize: initializeWorkspace, reset: resetWorkspace },
  actions: [
    defineAction({
      name: 'propose_blog_model', title: 'Propose the blog post model', group: BLOG, steps: ['propose-profile'],
      description: 'Propose the domain guide blog-post model: author, the byline date-time, the CMS audience label, and a content map keyed by BCP 47 locale tag that allows en-US, es-US, en-MX, and es-MX; requires en-US and es-MX; and declares es-US falling back to en-US and en-MX to es-MX. Propose the next revision without changing existing profiles or posts. Review and ratify this exact proposal before saving under it; this action does not approve the model.',
      input: { proposedBy: actor },
      run: ({ proposedBy }, { workspaceRoot }) => proposeBlogModel(proposedBy, workspaceRoot),
    }),
    defineAction({
      name: 'save_blog_post', title: 'Save a blog post draft', group: BLOG, steps: ['create-version'],
      description: 'Save an immutable blog-post draft under the ratified model. date is the byline date and time as an RFC 3339 date-time such as 2026-10-26T09:30:00Z; content maps locale tags to a headline and body; a minimal post carries en-US and es-MX. Missing US Spanish falls back to US English; missing Mexican English falls back to Mexican Spanish. Every required locale must be present and only allowed locales are accepted, or nothing is stored. Use expectedVersion 0 for a new ID or the last saved draft version for edits. Locale content is part of the payload, so one later publish covers every locale in the version; there is no per-locale publish. Save preserves history and grants no publish authority.',
      input: {
        artifactId: z.string().min(1), expectedVersion: z.number().int().nonnegative(), author: z.string().min(1).max(5000), date: z.iso.datetime({ offset: true }), audience,
        content: z.record(z.string(), z.object({ headline: z.string().min(1).max(5000), body: z.string().min(1).max(5000) }).strict()), authoredBy: actor,
      },
      run: (input, { workspaceRoot }) => saveBlogPost(input, workspaceRoot),
    }),
    defineAction({
      name: 'preview_release_approval', title: 'Preview a version for approval', group: BLOG, steps: [],
      description: 'Review the exact saved blog-post version an approver is deciding on: identity, version, payload, payload digest, profile pin, subject digest, the configured approval authorities, and the required APPROVE confirmation. This grants no authority and releases nothing.',
      input: { artifactId: z.string().min(1), artifactVersion: z.number().int().positive() },
      run: ({ artifactId, artifactVersion }, { workspaceRoot }) => previewReleaseApproval(artifactId, artifactVersion, workspaceRoot),
    }),
    defineAction({
      name: 'approve_post', title: 'Approve a version', group: BLOG, steps: ['approve-release'],
      description: 'Record a release approval of the exact saved blog-post version reviewed with preview_release_approval, naming the configured approval authority in approvedBy. When the approver states why, carry it as reason: plain language stored on the approval, not evidence that the post is correct, and outside every digest. Approval releases nothing and grants no publish authority; publish_post still needs a configured release authority. Carry the APPROVE confirmation after contextual approval; do not ask for a second approval or transcription.',
      input: { artifactId: z.string().min(1), artifactVersion: z.number().int().positive(), approvedBy: actor, confirmation: z.string().min(1), reason: reason.optional() },
      run: (input, { workspaceRoot }) => approvePost(input, workspaceRoot),
    }),
    defineAction({
      name: 'reject_post', title: 'Reject a version', group: BLOG, steps: ['reject-release'],
      description: 'Record a release rejection: a configured approval authority named in rejectedBy decides that the exact saved blog-post version is not approved. The record binds the version as stored, with its subject digest. This CMS requires a reason: the plain-language basis for not approving, attributed text that is not evidence the post is wrong. Rejecting releases, withdraws, and blocks nothing; a later approval or publish of the same version is still checked only against configured authority, and a proof of that version then carries the rejection beside the approval.',
      input: { artifactId: z.string().min(1), artifactVersion: z.number().int().positive(), rejectedBy: actor, reason },
      run: (input, { workspaceRoot }) => rejectPost(input, workspaceRoot),
    }),
    defineAction({
      name: 'list_post_rejections', title: 'List the rejections of a post', group: BLOG, steps: [],
      description: 'List the release rejections recorded for one blog post: which exact version each binds, who declined, when, and why. A rejection of an unreleased version is readable here and nowhere else; once a version with rejections is published, its proof carries them.',
      input: { artifactId: z.string().min(1) },
      run: ({ artifactId }, { workspaceRoot }) => listRejections(artifactId, workspaceRoot),
    }),
    defineAction({
      name: 'publish_post', title: 'Publish a version', group: BLOG, steps: ['authorize-release', 'release'],
      description: 'Publish the exact saved blog-post version reviewed with preview_release_authorization. A configured release authority supplies authorization and release in one action; the local blog-post policy requires a release approval of this exact version first, and the proof carries that approval. When the publisher states why, carry it as reason: plain language stored on the authorization, not evidence of anything, and outside every digest. Carry the AUTHORIZE preview confirmation after contextual approval; do not ask for a second approval or transcription. This demo permits one released version per post ID and does not publish a website.',
      input: { artifactId: z.string().min(1), artifactVersion: z.number().int().positive(), authorizedBy: actor, confirmation: z.string().min(1), reason: reason.optional() },
      run: (input, { workspaceRoot }) => publishPost(input, workspaceRoot),
    }),
    defineAction({
      name: 'read_post', title: 'Read a published post', group: BLOG, steps: ['verify'],
      description: 'Read one released blog post for the exact audience label, verify its release proof, then select the requested locale or the fallback the profile declares for it. Selection is delivery, not a GAP step: the authorization covers the entire payload, every locale, and the result labels display as not performed or proved. A locale outside the model is refused.',
      input: { artifactId: z.string().min(1), audience, locale: z.string().min(1) },
      run: (input, { workspaceRoot }) => readPost(input, workspaceRoot),
    }),

    defineAction({
      name: 'get_cms_capabilities', title: 'Describe this CMS', group: GENERIC, steps: [],
      description: 'Discover machine-readable implementation-local contract limits, content-audience semantics, storage boundaries, and release-model limits before proposing profiles or describing release state.',
      input: {},
      run: () => localCmsCapabilities(),
    }),
    defineAction({
      name: 'propose_profile', title: 'Propose a profile', group: GENERIC, steps: ['propose-profile'],
      description: 'Create one immutable, non-authoritative profile proposal using the bounded local contract language. Call get_cms_capabilities first for exact supported limits. Proposal never grants authority or advances the ratified head.',
      input: { profileId: z.string().min(1), revision: z.number().int().positive(), payloadContract, proposedBy: actor },
      run: (input, { workspaceRoot }) => proposeProfile(input as Parameters<typeof proposeProfile>[0], workspaceRoot),
    }),
    defineAction({
      name: 'list_profile_proposals', title: 'List profile proposals', group: GENERIC, steps: [],
      description: 'List immutable profile proposals, including unratified proposals.',
      input: {},
      run: (_input, { workspaceRoot }) => listProfileProposals(workspaceRoot),
    }),
    defineAction({
      name: 'get_profile_proposal', title: 'Read a profile proposal', group: GENERIC, steps: [],
      description: 'Read one exact immutable, non-authoritative profile proposal.',
      input: { profileId: z.string().min(1), revision: z.number().int().positive() },
      run: ({ profileId, revision }, { workspaceRoot }) => readProfileProposal(profileId, revision, workspaceRoot),
    }),
    defineAction({
      name: 'preview_profile_ratification', title: 'Preview a proposal for ratification', group: GENERIC, steps: [],
      description: 'Review one exact proposal, its profile digest, configuration audience, seeded release policies, and opaque confirmation. This grants no authority.',
      input: { profileId: z.string().min(1), revision: z.number().int().positive() },
      run: ({ profileId, revision }, { workspaceRoot }) => previewProfileRatification(profileId, revision, workspaceRoot),
    }),
    defineAction({
      name: 'ratify_profile', title: 'Ratify a profile revision', group: GENERIC, steps: ['ratify-profile'],
      description: 'Ratify one exact reviewed proposal under configured attributed-human configuration authority. After the human clearly approves the exact preview in context, carry the opaque preview confirmation yourself; do not require magic wording or ask the human to transcribe it. When the human states why, carry it as reason: plain language stored on the ratification, outside the profile digest, and not evidence of anything.',
      input: { profileId: z.string().min(1), revision: z.number().int().positive(), ratifiedBy: actor, confirmation: z.string().min(1), reason: reason.optional() },
      run: ({ profileId, revision, ratifiedBy, confirmation, reason }, { workspaceRoot }) => ratifyProfile({ profileId, revision, ratifiedBy, confirmation, ...(reason !== undefined ? { reason } : {}) }, workspaceRoot),
    }),
    defineAction({
      name: 'list_profiles', title: 'List ratified profiles', group: GENERIC, steps: [],
      description: 'List ratified CMS profile revisions with exact digest pins; contract bodies are omitted.',
      input: {},
      run: (_input, { workspaceRoot }) => listProfiles(workspaceRoot),
    }),
    defineAction({
      name: 'get_profile_revision', title: 'Read a ratified profile revision', group: GENERIC, steps: [],
      description: 'Read one exact ratified CMS profile revision and its bounded payload contract.',
      input: { profileId: z.string().min(1), revision: z.number().int().positive() },
      run: ({ profileId, revision }, { workspaceRoot }) => readProfileRevision(profileId, revision, workspaceRoot),
    }),
    defineAction({
      name: 'list_release_authority_policies', title: 'List release authority policies', group: GENERIC, steps: [],
      description: 'List the exact local release-authority policies configured by profile revision, actor identity and kind, and application audience. Authorship or confidence never creates authority.',
      input: {},
      run: (_input, { workspaceRoot }) => listReleaseAuthorityPolicies(workspaceRoot),
    }),
    defineAction({
      name: 'create_artifact_version', title: 'Create an artifact version', group: GENERIC, steps: ['create-version'],
      description: 'Create one immutable governed artifact version pinned to an exact or current ratified profile revision. This does not authorize or release it.',
      input: { artifactId: z.string().min(1), artifactVersion: z.number().int().positive(), profileId: z.string().min(1), profileRevision: z.number().int().positive().optional(), payload: jsonValue, authoredBy: actor },
      run: (input, { workspaceRoot }) => createArtifactVersion(input, workspaceRoot),
    }),
    defineAction({
      name: 'get_artifact_version', title: 'Read an artifact version', group: GENERIC, steps: [],
      description: 'Read one exact immutable artifact version inside the authoring boundary. The record does not contain or imply release status; query list_releases or get_release_proof separately before describing it as released.',
      input: { artifactId: z.string().min(1), artifactVersion: z.number().int().positive() },
      run: ({ artifactId, artifactVersion }, { workspaceRoot }) => readArtifactVersion(artifactId, artifactVersion, workspaceRoot),
    }),
    defineAction({
      name: 'list_artifact_versions', title: 'List artifact versions', group: GENERIC, steps: [],
      description: 'List concise immutable artifact-version summaries inside the authoring boundary. This is not a consumer release read.',
      input: {},
      run: (_input, { workspaceRoot }) => listArtifactVersions(workspaceRoot),
    }),
    defineAction({
      name: 'get_raw_record', title: 'Read one raw record', group: GENERIC, steps: [],
      description: 'Retrieve one exact full raw record by identity instead of listing large collections. Artifact records do not imply release status; select releaseProof separately to establish a release.',
      input: {
        recordType: z.enum(['profileProposal', 'profileRevision', 'artifactVersion', 'releaseProof']),
        profileId: z.string().min(1).optional().describe('profileProposal and profileRevision'),
        revision: z.number().int().positive().optional().describe('profileProposal and profileRevision'),
        artifactId: z.string().min(1).optional().describe('artifactVersion and releaseProof'),
        artifactVersion: z.number().int().positive().optional().describe('artifactVersion'),
        audience: audience.optional().describe('releaseProof'),
      },
      run: async (input, { workspaceRoot }) => {
        // The tool takes a flat shape; the selector checks that exactly the fields for that record type were supplied.
        const record = rawRecordSelector.parse(input);
        switch (record.recordType) {
          case 'profileProposal': return readProfileProposal(record.profileId, record.revision, workspaceRoot);
          case 'profileRevision': return readProfileRevision(record.profileId, record.revision, workspaceRoot);
          case 'artifactVersion': return readArtifactVersion(record.artifactId, record.artifactVersion, workspaceRoot);
          case 'releaseProof': return readRelease(record.artifactId, record.audience, workspaceRoot);
        }
      },
    }),
    defineAction({
      name: 'preview_release_authorization', title: 'Preview a version for authorization', group: GENERIC, steps: [],
      description: 'Review the exact artifact identity, version, payload, payload digest, profile pin, subject digest, and required confirmation. This grants no authority.',
      input: { artifactId: z.string().min(1), artifactVersion: z.number().int().positive() },
      run: ({ artifactId, artifactVersion }, { workspaceRoot }) => previewAuthorization(artifactId, artifactVersion, workspaceRoot),
    }),
    defineAction({
      name: 'authorize_and_release', title: 'Authorize and release a version', group: GENERIC, steps: ['authorize-release', 'release'],
      description: 'Atomically create the sole release for one exact reviewed artifact version under a configured authority policy. This implementation cannot replace, supersede, or withdraw an existing release and does not define a current release. After the authority clearly approves the exact preview in context, carry its opaque confirmation yourself; do not require magic wording or ask the human to transcribe it. When the authority states why, carry it as reason: plain language stored on the authorization, outside every digest, and not evidence of anything.',
      input: { artifactId: z.string().min(1), artifactVersion: z.number().int().positive(), authorizedBy: actor, confirmation: z.string().min(1), reason: reason.optional() },
      run: ({ artifactId, artifactVersion, authorizedBy, confirmation, reason }, { workspaceRoot }) => authorizeAndRelease({
        artifactId, artifactVersion, authorizedBy, confirmation, ...(reason !== undefined ? { reason } : {}),
      }, workspaceRoot),
    }),
    defineAction({
      name: 'list_releases', title: 'List releases for an audience', group: GENERIC, steps: ['verify'],
      description: 'List verifiable released artifacts eligible for the exact application audience label. Drafts are never returned.',
      input: { audience },
      run: ({ audience }, { workspaceRoot }) => listReleases(audience, workspaceRoot),
    }),
    defineAction({
      name: 'get_release_proof', title: 'Read a release proof', group: GENERIC, steps: ['verify'],
      description: 'Read one released artifact and its verification records for the exact application audience label. Drafts are never returned.',
      input: { artifactId: z.string().min(1), audience },
      run: ({ artifactId, audience }, { workspaceRoot }) => readRelease(artifactId, audience, workspaceRoot),
    }),
    defineAction({
      name: 'verify_release_proof', title: 'Verify a release proof', group: GENERIC, steps: ['verify'],
      description: 'Verify a supplied CMS release proof by checking exact shapes, references, profile and payload digests, bounded content, and actor attribution.',
      input: { proof: releaseProof },
      run: ({ proof }) => verifyReleaseProof(proof as ReleaseProof),
    }),

    defineAction({
      name: 'render_released_article', title: 'Render a released article', group: DERIVED, steps: ['verify', 'create-version'],
      description: 'Deterministically transform one verified released cms.article into a new immutable draft under the distinct local cms.rendered-article profile. The draft carries a candidate GovernedDependencyPin for the exact source. Rendering does not authorize or release the derivative and does not display it.',
      input: {
        sourceArtifactId: z.string().min(1), sourceAudience: audience, renderedArtifactId: z.string().min(1),
        renderedArtifactVersion: z.number().int().positive(), authoredBy: actor,
      },
      run: (input, { workspaceRoot }) => renderReleasedArticle(input, workspaceRoot),
    }),
    defineAction({
      name: 'verify_rendered_artifact', title: 'Verify a rendered article against its source', group: DERIVED, steps: ['verify'],
      description: 'Verify both release proofs under normative GAP core, exact GovernedDependencyPin matching under the non-normative #91 candidate, and deterministic renderer/template/locale bytes under implementation-local semantics. Returns machine-readable classifications and states that later display was not proved.',
      input: { renderedProof: releaseProof, sourceProof: releaseProof },
      run: ({ renderedProof, sourceProof }) => verifyRenderedArtifact(renderedProof as ReleaseProof, sourceProof as ReleaseProof),
    }),
    defineAction({
      name: 'inspect_gallery_external_dependencies', title: 'Inspect a gallery’s external pins', group: DERIVED, steps: ['verify'],
      description: 'Verify a released cms.external-image-gallery proof, then report every #91 candidate ExternalDependencyPin as unverified because no external bytes were supplied. A pin in a valid release is only a governed claim, not verified external content.',
      input: { galleryProof: releaseProof },
      run: ({ galleryProof }) => inspectGalleryExternalDependencies(galleryProof as ReleaseProof),
    }),
    defineAction({
      name: 'verify_gallery_external_dependency', title: 'Verify one external image pin', group: DERIVED, steps: ['verify'],
      description: 'Verify one released gallery proof, then apply the non-normative #91 ExternalDependencyPin candidate by hashing independently supplied exact raw bytes. Bytes are base64 only for MCP transport; retrieval, availability, and governance of the external content are not proved.',
      input: { galleryProof: releaseProof, imageIndex: z.number().int().nonnegative(), contentBase64: z.string() },
      run: ({ galleryProof, imageIndex, contentBase64 }) => verifyGalleryExternalDependency(galleryProof as ReleaseProof, imageIndex, contentBase64),
    }),
  ],
});
