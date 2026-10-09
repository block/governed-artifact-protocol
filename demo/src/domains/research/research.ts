import { mkdir, rm } from 'node:fs/promises';
import { z } from 'zod';
import { canonical, demoKeyCustody, digest, signAsAuthority, trustStore, verifyAuthoritySignature, type AuthoritySignature, type TrustContext, type TrustStore } from './signing.js';
import { verifyReleaseProof } from './verify.js';
import { actorSchema, models, paperSchema, referenceSchema, type Actor, type Kind, type Reference, type SourcePayload, type PaperPayload, type ReviewPayload, type EditorNotesPayload } from './models.js';
import { initializeWorkspace, readWorkspace, workspacePath, writeWorkspace } from './workspace.js';

type Pin = { profileId: string; revision: number; digest: string };
type Artifact = { artifactId: string; artifactVersion: number; payload: Record<string, any>; profile: Pin; authoredBy: Actor };
type Release = Omit<Artifact, 'authoredBy'>;
type Subject = Reference & { profile: Pin; authorizationSubjectDigest: string };
type Authorization = Subject & { authorizedBy: Actor; authorizedAt: string; authoritySignature: AuthoritySignature; reason?: string };
type Withdrawal = Subject & { withdrawnBy: Actor; withdrawnAt: string; authoritySignature: AuthoritySignature; reason?: string };
type Approval = Subject & { approvedBy: Actor; approvedAt: string; authoritySignature: AuthoritySignature; reason?: string };
type Rejection = Subject & { rejectedBy: Actor; rejectedAt: string; authoritySignature: AuthoritySignature; reason?: string };
type State = { artifacts: Artifact[]; authorizations: Authorization[]; releases: Release[]; selections: { artifactId: string; artifactVersion: number; previousVersion: number }[]; withdrawals: Withdrawal[]; approvals: Approval[]; rejections: Rejection[] };
const reasonSchema = z.string().min(1).max(5000).regex(/\S/);
export const researchPayloadDigest = (payload: unknown) => digest('governed-artifact.payload.v1', payload);
const ratifier = 'human:journal-owner';
export function researchProfile(kind: Kind) {
  const payloadContract = { ...z.toJSONSchema(models[kind]), $contractLanguage: 'json-schema/draft-2020-12' };
  const semantics = { profileId: kind === 'review' ? 'research-peer-review' : `research-${kind}`, revision: 1, payloadContract };
  const profileDigest = digest('governed-artifact.profile-revision.draft', semantics);
  return { ...semantics, digest: profileDigest, ratification: { actorId: ratifier, actorKind: 'human' as const, ratifiedAt: '2026-10-08T00:00:00.000Z', authoritySignature: signAsAuthority('ratify-profile', ratifier, profileDigest) } };
}
function pin(kind: Kind): Pin { const p = researchProfile(kind); return { profileId: p.profileId, revision: p.revision, digest: p.digest }; }
function kindOf(artifact: Release): Kind {
  for (const kind of ['source', 'paper', 'review', 'editor-notes'] as const) if (canonical(artifact.profile) === canonical(pin(kind))) return kind;
  throw new Error('unknown research profile pin');
}
// Cited sources are previously published works from other journals, verified under their own context's trust.
const contextOf = (kind: Kind): TrustContext => kind === 'source' ? 'cited-works' : 'journal';
// These permissions and the required study, methods paper, and editorial approval are this journal's local policy.
const actors = [
  { actorId: 'agent:public-reader', actorKind: 'agent', drafts: [], releases: [], approvals: [], withdrawals: [] },
  { actorId: 'agent:source-author', actorKind: 'agent', drafts: ['source'], releases: [], approvals: [], withdrawals: [] },
  { actorId: 'agent:paper-author', actorKind: 'agent', drafts: ['paper'], releases: [], approvals: [], withdrawals: [] },
  { actorId: 'agent:sweep', actorKind: 'agent', drafts: [], releases: [], approvals: [], withdrawals: [] },
  { actorId: ratifier, actorKind: 'human', drafts: [], releases: [], approvals: [], withdrawals: [] },
  { actorId: 'human:cited-works-editor', actorKind: 'human', drafts: ['source'], releases: ['source'], approvals: [], withdrawals: [] },
  { actorId: 'human:peer-reviewer', actorKind: 'human', drafts: ['review'], releases: [], approvals: [], withdrawals: [] },
  { actorId: 'human:journal-editor', actorKind: 'human', drafts: ['editor-notes'], releases: [], approvals: ['paper'], withdrawals: [] },
  { actorId: 'human:journal-publisher', actorKind: 'human', drafts: [], releases: ['paper', 'review', 'editor-notes'], approvals: [], withdrawals: ['paper'] },
] as const;
function permission(actor: Actor) {
  actorSchema.parse(actor);
  const configured = actors.find((a) => a.actorId === actor.actorId && a.actorKind === actor.actorKind);
  if (!configured) throw new Error('actor has no configured research workflow permission');
  return configured;
}
export function researchWorkflow() {
  return {
    profiles: (['source', 'paper', 'review', 'editor-notes'] as const).map(researchProfile), actors, keyCustody: demoKeyCustody,
    trustStores: { journal: trustStore('journal'), 'cited-works': trustStore('cited-works') },
    trustPolicy: 'Local choice: verify papers, review reports, and editor notes under the journal trust store, and cited sources under the cited-works store. Each store trusts one release authority, so a proof released by anyone else fails verification. A trust store names actions, not profiles; the draft does not yet scope a signer to some profiles.',
    publicationPolicy: 'Local policy: a paper pins at least one released study and exactly one released methods paper. Publication requires a released review report, responses to its feedback, and editorial approval of the exact final version. Peer advice grants no publication authority.',
    reviewPolicy: 'Distinct peer-review and editor-notes profiles use local section anchors and exact manuscript references; either may name a draft. Notes are feedback content, separate from signed approval or rejection decisions. The manuscript reference is domain content, not a governed dependency. Comments are never moved automatically between versions.',
    currentSelection: 'Local append-only release selections with expected-version checks; not portable GAP supersession.',
    sourceContext: 'Cited sources are a separate context with its own trust store, though this local demo stores them in the same workspace. External bibliography retrieval and distributed resolution are outside this demo.',
    evidence: 'Signed ratification, approval, rejection, authorization, and withdrawal. Verification uses supplied proof bytes and reader-configured trust, without a workspace or signing keys.',
    disclosure: 'Local, single-user evaluation on fictional papers and invented results. Publication records permission to release content; it does not establish scientific correctness, actual peer review, or journal delivery.',
  };
}
export function verifyResearchProof(proof: unknown, store: TrustStore) { return verifyReleaseProof(structuredClone(proof), structuredClone(store)); }
async function load(root?: string) {
  await initializeWorkspace(root); const workspace = await readWorkspace(root);
  const state = workspace.research as State;
  if (!state || ['artifacts', 'authorizations', 'releases', 'selections', 'withdrawals', 'approvals', 'rejections'].some((key) => !Array.isArray(state[key as keyof State]))) throw new Error('malformed research workspace');
  return { workspace, state };
}
async function mutate<T>(root: string | undefined, change: (state: State) => T): Promise<T> {
  await initializeWorkspace(root); const lock = `${workspacePath(root)}.research-lock`;
  await mkdir(lock);
  try { const { workspace, state } = await load(root); const result = change(state); await writeWorkspace({ ...workspace, research: state }, root); return structuredClone(result); }
  finally { await rm(lock, { recursive: true }); }
}
function exact<T extends { artifactId: string; artifactVersion: number }>(records: T[], id: string, version: number): T {
  const matches = records.filter((r) => r.artifactId === id && r.artifactVersion === version);
  if (matches.length !== 1) throw new Error('missing or ambiguous exact research record');
  return matches[0]!;
}
function subject(artifact: Release) { return { artifactId: artifact.artifactId, artifactVersion: artifact.artifactVersion, payloadDigest: researchPayloadDigest(artifact.payload), profile: artifact.profile }; }
function bound(artifact: Release): Subject { const s = subject(artifact); return { ...s, authorizationSubjectDigest: digest('governed-artifact.authorization-subject.v1', s) }; }
function exactKeys(value: object, keys: string[]) {
  if (!value || typeof value !== 'object' || Object.keys(value).sort().join(',') !== keys.sort().join(',')) throw new Error('malformed research proof record');
}
function unique(ids: string[], label: string) { if (new Set(ids).size !== ids.length) throw new Error(`duplicate ${label}`); }
function validate(artifact: Release) {
  if (typeof artifact.artifactId !== 'string' || !artifact.artifactId.trim() || artifact.artifactId.length > 200 || !Number.isSafeInteger(artifact.artifactVersion) || artifact.artifactVersion < 1) throw new Error('malformed research artifact identity');
  models[kindOf(artifact)].parse(artifact.payload);
  if (kindOf(artifact) === 'paper') {
    const p = paperSchema.parse(artifact.payload);
    const ids = p.dependencySet.entries.map((e) => e.artifactId);
    unique(ids, 'dependency sources');
    if (canonical(ids) !== canonical([...ids].sort())) throw new Error('dependency set must be ordered by artifact ID');
    unique(p.sections.map((s) => s.id), 'section IDs'); unique(p.bibliography.map((b) => b.id), 'citation IDs');
    unique(p.bibliography.map((b) => b.sourceArtifactId), 'bibliography sources');
    const citations = new Set(p.bibliography.map((b) => b.id));
    if (p.sections.some((s) => s.citations.some((c) => !citations.has(c)))) throw new Error('citation does not name a bibliography entry');
    unique(p.reviewResponses.map((r) => `${r.reviewArtifactId}#${r.feedbackId}`), 'review responses');
    unique(p.editorResponses.map((r) => `${r.notesArtifactId}#${r.feedbackId}`), 'editor responses');
  } else if (['review', 'editor-notes'].includes(kindOf(artifact))) unique(artifact.payload.feedback.map((f: any) => f.id), 'feedback IDs');
}
// Check every stored editorial decision, including decisions for drafts, so changed IDs cannot hide bad evidence.
function editorial(state: State, id: string, version: number) {
  for (const [key, action, actorKey, timeKey] of [
    ['approvals', 'approve-release', 'approvedBy', 'approvedAt'], ['rejections', 'reject-release', 'rejectedBy', 'rejectedAt'],
  ] as const) {
    const seen = new Set<string>();
    for (const d of state[key]) {
      try {
        exactKeys(d, ['artifactId', 'artifactVersion', 'payloadDigest', 'profile', 'authorizationSubjectDigest', actorKey, timeKey, 'authoritySignature', ...('reason' in d ? ['reason'] : [])]);
        const a = exact(state.artifacts, d.artifactId, d.artifactVersion);
        const b = bound(a);
        if (Object.keys(b).some((k) => canonical((d as any)[k]) !== canonical((b as any)[k]))) throw new Error('editorial subject mismatch');
        const who = (d as any)[actorKey] as Actor;
        if (!(permission(who).approvals as readonly string[]).includes(kindOf(a))) throw new Error('actor lacks editorial authority');
        z.iso.datetime({ offset: true }).parse((d as any)[timeKey]);
        if (d.reason !== undefined) reasonSchema.parse(d.reason);
        verifyAuthoritySignature(action, b.authorizationSubjectDigest, d.authoritySignature, trustStore(contextOf(kindOf(a))), who.actorId);
        const identity = `${d.artifactId}#${d.artifactVersion}#${who.actorId}`;
        if (seen.has(identity)) throw new Error('duplicate editorial decision'); seen.add(identity);
      } catch { throw new Error('research editorial decision integrity failure'); }
    }
  }
  return {
    approvals: state.approvals.filter((d) => d.artifactId === id && d.artifactVersion === version),
    rejections: state.rejections.filter((d) => d.artifactId === id && d.artifactVersion === version),
  };
}
function proof(state: State, id: string, version: number) {
  const artifact = exact(state.artifacts, id, version); const release = exact(state.releases, id, version); const authorization = exact(state.authorizations, id, version);
  try {
    exactKeys(artifact, ['artifactId', 'artifactVersion', 'payload', 'profile', 'authoredBy']); actorSchema.parse(artifact.authoredBy);
    validate(artifact); validate(release);
    if (canonical(release) !== canonical({ artifactId: id, artifactVersion: version, payload: artifact.payload, profile: artifact.profile })) throw new Error('changed stored payload');
    if ('reason' in authorization) reasonSchema.parse(authorization.reason);
    const decisions = editorial(state, id, version);
    const candidate = { profile: researchProfile(kindOf(artifact)), authorization, release, ...(decisions.approvals.length ? { approvals: decisions.approvals } : {}), ...(decisions.rejections.length ? { rejections: decisions.rejections } : {}) };
    verifyReleaseProof(structuredClone(candidate), trustStore(contextOf(kindOf(artifact))));
    if (!(permission(authorization.authorizedBy).releases as readonly string[]).includes(kindOf(artifact))) throw new Error('unconfigured release authority');
    if (kindOf(artifact) === 'paper' && !decisions.approvals.length) throw new Error('missing exact editorial approval');
    return candidate;
  } catch { throw new Error('research release proof integrity failure'); }
}
// Verify the whole withdrawal ledger on every read and return the withdrawal for this exact version, if any. A ledger
// entry the boundary cannot verify (not a record, wrong keys, an unknown or another subject, a bad digest or signature,
// an unconfigured actor, a duplicate) fails the read rather than letting any bare proof be served as current. The whole
// ledger is checked, not only entries naming this artifact, so a withdrawal whose stored ID was altered cannot vanish.
function withdrawalOf(state: State, id: string, version: number): Withdrawal | undefined {
  const failure = () => new Error('research withdrawal integrity failure');
  const ledger = state.withdrawals;
  if (ledger.some((w) => !w || typeof w !== 'object' || Array.isArray(w))) throw failure();
  const keys = ledger.map((w) => `${String(w.artifactId)}#${String(w.artifactVersion)}`);
  if (new Set(keys).size !== keys.length) throw failure(); // Two withdrawals of one version are ambiguous.
  for (const withdrawal of ledger) {
    try {
      const artifact = exact(state.artifacts, withdrawal.artifactId, withdrawal.artifactVersion);
      const authorization = exact(state.authorizations, withdrawal.artifactId, withdrawal.artifactVersion);
      verifyReleaseProof({ withdrawal: structuredClone(withdrawal) }, trustStore(contextOf(kindOf(artifact)))); // shape, subject digest, and the withdrawing authority's signature
      const bound = (['artifactId', 'artifactVersion', 'payloadDigest', 'profile'] as const).every((key) => canonical(withdrawal[key]) === canonical(authorization[key]))
        && withdrawal.authorizationSubjectDigest === authorization.authorizationSubjectDigest
        && (permission(withdrawal.withdrawnBy).withdrawals as readonly string[]).includes(kindOf(artifact))
        && (withdrawal.reason === undefined || reasonSchema.safeParse(withdrawal.reason).success);
      if (!bound) throw failure();
    } catch { throw failure(); }
  }
  return ledger.find((w) => w.artifactId === id && w.artifactVersion === version);
}
// What the release boundary serves for one exact version: the verified proof, with its withdrawal when one is recorded.
function served(state: State, id: string, version: number) {
  const verified = proof(state, id, version); const withdrawal = withdrawalOf(state, id, version);
  return { ...verified, ...(withdrawal ? { withdrawal } : {}) };
}
function currentVersion(state: State, id: string) {
  let version = 0;
  for (const selection of state.selections.filter((s) => s.artifactId === id)) {
    if (selection.previousVersion !== version || selection.artifactVersion <= version) throw new Error('ambiguous current research selection');
    proof(state, id, selection.artifactVersion); version = selection.artifactVersion;
  }
  return version;
}
function source(state: State, reference: Reference) {
  referenceSchema.parse(reference);
  const verified = served(state, reference.artifactId, reference.artifactVersion);
  if (!['source', 'review', 'editor-notes'].includes(kindOf(verified.release)) || verified.authorization.payloadDigest !== reference.payloadDigest) throw new Error('source baseline integrity failure');
  if (verified.withdrawal) throw new Error('source release is withdrawn');
  return verified;
}
// Validate domain relationships separately from GAP identity. These rules are local journal policy.
function paperSources(state: State, artifact: Artifact, publication = false) {
  const p = paperSchema.parse(artifact.payload);
  const sources = p.dependencySet.entries.map((ref) => source(state, ref));
  const material = sources.filter((s) => kindOf(s.release) === 'source');
  const reports = sources.filter((s) => kindOf(s.release) === 'review');
  if (!material.some((s) => s.release.payload.kind === 'study')) throw new Error('paper must pin at least one released study');
  if (material.filter((s) => s.release.payload.kind === 'methods-paper').length !== 1) throw new Error('paper must pin exactly one released methods paper');
  const bibliographyIds = p.bibliography.map((b) => b.sourceArtifactId).sort();
  if (canonical(bibliographyIds) !== canonical(material.map((s) => s.release.artifactId).sort())) throw new Error('bibliography must map to all governed source material');
  for (const citation of p.bibliography) {
    const cited = material.find((s) => s.release.artifactId === citation.sourceArtifactId)!.release.payload;
    for (const field of ['title', 'authors', 'journal', 'year'] as const) {
      if (canonical(citation[field]) !== canonical(cited[field])) throw new Error('bibliography metadata must match the pinned published paper');
    }
  }
  for (const response of p.reviewResponses) {
    const report = reports.find((r) => r.release.artifactId === response.reviewArtifactId);
    if (!report || !report.release.payload.feedback.some((f: any) => f.id === response.feedbackId)) throw new Error('response does not name pinned review feedback');
  }
  for (const report of reports) {
    const target = report.release.payload.manuscript;
    if (target.artifactId !== artifact.artifactId || target.artifactVersion >= artifact.artifactVersion) throw new Error('report must review an earlier version of this paper');
    if (report.release.payload.feedback.some((f: any) => !p.reviewResponses.some((r) => r.reviewArtifactId === report.release.artifactId && r.feedbackId === f.id))) throw new Error('paper must respond to each pinned review comment');
  }
  const notes = sources.filter((s) => kindOf(s.release) === 'editor-notes');
  for (const response of p.editorResponses) {
    const note = notes.find((n) => n.release.artifactId === response.notesArtifactId);
    if (!note || !note.release.payload.feedback.some((f: any) => f.id === response.feedbackId)) throw new Error('response does not name pinned editor feedback');
  }
  for (const note of notes) {
    const target = note.release.payload.manuscript;
    if (target.artifactId !== artifact.artifactId || target.artifactVersion >= artifact.artifactVersion) throw new Error('editor notes must name an earlier version of this paper');
    if (note.release.payload.feedback.some((f: any) => !p.editorResponses.some((r) => r.notesArtifactId === note.release.artifactId && r.feedbackId === f.id))) throw new Error('paper must respond to each pinned editor comment');
  }
  if (publication && !reports.length) throw new Error('publication requires a released review report and responses');
}
function reviewTarget(state: State, payload: ReviewPayload | EditorNotesPayload) {
  const a = exact(state.artifacts, payload.manuscript.artifactId, payload.manuscript.artifactVersion);
  validate(a);
  if (kindOf(a) !== 'paper' || canonical(subject(a)) !== canonical(payload.manuscript)) throw new Error('review does not bind the exact manuscript');
  for (const f of payload.feedback) {
    const section = a.payload.sections.find((s: any) => s.id === f.sectionId);
    if (!section || !section.text.includes(f.quotedText)) throw new Error('feedback does not match the named manuscript section');
  }
}
function save(state: State, id: string, kind: Kind, payload: Record<string, any>, actor: Actor) {
  if (!(permission(actor).drafts as readonly string[]).includes(kind)) throw new Error('actor lacks configured drafting permission');
  const versions = state.artifacts.filter((a) => a.artifactId === id);
  if (versions.some((a) => kindOf(a) !== kind)) throw new Error('artifact identity cannot change content model');
  const artifact: Artifact = { artifactId: id, artifactVersion: Math.max(0, ...versions.map((a) => a.artifactVersion)) + 1, profile: pin(kind), payload: structuredClone(payload), authoredBy: structuredClone(actor) };
  validate(artifact);
  if (kind === 'paper') paperSources(state, artifact);
  if (['review', 'editor-notes'].includes(kind)) reviewTarget(state, payload as ReviewPayload | EditorNotesPayload);
  state.artifacts.push(artifact); return artifact;
}
export async function saveSource(input: { artifactId: string; payload: SourcePayload; actor: Actor }, root?: string) { return mutate(root, (state) => save(state, input.artifactId, 'source', input.payload, input.actor)); }
export async function savePaper(input: { artifactId: string; payload: PaperPayload; actor: Actor }, root?: string) { return mutate(root, (state) => save(state, input.artifactId, 'paper', input.payload, input.actor)); }
export async function saveReview(input: { artifactId: string; payload: ReviewPayload; actor: Actor }, root?: string) { return mutate(root, (state) => save(state, input.artifactId, 'review', input.payload, input.actor)); }
export async function saveEditorNotes(input: { artifactId: string; payload: EditorNotesPayload; actor: Actor }, root?: string) { return mutate(root, (state) => save(state, input.artifactId, 'editor-notes', input.payload, input.actor)); }
function preview(state: State, artifactId: string, artifactVersion: number) {
  const artifact = exact(state.artifacts, artifactId, artifactVersion); validate(artifact); editorial(state, artifactId, artifactVersion);
  const expectedCurrentVersion = currentVersion(state, artifactId);
  const subjectDigest = bound(artifact).authorizationSubjectDigest;
  return { artifact, expectedCurrentVersion, subjectDigest,
    confirmation: `RELEASE ${artifactId}@${artifactVersion} ${subjectDigest} AFTER ${expectedCurrentVersion}`,
    approvalConfirmation: `APPROVE ${subjectDigest}`, rejectionConfirmation: `REJECT ${subjectDigest}`,
    authority: (({ actorId, actorKind }) => ({ actorId, actorKind }))(actors.find((a) => (a.releases as readonly string[]).includes(kindOf(artifact)))!),
  };
}
export async function previewResearch(input: { artifactId: string; artifactVersion: number; actor: Actor }, root?: string) { permission(input.actor); const { state } = await load(root); return structuredClone(preview(state, input.artifactId, input.artifactVersion)); }
export type Clock = () => string;
const systemClock: Clock = () => new Date().toISOString();
export async function decidePaper(input: { artifactId: string; artifactVersion: number; actor: Actor; decision: 'approve' | 'reject'; confirmation: string; reason?: string }, root?: string, now: Clock = systemClock) {
  return mutate(root, (state) => {
    if (!['approve', 'reject'].includes(input.decision)) throw new Error('unknown editorial decision');
    const p = preview(state, input.artifactId, input.artifactVersion);
    // Local policy: editorial decisions gate publication. After release, a new decision would change the served proof; a rejection is not a withdrawal.
    if (state.releases.some((r) => r.artifactId === input.artifactId && r.artifactVersion === input.artifactVersion)) throw new Error('editorial decision refused: this version is already released');
    if (!(permission(input.actor).approvals as readonly string[]).includes(kindOf(p.artifact))) throw new Error('actor lacks configured editorial authority');
    if (input.confirmation !== (input.decision === 'approve' ? p.approvalConfirmation : p.rejectionConfirmation)) throw new Error('mismatched exact editorial confirmation');
    if (input.reason !== undefined) reasonSchema.parse(input.reason);
    if (input.decision === 'approve') paperSources(state, p.artifact, true);
    const ledger = input.decision === 'approve' ? state.approvals : state.rejections;
    if (ledger.some((d) => d.artifactId === input.artifactId && d.artifactVersion === input.artifactVersion)) throw new Error('editorial decision already recorded');
    const common = { ...bound(p.artifact), authoritySignature: signAsAuthority(input.decision === 'approve' ? 'approve-release' : 'reject-release', input.actor.actorId, p.subjectDigest), ...(input.reason === undefined ? {} : { reason: input.reason }) };
    const time = now(); z.iso.datetime({ offset: true }).parse(time);
    if (input.decision === 'approve') { const d = { ...common, approvedBy: structuredClone(input.actor), approvedAt: time }; state.approvals.push(d); return d; }
    const d = { ...common, rejectedBy: structuredClone(input.actor), rejectedAt: time }; state.rejections.push(d); return d;
  });
}
export async function releaseResearch(input: { artifactId: string; artifactVersion: number; actor: Actor; confirmation: string; expectedCurrentVersion: number }, root?: string, now: Clock = systemClock) {
  return mutate(root, (state) => {
    const p = preview(state, input.artifactId, input.artifactVersion); const a = p.artifact;
    if (!(permission(input.actor).releases as readonly string[]).includes(kindOf(a))) throw new Error('authorship and review do not grant publication authority');
    if (input.expectedCurrentVersion !== p.expectedCurrentVersion || input.confirmation !== p.confirmation) throw new Error('stale selection or mismatched exact release confirmation');
    if (input.artifactVersion <= p.expectedCurrentVersion || state.releases.some((r) => r.artifactId === input.artifactId && r.artifactVersion === input.artifactVersion)) throw new Error('cannot replay or roll back a research release');
    if (kindOf(a) === 'paper') {
      paperSources(state, a, true);
      if (!editorial(state, a.artifactId, a.artifactVersion).approvals.length) throw new Error('publication requires exact editorial approval');
    }
    if (['review', 'editor-notes'].includes(kindOf(a))) reviewTarget(state, a.payload as ReviewPayload | EditorNotesPayload);
    const time = now(); z.iso.datetime({ offset: true }).parse(time);
    state.authorizations.push({ ...bound(a), authorizedBy: structuredClone(input.actor), authorizedAt: time, authoritySignature: signAsAuthority('authorize-release', input.actor.actorId, p.subjectDigest) });
    state.releases.push({ artifactId: a.artifactId, artifactVersion: a.artifactVersion, payload: structuredClone(a.payload), profile: structuredClone(a.profile) });
    state.selections.push({ artifactId: a.artifactId, artifactVersion: a.artifactVersion, previousVersion: p.expectedCurrentVersion });
    return proof(state, a.artifactId, a.artifactVersion);
  });
}
export async function withdrawResearch(input: { artifactId: string; artifactVersion: number; actor: Actor; reason?: string }, root?: string, now: Clock = systemClock) {
  return mutate(root, (state) => {
    const verified = proof(state, input.artifactId, input.artifactVersion);
    if (!(permission(input.actor).withdrawals as readonly string[]).includes(kindOf(verified.release))) throw new Error('actor lacks configured withdrawal authority');
    if (input.reason !== undefined) reasonSchema.parse(input.reason);
    if (withdrawalOf(state, input.artifactId, input.artifactVersion)) throw new Error('release already withdrawn');
    const time = now(); z.iso.datetime({ offset: true }).parse(time);
    const b = bound(verified.release);
    state.withdrawals.push({ ...b, withdrawnBy: structuredClone(input.actor), withdrawnAt: time, authoritySignature: signAsAuthority('withdraw-release', input.actor.actorId, b.authorizationSubjectDigest), ...(input.reason === undefined ? {} : { reason: input.reason }) });
    return served(state, input.artifactId, input.artifactVersion);
  });
}
export async function readResearch(input: { artifactId?: string; artifactVersion?: number }, root?: string) {
  const { state } = await load(root);
  if (input.artifactVersion !== undefined && !input.artifactId) throw new Error('exact version requires an artifact ID');
  const ids = input.artifactId ? [input.artifactId] : [...new Set(state.selections.map((s) => s.artifactId))];
  const results = [];
  for (const id of ids) {
    const version = input.artifactVersion ?? currentVersion(state, id);
    if (!version) { if (input.artifactId) throw new Error('draft is not released'); else continue; }
    const record = served(state, id, version);
    results.push(input.artifactVersion === undefined && record.withdrawal ? { withdrawal: record.withdrawal } : record);
  }
  return structuredClone(results);
}
export async function sweepResearch(actor: Actor, root?: string) {
  permission(actor); const { state } = await load(root);
  const findings: { artifactId: string; artifactVersion: number; source: Reference; status: 'aligned' | 'drift' | 'integrity-failure' | 'unresolved'; selectedVersion?: number }[] = [];
  for (const id of new Set(state.selections.map((s) => s.artifactId))) {
    if (!state.artifacts.some((a) => a.artifactId === id && a.profile.profileId === 'research-paper')) continue;
    const version = currentVersion(state, id); const parent = proof(state, id, version);
    for (const ref of parent.release.payload.dependencySet.entries as Reference[]) {
      let status: typeof findings[number]['status'] = 'unresolved'; let selectedVersion: number | undefined;
      if (state.releases.some((r) => r.artifactId === ref.artifactId && r.artifactVersion === ref.artifactVersion)) {
        try { source(state, ref); selectedVersion = currentVersion(state, ref.artifactId); status = !selectedVersion ? 'unresolved' : selectedVersion === ref.artifactVersion ? 'aligned' : 'drift'; }
        catch { status = 'integrity-failure'; }
      }
      findings.push({ artifactId: id, artifactVersion: version, source: structuredClone(ref), status, ...(selectedVersion ? { selectedVersion } : {}) });
    }
  }
  return findings; // Derived comparisons preserve the authorized baseline and never withdraw a paper.
}
