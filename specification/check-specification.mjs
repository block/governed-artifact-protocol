// Executable check for the specification artifacts:
// 1. every example validates against the core schema;
// 2. every digest in the examples recomputes exactly under the current wire domains;
// 3. every release approval and release rejection in a set binds the identical subject as its release
//    authorization, and a release withdrawal binds the identical subject as the authorization it withdraws;
// 4. representative invalid records are rejected by the schema, and approvals, rejections, or withdrawals
//    over another subject are rejected by the binding check;
// 4a. a reason on any decision record (README.md, Primitives) is accepted only as a non-empty string and
//    changes no profile digest, payload digest, or subject digest;
// 5. the cms post follows a profile revision whose contract declares a consistent locale policy, and one
//    payload digest covers every locale of its four-locale payload;
// 6. the research dependency sets pin their sources exactly: a released study and methods paper under the source
//    profile, a peer-review report, and, for the final paper, editor notes, each checked against its own release proof;
// 7. every authority signature in the research examples (ratifications, editorial approvals and the rejection,
//    authorizations, and the withdrawal) verifies against its context's published trust store, and stripped, altered,
//    cross-action, re-attributed, untrusted, other-context, or other-version signatures are rejected; a signed release approval and a signed
//    release rejection also receive negative checks under an ephemeral key; and
// 8. the conformance manifest is well-formed and its requirement IDs are unique and complete.
//
// Scope: this script checks the maintained specification artifacts only. Schema
// validation checks record shape; the digest recomputation covers the maintained
// examples and enforces the canonicalizer's safe-integer restriction only for
// those bytes — it does not reject arbitrary schema-valid records. It is not a
// portable conformance runner for independent implementations (see DEFERRED.md,
// "Portable conformance suite").
import { createHash, createPublicKey, generateKeyPairSync, sign as edSign, verify as edVerify } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { conformanceChecks, inForce } from './conformance.mjs';

const here = new URL('./', import.meta.url);
const readJson = async (path) => JSON.parse(await readFile(new URL(path, here), 'utf8'));

let failures = 0;
const pass = (name) => console.log(`PASS ${name}`);
const fail = (name, detail) => { failures += 1; console.error(`FAIL ${name}: ${detail}`); };
const check = (name, condition, detail) => (condition ? pass(name) : fail(name, detail));

// --- canonicalization and digests (README.md, Digest construction) ---
function canonicalJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new Error('canonical JSON permits only safe integers');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}
const digest = (domain, value) =>
  `sha256:${createHash('sha256').update(`${domain}\n${canonicalJson(value)}`, 'utf8').digest('hex')}`;

// --- authority signatures (README.md, Authority signature) ---
// Ed25519 over the action's fixed domain line, one line feed, then the canonical statement naming the signer and the exact
// subject digest. Keys and signatures are unpadded base64url of exactly 32 and 64 bytes.
const signingDomain = (action) => `governed-artifact.authority.${action}.ed25519.v1`;
const signedBytes = (action, signerId, subjectDigest) => Buffer.from(`${signingDomain(action)}\n${canonicalJson({ signerId, subjectDigest })}`, 'utf8');
const decodeExact = (text, bytes) => {
  if (typeof text !== 'string' || !/^[A-Za-z0-9_-]+$/.test(text)) throw new Error('malformed base64url');
  const decoded = Buffer.from(text, 'base64url');
  if (decoded.length !== bytes || decoded.toString('base64url') !== text) throw new Error(`expected ${bytes} bytes`);
  return decoded;
};
const publicKey = (raw) => createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: decodeExact(raw, 32).toString('base64url') }, format: 'jwk' });
// The consumer's verification of one signature: exact record shape, signer ID equal to the record actor, a trust store
// entry trusted for this action, and the bytes verifying under that entry's key. Returns false on anything it cannot resolve.
const signatureVerifies = (action, subjectDigest, signature, store, expectedSignerId) => {
  try {
    if (!signature || typeof signature !== 'object' || Object.keys(signature).sort().join(',') !== 'signature,signerId') return false;
    if (typeof signature.signerId !== 'string' || signature.signerId !== expectedSignerId) return false;
    const trusted = Object.prototype.hasOwnProperty.call(store, signature.signerId) ? store[signature.signerId] : undefined;
    if (!trusted || !Array.isArray(trusted.actions) || !trusted.actions.includes(action)) return false;
    return edVerify(null, signedBytes(action, signature.signerId, subjectDigest), publicKey(trusted.publicKey), decodeExact(signature.signature, 64));
  } catch { return false; }
};
const signWith = (privateKey, action, signerId, subjectDigest) => ({ signerId, signature: edSign(null, signedBytes(action, signerId, subjectDigest), privateKey).toString('base64url') });

// --- schema ---
const schema = await readJson('draft/schemas/core.schema.json');
const ajv = new Ajv2020.default({ strict: true, allowUnionTypes: true, allErrors: true });
addFormats.default(ajv);
ajv.addSchema(schema);
const validate = (ref, value) => {
  const validator = ajv.getSchema(`${schema.$id}#/$defs/${ref}`);
  if (!validator) throw new Error(`schema $defs/${ref} not found`);
  return { ok: validator(value), errors: validator.errors };
};

// --- example sets: one complete lifecycle per example ---
// Every folder holds its shared profile revision(s) as profile-revision.json (or profile-revision_<model>.json
// when a set has several models) and each artifact record as <record>_<example>.json.
const researchSet = (example, extra = {}) => ({ name: `research-${example}`, dir: 'draft/examples/research/', suffix: `_${example}`, profileFile: `profile-revision_${/^(study|methods)-/.test(example) ? 'source' : example.replace(/-\d+$/, '')}.json`, ...extra });
const lifecycleSets = [
  { name: 'cms-four-locale-post', dir: 'draft/examples/cms/', suffix: '_four-locale-post', approval: true, rejection: true },
  { name: 'issue-tracking-new-ticket', dir: 'draft/examples/issue-tracking/', suffix: '_new-ticket' },
  { name: 'issue-tracking-criteria-update', dir: 'draft/examples/issue-tracking/', suffix: '_criteria-update' },
  researchSet('study-1'), researchSet('study-2'), researchSet('methods-1'), researchSet('review-1'), researchSet('editor-notes-1'),
  researchSet('paper-3', { approval: true }),
  researchSet('withdrawal-review-1', { profileFile: 'profile-revision_review.json' }),
  researchSet('withdrawal-paper-2', { profileFile: 'profile-revision_paper.json', approval: true, withdrawal: true }),
];
// The trust stores a reader of the research examples is configured with: consumer configuration, never part of a proof.
// The journal and the works it cites are separate source contexts, each trusting one release authority.
const researchTrustStores = {
  journal: await readJson('draft/examples/research/trust-store_journal.json'),
  'cited-works': await readJson('draft/examples/research/trust-store_cited-works.json'),
};
for (const [context, store] of Object.entries(researchTrustStores)) {
  check(`schema [research]: trust-store_${context}.json validates as TrustStore`, validate('TrustStore', store).ok, JSON.stringify(validate('TrustStore', store).errors));
  check(`trust [research]: the ${context} store trusts exactly one release authority`,
    Object.values(store).filter((entry) => entry.actions.includes('authorize-release')).length === 1, 'several signers may authorize release in one context');
}
const researchTrustStore = researchTrustStores.journal;
const trustFor = (profileRevision) => researchTrustStores[profileRevision.profileId === 'research-source' ? 'cited-works' : 'journal'];
const examples = {};
for (const set of lifecycleSets) {
  const file = (record) => `${set.dir}${record}${set.suffix}.json`;
  examples[set.name] = {
    profileRevision: await readJson(`${set.dir}${set.profileFile ?? 'profile-revision.json'}`),
    artifactVersion: await readJson(file('artifact-version')),
    authorization: await readJson(file('release-authorization')),
    release: await readJson(file('release')),
    releaseProof: await readJson(file('release-proof')),
    approval: set.approval ? await readJson(file('release-approval')) : undefined,
    rejection: set.rejection ? await readJson(file('release-rejection')) : undefined,
    ...(set.withdrawal ? { withdrawal: await readJson(file('release-withdrawal')), withdrawnProof: await readJson(file('release-proof-withdrawn')) } : {}),
  };
}
const samePin = (a, b) => a.profileId === b.profileId && a.revision === b.revision && a.digest === b.digest;
const subjectDigest = (record) => digest('governed-artifact.authorization-subject.v1', {
  artifactId: record.artifactId,
  artifactVersion: record.artifactVersion,
  payloadDigest: record.payloadDigest,
  profile: record.profile,
});
// README.md, step 6: a carried approval or rejection binds the identical subject as the authorization.
const approvalBindsAuthorization = (approval, authorization) =>
  approval.artifactId === authorization.artifactId
  && approval.artifactVersion === authorization.artifactVersion
  && approval.payloadDigest === authorization.payloadDigest
  && samePin(approval.profile, authorization.profile)
  && approval.authorizationSubjectDigest === subjectDigest(authorization);
// A withdrawal binds the identical subject as the authorization it withdraws (README.md, Release withdrawal):
// the four subject fields are canonically identical and the carried subject digest recomputes to the same value.
const bindsSubject = (withdrawal, authorization) =>
  ['artifactId', 'artifactVersion', 'payloadDigest', 'profile'].every((key) => canonicalJson(withdrawal[key]) === canonicalJson(authorization[key]))
  && subjectDigest(withdrawal) === withdrawal.authorizationSubjectDigest
  && withdrawal.authorizationSubjectDigest === authorization.authorizationSubjectDigest;
for (const [name, { profileRevision, artifactVersion, authorization, release, releaseProof, approval, rejection, withdrawal, withdrawnProof }] of Object.entries(examples)) {
  for (const [ref, value] of [
    ['ProfileRevision', profileRevision],
    ['ArtifactVersion', artifactVersion],
    ['ReleaseAuthorization', authorization],
    ['Release', release],
    ['ReleaseProof', releaseProof],
  ]) {
    const { ok, errors } = validate(ref, value);
    check(`schema [${name}]: example validates as ${ref}`, ok, JSON.stringify(errors));
  }

  // --- digest recomputation ---
  const recomputedProfile = digest('governed-artifact.profile-revision.draft', {
    payloadContract: profileRevision.payloadContract,
    profileId: profileRevision.profileId,
    revision: profileRevision.revision,
  });
  check(`digest [${name}]: profile revision digest recomputes`, recomputedProfile === profileRevision.digest,
    `${recomputedProfile} != ${profileRevision.digest}`);
  const recomputedPayload = digest('governed-artifact.payload.v1', release.payload);
  check(`digest [${name}]: payload digest recomputes`, recomputedPayload === authorization.payloadDigest,
    `${recomputedPayload} != ${authorization.payloadDigest}`);
  const recomputedSubject = subjectDigest(authorization);
  check(`digest [${name}]: authorization subject digest recomputes`, recomputedSubject === authorization.authorizationSubjectDigest,
    `${recomputedSubject} != ${authorization.authorizationSubjectDigest}`);

  // --- release approval (present only in sets that record one) ---
  if (approval !== undefined) {
    const { ok, errors } = validate('ReleaseApproval', approval);
    check(`schema [${name}]: example validates as ReleaseApproval`, ok, JSON.stringify(errors));
    const recomputedApprovalSubject = subjectDigest(approval);
    check(`digest [${name}]: approval subject digest recomputes from its own fields`,
      recomputedApprovalSubject === approval.authorizationSubjectDigest, `${recomputedApprovalSubject} != ${approval.authorizationSubjectDigest}`);
    check(`binding [${name}]: approval binds the identical subject as the authorization`,
      approvalBindsAuthorization(approval, authorization), 'approval subject differs from the authorization subject');
    check(`binding [${name}]: release proof carries exactly the recorded approval`,
      canonicalJson(releaseProof.approvals) === canonicalJson([approval]), 'release proof approvals differ from the recorded approval');
  }

  // --- release rejection (present only in sets that record one): binds like an approval, gates nothing ---
  if (rejection !== undefined) {
    const { ok, errors } = validate('ReleaseRejection', rejection);
    check(`schema [${name}]: example validates as ReleaseRejection`, ok, JSON.stringify(errors));
    check(`digest [${name}]: rejection subject digest recomputes from its own fields`,
      subjectDigest(rejection) === rejection.authorizationSubjectDigest, `${subjectDigest(rejection)} != ${rejection.authorizationSubjectDigest}`);
    check(`binding [${name}]: rejection binds the identical subject as the authorization`,
      approvalBindsAuthorization(rejection, authorization), 'rejection subject differs from the authorization subject');
    check(`binding [${name}]: release proof carries exactly the recorded rejection beside the approval`,
      canonicalJson(releaseProof.rejections) === canonicalJson([rejection]), 'release proof rejections differ from the recorded rejection');
    check(`binding [${name}]: the rejected version was released anyway, so a rejection blocks nothing`,
      release.artifactVersion === rejection.artifactVersion && authorization.artifactVersion === rejection.artifactVersion, 'the rejection and the release name different versions');
  } else {
    check(`binding [${name}]: release proof carries no rejections when none is recorded`, !('rejections' in releaseProof), 'unexpected rejections in the proof');
  }

  // --- exact reference binding across the set ---
  check(`binding [${name}]: artifact, authorization, and release share one exact profile pin`,
    samePin(artifactVersion.profile, authorization.profile) && samePin(authorization.profile, release.profile),
    'profile pins differ');
  check(`binding [${name}]: profile pin matches the ratified revision`,
    samePin(release.profile, profileRevision), 'pin does not match profile revision');
  check(`binding [${name}]: authorization binds the released artifact identity and version`,
    authorization.artifactId === release.artifactId && authorization.artifactVersion === release.artifactVersion,
    'artifact identity mismatch');
  check(`binding [${name}]: release carries the authored payload`,
    canonicalJson(release.payload) === canonicalJson(artifactVersion.payload), 'release payload differs from artifact version');
  check(`binding [${name}]: release proof embeds the exact records`,
    canonicalJson(releaseProof.profile) === canonicalJson(profileRevision)
      && canonicalJson(releaseProof.authorization) === canonicalJson(authorization)
      && canonicalJson(releaseProof.release) === canonicalJson(release),
    'release proof embeds different records');

  // --- release withdrawal: a new record beside the release, bound to the identical subject ---
  if (withdrawal || withdrawnProof) {
    check(`schema [${name}]: withdrawal validates as ReleaseWithdrawal`, validate('ReleaseWithdrawal', withdrawal).ok,
      JSON.stringify(validate('ReleaseWithdrawal', withdrawal).errors));
    check(`schema [${name}]: withdrawn proof validates as ReleaseProof`, validate('ReleaseProof', withdrawnProof).ok,
      JSON.stringify(validate('ReleaseProof', withdrawnProof).errors));
    check(`binding [${name}]: withdrawal carries the authorization's four subject fields exactly`,
      ['artifactId', 'artifactVersion', 'payloadDigest', 'profile'].every((key) => canonicalJson(withdrawal[key]) === canonicalJson(authorization[key])),
      'withdrawal subject fields differ from the authorization');
    check(`digest [${name}]: withdrawal subject digest recomputes and equals the authorization's`,
      subjectDigest(withdrawal) === withdrawal.authorizationSubjectDigest
        && withdrawal.authorizationSubjectDigest === authorization.authorizationSubjectDigest,
      `${subjectDigest(withdrawal)} != ${withdrawal.authorizationSubjectDigest} or != ${authorization.authorizationSubjectDigest}`);
    check(`binding [${name}]: withdrawn proof is the plain proof plus exactly the withdrawal`,
      canonicalJson(withdrawnProof.profile) === canonicalJson(releaseProof.profile)
        && canonicalJson(withdrawnProof.authorization) === canonicalJson(releaseProof.authorization)
        && canonicalJson(withdrawnProof.release) === canonicalJson(releaseProof.release)
        && canonicalJson(withdrawnProof.withdrawal) === canonicalJson(withdrawal)
        && canonicalJson(withdrawnProof) === canonicalJson({ ...releaseProof, withdrawal }),
      'withdrawn proof embeds different records');
  }

  // --- authority signatures (research sets): every decision record verifies against its context's published trust store ---
  if (name.startsWith('research-')) {
    check(`signature [${name}]: ratification is signed by its actor over the profile digest`,
      signatureVerifies('ratify-profile', profileRevision.digest, profileRevision.ratification.authoritySignature, trustFor(profileRevision), profileRevision.ratification.actorId),
      'ratification signature does not verify');
    check(`signature [${name}]: authorization is signed by its actor over the recomputed subject digest`,
      signatureVerifies('authorize-release', subjectDigest(authorization), authorization.authoritySignature, trustFor(profileRevision), authorization.authorizedBy.actorId),
      'authorization signature does not verify');
    check(`signature [${name}]: the proof carries the same signatures`,
      canonicalJson(releaseProof.authorization.authoritySignature) === canonicalJson(authorization.authoritySignature)
        && canonicalJson(releaseProof.profile.ratification.authoritySignature) === canonicalJson(profileRevision.ratification.authoritySignature),
      'proof signatures differ from the records');
    if (approval) check(`signature [${name}]: editorial approval verifies under its own domain`,
      signatureVerifies('approve-release', subjectDigest(approval), approval.authoritySignature, trustFor(profileRevision), approval.approvedBy.actorId), 'approval signature does not verify');
    if (withdrawal) {
      check(`signature [${name}]: withdrawal is signed by its actor over the same subject under the withdrawal domain`,
        signatureVerifies('withdraw-release', subjectDigest(withdrawal), withdrawal.authoritySignature, trustFor(profileRevision), withdrawal.withdrawnBy.actorId)
          && withdrawal.authoritySignature.signature !== authorization.authoritySignature.signature,
        'withdrawal signature does not verify or equals the authorization signature');
    }
  } else {
    check(`signature [${name}]: an attributed set carries no authority signature`,
      !('authoritySignature' in authorization) && !('authoritySignature' in profileRevision.ratification)
        && !(approval && 'authoritySignature' in approval) && !(rejection && 'authoritySignature' in rejection), 'unexpected signature in an attributed set');
  }
}
const { profileRevision, artifactVersion, authorization, release, releaseProof, approval, rejection } = examples['cms-four-locale-post'];

const ticketFirst = examples['issue-tracking-new-ticket'];
const ticketUpdated = examples['issue-tracking-criteria-update'];
check('binding [issue-tracking]: the update is version 2 of the same ticket under the same profile',
  ticketFirst.artifactVersion.artifactId === ticketUpdated.artifactVersion.artifactId
    && ticketFirst.artifactVersion.artifactVersion === 1
    && ticketUpdated.artifactVersion.artifactVersion === 2
    && samePin(ticketFirst.artifactVersion.profile, ticketUpdated.artifactVersion.profile),
  'the ticket identity, version sequence, or profile pin differs');
check('binding [issue-tracking]: the assignee adds acceptance criteria and moves the ticket to in progress',
  ticketFirst.artifactVersion.payload.status === 'to_do'
    && ticketFirst.artifactVersion.payload.acceptanceCriteria.length === 0
    && ticketUpdated.artifactVersion.payload.status === 'in_progress'
    && canonicalJson(ticketUpdated.artifactVersion.payload.acceptanceCriteria) === canonicalJson(['Subtracting 2 from 5 must display 3.'])
    && ticketUpdated.artifactVersion.authoredBy.actorId === 'agent:assignee'
    && ticketUpdated.authorization.authorizedBy.actorId === 'agent:assignee',
  'the maintained update does not match the issue-tracking workflow');

// --- invalid records must fail schema validation ---
const clone = (value) => JSON.parse(JSON.stringify(value));
const invalidCases = [
  ['unknown field on release', 'Release', (() => { const r = clone(release); r.channel = 'sms'; return r; })()],
  ['zero artifact version', 'Release', (() => { const r = clone(release); r.artifactVersion = 0; return r; })()],
  ['malformed digest on pin', 'Release', (() => { const r = clone(release); r.profile.digest = 'sha256:short'; return r; })()],
  ['authorization missing authorizedBy', 'ReleaseAuthorization', (() => {
    const a = clone(authorization); delete a.authorizedBy; return a; })()],
  ['ratification missing actor', 'ProfileRevision', (() => {
    const p = clone(profileRevision); p.ratification = { ratifiedAt: '2026-08-24T02:00:00Z' }; return p; })()],
  ['actorKind service is not a GAP actor kind', 'ReleaseAuthorization', (() => {
    const a = clone(authorization); a.authorizedBy.actorKind = 'service'; return a; })()],
  ['ratification carrying an unknown field', 'ProfileRevision', (() => {
    const p = clone(profileRevision); p.ratification.note = 'approved'; return p; })()],
  ['ratification with an empty reason', 'ProfileRevision', (() => {
    const p = clone(profileRevision); p.ratification.reason = ''; return p; })()],
  ['authorization with an empty reason', 'ReleaseAuthorization', (() => {
    const a = clone(authorization); a.reason = ''; return a; })()],
  ['authorization with a structured reason instead of plain text', 'ReleaseAuthorization', (() => {
    const a = clone(authorization); a.reason = { reviewed: ['rendered page'] }; return a; })()],
  ['approval with an empty reason', 'ReleaseApproval', (() => {
    const a = clone(approval); a.reason = ''; return a; })()],
  ['ratification with a whitespace-only reason', 'ProfileRevision', (() => {
    const p = clone(profileRevision); p.ratification.reason = ' \t\n'; return p; })()],
  ['authorization with a whitespace-only reason', 'ReleaseAuthorization', (() => {
    const a = clone(authorization); a.reason = '   '; return a; })()],
  ['approval with a whitespace-only reason', 'ReleaseApproval', (() => {
    const a = clone(approval); a.reason = '\u00a0'; return a; })()],
  ['authorization carrying an unknown field', 'ReleaseAuthorization', (() => {
    const a = clone(authorization); a.note = 'approved'; return a; })()],
  ['proposal contract with an empty $contractLanguage', 'ProfileProposal', (() => {
    const p = {
      profileId: profileRevision.profileId,
      revision: profileRevision.revision,
      payloadContract: clone(profileRevision.payloadContract),
      proposedBy: { actorId: 'agent:content-model-owner', actorKind: 'agent' },
    };
    p.payloadContract.$contractLanguage = '';
    return p; })()],
  ['revision contract with a non-string $contractLanguage', 'ProfileRevision', (() => {
    const p = clone(profileRevision);
    p.payloadContract.$contractLanguage = { name: 'json-schema', version: 'draft-2020-12' };
    return p; })()],
  ['approval missing authorizationSubjectDigest', 'ReleaseApproval', (() => {
    const a = clone(approval); delete a.authorizationSubjectDigest; return a; })()],
  ['approval carrying an unknown field', 'ReleaseApproval', (() => {
    const a = clone(approval); a.evidence = 'reviewed the rendered page'; return a; })()],
  ['approval actorKind service is not a GAP actor kind', 'ReleaseApproval', (() => {
    const a = clone(approval); a.approvedBy.actorKind = 'service'; return a; })()],
  ['proof with approvals as an object instead of an array', 'ReleaseProof', (() => {
    const p = clone(releaseProof); p.approvals = clone(approval); return p; })()],
  ['proof carrying the same approval twice', 'ReleaseProof', (() => {
    const p = clone(releaseProof); p.approvals = [clone(approval), clone(approval)]; return p; })()],
  ['rejection with an empty reason', 'ReleaseRejection', (() => {
    const r = clone(rejection); r.reason = ''; return r; })()],
  ['rejection with a whitespace-only reason', 'ReleaseRejection', (() => {
    const r = clone(rejection); r.reason = '  '; return r; })()],
  ['rejection missing rejectedBy', 'ReleaseRejection', (() => {
    const r = clone(rejection); delete r.rejectedBy; return r; })()],
  ['rejection missing authorizationSubjectDigest', 'ReleaseRejection', (() => {
    const r = clone(rejection); delete r.authorizationSubjectDigest; return r; })()],
  ['rejection carrying an unknown field', 'ReleaseRejection', (() => {
    const r = clone(rejection); r.blocking = true; return r; })()],
  ['rejection using the approval field names', 'ReleaseRejection', (() => {
    const r = clone(rejection); r.approvedBy = r.rejectedBy; delete r.rejectedBy; r.approvedAt = r.rejectedAt; delete r.rejectedAt; return r; })()],
  ['proof with rejections as an object instead of an array', 'ReleaseProof', (() => {
    const p = clone(releaseProof); p.rejections = clone(rejection); return p; })()],
  ['proof carrying the same rejection twice', 'ReleaseProof', (() => {
    const p = clone(releaseProof); p.rejections = [clone(rejection), clone(rejection)]; return p; })()],
];
for (const [name, ref, value] of invalidCases) {
  const { ok } = validate(ref, value);
  check(`schema rejects: ${name}`, !ok, 'schema accepted an invalid record');
}

// --- a reason is attributed text outside every digest domain (README.md, Primitives) ---
// The maintained CMS decisions record reasons. Removing one gives a schema-valid
// decision over the same exact subject because reasons are outside the digests.
{
  const withoutReason = (record) => { const copy = clone(record); delete copy.reason; return copy; };
  const profileWithoutReason = clone(profileRevision); delete profileWithoutReason.ratification.reason;
  check('reason: the four-locale example records a reason on each decision record',
    typeof profileRevision.ratification.reason === 'string' && typeof approval.reason === 'string' && typeof authorization.reason === 'string',
    'expected reasons on the maintained ratification, approval, and authorization');
  check('reason: a decision record without a reason is complete',
    validate('ReleaseApproval', withoutReason(approval)).ok && validate('ReleaseAuthorization', withoutReason(authorization)).ok
      && approvalBindsAuthorization(withoutReason(approval), withoutReason(authorization)),
    'decisions should validate and bind the same subject without reasons');
  check('reason: ratification is outside the profile digest, so its reason changes no pin',
    validate('ProfileRevision', profileWithoutReason).ok && profileWithoutReason.digest === profileRevision.digest
      && digest('governed-artifact.profile-revision.draft', { payloadContract: profileWithoutReason.payloadContract, profileId: profileWithoutReason.profileId, revision: profileWithoutReason.revision }) === profileRevision.digest,
    'profile digest must not depend on the ratification reason');
  check('reason: the authorization subject digest is the same with and without the reason',
    validate('ReleaseAuthorization', withoutReason(authorization)).ok && subjectDigest(withoutReason(authorization)) === subjectDigest(authorization)
      && subjectDigest(authorization) === authorization.authorizationSubjectDigest,
    'authorization subject digest must not depend on the reason');
  check('reason: an approval binds the same subject with and without its reason',
    validate('ReleaseApproval', withoutReason(approval)).ok && approvalBindsAuthorization(withoutReason(approval), authorization)
      && approvalBindsAuthorization(approval, withoutReason(authorization)),
    'approval binding must not depend on either reason');
  check('reason: a rejection binds the same subject with and without its reason, and a rejection without one is complete',
    typeof rejection.reason === 'string' && validate('ReleaseRejection', withoutReason(rejection)).ok
      && approvalBindsAuthorization(withoutReason(rejection), authorization) && subjectDigest(withoutReason(rejection)) === rejection.authorizationSubjectDigest,
    'rejection binding must not depend on the reason');
  check('reason: a withdrawal binds the same subject with and without its reason',
    validate('ReleaseWithdrawal', withoutReason(examples['research-withdrawal-paper-2'].withdrawal)).ok
      && bindsSubject(withoutReason(examples['research-withdrawal-paper-2'].withdrawal), examples['research-withdrawal-paper-2'].authorization),
    'withdrawal binding must not depend on the reason');
}

// --- approvals over another subject pass the schema but must fail the binding check ---
for (const [name, mutate] of [
  ['approval over artifact version 2', (a) => { a.artifactVersion = 2; a.authorizationSubjectDigest = subjectDigest(a); }],
  ['approval over a different payload digest', (a) => { a.payloadDigest = `sha256:${'0'.repeat(64)}`; a.authorizationSubjectDigest = subjectDigest(a); }],
  ['approval over a different profile pin digest', (a) => { a.profile.digest = `sha256:${'1'.repeat(64)}`; a.authorizationSubjectDigest = subjectDigest(a); }],
  ['approval with the right fields but the wrong subject digest', (a) => { a.authorizationSubjectDigest = `sha256:${'2'.repeat(64)}`; }],
]) {
  const mutated = clone(approval); mutate(mutated);
  check(`binding rejects: ${name} validates as a ReleaseApproval`, validate('ReleaseApproval', mutated).ok, 'mutation should remain schema-valid');
  check(`binding rejects: ${name}`, !approvalBindsAuthorization(mutated, authorization), 'binding check accepted an approval over another subject');
}

// --- rejections over another subject pass the schema but must fail the same binding check ---
for (const [name, mutate] of [
  ['rejection over artifact version 2', (r) => { r.artifactVersion = 2; r.authorizationSubjectDigest = subjectDigest(r); }],
  ['rejection over a different payload digest', (r) => { r.payloadDigest = `sha256:${'0'.repeat(64)}`; r.authorizationSubjectDigest = subjectDigest(r); }],
  ['rejection over a different profile pin digest', (r) => { r.profile.digest = `sha256:${'1'.repeat(64)}`; r.authorizationSubjectDigest = subjectDigest(r); }],
  ['rejection with the right fields but the wrong subject digest', (r) => { r.authorizationSubjectDigest = `sha256:${'2'.repeat(64)}`; }],
]) {
  const mutated = clone(rejection); mutate(mutated);
  check(`binding rejects: ${name} validates as a ReleaseRejection`, validate('ReleaseRejection', mutated).ok, 'mutation should remain schema-valid');
  check(`binding rejects: ${name}`, !approvalBindsAuthorization(mutated, authorization), 'binding check accepted a rejection over another subject');
}

// --- release withdrawal: schema rejection and mismatched-subject rejection (research example) ---
const { authorization: withdrawnAuthorization, withdrawal: researchWithdrawal, withdrawnProof: researchWithdrawnProof } = examples['research-withdrawal-paper-2'];
for (const [name, ref, value] of [
  ['withdrawal missing withdrawnBy', 'ReleaseWithdrawal', (() => { const w = clone(researchWithdrawal); delete w.withdrawnBy; return w; })()],
  ['withdrawal carrying an unknown field', 'ReleaseWithdrawal', (() => { const w = clone(researchWithdrawal); w.supersededBy = 2; return w; })()],
  ['withdrawal with an empty reason', 'ReleaseWithdrawal', (() => { const w = clone(researchWithdrawal); w.reason = ''; return w; })()],
  ['withdrawal with a whitespace-only reason', 'ReleaseWithdrawal', (() => { const w = clone(researchWithdrawal); w.reason = ' '; return w; })()],
  ['withdrawn proof carrying an unknown field next to the withdrawal', 'ReleaseProof', (() => { const p = clone(researchWithdrawnProof); p.currentVersion = 2; return p; })()],
]) {
  check(`schema rejects: ${name}`, !validate(ref, value).ok, 'schema accepted an invalid record');
}
check('withdrawal: the maintained withdrawal binds the authorization subject', bindsSubject(researchWithdrawal, withdrawnAuthorization), 'valid withdrawal rejected');
const otherPin = { ...researchWithdrawal.profile, digest: `sha256:${'0'.repeat(64)}` };
for (const [name, mutate] of [
  ['another artifact version', (w) => { w.artifactVersion += 1; }],
  ['another payload digest', (w) => { w.payloadDigest = `sha256:${'0'.repeat(64)}`; }],
  ['another profile digest', (w) => { w.profile = otherPin; }],
  ['wrong authorization subject digest', (w) => { w.authorizationSubjectDigest = `sha256:${'0'.repeat(64)}`; }],
]) {
  const w = clone(researchWithdrawal); mutate(w);
  check(`withdrawal rejects: ${name}`, validate('ReleaseWithdrawal', w).ok && !bindsSubject(w, withdrawnAuthorization),
    'a withdrawal for another subject was accepted as binding this release');
}
const otherArtifactProof = clone(researchWithdrawnProof);
otherArtifactProof.withdrawal.artifactId = 'paper:other';
otherArtifactProof.withdrawal.authorizationSubjectDigest = subjectDigest(otherArtifactProof.withdrawal);
check('withdrawal rejects: a proof whose withdrawal is for another artifact',
  validate('ReleaseProof', otherArtifactProof).ok && !bindsSubject(otherArtifactProof.withdrawal, otherArtifactProof.authorization),
  'a proof carrying a withdrawal of another artifact was accepted');

// --- authority signatures: schema rejection and fail-closed verification (separate withdrawal fixture) ---
const signed = examples['research-withdrawal-paper-2'];
const reviewer = signed.authorization.authorizedBy.actorId;
const ratifier = signed.profileRevision.ratification.actorId;
const otherDigest = `sha256:${'0'.repeat(64)}`;
const flip = (text) => `${text.slice(0, -2)}${text.endsWith('AA') ? 'BA' : 'AA'}`;
for (const [name, ref, value] of [
  ['signature record with an unknown field', 'ReleaseAuthorization', (() => { const a = clone(signed.authorization); a.authoritySignature.algorithm = 'ed25519'; return a; })()],
  ['signature record missing signerId', 'ReleaseAuthorization', (() => { const a = clone(signed.authorization); delete a.authoritySignature.signerId; return a; })()],
  ['padded base64url signature', 'ReleaseAuthorization', (() => { const a = clone(signed.authorization); a.authoritySignature.signature += '=='; return a; })()],
  ['signature of the wrong length', 'ReleaseAuthorization', (() => { const a = clone(signed.authorization); a.authoritySignature.signature = a.authoritySignature.signature.slice(0, 43); return a; })()],
  ['ratification signature that is a bare string', 'ProfileRevision', (() => { const p = clone(signed.profileRevision); p.ratification.authoritySignature = p.ratification.authoritySignature.signature; return p; })()],
  ['trust store entry without actions', 'TrustStore', { [reviewer]: { publicKey: researchTrustStore[reviewer].publicKey } }],
  ['trust store entry with an unknown action', 'TrustStore', { [reviewer]: { publicKey: researchTrustStore[reviewer].publicKey, actions: ['publish'] } }],
  ['trust store entry with a private key field', 'TrustStore', { [reviewer]: { ...researchTrustStore[reviewer], privateKey: researchTrustStore[reviewer].publicKey } }],
  ['trust store key of the wrong length', 'TrustStore', { [reviewer]: { ...researchTrustStore[reviewer], publicKey: researchTrustStore[reviewer].publicKey.slice(1) } }],
]) {
  check(`schema rejects: ${name}`, !validate(ref, value).ok, 'schema accepted an invalid record');
}
const authorizationSubject = subjectDigest(signed.authorization);
for (const [name, subject, signature, store, expectedSigner] of [
  ['a stripped signature', authorizationSubject, undefined, researchTrustStore, reviewer],
  ['one changed signature byte', authorizationSubject, { ...signed.authorization.authoritySignature, signature: flip(signed.authorization.authoritySignature.signature) }, researchTrustStore, reviewer],
  ['a signature over another subject', otherDigest, signed.authorization.authoritySignature, researchTrustStore, reviewer],
  ['a signature from another paper\'s authorization', subjectDigest(examples['research-paper-3'].authorization), signed.authorization.authoritySignature, researchTrustStore, reviewer],
  ['the withdrawal signature presented as the authorization signature (cross-action)', authorizationSubject, signed.withdrawal.authoritySignature, researchTrustStore, reviewer],
  ['a signer ID that differs from the record actor', authorizationSubject, { ...signed.authorization.authoritySignature, signerId: ratifier }, researchTrustStore, reviewer],
  ['a record re-attributed to another trusted signer', authorizationSubject, { ...signed.authorization.authoritySignature, signerId: ratifier }, researchTrustStore, ratifier],
  ['a signer the trust store does not name', authorizationSubject, signed.authorization.authoritySignature, { [ratifier]: researchTrustStore[ratifier] }, reviewer],
  ['a signer not trusted for this action', authorizationSubject, signed.authorization.authoritySignature, { [reviewer]: { ...researchTrustStore[reviewer], actions: ['withdraw-release'] } }, reviewer],
  ['a different key for the same signer', authorizationSubject, signed.authorization.authoritySignature, { [reviewer]: { ...researchTrustStore[reviewer], publicKey: researchTrustStore[ratifier].publicKey } }, reviewer],
  ['an empty trust store', authorizationSubject, signed.authorization.authoritySignature, {}, reviewer],
]) {
  check(`signature rejects: ${name}`, !signatureVerifies('authorize-release', subject, signature, store, expectedSigner), 'an invalid signature verified');
}
check('signature rejects: the authorization signature presented as a withdrawal signature (cross-action)',
  !signatureVerifies('withdraw-release', authorizationSubject, signed.authorization.authoritySignature, researchTrustStore, reviewer), 'cross-action signature verified');
check('signature rejects: the ratification signature presented over the authorization subject',
  !signatureVerifies('ratify-profile', authorizationSubject, signed.profileRevision.ratification.authoritySignature, researchTrustStore, ratifier), 'ratification signature verified over another subject');
check('signature: embedding a signature changes no profile digest, payload digest, or pin',
  signed.profileRevision.digest === digest('governed-artifact.profile-revision.draft', { payloadContract: signed.profileRevision.payloadContract, profileId: signed.profileRevision.profileId, revision: signed.profileRevision.revision })
    && signed.authorization.payloadDigest === digest('governed-artifact.payload.v1', signed.release.payload)
    && samePin(signed.release.profile, signed.profileRevision),
  'a digest or pin depends on the signature');
// Alongside the maintained research signatures, the approve-release
// and reject-release domains are exercised with an ephemeral key over the cms example's subject: the same statement,
// verification, and refusals.
const ephemeral = generateKeyPairSync('ed25519');
const ephemeralStore = { [approval.approvedBy.actorId]: { publicKey: ephemeral.publicKey.export({ format: 'jwk' }).x, actions: ['approve-release'] } };
const signedApproval = { ...clone(approval), authoritySignature: signWith(ephemeral.privateKey, 'approve-release', approval.approvedBy.actorId, subjectDigest(approval)) };
check('schema: a signed release approval validates as ReleaseApproval', validate('ReleaseApproval', signedApproval).ok, JSON.stringify(validate('ReleaseApproval', signedApproval).errors));
check('schema: the ephemeral trust store validates as TrustStore', validate('TrustStore', ephemeralStore).ok, JSON.stringify(validate('TrustStore', ephemeralStore).errors));
check('signature: a signed approval verifies under the approve-release domain against the approver\'s key',
  signatureVerifies('approve-release', subjectDigest(signedApproval), signedApproval.authoritySignature, ephemeralStore, approval.approvedBy.actorId), 'signed approval did not verify');
check('signature: the signed approval still binds the identical subject as the authorization', approvalBindsAuthorization(signedApproval, authorization), 'signature changed the approval subject');
check('signature rejects: an approval signature presented as a release authorization (approver not trusted to authorize)',
  !signatureVerifies('authorize-release', subjectDigest(signedApproval), signedApproval.authoritySignature, ephemeralStore, approval.approvedBy.actorId), 'approval signature authorized a release');
check('signature rejects: an approval signature under a store that trusts the approver to authorize but not approve',
  !signatureVerifies('approve-release', subjectDigest(signedApproval), signedApproval.authoritySignature, { [approval.approvedBy.actorId]: { ...ephemeralStore[approval.approvedBy.actorId], actions: ['authorize-release'] } }, approval.approvedBy.actorId), 'untrusted action verified');
check('signature rejects: a signed approval over artifact version 2 presented for version 1',
  !signatureVerifies('approve-release', subjectDigest(approval), signWith(ephemeral.privateKey, 'approve-release', approval.approvedBy.actorId, subjectDigest({ ...approval, artifactVersion: 2 })), ephemeralStore, approval.approvedBy.actorId),
  'a signature over another version verified');
const rejectionStore = { [rejection.rejectedBy.actorId]: { publicKey: ephemeral.publicKey.export({ format: 'jwk' }).x, actions: ['approve-release', 'reject-release'] } };
const signedRejection = { ...clone(rejection), authoritySignature: signWith(ephemeral.privateKey, 'reject-release', rejection.rejectedBy.actorId, subjectDigest(rejection)) };
check('schema: a signed release rejection validates as ReleaseRejection', validate('ReleaseRejection', signedRejection).ok, JSON.stringify(validate('ReleaseRejection', signedRejection).errors));
check('signature: a signed rejection verifies under the reject-release domain against the rejecting authority\'s key',
  signatureVerifies('reject-release', subjectDigest(signedRejection), signedRejection.authoritySignature, rejectionStore, rejection.rejectedBy.actorId), 'signed rejection did not verify');
check('signature: the signed rejection still binds the identical subject as the authorization', approvalBindsAuthorization(signedRejection, authorization), 'signature changed the rejection subject');
check('signature rejects: a rejection signature presented as an approval (cross-action, same signer and subject)',
  !signatureVerifies('approve-release', subjectDigest(signedRejection), signedRejection.authoritySignature, rejectionStore, rejection.rejectedBy.actorId), 'rejection signature approved a release');
check('signature rejects: a rejection signature under a store that trusts the signer to approve but not reject',
  !signatureVerifies('reject-release', subjectDigest(signedRejection), signedRejection.authoritySignature, { [rejection.rejectedBy.actorId]: { ...rejectionStore[rejection.rejectedBy.actorId], actions: ['approve-release'] } }, rejection.rejectedBy.actorId), 'untrusted rejection signature verified');
check('signature rejects: a signed rejection over artifact version 2 presented for version 1',
  !signatureVerifies('reject-release', subjectDigest(rejection), signWith(ephemeral.privateKey, 'reject-release', rejection.rejectedBy.actorId, subjectDigest({ ...rejection, artifactVersion: 2 })), rejectionStore, rejection.rejectedBy.actorId),
  'a rejection signature over another version verified');
check('signature: a rejection signature is outside the subject digest, so signing changes no binding',
  subjectDigest(signedRejection) === rejection.authorizationSubjectDigest, 'signing changed the rejection subject digest');
check('signature: strict base64url decoding rejects padding, other alphabets, and wrong lengths',
  [() => decodeExact(`${researchTrustStore[reviewer].publicKey}=`, 32), () => decodeExact(`+${researchTrustStore[reviewer].publicKey.slice(1)}`, 32), () => decodeExact(researchTrustStore[reviewer].publicKey, 64)]
    .every((attempt) => { try { attempt(); return false; } catch { return true; } })
    && decodeExact(researchTrustStore[reviewer].publicKey, 32).length === 32,
  'lenient decoding');

// --- research content, review targeting, exact dependencies, and immutable baselines ---
const researchExample = (name) => examples[`research-${name}`];
const submitted = await readJson('draft/examples/research/artifact-version_paper-1.json');
const declined = await readJson('draft/examples/research/release-rejection_paper-1.json');
check('schema [research]: submitted manuscript and editorial rejection validate',
  validate('ArtifactVersion', submitted).ok && validate('ReleaseRejection', declined).ok, 'invalid submitted records');
const submittedSubject = { artifactId: submitted.artifactId, artifactVersion: submitted.artifactVersion,
  payloadDigest: digest('governed-artifact.payload.v1', submitted.payload), profile: submitted.profile };
check('binding [research]: the signed rejection names the exact unpublished manuscript',
  approvalBindsAuthorization(declined, submittedSubject)
    && signatureVerifies('reject-release', subjectDigest(declined), declined.authoritySignature, researchTrustStore, declined.rejectedBy.actorId), 'rejection binding or signature failed');
const revisedSubject = await readJson('draft/examples/research/artifact-version_paper-2.json').then((v) => ({ artifactId: v.artifactId, artifactVersion: v.artifactVersion,
  payloadDigest: digest('governed-artifact.payload.v1', v.payload), profile: v.profile }));
check('signature rejects [research]: the maintained rejection of version 1 presented for version 2 of the same manuscript',
  !signatureVerifies('reject-release', subjectDigest(revisedSubject), declined.authoritySignature, researchTrustStore, declined.rejectedBy.actorId),
  'a rejection signature over another version verified');
const [studyOne, studyTwo] = [researchExample('study-1'), researchExample('study-2')];
check('signature rejects [research]: the study version 1 authorization signature presented for version 2 of the same source',
  signatureVerifies('authorize-release', subjectDigest(studyOne.authorization), studyOne.authorization.authoritySignature, researchTrustStores['cited-works'], studyOne.authorization.authorizedBy.actorId)
    && !signatureVerifies('authorize-release', subjectDigest(studyTwo.authorization), studyOne.authorization.authoritySignature, researchTrustStores['cited-works'], studyOne.authorization.authorizedBy.actorId),
  'an authorization signature over another version verified');
for (const [name, context] of [['paper-3', 'cited-works'], ['study-2', 'journal']]) {
  const { authorization } = researchExample(name);
  check(`trust [research]: ${name}'s authorization does not verify under the ${context} trust store`,
    !signatureVerifies('authorize-release', subjectDigest(authorization), authorization.authoritySignature, researchTrustStores[context], authorization.authorizedBy.actorId),
    'a release authority from another context verified');
}
const report = researchExample('review-1');
check('binding [research]: the report identifies the exact submitted manuscript as domain content',
  canonicalJson(report.artifactVersion.payload.manuscript) === canonicalJson(submittedSubject)
    && !('dependencySet' in report.artifactVersion.payload), 'report target mismatch');
check('examples [research]: section feedback identifies the overstatement in the submitted version',
  report.artifactVersion.payload.feedback.every((f) => submitted.payload.sections.some((section) => section.id === f.sectionId && section.text.includes(f.quotedText))), 'feedback quote mismatch');
const validDependencySet = (set) => validate('DependencySet', set).ok
  && set.entries.every((entry, index) => index === 0 || set.entries[index - 1].artifactId < entry.artifactId);
const sourceEntry = ({ artifactVersion: source }) => ({ artifactId: source.artifactId, artifactVersion: source.artifactVersion, payloadDigest: digest('governed-artifact.payload.v1', source.payload) });
const matchesProof = (entry, proof) => entry.artifactId === proof.authorization.artifactId
  && entry.artifactVersion === proof.authorization.artifactVersion && entry.payloadDigest === proof.authorization.payloadDigest;
const revisedDraft = await readJson('draft/examples/research/artifact-version_paper-2.json');
const publishedPaper = researchExample('paper-3');
check('schema [research]: the revised unpublished manuscript validates', validate('ArtifactVersion', revisedDraft).ok, 'invalid revised draft');
const papers = [{ artifactVersion: revisedDraft, profileRevision: publishedPaper.profileRevision }, publishedPaper];
check('publication [research]: only the final gummy-worm recall manuscript is released and it has no withdrawal',
  lifecycleSets.filter((set) => /^research-paper-/.test(set.name)).length === 1
    && publishedPaper.artifactVersion.artifactVersion === 3 && !publishedPaper.withdrawal, 'gummy-worm recall publication sequence changed');
const methods = researchExample('methods-1');
const studies = [researchExample('study-1'), researchExample('study-2')];
check('binding [research]: sources, papers, and reports follow distinct profiles',
  !samePin(methods.profileRevision, report.profileRevision) && !samePin(report.profileRevision, papers[0].profileRevision)
    && !samePin(methods.profileRevision, papers[0].profileRevision), 'profiles coincide');
for (const [index, paper] of papers.entries()) {
  const payload = paper.artifactVersion.payload;
  const sources = [methods, report, studies[index], ...(index === 1 ? [researchExample('editor-notes-1')] : [])].sort((a, b) => a.artifactVersion.artifactId < b.artifactVersion.artifactId ? -1 : 1);
  const { $contractLanguage, ...contract } = paper.profileRevision.payloadContract;
  check(`contract [research]: paper ${index + 2} satisfies its exact JSON Schema profile`,
    $contractLanguage === 'json-schema/draft-2020-12' && ajv.compile(contract)(payload), 'paper contract invalid');
  check(`dependency [research]: paper ${index + 2} pins exact released methods, review, and study versions`,
    validDependencySet(payload.dependencySet)
      && canonicalJson(payload.dependencySet.entries) === canonicalJson(sources.map(sourceEntry))
      && payload.dependencySet.entries.every((entry, position) => matchesProof(entry, sources[position].releaseProof)), 'baseline mismatch');
  check(`bibliography [research]: paper ${index + 2} links both source material artifacts`,
    canonicalJson(payload.bibliography.map((b) => b.sourceArtifactId).sort()) === canonicalJson([methods.artifactVersion.artifactId, studies[index].artifactVersion.artifactId].sort()), 'bibliography mismatch');
  check(`bibliography [research]: paper ${index + 2} cites published authors, journal, and year from its exact sources`,
    payload.bibliography.every((citation) => {
      const cited = sources.find((source) => source.artifactVersion.artifactId === citation.sourceArtifactId)?.artifactVersion.payload;
      return cited && ['title', 'authors', 'journal', 'year'].every((field) => canonicalJson(citation[field]) === canonicalJson(cited[field]));
    }), 'bibliographic metadata mismatch');
  check(`feedback [research]: paper ${index + 2} responds to the released report and qualifies its conclusion`,
    payload.reviewResponses.some((r) => r.reviewArtifactId === report.artifactVersion.artifactId && r.feedbackId === 'comment-1')
      && payload.sections.find((section) => section.id === 'conclusion').text.includes('do not establish'), 'response or limitation missing');
  if (paper.approval) check(`authority [research]: paper ${index + 2} separates editor approval from publisher authorization`,
    paper.approval.approvedBy.actorId !== paper.authorization.authorizedBy.actorId, 'editor and publisher conflated');
}
const notes = researchExample('editor-notes-1');
check('feedback [research]: editor notes use a distinct profile and bind manuscript version 2',
  notes.profileRevision.profileId === 'research-editor-notes' && report.profileRevision.profileId === 'research-peer-review'
    && canonicalJson(notes.artifactVersion.payload.manuscript) === canonicalJson({ artifactId: revisedDraft.artifactId,
      artifactVersion: revisedDraft.artifactVersion, payloadDigest: digest('governed-artifact.payload.v1', revisedDraft.payload), profile: revisedDraft.profile })
    && notes.artifactVersion.payload.feedback.every((feedback) => revisedDraft.payload.sections.some((section) => section.id === feedback.sectionId && section.text.includes(feedback.quotedText)))
    && publishedPaper.artifactVersion.payload.editorResponses.some((response) => response.notesArtifactId === notes.artifactVersion.artifactId && response.feedbackId === 'editor-comment-1'), 'editor note targeting or response mismatch');
const methodsEntry = papers[0].artifactVersion.payload.dependencySet.entries[0];
check('dependency rejects: a profile pin in place of a content dependency',
  !validDependencySet({ entries: [{ profileId: methods.profileRevision.profileId, revision: methods.profileRevision.revision, digest: methods.profileRevision.digest }] }), 'profile pin accepted');
check('dependency rejects: methods content pinned by its profile digest',
  !matchesProof({ ...methodsEntry, payloadDigest: methods.profileRevision.digest }, methods.releaseProof), 'profile digest accepted as payload digest');
check('dependency rejects: methods version not covered by the proof',
  !matchesProof({ ...methodsEntry, artifactVersion: methodsEntry.artifactVersion + 1 }, methods.releaseProof), 'wrong source version accepted');
const baseline = papers[0].artifactVersion.payload;
const changedBaseline = structuredClone(baseline);
changedBaseline.dependencySet = papers[1].artifactVersion.payload.dependencySet;
check('dependency: changing only a source pin changes the paper payload digest',
  digest('governed-artifact.payload.v1', baseline) !== digest('governed-artifact.payload.v1', changedBaseline), 'baseline excluded from payload digest');

const validEntry = baseline.dependencySet.entries[0];
for (const [name, set] of [
  ['zero source version', { entries: [{ ...validEntry, artifactVersion: 0 }] }],
  ['malformed source digest', { entries: [{ ...validEntry, payloadDigest: 'sha256:invalid' }] }],
  ['duplicate source identity', { entries: [validEntry, { ...validEntry, artifactVersion: 2 }] }],
  ['out-of-order sources', { entries: [{ ...validEntry, artifactId: 'z' }, { ...validEntry, artifactId: 'a' }] }],
  ['unknown entry field', { entries: [{ ...validEntry, status: 'current' }] }],
]) {
  check(`dependency rejects: ${name}`, !validDependencySet(set), 'invalid dependency set accepted');
}
check('dependency: ordered distinct sources validate', validDependencySet({ entries: [
  { ...validEntry, artifactId: 'a' }, { ...validEntry, artifactId: 'z' },
] }), 'valid sources rejected');

// --- payload object and optional dependency set ---
for (const [name, value, expected] of [
  ['domain content without dependencies', { title: 'Standalone content' }, true],
  ['domain content with dependencies', baseline, true],
  ['empty dependency set', { title: 'No upstream sources', dependencySet: { entries: [] } }, true],
  ['malformed dependency set', { dependencySet: 'not a set' }, false],
  ['null dependency set', { dependencySet: null }, false],
  ['scalar payload', 'content', false],
  ['array payload', [], false],
  ['null payload', null, false],
]) {
  check(`payload: ${name}`, validate('Payload', value).ok === expected, 'unexpected payload validation result');
}
for (const [name, ref, original] of [
  ['artifact version', 'ArtifactVersion', artifactVersion], ['release', 'Release', release],
]) {
  check(`payload: ${name} uses Payload type`, !validate(ref, { ...original, payload: [] }).ok,
    'record accepted a non-object payload');
}

// --- locale variants (cms four-locale-post example) ---
// blog-post:monarch-migration carries four locales. Its contract is the CMS's own
// contract language (GAP standardizes none): its content field is a localeMap rule
// that declares allowed, required, and fallback locales. Checks that the policy is
// internally consistent and the released payload satisfies it, plus the digest consequence
// GAP defines: locale content is payload, so one payload digest and one authorization cover every
// locale, and no record carries a per-locale field (README.md, Payload → Locale variants).
const fourLocales = examples['cms-four-locale-post'];
const localeRule = fourLocales.profileRevision.payloadContract.fields.content;
const localePolicy = localeRule && localeRule.type === 'localeMap' ? localeRule : undefined;
const localePayload = fourLocales.release.payload;
// Conservative BCP 47 subset: language[-Script][-REGION]. Enough for the maintained example set;
// it does not accept every tag RFC 5646 permits.
const bcp47 = /^[a-z]{2,3}(-[A-Z][a-z]{3})?(-(?:[A-Z]{2}|\d{3}))?$/;
const subset = (inner, outer) => inner.every((item) => outer.includes(item));
check('locale: contract declares allowed, required, and fallback locales',
  Array.isArray(localePolicy?.allowed) && localePolicy.allowed.length > 0
    && Array.isArray(localePolicy?.required) && localePolicy.required.length > 0
    && localePolicy.fallback && typeof localePolicy.fallback === 'object' && !Array.isArray(localePolicy.fallback),
  'locale policy is missing or malformed');
check('locale: the blog model requires US English and Mexican Spanish with same-country fallback',
  canonicalJson(localePolicy.allowed) === canonicalJson(['en-US', 'es-US', 'en-MX', 'es-MX'])
    && canonicalJson(localePolicy.required) === canonicalJson(['en-US', 'es-MX'])
    && canonicalJson(localePolicy.fallback) === canonicalJson({ 'es-US': 'en-US', 'en-MX': 'es-MX' }),
  'the blog model does not preserve country-specific content during fallback');
check('locale: the maintained post has all four locales',
  canonicalJson(Object.keys(localePayload.content).sort()) === canonicalJson(['en-MX', 'en-US', 'es-MX', 'es-US']),
  'example payload locales do not match their described coverage');
check('locale: required locales are a subset of allowed locales', subset(localePolicy.required, localePolicy.allowed), 'required locale not allowed');
check('locale: fallback maps optional allowed locales to required locales',
  Object.entries(localePolicy.fallback).every(([from, to]) =>
    localePolicy.allowed.includes(from) && !localePolicy.required.includes(from) && localePolicy.required.includes(to)),
  'fallback entry names a locale outside the policy');
check('locale: each locale entry declares the same headline and body fields',
  localeRule.items?.type === 'object' && JSON.stringify([...localeRule.items.required].sort()) === JSON.stringify(['body', 'headline'])
    && Object.values(localePayload.content).every((entry) => JSON.stringify(Object.keys(entry).sort()) === JSON.stringify(['body', 'headline'])),
  'locale entries and the item rule disagree');
check('locale: every locale key is a well-formed BCP 47 tag',
  [...localePolicy.allowed, ...Object.keys(localePayload.content)].every((tag) => bcp47.test(tag)),
  'malformed locale tag');
const requiredLocalesPayload = structuredClone(localePayload);
delete requiredLocalesPayload.content['es-US'];
delete requiredLocalesPayload.content['en-MX'];
check('locale: optional locales may be omitted while US English and Mexican Spanish remain',
  [localePayload, requiredLocalesPayload].every((payload) =>
    subset(localePolicy.required, Object.keys(payload.content)) && subset(Object.keys(payload.content), localePolicy.allowed))
    && canonicalJson(Object.keys(requiredLocalesPayload.content).sort()) === canonicalJson(['en-US', 'es-MX']),
  'the required-locales payload variant does not satisfy the declared locale policy');
const withoutOptionalLocale = structuredClone(localePayload);
delete withoutOptionalLocale.content['en-MX'];
check('locale rejects: a payload without one authored locale is not the authorized payload',
  digest('governed-artifact.payload.v1', withoutOptionalLocale) !== fourLocales.authorization.payloadDigest,
  'a locale subset recomputed to the authorized payload digest');
const changedLocale = structuredClone(localePayload);
changedLocale.content['es-MX'].body = 'Texto cambiado.';
check('locale rejects: changing one locale changes the whole payload digest',
  digest('governed-artifact.payload.v1', changedLocale) !== fourLocales.authorization.payloadDigest,
  'a changed locale recomputed to the authorized payload digest');
check('locale: authorization carries no per-locale field',
  JSON.stringify(Object.keys(fourLocales.authorization).sort()) === JSON.stringify(['artifactId', 'artifactVersion', 'authorizationSubjectDigest', 'authorizedAt', 'authorizedBy', 'payloadDigest', 'profile', 'reason']),
  `authorization fields: ${Object.keys(fourLocales.authorization).join(', ')}`);

// --- the draft's inline artifact version (README.md, Artifact version) ---
// The draft quotes the four-locale post "exactly as the CMS reference implementation stores it",
// so the quote must be the example file's text, key order included.
const draft = await readFile(new URL('draft/README.md', here), 'utf8');
const quoteStart = draft.indexOf('```json\n', draft.indexOf('This blog post is one complete artifact version'));
const quoted = quoteStart < 0 ? '' : draft.slice(quoteStart + '```json\n'.length, draft.indexOf('\n```', quoteStart + 1));
const storedPost = (await readFile(new URL('draft/examples/cms/artifact-version_four-locale-post.json', here), 'utf8')).trimEnd();
check('inline example: the draft quotes artifact-version_four-locale-post.json exactly',
  quoted === storedPost,
  'the JSON block in Artifact version differs from the file; copy the file into it');

// --- conformance manifest (conformance.mjs; fixtures in test/conformance.test.mjs) ---
const manifest = await readJson('draft/conformance/core-requirements.json');
const conformanceReadme = await readFile(new URL('draft/conformance/README.md', here), 'utf8');
for (const { name, ok, detail } of conformanceChecks(manifest, conformanceReadme)) check(name, ok, detail);
// Cited executable coverage must point at files that exist (citation format: "path (detail)").
const { access } = await import('node:fs/promises');
const repoRoot = new URL('../', here);
for (const requirement of inForce(manifest)) {
  for (const citation of requirement.coverage?.executable ?? []) {
    const path = citation.split(' (')[0];
    try {
      await access(new URL(path, repoRoot));
      pass(`conformance: ${requirement.id} citation exists: ${path}`);
    } catch {
      fail(`conformance: ${requirement.id} citation exists: ${path}`, 'cited file not found');
    }
  }
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll specification checks passed');
