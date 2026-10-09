// Independent consumer verification of a release proof (specification, step 6). This module reads nothing from the
// workspace and consults no local permission table: it takes the proof bytes a reader holds and the trust store the
// reader configured, recomputes every digest, checks every exact reference, and verifies every authority signature.
// A reader who never touches this application can run it and reach the same answer.
import { Ajv2020 } from 'ajv/dist/2020.js';
import { canonical, digest, isDigest, verifyAuthoritySignature, type AuthorityAction, type TrustStore } from './authority.js';

type Json = Record<string, any>;
export type Verification = {
  status: 'verified' | 'withdrawn';
  artifactId: string;
  artifactVersion: number;
  profile: { profileId: string; revision: number; digest: string };
  subjectDigest: string;
  signedBy: { ratification?: string; authorization?: string; approvals?: string[]; rejections?: string[]; withdrawal?: string };
  claim: string;
};
const contracts = new Ajv2020({ strict: true, allErrors: true });
const failure = (detail: string) => new Error(`release proof verification failure: ${detail}`);
function record(value: unknown, keys: string[], optional: string[] = []): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw failure('expected a record');
  const present = Object.keys(value as object);
  if (keys.some((key) => !present.includes(key)) || present.some((key) => !keys.includes(key) && !optional.includes(key))) throw failure(`unexpected record fields: ${present.sort().join(',')}`);
  return value as Json;
}
const nonEmpty = (value: unknown): string => { if (typeof value !== 'string' || !value.trim()) throw failure('expected a non-empty string'); return value; };
const positive = (value: unknown): number => { if (!Number.isSafeInteger(value) || (value as number) < 1) throw failure('expected a positive integer'); return value as number; };
// RFC 3339 date-time, the schema's `date-time` format: a full date, 'T', a full time with optional fraction, and 'Z' or a numeric offset.
const rfc3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const timestamp = (value: unknown): string => { if (typeof value !== 'string' || !rfc3339.test(value) || !Number.isFinite(Date.parse(value))) throw failure('expected an RFC 3339 timestamp'); return value; };
// A decision reason (specification, Primitives): when present, a string with at least one non-whitespace character; no other meaning.
const reason = (r: Json) => { if ('reason' in r && (typeof r.reason !== 'string' || !r.reason.trim())) throw failure('a reason must be a non-blank string'); };
// The one payload member GAP reserves (specification, Dependency set): entries pin released versions exactly, in strictly ascending artifactId order, no source twice.
function dependencySet(value: unknown) {
  const set = record(value, ['entries']);
  if (!Array.isArray(set.entries)) throw failure('dependencySet.entries must be an array');
  let previous: string | undefined;
  for (const entry of set.entries) {
    const e = record(entry, ['artifactId', 'artifactVersion', 'payloadDigest']);
    nonEmpty(e.artifactId); positive(e.artifactVersion); sha(e.payloadDigest);
    if (previous !== undefined && !(e.artifactId > previous)) throw failure('dependencySet entries must be in strictly ascending artifactId order');
    previous = e.artifactId;
  }
}
function payload(value: unknown) {
  const p = record(value, [], Object.keys((value as object) ?? {}));
  if ('dependencySet' in p) dependencySet(p.dependencySet);
  return p;
}
// The one contract member GAP reserves (specification, Propose a profile): $contractLanguage, when present, names one language and version.
function payloadContract(value: unknown) {
  const c = record(value, [], Object.keys((value as object) ?? {}));
  if ('$contractLanguage' in c) nonEmpty(c.$contractLanguage);
  return c;
}
const sha = (value: unknown): string => { if (!isDigest(value)) throw failure('expected a sha256 digest'); return value; };
function actor(value: unknown) { const a = record(value, ['actorId', 'actorKind']); nonEmpty(a.actorId); if (a.actorKind !== 'human' && a.actorKind !== 'agent') throw failure('unknown actor kind'); return a as { actorId: string; actorKind: string }; }
function pin(value: unknown) { const p = record(value, ['profileId', 'revision', 'digest']); nonEmpty(p.profileId); positive(p.revision); sha(p.digest); return p as { profileId: string; revision: number; digest: string }; }
const subjectOf = (r: Json) => ({ artifactId: r.artifactId, artifactVersion: r.artifactVersion, payloadDigest: r.payloadDigest, profile: r.profile });
const subjectDigestOf = (r: Json) => digest('governed-artifact.authorization-subject.v1', subjectOf(r));
// A decision record over the authorization subject: approval, authorization, or withdrawal. Checks its own subject
// fields, recomputes its subject digest, and verifies its signature by the record's actor for the given action.
function decision(value: unknown, action: AuthorityAction, actorKey: string, timeKey: string, store: TrustStore, extraOptional: string[] = [], subjectRequired = true) {
  const r = record(value, ['artifactId', 'artifactVersion', 'payloadDigest', 'profile', actorKey, timeKey, ...(subjectRequired ? ['authorizationSubjectDigest'] : [])], ['authoritySignature', 'reason', ...extraOptional, ...(subjectRequired ? [] : ['authorizationSubjectDigest'])]);
  nonEmpty(r.artifactId); positive(r.artifactVersion); sha(r.payloadDigest); pin(r.profile); timestamp(r[timeKey]); reason(r);
  const who = actor(r[actorKey]);
  const subjectDigest = subjectDigestOf(r);
  if (r.authorizationSubjectDigest !== undefined && sha(r.authorizationSubjectDigest) !== subjectDigest) throw failure(`${action} subject digest does not recompute`);
  if (!('authoritySignature' in r)) throw failure(`${action} record carries no authority signature`);
  const signer = verifyAuthoritySignature(action, subjectDigest, r.authoritySignature, store, who.actorId);
  return { record: r, subjectDigest, signer };
}
function profileRevision(value: unknown, store: TrustStore) {
  const p = record(value, ['profileId', 'revision', 'payloadContract', 'digest', 'ratification']);
  nonEmpty(p.profileId); positive(p.revision); payloadContract(p.payloadContract);
  if (sha(p.digest) !== digest('governed-artifact.profile-revision.draft', { profileId: p.profileId, revision: p.revision, payloadContract: p.payloadContract })) throw failure('profile digest does not recompute');
  const ratification = record(p.ratification, ['ratifiedAt', 'actorId', 'actorKind'], ['authoritySignature', 'reason']);
  timestamp(ratification.ratifiedAt); actor({ actorId: ratification.actorId, actorKind: ratification.actorKind }); reason(ratification);
  if (!('authoritySignature' in ratification)) throw failure('ratification carries no authority signature');
  const signer = verifyAuthoritySignature('ratify-profile', p.digest, ratification.authoritySignature, store, ratification.actorId);
  return { record: p, signer };
}
function withdrawal(value: unknown, store: TrustStore) {
  return decision(value, 'withdraw-release', 'withdrawnBy', 'withdrawnAt', store);
}
const claim = 'the trusted keys signed exactly these records over exactly this subject; a release proves what entered the boundary, not any downstream outcome or what the signers reviewed beyond the subject';
// Verify a release proof, or a withdrawal served alone, against the given trust store.
export function verifyReleaseProof(input: unknown, store: TrustStore): Verification {
  if (input && typeof input === 'object' && !Array.isArray(input) && Object.keys(input).join(',') === 'withdrawal') {
    const w = withdrawal((input as Json).withdrawal, store);
    return { status: 'withdrawn', artifactId: w.record.artifactId, artifactVersion: w.record.artifactVersion, profile: { ...w.record.profile }, subjectDigest: w.subjectDigest, signedBy: { withdrawal: w.signer }, claim: `${claim}; served without its release, this establishes only that the release is withdrawn` };
  }
  const proof = record(input, ['profile', 'authorization', 'release'], ['approvals', 'rejections', 'withdrawal']);
  const profile = profileRevision(proof.profile, store);
  const release = record(proof.release, ['artifactId', 'artifactVersion', 'payload', 'profile']);
  nonEmpty(release.artifactId); positive(release.artifactVersion); payload(release.payload);
  const releasePin = pin(release.profile);
  if (releasePin.profileId !== profile.record.profileId || releasePin.revision !== profile.record.revision || releasePin.digest !== profile.record.digest) throw failure('release pin does not match the embedded profile revision');
  if (profile.record.payloadContract.$contractLanguage !== 'json-schema/draft-2020-12') throw failure('unknown contract semantics');
  const { $contractLanguage, ...contract } = profile.record.payloadContract;
  if (!contracts.getSchema(profile.record.digest)) contracts.addSchema(contract, profile.record.digest);
  if (!contracts.getSchema(profile.record.digest)!(release.payload)) throw failure('payload does not satisfy the pinned contract');
  const authorization = decision(proof.authorization, 'authorize-release', 'authorizedBy', 'authorizedAt', store, [], false);
  const a = authorization.record;
  if (a.artifactId !== release.artifactId || a.artifactVersion !== release.artifactVersion || canonical(a.profile) !== canonical(release.profile)) throw failure('authorization does not bind the released identity, version, and pin');
  if (a.payloadDigest !== digest('governed-artifact.payload.v1', release.payload)) throw failure('payload digest does not recompute from the released payload');
  const signedBy: Verification['signedBy'] = { ratification: profile.signer, authorization: authorization.signer };
  // Approvals and rejections are carried beside the authorization; each must bind the identical subject and be signed
  // by its own actor under its own domain (specification, step 6 rules 6 and 7).
  const carried = (key: 'approvals' | 'rejections', action: AuthorityAction, actorKey: string, timeKey: string): string[] => {
    if (!Array.isArray(proof[key])) throw failure(`${key} must be an array`);
    const seen = new Set<string>();
    return proof[key].map((entry: unknown) => {
      const d = decision(entry, action, actorKey, timeKey, store);
      if (canonical(subjectOf(d.record)) !== canonical(subjectOf(a))) throw failure(`a carried ${key.slice(0, -1)} binds another subject`);
      const dup = canonical(entry); if (seen.has(dup)) throw failure(`duplicate ${key.slice(0, -1)}`); seen.add(dup);
      return d.signer;
    });
  };
  if ('approvals' in proof) signedBy.approvals = carried('approvals', 'approve-release', 'approvedBy', 'approvedAt');
  if ('rejections' in proof) signedBy.rejections = carried('rejections', 'reject-release', 'rejectedBy', 'rejectedAt');
  let status: Verification['status'] = 'verified';
  if ('withdrawal' in proof) {
    const w = withdrawal(proof.withdrawal, store);
    if (canonical(subjectOf(w.record)) !== canonical(subjectOf(a))) throw failure('the withdrawal binds another subject');
    signedBy.withdrawal = w.signer; status = 'withdrawn';
  }
  // authorization.subjectDigest is the digest recomputed from the record's own fields, not the optional stored one.
  return { status, artifactId: release.artifactId, artifactVersion: release.artifactVersion, profile: releasePin, subjectDigest: authorization.subjectDigest, signedBy, claim };
}
