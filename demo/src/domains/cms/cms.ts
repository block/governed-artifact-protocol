import { createHash } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import {
  BLOG_PROFILE_ID, LOCALE_TAG_PATTERN, PROFILE_AUTHORITY_AUDIENCE, RENDERED_ARTICLE_PROFILE_ID, type Actor, type ArticlePayload, type Audience, type CmsWorkspace,
  type ExternalDependencyPin, type GalleryPayload, type GovernedDependencyPin, type BlogPostContent, type BlogPostPayload, type JsonValue, type PayloadContract, type RenderedArtifactPayload,
  type ProfilePin, type ProfileProposal, type ProfileRevision, type ReleaseApproval, type ReleaseAuthorization, type ReleaseProof, type ReleaseRejection, authorizationSubjectDigest, exactPin,
  payloadAudience, payloadDigest, profileDigest, samePin, validatePayload, validatePayloadContract, validateDependencySet, validateReason, withOptionalReason,
 canonicalJson } from './domain.js';
import { initializeWorkspace, readWorkspace, workspacePath, writeWorkspace } from './workspace.js';

function isCmsWorkspace(value: Record<string, unknown>): value is unknown & CmsWorkspace {
  return value.workspaceFormat === 'local-reference-v1' && value.application === 'cms' &&
    Array.isArray(value.profileProposals) && Array.isArray(value.profileRatificationAuthorities) && Array.isArray(value.profiles) &&
    Array.isArray(value.releaseAuthorityPolicies) && Array.isArray(value.releaseApprovalAuthorities) && Array.isArray(value.artifacts) &&
    Array.isArray(value.approvals) && Array.isArray(value.authorizations) && Array.isArray(value.releases) && Array.isArray(value.rejections);
}
export async function loadCmsWorkspace(root?: string): Promise<CmsWorkspace> {
  await initializeWorkspace(root); const value = await readWorkspace(root);
  if (!isCmsWorkspace(value)) throw new Error('workspace does not match the GAP CMS format'); return value;
}
function validActor(actor: Actor, label: string) {
  if (!actor.actorId || !['agent', 'human'].includes(actor.actorKind)) throw new Error(`${label} must be a well-formed actor`);
}
function findProfile(workspace: CmsWorkspace, profileId: string, revision?: number): ProfileRevision {
  const candidates = workspace.profiles.filter((profile) => profile.profileId === profileId && (revision === undefined || profile.revision === revision));
  if (candidates.length === 0) throw new Error(`ratified profile not found: ${profileId}${revision ? ` revision ${revision}` : ''}`);
  const identities = new Set(candidates.map((profile) => `${profile.profileId}\u0000${profile.revision}`));
  if (identities.size !== candidates.length) throw new Error(`ambiguous ratified profile: ${profileId}${revision ? ` revision ${revision}` : ''}`);
  if (revision === undefined) candidates.sort((a, b) => b.revision - a.revision);
  const profile = candidates[0]!; validatePayloadContract(profile.payloadContract);
  if (profile.digest !== profileDigest(profile)) throw new Error(`profile digest mismatch: ${profile.profileId} revision ${profile.revision}`);
  if (profile.ratification.actorKind !== 'human' || !profile.ratification.actorId) throw new Error('this local CMS policy requires profile ratification to be attributed to a human');
  return profile;
}
function findProposal(workspace: CmsWorkspace, profileId: string, revision: number): ProfileProposal {
  const matches = workspace.profileProposals.filter((proposal) => proposal.profileId === profileId && proposal.revision === revision);
  if (matches.length !== 1) throw new Error(matches.length ? `ambiguous profile proposal: ${profileId} revision ${revision}` : `profile proposal not found: ${profileId} revision ${revision}`);
  validatePayloadContract(matches[0]!.payloadContract); return matches[0]!;
}
export async function proposeProfile(input: { profileId: string; revision: number; payloadContract: PayloadContract; proposedBy: Actor }, root?: string) {
  if (!input.profileId) throw new Error('profileId must be non-empty');
  if (!Number.isSafeInteger(input.revision) || input.revision <= 0) throw new Error('profile revision must be a positive integer');
  validActor(input.proposedBy, 'proposedBy'); validatePayloadContract(input.payloadContract);
  const workspace = await loadCmsWorkspace(root);
  if (workspace.profileProposals.some((item) => item.profileId === input.profileId && item.revision === input.revision)) throw new Error(`immutable profile proposal already exists: ${input.profileId} revision ${input.revision}; inspect it with get_profile_proposal and ratify it, or choose a different profileId`);
  if (workspace.profiles.some((item) => item.profileId === input.profileId && item.revision === input.revision)) throw new Error(`immutable profile revision already exists: ${input.profileId} revision ${input.revision}; propose the next revision instead`);
  const highest = Math.max(0, ...workspace.profiles.filter((item) => item.profileId === input.profileId).map((item) => item.revision));
  const exactRevision = workspace.profiles.filter((profile) => profile.profileId === input.profileId && profile.revision === highest);
  if (exactRevision.length > 1) throw new Error(`ambiguous ratified profile: ${input.profileId} revision ${highest}`);
  const pending = workspace.profileProposals.find((item) => item.profileId === input.profileId &&
    !workspace.profiles.some((profile) => profile.profileId === item.profileId && profile.revision === item.revision));
  if (pending) throw new Error(`profile ${input.profileId} already has immutable unratified proposal revision ${pending.revision}; inspect and ratify it before proposing revision ${pending.revision + 1}, or use a different profileId`);
  if (input.revision !== highest + 1) throw new Error(`profile proposal must use next revision ${highest + 1}`);
  const proposal = structuredClone(input);
  await writeWorkspace({ ...workspace, profileProposals: [...workspace.profileProposals, proposal] }, root); return proposal;
}
export async function listProfileProposals(root?: string) {
  return (await loadCmsWorkspace(root)).profileProposals.map((proposal) => structuredClone(proposal)).sort((a, b) => a.profileId.localeCompare(b.profileId) || a.revision - b.revision);
}
export async function readProfileProposal(profileId: string, revision: number, root?: string) { return structuredClone(findProposal(await loadCmsWorkspace(root), profileId, revision)); }
function localReleasePolicies(profile: ProfilePin) {
  return [
    { profile, authority: { actorId: '*', actorKind: 'human' as const }, audiences: ['public', 'members', 'internal'] as Audience[] },
    { profile, authority: { actorId: 'agent:local-publisher', actorKind: 'agent' as const }, audiences: ['public', 'members', 'internal'] as Audience[] },
  ];
}
export async function previewProfileRatification(profileId: string, revision: number, root?: string) {
  const proposal = findProposal(await loadCmsWorkspace(root), profileId, revision); const subjectDigest = profileDigest(proposal);
  return { proposal, subjectDigest, authorityAudience: PROFILE_AUTHORITY_AUDIENCE, releaseAuthorityPolicies: localReleasePolicies({ profileId, revision, digest: subjectDigest }), confirmation: `RATIFY ${profileId} revision ${revision} ${subjectDigest}` };
}
export async function ratifyProfile(input: { profileId: string; revision: number; ratifiedBy: Actor; confirmation: string; ratifiedAt?: string; reason?: string }, root?: string) {
  validActor(input.ratifiedBy, 'ratifiedBy'); if (input.ratifiedBy.actorKind !== 'human') throw new Error('this local CMS policy requires profile ratification to be attributed to a human');
  if (input.reason !== undefined) validateReason(input.reason, 'ratification reason');
  const preview = await previewProfileRatification(input.profileId, input.revision, root);
  if (input.confirmation !== preview.confirmation) throw new Error('ratification confirmation does not exactly match preview');
  const workspace = await loadCmsWorkspace(root);
  const configured = workspace.profileRatificationAuthorities.some((item) => item.audience === PROFILE_AUTHORITY_AUDIENCE && item.authority.actorKind === 'human' && (item.authority.actorId === '*' || item.authority.actorId === input.ratifiedBy.actorId));
  if (!configured) throw new Error(`actor is not configured to ratify profiles for audience ${PROFILE_AUTHORITY_AUDIENCE}`);
  if (workspace.profiles.some((item) => item.profileId === input.profileId && item.revision === input.revision)) throw new Error(`profile revision already ratified: ${input.profileId} revision ${input.revision}`);
  // Ratification takes the next number, one above the highest ratified revision (draft, step 2), so ratified revisions run 1, 2, 3 with none skipped.
  const next = 1 + Math.max(0, ...workspace.profiles.filter((item) => item.profileId === input.profileId).map((item) => item.revision));
  if (input.revision !== next) throw new Error(`profile ${input.profileId} can ratify only its next revision ${next}, not revision ${input.revision}; propose the change again as revision ${next}`);
  // The reason is attributed text beside the actor; ratification is outside the profile digest, so it changes no pin.
  const revision: ProfileRevision = { profileId: preview.proposal.profileId, revision: preview.proposal.revision, payloadContract: structuredClone(preview.proposal.payloadContract), digest: preview.subjectDigest, ratification: { ratifiedAt: input.ratifiedAt ?? new Date().toISOString(), actorId: input.ratifiedBy.actorId, actorKind: 'human', ...(input.reason !== undefined ? { reason: input.reason } : {}) } };
  const policies = localReleasePolicies(exactPin(revision));
  await writeWorkspace({ ...workspace, profiles: [...workspace.profiles, revision], releaseAuthorityPolicies: [...workspace.releaseAuthorityPolicies, ...policies] }, root);
  return { profile: revision, releaseAuthorityPolicies: policies };
}
export async function createArtifactVersion(input: { artifactId: string; artifactVersion: number; profileId: string; profileRevision?: number; payload: JsonValue; authoredBy: Actor }, root?: string) {
  if (!input.artifactId) throw new Error('artifactId must be non-empty'); if (!Number.isSafeInteger(input.artifactVersion) || input.artifactVersion <= 0) throw new Error('artifactVersion must be a positive integer'); validActor(input.authoredBy, 'authoredBy');
  const workspace = await loadCmsWorkspace(root);
  if (workspace.artifacts.some((item) => item.artifactId === input.artifactId && item.artifactVersion === input.artifactVersion)) throw new Error(`artifact version already exists: ${input.artifactId} v${input.artifactVersion}`);
  const profile = findProfile(workspace, input.profileId, input.profileRevision); validatePayload(input.payload, profile.payloadContract);
  const artifact = { artifactId: input.artifactId, artifactVersion: input.artifactVersion, payload: structuredClone(input.payload), profile: exactPin(profile), authoredBy: input.authoredBy };
  await writeWorkspace({ ...workspace, artifacts: [...workspace.artifacts, artifact] }, root); return artifact;
}
export async function previewAuthorization(artifactId: string, artifactVersion: number, root?: string) {
  const workspace = await loadCmsWorkspace(root); const artifact = workspace.artifacts.find((item) => item.artifactId === artifactId && item.artifactVersion === artifactVersion);
  if (!artifact) throw new Error(`artifact version not found: ${artifactId} v${artifactVersion}`); const digest = payloadDigest(artifact.payload);
  const subject = { artifactId, artifactVersion, payloadDigest: digest, profile: artifact.profile }; const subjectDigest = authorizationSubjectDigest(subject);
  return { ...subject, payload: artifact.payload, authorizationSubjectDigest: subjectDigest, confirmation: `AUTHORIZE ${artifactId} v${artifactVersion} ${subjectDigest}` };
}
function authorityPolicy(workspace: CmsWorkspace, profile: ProfilePin, audience: Audience, actor: Actor) {
  return workspace.releaseAuthorityPolicies.find((policy) => samePin(policy.profile, profile) && (policy.authority.actorId === '*' || policy.authority.actorId === actor.actorId) && policy.authority.actorKind === actor.actorKind && policy.audiences.includes(audience));
}
export async function listReleaseAuthorityPolicies(root?: string) { return structuredClone((await loadCmsWorkspace(root)).releaseAuthorityPolicies); }

// --- release approval (draft, step 4 and Release approval) ---
// Local policy: a content model with any configured approval authority requires a release approval before release.
// Approval authority and release authority are configured separately; holding one grants nothing about the other.
function approvalAuthorities(workspace: CmsWorkspace, profileId: string) {
  return workspace.releaseApprovalAuthorities.filter((item) => item.profileId === '*' || item.profileId === profileId);
}
function approvalAuthority(workspace: CmsWorkspace, profileId: string, actor: Actor) {
  return approvalAuthorities(workspace, profileId).find((item) => item.authority.actorKind === actor.actorKind && (item.authority.actorId === '*' || item.authority.actorId === actor.actorId));
}
type AuthorizationSubject = Pick<ReleaseAuthorization, 'artifactId' | 'artifactVersion' | 'payloadDigest' | 'profile' | 'authorizationSubjectDigest'>;
function approvalBindsSubject(approval: ReleaseApproval, subject: AuthorizationSubject): boolean {
  return approval.artifactId === subject.artifactId && approval.artifactVersion === subject.artifactVersion && approval.payloadDigest === subject.payloadDigest &&
    samePin(approval.profile, subject.profile) && approval.authorizationSubjectDigest === subject.authorizationSubjectDigest;
}
/** Stored approvals that bind exactly the subject computed from stored bytes. A stored approval for that version that does not bind, or whose approver is not configured, fails closed. */
function bindingApprovals(workspace: CmsWorkspace, subject: AuthorizationSubject): ReleaseApproval[] {
  const stored = workspace.approvals.filter((item) => item.artifactId === subject.artifactId && item.artifactVersion === subject.artifactVersion);
  for (const approval of stored) {
    if (!approvalBindsSubject(approval, subject)) throw new Error(`stored release approval does not bind the stored artifact version ${subject.artifactId} v${subject.artifactVersion}`);
    if (!approvalAuthority(workspace, subject.profile.profileId, approval.approvedBy)) throw new Error(`stored release approval names an actor who is not a configured approval authority for ${subject.profile.profileId}`);
  }
  return stored;
}
type SubjectDecision = Pick<ReleaseApproval, 'artifactId' | 'artifactVersion' | 'payloadDigest' | 'profile' | 'authorizationSubjectDigest'>;
function decisionBindsSubject(decision: SubjectDecision, subject: AuthorizationSubject): boolean {
  return decision.artifactId === subject.artifactId && decision.artifactVersion === subject.artifactVersion && decision.payloadDigest === subject.payloadDigest &&
    samePin(decision.profile, subject.profile) && decision.authorizationSubjectDigest === subject.authorizationSubjectDigest;
}
/** Stored rejections that bind exactly the stored subject. Like approvals they fail closed; unlike approvals they gate nothing, so the proof carries them for the record only. */
function bindingRejections(workspace: CmsWorkspace, subject: AuthorizationSubject): ReleaseRejection[] {
  const stored = workspace.rejections.filter((item) => item.artifactId === subject.artifactId && item.artifactVersion === subject.artifactVersion);
  for (const rejection of stored) {
    if (!decisionBindsSubject(rejection, subject)) throw new Error(`stored release rejection does not bind the stored artifact version ${subject.artifactId} v${subject.artifactVersion}`);
    if (!approvalAuthority(workspace, subject.profile.profileId, rejection.rejectedBy)) throw new Error(`stored release rejection names an actor who is not a configured approval authority for ${subject.profile.profileId}`);
  }
  return stored;
}
export async function previewReleaseApproval(artifactId: string, artifactVersion: number, root?: string) {
  const workspace = await loadCmsWorkspace(root); const artifact = workspace.artifacts.find((item) => item.artifactId === artifactId && item.artifactVersion === artifactVersion);
  if (!artifact) throw new Error(`artifact version not found: ${artifactId} v${artifactVersion}`); const digest = payloadDigest(artifact.payload);
  const subject = { artifactId, artifactVersion, payloadDigest: digest, profile: artifact.profile }; const subjectDigest = authorizationSubjectDigest(subject);
  // The confirmation names the action so an approval confirmation cannot be replayed as a publish confirmation.
  return { ...subject, payload: artifact.payload, authorizationSubjectDigest: subjectDigest, releaseApprovalAuthorities: structuredClone(approvalAuthorities(workspace, artifact.profile.profileId)), confirmation: `APPROVE ${artifactId} v${artifactVersion} ${subjectDigest}` };
}
export async function approveRelease(input: { artifactId: string; artifactVersion: number; approvedBy: Actor; confirmation: string; approvedAt?: string; reason?: string }, root?: string): Promise<ReleaseApproval> {
  validActor(input.approvedBy, 'approvedBy'); if (input.reason !== undefined) validateReason(input.reason, 'approval reason'); const preview = await previewReleaseApproval(input.artifactId, input.artifactVersion, root);
  if (input.confirmation !== preview.confirmation) throw new Error('approval confirmation does not exactly match preview'); const workspace = await loadCmsWorkspace(root);
  const artifact = workspace.artifacts.find((item) => item.artifactId === input.artifactId && item.artifactVersion === input.artifactVersion)!;
  if (!approvalAuthority(workspace, artifact.profile.profileId, input.approvedBy)) throw new Error(`actor is not configured to approve release for ${artifact.profile.profileId}`);
  // Local policy: an approval records a decision made before release. Once the version is released, a new approval would read as evidence that never gated publication.
  if (workspace.releases.some((item) => item.artifactId === input.artifactId && item.artifactVersion === input.artifactVersion)) throw new Error(`release approval refused: ${input.artifactId} v${input.artifactVersion} is already released`);
  // Local choice: one approval per actor per version. The record is immutable, so a second decision by the same actor would only duplicate it.
  if (workspace.approvals.some((item) => item.artifactId === input.artifactId && item.artifactVersion === input.artifactVersion && item.approvedBy.actorId === input.approvedBy.actorId && item.approvedBy.actorKind === input.approvedBy.actorKind)) throw new Error(`release approval already recorded by ${input.approvedBy.actorId} for ${input.artifactId} v${input.artifactVersion}`);
  const approval: ReleaseApproval = { artifactId: artifact.artifactId, artifactVersion: artifact.artifactVersion, payloadDigest: preview.payloadDigest, profile: artifact.profile, approvedAt: input.approvedAt ?? new Date().toISOString(), approvedBy: input.approvedBy, ...(input.reason !== undefined ? { reason: input.reason } : {}), authorizationSubjectDigest: preview.authorizationSubjectDigest };
  // Approving releases nothing: only the approvals collection changes.
  await writeWorkspace({ ...workspace, approvals: [...workspace.approvals, approval] }, root); return structuredClone(approval);
}
/** Record a release rejection: a configured approval authority's decision that one exact version is not approved (draft, Release rejection).
 *  It binds the stored subject like an approval, and releases, withdraws, and blocks nothing: a later approval or authorization of the same
 *  version is still checked only against configured authority. Local policy requires a reason; GAP leaves it optional. */
export async function rejectRelease(input: { artifactId: string; artifactVersion: number; rejectedBy: Actor; reason: string; rejectedAt?: string }, root?: string): Promise<ReleaseRejection> {
  validActor(input.rejectedBy, 'rejectedBy');
  if (input.reason === undefined) throw new Error('a rejection requires a reason: say why the version was not approved'); validateReason(input.reason, 'rejection reason');
  // No confirmation string: the confirmation guards decisions that release or gate a release, and a rejection does neither. The record still binds the stored bytes.
  const preview = await previewReleaseApproval(input.artifactId, input.artifactVersion, root); const workspace = await loadCmsWorkspace(root);
  const artifact = workspace.artifacts.find((item) => item.artifactId === input.artifactId && item.artifactVersion === input.artifactVersion)!;
  if (!approvalAuthority(workspace, artifact.profile.profileId, input.rejectedBy)) throw new Error(`actor is not configured to approve release for ${artifact.profile.profileId}`);
  if (workspace.releases.some((item) => item.artifactId === input.artifactId && item.artifactVersion === input.artifactVersion)) throw new Error(`release rejection refused: ${input.artifactId} v${input.artifactVersion} is already released; a rejection is not a withdrawal`);
  if (workspace.rejections.some((item) => item.artifactId === input.artifactId && item.artifactVersion === input.artifactVersion && item.rejectedBy.actorId === input.rejectedBy.actorId && item.rejectedBy.actorKind === input.rejectedBy.actorKind)) throw new Error(`release rejection already recorded by ${input.rejectedBy.actorId} for ${input.artifactId} v${input.artifactVersion}`);
  const rejection: ReleaseRejection = { artifactId: artifact.artifactId, artifactVersion: artifact.artifactVersion, payloadDigest: preview.payloadDigest, profile: artifact.profile, rejectedAt: input.rejectedAt ?? new Date().toISOString(), rejectedBy: input.rejectedBy, reason: input.reason, authorizationSubjectDigest: preview.authorizationSubjectDigest };
  // Rejecting changes no lifecycle state: only the rejections collection changes.
  await writeWorkspace({ ...workspace, rejections: [...workspace.rejections, rejection] }, root); return structuredClone(rejection);
}
export async function listRejections(artifactId: string, root?: string): Promise<ReleaseRejection[]> {
  return structuredClone((await loadCmsWorkspace(root)).rejections.filter((item) => item.artifactId === artifactId));
}
export async function authorizeAndRelease(input: { artifactId: string; artifactVersion: number; authorizedBy: Actor; confirmation: string; authorizedAt?: string; reason?: string }, root?: string): Promise<ReleaseProof> {
  validActor(input.authorizedBy, 'authorizedBy'); if (input.reason !== undefined) validateReason(input.reason, 'authorization reason'); const preview = await previewAuthorization(input.artifactId, input.artifactVersion, root);
  if (input.confirmation !== preview.confirmation) throw new Error('authorization confirmation does not exactly match preview'); const workspace = await loadCmsWorkspace(root);
  const artifact = workspace.artifacts.find((item) => item.artifactId === input.artifactId && item.artifactVersion === input.artifactVersion)!; const audience = payloadAudience(artifact.payload);
  if (!authorityPolicy(workspace, artifact.profile, audience, input.authorizedBy)) throw new Error(`actor is not configured to authorize release for ${artifact.profile.profileId} revision ${artifact.profile.revision} and audience ${audience}`);
  if (workspace.releases.some((item) => item.artifactId === input.artifactId)) throw new Error(`artifact ${input.artifactId} already has its one supported release; this local implementation cannot replace, supersede, or withdraw it and does not define a current release`);
  // The subject digest covers the four subject fields only; the reason sits beside the actor and never enters it.
  const authorization: ReleaseAuthorization = { artifactId: artifact.artifactId, artifactVersion: artifact.artifactVersion, payloadDigest: preview.payloadDigest, profile: artifact.profile, authorizedAt: input.authorizedAt ?? new Date().toISOString(), authorizedBy: input.authorizedBy, ...(input.reason !== undefined ? { reason: input.reason } : {}), authorizationSubjectDigest: preview.authorizationSubjectDigest };
  // The approval requirement is checked against the subject computed from stored bytes, not the request.
  const approvals = bindingApprovals(workspace, authorization); const rejections = bindingRejections(workspace, authorization);
  if (approvalAuthorities(workspace, artifact.profile.profileId).length > 0 && approvals.length === 0) throw new Error(`publish requires a release approval of this exact version: ${artifact.artifactId} v${artifact.artifactVersion}`);
  const release = { artifactId: artifact.artifactId, artifactVersion: artifact.artifactVersion, payload: artifact.payload, profile: artifact.profile };
  const profile = findProfile(workspace, artifact.profile.profileId, artifact.profile.revision);
  await writeWorkspace({ ...workspace, authorizations: [...workspace.authorizations, authorization], releases: [...workspace.releases, release] }, root);
  return { profile, authorization, release, ...(approvals.length > 0 ? { approvals: structuredClone(approvals) } : {}), ...(rejections.length > 0 ? { rejections: structuredClone(rejections) } : {}) };
}
export async function listProfiles(root?: string): Promise<ProfilePin[]> { const workspace = await loadCmsWorkspace(root); return workspace.profiles.map((item) => exactPin(findProfile(workspace, item.profileId, item.revision))).sort((a, b) => a.profileId.localeCompare(b.profileId) || a.revision - b.revision); }
export async function readProfileRevision(profileId: string, revision: number, root?: string) { return structuredClone(findProfile(await loadCmsWorkspace(root), profileId, revision)); }
export async function listArtifactVersions(root?: string) { return (await loadCmsWorkspace(root)).artifacts.map(({ artifactId, artifactVersion, authoredBy, profile }) => ({ artifactId, artifactVersion, authoredBy, profile })).sort((a, b) => a.artifactId.localeCompare(b.artifactId) || a.artifactVersion - b.artifactVersion); }
export async function readArtifactVersion(artifactId: string, artifactVersion: number, root?: string) { const matches = (await loadCmsWorkspace(root)).artifacts.filter((item) => item.artifactId === artifactId && item.artifactVersion === artifactVersion); if (matches.length !== 1) throw new Error(matches.length ? `ambiguous artifact version: ${artifactId} v${artifactVersion}` : `artifact version not found: ${artifactId} v${artifactVersion}`); return structuredClone(matches[0]!); }
export async function listReleases(audience: Audience, root?: string) {
  const workspace = await loadCmsWorkspace(root); const summaries = [];
  for (const release of workspace.releases.filter((item) => payloadAudience(item.payload) === audience)) { const proof = await readRelease(release.artifactId, audience, root); summaries.push({ artifactId: proof.release.artifactId, artifactVersion: proof.release.artifactVersion, audience, profile: proof.release.profile }); }
  return summaries.sort((a, b) => a.artifactId.localeCompare(b.artifactId));
}
export async function readRelease(artifactId: string, audience: Audience, root?: string): Promise<ReleaseProof> {
  const workspace = await loadCmsWorkspace(root); const releases = workspace.releases.filter((item) => item.artifactId === artifactId);
  if (releases.length !== 1) throw new Error(releases.length ? `ambiguous release: ${artifactId}` : `release not found: ${artifactId}`); const release = releases[0]!;
  if (payloadAudience(release.payload) !== audience) throw new Error(`release not found for audience: ${audience}`);
  const artifacts = workspace.artifacts.filter((item) => item.artifactId === release.artifactId && item.artifactVersion === release.artifactVersion); if (artifacts.length !== 1) throw new Error('release has missing or ambiguous immutable artifact'); const artifact = artifacts[0]!;
  const authorizations = workspace.authorizations.filter((item) => item.artifactId === release.artifactId && item.artifactVersion === release.artifactVersion); if (authorizations.length !== 1) throw new Error('release has incomplete or ambiguous authorization'); const authorization = authorizations[0]!;
  const computed = payloadDigest(artifact.payload);
  if (!samePin(release.profile, artifact.profile) || !samePin(authorization.profile, artifact.profile) || payloadDigest(release.payload) !== computed || authorization.payloadDigest !== computed || authorization.authorizationSubjectDigest !== authorizationSubjectDigest({ artifactId: artifact.artifactId, artifactVersion: artifact.artifactVersion, payloadDigest: computed, profile: artifact.profile })) throw new Error('release proof failed immutable artifact binding verification');
  const profile = findProfile(workspace, release.profile.profileId, release.profile.revision); if (!authorityPolicy(workspace, release.profile, audience, authorization.authorizedBy)) throw new Error('release authority is not allowed by the current local policy');
  const subject = { artifactId: artifact.artifactId, artifactVersion: artifact.artifactVersion, payloadDigest: computed, profile: artifact.profile, authorizationSubjectDigest: authorization.authorizationSubjectDigest };
  const approvals = bindingApprovals(workspace, subject); const rejections = bindingRejections(workspace, subject);
  const proof: ReleaseProof = { profile, authorization, release, ...(approvals.length > 0 ? { approvals } : {}), ...(rejections.length > 0 ? { rejections } : {}) }; verifyReleaseProof(proof); return structuredClone(proof);
}
function requireExactKeys(value: unknown, expected: string[], label: string): asserts value is Record<string, any> { if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error(`${label} must be an object`); const actual = Object.keys(value).sort(); const sorted = [...expected].sort(); if (actual.length !== sorted.length || actual.some((key, index) => key !== sorted[index])) throw new Error(`${label} fields must be exactly: ${sorted.join(', ')}`); }
// The schema types every timestamp as an RFC 3339 date-time; the verifier enforces the same shape rather than accepting any string.
const dateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
function requireDateTime(value: unknown, label: string) { if (typeof value !== 'string' || !dateTimePattern.test(value) || Number.isNaN(Date.parse(value))) throw new Error(`${label} must be an RFC 3339 date-time`); }
function verifyPinShape(value: unknown, label: string): asserts value is ProfilePin { requireExactKeys(value, ['profileId', 'revision', 'digest'], label); if (typeof value.profileId !== 'string' || !Number.isSafeInteger(value.revision) || typeof value.digest !== 'string') throw new Error(`${label} has malformed values`); }
// Draft, step 6 rule 6: every carried approval and rejection binds the identical subject as the authorization. A rejection verifies the
// same way and, once verified, means only that a configured authority declined this exact subject; it does not invalidate the release.
function verifyCarriedDecisions(kind: 'approval' | 'rejection', decisions: unknown, authorization: ReleaseAuthorization) {
  const label = `release ${kind}`; const at = kind === 'approval' ? 'approvedAt' : 'rejectedAt'; const by = kind === 'approval' ? 'approvedBy' : 'rejectedBy';
  if (!Array.isArray(decisions)) throw new Error(`release proof ${kind}s must be an array`);
  // The schema marks the array uniqueItems: one decision must not be counted twice.
  const seen = new Set<string>();
  for (const decision of decisions) { const key = canonicalJson(decision as JsonValue); if (seen.has(key)) throw new Error(`release proof ${kind}s must be unique`); seen.add(key); }
  const recomputedSubject = authorizationSubjectDigest(authorization);
  for (const decision of decisions) {
    requireExactKeys(decision, withOptionalReason(decision, ['artifactId', 'artifactVersion', 'payloadDigest', 'profile', at, by, 'authorizationSubjectDigest']), label);
    requireExactKeys(decision[by], ['actorId', 'actorKind'], `${label} authority`); verifyPinShape(decision.profile, `${label} profile pin`); validActor(decision[by] as Actor, `${label} authority`);
    requireDateTime(decision[at], `${label} ${at}`); if (Object.hasOwn(decision, 'reason')) validateReason(decision.reason, `${label} reason`);
    if (decision.artifactId !== authorization.artifactId || decision.artifactVersion !== authorization.artifactVersion || decision.payloadDigest !== authorization.payloadDigest || !samePin(decision.profile, authorization.profile)) throw new Error(`${label} subject verification failed: ${kind} does not bind the authorized subject`);
    if (decision.authorizationSubjectDigest !== recomputedSubject) throw new Error(`${label} subject verification failed: subject digest does not match the authorization`);
  }
}
export function verifyReleaseProof(proof: ReleaseProof) {
  const carries = (key: 'approvals' | 'rejections') => !!proof && typeof proof === 'object' && !Array.isArray(proof) && Object.hasOwn(proof, key);
  const carriesApprovals = carries('approvals'); const carriesRejections = carries('rejections');
  requireExactKeys(proof, ['profile', 'authorization', 'release', ...(carriesApprovals ? ['approvals'] : []), ...(carriesRejections ? ['rejections'] : [])], 'release proof');
  requireExactKeys(proof.profile, ['profileId', 'revision', 'payloadContract', 'digest', 'ratification'], 'profile'); requireExactKeys(proof.profile.ratification, withOptionalReason(proof.profile.ratification, ['ratifiedAt', 'actorId', 'actorKind']), 'profile ratification'); requireExactKeys(proof.authorization, withOptionalReason(proof.authorization, ['artifactId', 'artifactVersion', 'payloadDigest', 'profile', 'authorizedAt', 'authorizedBy', 'authorizationSubjectDigest']), 'authorization'); requireExactKeys(proof.authorization.authorizedBy, ['actorId', 'actorKind'], 'release authority'); requireExactKeys(proof.release, ['artifactId', 'artifactVersion', 'payload', 'profile'], 'release'); verifyPinShape(proof.authorization.profile, 'authorization profile pin'); verifyPinShape(proof.release.profile, 'release profile pin');
  const { profile, authorization, release } = proof; validatePayloadContract(profile.payloadContract); if (profile.digest !== profileDigest(profile)) throw new Error('profile digest verification failed'); if (profile.ratification.actorKind !== 'human' || !profile.ratification.actorId) throw new Error('profile lacks attributed human ratification'); requireDateTime(profile.ratification.ratifiedAt, 'profile ratification ratifiedAt'); requireDateTime(authorization.authorizedAt, 'authorization authorizedAt');
  // A reason, when present, is checked as bounded plain text and given no other meaning (draft, Primitives): it is not evidence of review or correctness.
  if (Object.hasOwn(profile.ratification, 'reason')) validateReason(profile.ratification.reason, 'profile ratification reason'); if (Object.hasOwn(authorization, 'reason')) validateReason(authorization.reason, 'authorization reason'); if (!samePin(release.profile, exactPin(profile)) || !samePin(authorization.profile, release.profile)) throw new Error('profile pin verification failed'); validatePayload(release.payload, profile.payloadContract);
  const computedPayloadDigest = payloadDigest(release.payload); if (authorization.payloadDigest !== computedPayloadDigest) throw new Error('payload digest verification failed'); if (authorization.artifactId !== release.artifactId || authorization.artifactVersion !== release.artifactVersion) throw new Error('artifact reference verification failed'); if (authorization.authorizationSubjectDigest !== authorizationSubjectDigest(authorization)) throw new Error('authorization subject verification failed'); validActor(authorization.authorizedBy, 'release authority');
  if (carriesApprovals) verifyCarriedDecisions('approval', proof.approvals, authorization); if (carriesRejections) verifyCarriedDecisions('rejection', proof.rejections, authorization);
  return { valid: true as const, artifactId: release.artifactId, artifactVersion: release.artifactVersion };
}

const LOCAL_RENDERER = {
  rendererId: 'cms.local-html',
  rendererVersion: '1',
  templateId: 'article-page',
  templateVersion: '1',
  locale: 'en-US',
} as const;

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

export function renderArticleDeterministically(payload: ArticlePayload): string {
  return `<!doctype html><html lang="en-US"><head><meta charset="utf-8"><title>${escapeHtml(payload.title)}</title></head><body><main><h1>${escapeHtml(payload.title)}</h1><p>${escapeHtml(payload.body)}</p></main></body></html>`;
}

export async function renderReleasedArticle(input: {
  sourceArtifactId: string;
  sourceAudience: Audience;
  renderedArtifactId: string;
  renderedArtifactVersion: number;
  authoredBy: Actor;
}, root?: string) {
  const sourceProof = await readRelease(input.sourceArtifactId, input.sourceAudience, root);
  if (sourceProof.profile.profileId !== 'cms.article') throw new Error('local renderer accepts only released cms.article sources');
  const sourcePayload = sourceProof.release.payload as ArticlePayload;
  const source: GovernedDependencyPin = {
    artifactId: sourceProof.release.artifactId,
    artifactVersion: sourceProof.release.artifactVersion,
    payloadDigest: sourceProof.authorization.payloadDigest,
  };
  const payload: RenderedArtifactPayload = {
    audience: payloadAudience(sourcePayload),
    source,
    renderer: LOCAL_RENDERER,
    mediaType: 'text/html',
    renderedContent: renderArticleDeterministically(sourcePayload),
  };
  const artifact = await createArtifactVersion({
    artifactId: input.renderedArtifactId,
    artifactVersion: input.renderedArtifactVersion,
    profileId: RENDERED_ARTICLE_PROFILE_ID,
    payload,
    authoredBy: input.authoredBy,
  }, root);
  return { artifact, sourceDependency: { status: 'verified' as const, pin: source } };
}

function exactGovernedDependencyPin(value: unknown): asserts value is GovernedDependencyPin {
  requireExactKeys(value, ['artifactId', 'artifactVersion', 'payloadDigest'], 'governed dependency pin');
  if (typeof value.artifactId !== 'string' || !value.artifactId || !Number.isSafeInteger(value.artifactVersion) || value.artifactVersion <= 0 || typeof value.payloadDigest !== 'string') {
    throw new Error('governed dependency pin has malformed values');
  }
}

export function verifyRenderedArtifact(renderedProof: ReleaseProof, sourceProof: ReleaseProof) {
  verifyReleaseProof(renderedProof);
  verifyReleaseProof(sourceProof);
  if (renderedProof.profile.profileId !== RENDERED_ARTICLE_PROFILE_ID) throw new Error('rendered artifact uses the wrong profile');
  if (sourceProof.profile.profileId !== 'cms.article') throw new Error('rendered source uses the wrong profile');
  const rendered = renderedProof.release.payload as unknown as RenderedArtifactPayload;
  exactGovernedDependencyPin(rendered.source);
  const expectedPin: GovernedDependencyPin = {
    artifactId: sourceProof.release.artifactId,
    artifactVersion: sourceProof.release.artifactVersion,
    payloadDigest: sourceProof.authorization.payloadDigest,
  };
  if (rendered.source.artifactId !== expectedPin.artifactId || rendered.source.artifactVersion !== expectedPin.artifactVersion || rendered.source.payloadDigest !== expectedPin.payloadDigest) {
    throw new Error('governed dependency pin does not match the independently verified source release');
  }
  requireExactKeys(rendered.renderer, ['locale', 'rendererId', 'rendererVersion', 'templateId', 'templateVersion'], 'local renderer identity');
  if (rendered.renderer.rendererId !== LOCAL_RENDERER.rendererId || rendered.renderer.rendererVersion !== LOCAL_RENDERER.rendererVersion ||
    rendered.renderer.templateId !== LOCAL_RENDERER.templateId || rendered.renderer.templateVersion !== LOCAL_RENDERER.templateVersion ||
    rendered.renderer.locale !== LOCAL_RENDERER.locale) throw new Error('rendered artifact uses unsupported local renderer identity');
  if (rendered.renderedContent !== renderArticleDeterministically(sourceProof.release.payload as ArticlePayload)) throw new Error('rendered content does not match the deterministic local transformation');
  return {
    valid: true as const,
    renderedArtifactId: renderedProof.release.artifactId,
    verificationClassification: {
      releaseProofs: { status: 'verified' as const, semantics: 'normative-gap-core' as const },
      sourceDependency: { status: 'verified' as const, semantics: 'candidate-not-normative' as const, candidate: 'DEPENDENCY_PINS' as const },
      transformation: { status: 'verified' as const, semantics: 'implementation-local' as const },
    },
    sourceDependency: { status: 'verified' as const, semantics: 'candidate-not-normative' as const, pin: expectedPin },
    transformation: { status: 'verified' as const, semantics: 'implementation-local' as const },
    displayOutcome: 'not-performed-or-proved' as const,
  };
}

function exactExternalDependencyPin(value: unknown): asserts value is ExternalDependencyPin {
  requireExactKeys(value, ['contentDigest', 'ref'], 'external dependency pin');
  if (typeof value.ref !== 'string' || !value.ref || typeof value.contentDigest !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(value.contentDigest)) {
    throw new Error('external dependency pin has malformed values');
  }
}

export function inspectGalleryExternalDependencies(galleryProof: ReleaseProof) {
  verifyReleaseProof(galleryProof);
  if (galleryProof.profile.profileId !== 'cms.external-image-gallery') throw new Error('external gallery dependency inspection requires a released cms.external-image-gallery proof');
  const gallery = galleryProof.release.payload as unknown as GalleryPayload;
  if (!Array.isArray(gallery.images)) throw new Error('gallery images must be an array');
  const dependencies = gallery.images.map((image, index) => {
    exactExternalDependencyPin(image?.asset);
    return { index, pin: structuredClone(image.asset), status: 'unverified' as const, reason: 'exact external bytes were not supplied' as const };
  });
  return { galleryRelease: { status: 'verified' as const, semantics: 'normative-gap-core' as const }, dependencySemantics: 'candidate-not-normative' as const, dependencies };
}

export function verifyGalleryExternalDependency(galleryProof: ReleaseProof, imageIndex: number, contentBase64: string) {
  const inspection = inspectGalleryExternalDependencies(galleryProof);
  if (!Number.isSafeInteger(imageIndex) || imageIndex < 0 || imageIndex >= inspection.dependencies.length) throw new Error('imageIndex does not identify a gallery dependency');
  const content = Buffer.from(contentBase64, 'base64');
  if (content.toString('base64') !== contentBase64) throw new Error('contentBase64 must be canonical base64 for the exact raw external bytes');
  const dependency = inspection.dependencies[imageIndex]!;
  const computedContentDigest = `sha256:${createHash('sha256').update(content).digest('hex')}`;
  if (computedContentDigest !== dependency.pin.contentDigest) throw new Error('external dependency content digest verification failed');
  return {
    galleryRelease: inspection.galleryRelease,
    dependency: { index: imageIndex, pin: dependency.pin, status: 'verified' as const, semantics: 'candidate-not-normative' as const, digestInput: 'exact-raw-bytes' as const },
    retrievalOutcome: 'not-proved' as const,
    governanceOutcome: 'external-content-not-governed-by-this-check' as const,
  };
}

// Local verification only: parent and sources resolve in this workspace using its
// configured attributed authority policies. This does not define cross-store identity.
export async function verifyReleasedDependencies(artifactId: string, audience: Audience, sourceAudience: Audience, root?: string) {
  const parent = await readRelease(artifactId, audience, root);
  const payload = parent.release.payload as Record<string, JsonValue>;
  if (!Object.hasOwn(payload, 'dependencySet')) return { status: 'not-declared' as const, dependencies: [] };
  const set = payload.dependencySet;
  validateDependencySet(set);
  const dependencies = [];
  for (const entry of set.entries) {
    let status: 'verified' | 'unverified' = 'unverified';
    try {
      const source = await readRelease(entry.artifactId, sourceAudience, root);
      if (source.release.artifactId === entry.artifactId && source.release.artifactVersion === entry.artifactVersion && source.authorization.payloadDigest === entry.payloadDigest) status = 'verified';
    } catch {
      // Missing, inaccessible, draft, and invalid sources all remain unverified.
      // Do not disclose restricted source content or lookup details to the caller.
    }
    dependencies.push({ ...entry, status });
  }
  return { status: dependencies.every(entry => entry.status === 'verified') ? 'verified' as const : 'unverified' as const, dependencies };
}

/** Application actions for the domain guide; the existing GAP gates remain authoritative. */
const blogText = { type: 'string' as const, minLength: 1, maxLength: 5000 };
/**
 * The blog-post content model in the domain guide: author, the byline date-time, the CMS audience label, and a content map
 * keyed by BCP 47 locale tag. The localeMap rule declares which locales are allowed, which are required, and how an absent
 * locale falls back at delivery (draft, Payload → Locale variants). US English and Mexican Spanish are required; the other language falls back
 * to the required content for the same country, preserving that country's seasonal advice.
 */
export const BLOG_MODEL_CONTRACT: PayloadContract = Object.freeze({
  type: 'object', additionalProperties: false, fields: {
    audience: { type: 'string', enum: ['public', 'members', 'internal'] }, author: blogText,
    content: { type: 'localeMap', allowed: ['en-US', 'es-US', 'en-MX', 'es-MX'], required: ['en-US', 'es-MX'], fallback: { 'es-US': 'en-US', 'en-MX': 'es-MX' },
      items: { type: 'object', additionalProperties: false, fields: { headline: blogText, body: blogText }, required: ['headline', 'body'] } },
    date: { type: 'string', format: 'date-time' },   // the byline date and time: content the writer sets, inside the payload digest
  }, required: ['audience', 'author', 'content', 'date'],
}) as PayloadContract;
export async function proposeBlogModel(proposedBy: Actor, root?: string) {
  const workspace = await loadCmsWorkspace(root);
  const revision = Math.max(0, ...workspace.profiles.filter((profile) => profile.profileId === BLOG_PROFILE_ID).map((profile) => profile.revision)) + 1;
  return proposeProfile({ profileId: BLOG_PROFILE_ID, revision, proposedBy, payloadContract: structuredClone(BLOG_MODEL_CONTRACT) }, root);
}
// Existing workspaces may contain either earlier model. Preserve their ratified rules for historical
// drafts and releases; new saves require a separately proposed and ratified revision of the current model.
const previousFourLocaleContract = structuredClone(BLOG_MODEL_CONTRACT);
Object.assign(previousFourLocaleContract.fields.content!, { required: ['en-US', 'en-MX'], fallback: { 'es-US': 'en-US', 'es-MX': 'en-MX' } });
const previousBlogContract = structuredClone(BLOG_MODEL_CONTRACT);
Object.assign(previousBlogContract.fields.content!, { allowed: ['en-US', 'es-MX'], required: ['en-US'], fallback: { 'es-MX': 'en-US' } });
/**
 * The blog actions read and build the payload shape this contract declares, so they accept only a blog-post revision whose
 * ratified contract matches a supported blog model. Unrelated contracts ratified through the generic tools stay usable through them.
 */
function isBlogModel(profile: Pick<ProfileRevision, 'profileId' | 'payloadContract'>, contract = BLOG_MODEL_CONTRACT) {
  return profile.profileId === BLOG_PROFILE_ID && canonicalJson(profile.payloadContract as unknown as JsonValue) === canonicalJson(contract as unknown as JsonValue);
}
function requireBlogModel(profile: ProfileRevision, action: string) {
  if (profile.profileId !== BLOG_PROFILE_ID) throw new Error(`${action} requires the blog-post content model; this content follows ${profile.profileId}`);
  if (![BLOG_MODEL_CONTRACT, previousFourLocaleContract, previousBlogContract].some(contract => isBlogModel(profile, contract))) throw new Error(`${action} requires the domain guide's blog-post contract; ${profile.profileId} revision ${profile.revision} declares a different one, so use the generic tools for it`);
}
export type SaveBlogPostInput = { artifactId: string; expectedVersion: number; author: string; date: string; audience: Audience; content: Record<string, BlogPostContent>; authoredBy: Actor };
export async function saveBlogPost(input: SaveBlogPostInput, root?: string) {
  await initializeWorkspace(root);
  const lock = `${workspacePath(root)}.blog-save-lock`;
  await mkdir(lock);
  try {
    const workspace = await loadCmsWorkspace(root);
    const model = workspace.profiles.filter((profile) => isBlogModel(profile)).sort((a, b) => b.revision - a.revision)[0];
    if (!model) throw new Error('the blog-post content model is not ratified; propose it with propose_blog_model and ratify it before saving posts');
    const versions = workspace.artifacts.filter((artifact) => artifact.artifactId === input.artifactId);
    if (versions.some((artifact) => artifact.profile.profileId !== BLOG_PROFILE_ID)) throw new Error('artifact identity already uses another content model');
    const latest = Math.max(0, ...versions.map((artifact) => artifact.artifactVersion));
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion !== latest) throw new Error('stale blog draft: read the saved versions before saving');
    const payload: BlogPostPayload = { audience: input.audience, author: input.author, content: structuredClone(input.content), date: input.date };
    return await createArtifactVersion({ artifactId: input.artifactId, artifactVersion: latest + 1, profileId: BLOG_PROFILE_ID, profileRevision: model.revision, payload: payload as unknown as JsonValue, authoredBy: input.authoredBy }, root);
  } finally { await rm(lock, { recursive: true }); }
}
export async function approvePost(input: Parameters<typeof approveRelease>[0], root?: string) {
  const artifact = await readArtifactVersion(input.artifactId, input.artifactVersion, root);
  requireBlogModel(findProfile(await loadCmsWorkspace(root), artifact.profile.profileId, artifact.profile.revision), 'Approve post');
  return approveRelease(input, root);
}
export async function rejectPost(input: Parameters<typeof rejectRelease>[0], root?: string) {
  const artifact = await readArtifactVersion(input.artifactId, input.artifactVersion, root);
  requireBlogModel(findProfile(await loadCmsWorkspace(root), artifact.profile.profileId, artifact.profile.revision), 'Reject post');
  return rejectRelease(input, root);
}
export async function publishPost(input: Parameters<typeof authorizeAndRelease>[0], root?: string) {
  const artifact = await readArtifactVersion(input.artifactId, input.artifactVersion, root);
  requireBlogModel(findProfile(await loadCmsWorkspace(root), artifact.profile.profileId, artifact.profile.revision), 'Publish post');
  return authorizeAndRelease(input, root);
}
/**
 * Consumer-side locale selection. It happens after the release proof verifies and is delivery, not a GAP
 * lifecycle step: the proof covers every authored locale as one payload, and nothing here proves display.
 */
export function selectLocaleContent(proof: ReleaseProof, locale: string) {
  verifyReleaseProof(proof);
  const rule = proof.profile.payloadContract.fields.content;
  if (!rule || rule.type !== 'localeMap') throw new Error(`locale selection requires a profile whose content field is a localeMap; ${proof.profile.profileId} revision ${proof.profile.revision} does not declare one`);
  if (typeof locale !== 'string' || !LOCALE_TAG_PATTERN.test(locale)) throw new Error(`requested locale ${String(locale)} is not a syntactically valid BCP 47 language tag`);
  if (!rule.allowed.includes(locale)) throw new Error(`requested locale ${locale} is not an allowed locale for ${proof.profile.profileId} revision ${proof.profile.revision} (allowed: ${rule.allowed.join(', ')})`);
  const content = (proof.release.payload as unknown as { content: Record<string, BlogPostContent> }).content;
  const authorizedLocales = Object.keys(content).sort();
  const deliveredLocale = Object.hasOwn(content, locale) ? locale : rule.fallback[locale];
  if (deliveredLocale === undefined || !Object.hasOwn(content, deliveredLocale)) throw new Error(`locale ${locale} is not in the released payload and the profile declares no fallback for it`);
  return {
    artifactId: proof.release.artifactId,
    artifactVersion: proof.release.artifactVersion,
    requestedLocale: locale,
    deliveredLocale,
    fallbackApplied: deliveredLocale !== locale,
    authorizedLocales,
    authorizationCoverage: 'entire-payload' as const,
    content: structuredClone(content[deliveredLocale]!),
    displayOutcome: 'not-performed-or-proved' as const,
  };
}
/** Read one released post for the exact audience label, verify its proof, and select the reader's locale from the verified payload. */
export async function readPost(input: { artifactId: string; audience: Audience; locale: string }, root?: string) {
  const proof = await readRelease(input.artifactId, input.audience, root);
  requireBlogModel(proof.profile, 'Read post');
  const payload = proof.release.payload as unknown as BlogPostPayload;
  const selection = selectLocaleContent(proof, input.locale);
  return {
    artifactId: proof.release.artifactId, artifactVersion: proof.release.artifactVersion, profile: proof.release.profile, audience: payload.audience, author: payload.author, date: payload.date,
    headline: selection.content.headline, body: selection.content.body,
    locale: { requested: selection.requestedLocale, delivered: selection.deliveredLocale, fallbackApplied: selection.fallbackApplied, authorizedLocales: selection.authorizedLocales },
    authorizationCoverage: selection.authorizationCoverage, displayOutcome: selection.displayOutcome, proof,
  };
}
