import { createHash } from 'node:crypto';

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type Audience = 'public' | 'members' | 'internal';
export type Actor = { actorId: string; actorKind: 'agent' | 'human' };
export type ProfilePin = { profileId: string; revision: number; digest: string };
/** String bounds use JSON Schema's names and count characters as JSON Schema does: Unicode code points, not UTF-16 units. */
export type StringRule = { type: 'string'; enum?: string[]; format?: 'sha256-digest' | 'date-time'; minLength?: number; maxLength?: number };
export type IntegerRule = { type: 'integer'; minimum: number; maximum: number };
export type ArrayRule = { type: 'array'; minItems: number; maxItems: number; items: ContractRule };
export type ObjectRule = { type: 'object'; additionalProperties: false; fields: Record<string, ContractRule>; required: string[] };
/** An object keyed by locale tag. The profile declares which locales are allowed, which must be present, and how an absent optional locale falls back to a required one at delivery. */
export type LocaleMapRule = { type: 'localeMap'; allowed: string[]; required: string[]; fallback: Record<string, string>; items: ObjectRule };
export type ContractRule = StringRule | IntegerRule | ArrayRule | ObjectRule | LocaleMapRule;
export type PayloadContract = ObjectRule;
export type ArticlePayload = { audience: Audience; body: string; title: string };
export type BlogPostContent = { headline: string; body: string };
/** A blog post: author, the byline date-time (RFC 3339), the CMS audience label, and a headline and body per BCP 47 locale tag. */
export type BlogPostPayload = { audience: Audience; author: string; content: Record<string, BlogPostContent>; date: string };
export type ProfileProposal = { profileId: string; revision: number; payloadContract: PayloadContract; proposedBy: Actor };
export type ProfileRevision = {
  profileId: string; revision: number; payloadContract: PayloadContract; digest: string;
  ratification: { ratifiedAt: string; actorId: string; actorKind: 'human'; reason?: string };
};
export type ProfileRatificationAuthority = { audience: string; authority: Actor & { actorKind: 'human' } };
export type ReleaseAuthorityPolicy = { profile: ProfilePin; authority: Actor; audiences: Audience[] };
export type ArtifactVersion = { artifactId: string; artifactVersion: number; payload: JsonValue; profile: ProfilePin; authoredBy: Actor };
// Every decision record MAY carry a reason (draft, Primitives): the authority's plain-language basis, attributed text outside every digest.
export type ReleaseAuthorization = {
  artifactId: string; artifactVersion: number; payloadDigest: string; profile: ProfilePin; authorizedAt: string;
  authorizedBy: Actor; reason?: string; authorizationSubjectDigest: string;
};
// A release approval binds the same subject as a release authorization and releases nothing (draft, Release approval).
export type ReleaseApproval = {
  artifactId: string; artifactVersion: number; payloadDigest: string; profile: ProfilePin; approvedAt: string;
  approvedBy: Actor; reason?: string; authorizationSubjectDigest: string;
};
// Local configuration: who may record a release approval for a profile ID. '*' matches any profile ID or actor ID.
export type ReleaseApprovalAuthority = { profileId: string; authority: Actor };
export type Release = { artifactId: string; artifactVersion: number; payload: JsonValue; profile: ProfilePin };
// A release rejection is a configured approval authority's decision that one exact version is not approved (draft, Release rejection).
// It binds the same subject as an approval, releases, withdraws, and blocks nothing, and travels with the proof beside any approvals.
// GAP makes its reason optional; this CMS requires one when it records a rejection, so the basis for the decline is not lost.
export type ReleaseRejection = {
  artifactId: string; artifactVersion: number; payloadDigest: string; profile: ProfilePin; rejectedAt: string;
  rejectedBy: Actor; reason?: string; authorizationSubjectDigest: string;
};
export type ReleaseProof = { profile: ProfileRevision; authorization: ReleaseAuthorization; release: Release; approvals?: ReleaseApproval[]; rejections?: ReleaseRejection[] };
export type GovernedDependencyPin = { artifactId: string; artifactVersion: number; payloadDigest: string };
export type ExternalDependencyPin = { ref: string; contentDigest: string };
export type GalleryImage = { asset: ExternalDependencyPin; altText: string; caption: string };
export type GalleryPayload = { audience: Audience; title: string; images: GalleryImage[] };
export type RenderedArtifactPayload = {
  audience: Audience;
  source: GovernedDependencyPin;
  renderer: { rendererId: string; rendererVersion: string; templateId: string; templateVersion: string; locale: string };
  mediaType: 'text/html';
  renderedContent: string;
};
export type CmsWorkspace = {
  workspaceFormat: 'local-reference-v1'; application: 'cms'; storage: 'local-json'; deploymentMode: 'local-evaluation'; productionReady: false;
  profileProposals: ProfileProposal[]; profileRatificationAuthorities: ProfileRatificationAuthority[]; profiles: ProfileRevision[];
  releaseAuthorityPolicies: ReleaseAuthorityPolicy[]; releaseApprovalAuthorities: ReleaseApprovalAuthority[];
  artifacts: ArtifactVersion[]; approvals: ReleaseApproval[]; authorizations: ReleaseAuthorization[]; releases: Release[]; rejections: ReleaseRejection[];
};

export const RENDERED_ARTICLE_PROFILE_ID = 'cms.rendered-article';
export const BLOG_PROFILE_ID = 'blog-post';
export const PROFILE_AUTHORITY_AUDIENCE = 'local-cms.configuration';
/** Local bound on a decision reason, in characters (counted as Unicode code points). GAP fixes no limit; this CMS bounds reasons as it bounds any other text. */
export const REASON_MAX_CHARACTERS = 5000;
export const LOCAL_CONTRACT_LIMITS = Object.freeze({
  maxDepth: 8,
  maxRules: 100,
  maxObjectFields: 50,
  maxEnumMembers: 50,
  maxArrayItems: 1_000,
  maxLocales: 50,
});
const digestPattern = /^sha256:[0-9a-f]{64}$/;
/** Syntactic check for a conservative BCP 47 subset, language[-Script][-REGION]; it does not consult the language subtag registry. */
export const LOCALE_TAG_PATTERN = /^[a-z]{2,3}(-[A-Z][a-z]{3})?(-(?:[A-Z]{2}|\d{3}))?$/;

export function localCmsCapabilities() {
  return {
    implementation: 'GAP CMS',
    contractLanguage: {
      identifier: 'cms.local-bounded-json',
      portability: 'implementation-local',
      bounds: LOCAL_CONTRACT_LIMITS,
      arraysRequireFiniteMaximum: true,
      supportedScalarTypes: ['string', 'integer'],
      supportedStringFormats: ['sha256-digest', 'date-time'],
      supportedCompositeTypes: ['array', 'object', 'localeMap'],
    },
    localeVariants: {
      semantics: 'locale-keyed content is payload structure under the profile contract; the localeMap rule declares allowed, required, and fallback locales',
      authorization: 'one authorization covers every locale in the payload; there is no per-locale digest and no partial authorization',
      fallback: 'declared by the profile and applied by the consumer at delivery; it can deliver only content the released payload contains',
      localeTags: 'syntactic BCP 47 check (language[-Script][-REGION]); registry membership is not checked',
    },
    dependencyPins: {
      candidate: 'GovernedDependencyPin and ExternalDependencyPin from issue #91 / PR #109',
      portability: 'candidate-not-normative',
      verification: 'opt-in profile/application policy; a pin is unverified until the dependency release proof or exact external bytes are independently obtained and matched',
    },
    rendering: {
      semantics: 'deterministic local HTML rendering under profile-local renderer, template, and locale identity',
      outcomeBoundary: 'a governed rendered artifact proves the exact HTML bytes entered the release boundary; later display is not performed or proved',
    },
    contentAudienceLabels: ['public', 'members', 'internal'],
    audienceSemantics: 'application content labels; not GAP authority-evidence audiences or reader authentication',
    releaseModel: 'one released version per artifact ID; current, supersession, and withdrawal are not implemented',
    approvalModel: 'content models with configured approval authorities (blog-post) require a release approval by one of them before release; an approval never releases and confers no release authority',
    rejectionModel: 'the same approval authorities may record a release rejection of an exact unreleased version; it requires a reason here, blocks no later approval or authorization, and a proof that carries approvals carries every rejection of the same subject',
    decisionReasons: {
      records: ['ratification', 'releaseApproval', 'releaseRejection', 'releaseAuthorization'],
      semantics: 'optional plain-language basis stated by the deciding authority; attributed text, not evidence of review or of content correctness, and outside every digest',
      bound: `1 to ${REASON_MAX_CHARACTERS} characters, not blank`,
      requiredOn: ['releaseRejection'],
    },
    storageModel: 'local JSON records; this layout is not required by GAP',
  } as const;
}

export function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') { if (!Number.isSafeInteger(value)) throw new Error('canonical JSON permits only safe integers'); return JSON.stringify(value); }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key]!)}`).join(',')}}`;
}
function digest(domain: string, value: JsonValue): string { return `sha256:${createHash('sha256').update(`${domain}\n${canonicalJson(value)}`, 'utf8').digest('hex')}`; }
export function profileDigest(profile: Pick<ProfileProposal, 'profileId' | 'revision' | 'payloadContract'>): string {
  return digest('governed-artifact.profile-revision.draft', { payloadContract: profile.payloadContract as unknown as JsonValue, profileId: profile.profileId, revision: profile.revision });
}
export function payloadDigest(payload: JsonValue): string { return digest('governed-artifact.payload.v1', payload); }
export function authorizationSubjectDigest(subject: Pick<ReleaseAuthorization, 'artifactId' | 'artifactVersion' | 'payloadDigest' | 'profile'>): string {
  return digest('governed-artifact.authorization-subject.v1', { artifactId: subject.artifactId, artifactVersion: subject.artifactVersion, payloadDigest: subject.payloadDigest, profile: subject.profile });
}
function codePoints(value: string): number { return [...value].length; }
/** A decision reason is plain text: non-empty, not blank, and within the local bound. It carries no other meaning. */
export function validateReason(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0 || codePoints(value) > REASON_MAX_CHARACTERS) throw new Error(`${label} must be a non-blank string of at most ${REASON_MAX_CHARACTERS} characters`);
}
/** The record's fields plus 'reason' when the record carries one, for exact-key checks on decision records. */
export function withOptionalReason(value: unknown, keys: string[]): string[] {
  return value && typeof value === 'object' && !Array.isArray(value) && Object.hasOwn(value, 'reason') ? [...keys, 'reason'] : keys;
}
function requireExactObjectKeys(value: unknown, expected: string[], label: string): asserts value is Record<string, any> {
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error(`${label} must be an object`);
  const actual = Object.keys(value).sort(); const sortedExpected = [...expected].sort();
  if (actual.length !== sortedExpected.length || actual.some((key, index) => key !== sortedExpected[index])) throw new Error(`${label} fields must be exactly: ${sortedExpected.join(', ')}`);
}
function validateRule(rule: unknown, label: string, depth: number, count: { value: number }): asserts rule is ContractRule {
  if (depth > LOCAL_CONTRACT_LIMITS.maxDepth || ++count.value > LOCAL_CONTRACT_LIMITS.maxRules) throw new Error(`payload contract exceeds local complexity limits (maximum depth ${LOCAL_CONTRACT_LIMITS.maxDepth}; maximum rules ${LOCAL_CONTRACT_LIMITS.maxRules})`);
  if (!rule || Array.isArray(rule) || typeof rule !== 'object') throw new Error(`${label} must be an object rule`);
  const value = rule as Record<string, any>;
  if (value.type === 'string') {
    const allowed = ['type', ...(value.enum !== undefined ? ['enum'] : []), ...(value.format !== undefined ? ['format'] : []), ...(value.minLength !== undefined ? ['minLength'] : []), ...(value.maxLength !== undefined ? ['maxLength'] : [])];
    requireExactObjectKeys(value, allowed, label);
    if (value.enum !== undefined && (!Array.isArray(value.enum) || value.enum.length < 1 || value.enum.length > LOCAL_CONTRACT_LIMITS.maxEnumMembers || new Set(value.enum).size !== value.enum.length || value.enum.some((item: unknown) => typeof item !== 'string' || item.length === 0))) throw new Error(`${label} has invalid enum (expected 1-${LOCAL_CONTRACT_LIMITS.maxEnumMembers} unique non-empty strings)`);
    if (value.format !== undefined && value.format !== 'sha256-digest' && value.format !== 'date-time') throw new Error(`${label} has unsupported string format`);
    for (const bound of ['minLength', 'maxLength'] as const) if (value[bound] !== undefined && (!Number.isSafeInteger(value[bound]) || value[bound] < 0)) throw new Error(`${label} has invalid ${bound}`);
    if (value.minLength !== undefined && value.maxLength !== undefined && value.maxLength < value.minLength) throw new Error(`${label} has inverted string bounds`);
    if (value.enum === undefined && value.format === undefined && value.maxLength === undefined) throw new Error(`${label} string rule must be bounded`);
    return;
  }
  if (value.type === 'integer') {
    requireExactObjectKeys(value, ['maximum', 'minimum', 'type'], label);
    if (!Number.isSafeInteger(value.minimum) || !Number.isSafeInteger(value.maximum) || value.maximum < value.minimum) {
      throw new Error(`${label} has invalid integer bounds`);
    }
    return;
  }
  if (value.type === 'array') {
    requireExactObjectKeys(value, ['items', 'maxItems', 'minItems', 'type'], label);
    if (!Number.isSafeInteger(value.minItems) || value.minItems < 0) throw new Error(`${label}.minItems must be a non-negative safe integer`);
    if (!Number.isSafeInteger(value.maxItems) || value.maxItems < value.minItems || value.maxItems > LOCAL_CONTRACT_LIMITS.maxArrayItems) throw new Error(`${label}.maxItems must be a safe integer from minItems through the local maximum of ${LOCAL_CONTRACT_LIMITS.maxArrayItems}`);
    validateRule(value.items, `${label}.items`, depth + 1, count); return;
  }
  if (value.type === 'object') {
    requireExactObjectKeys(value, ['additionalProperties', 'fields', 'required', 'type'], label);
    if (value.additionalProperties !== false || !value.fields || Array.isArray(value.fields) || typeof value.fields !== 'object') throw new Error(`${label} has unsupported object semantics`);
    const fields = Object.keys(value.fields); if (fields.length < 1 || fields.length > LOCAL_CONTRACT_LIMITS.maxObjectFields || fields.some((field) => !field)) throw new Error(`${label} has invalid fields (expected 1-${LOCAL_CONTRACT_LIMITS.maxObjectFields} non-empty field names)`);
    if (!Array.isArray(value.required) || value.required.length !== fields.length || new Set(value.required).size !== fields.length || value.required.some((field: unknown) => typeof field !== 'string' || !fields.includes(field))) throw new Error(`${label} must require every declared field exactly once`);
    for (const field of fields) validateRule(value.fields[field], `${label}.${field}`, depth + 1, count); return;
  }
  if (value.type === 'localeMap') {
    requireExactObjectKeys(value, ['allowed', 'fallback', 'items', 'required', 'type'], label);
    if (!Array.isArray(value.allowed) || value.allowed.length < 1 || value.allowed.length > LOCAL_CONTRACT_LIMITS.maxLocales || new Set(value.allowed).size !== value.allowed.length || value.allowed.some((tag: unknown) => typeof tag !== 'string' || !LOCALE_TAG_PATTERN.test(tag))) throw new Error(`${label}.allowed must list 1-${LOCAL_CONTRACT_LIMITS.maxLocales} unique syntactically valid BCP 47 language tags`);
    if (!Array.isArray(value.required) || value.required.length < 1 || new Set(value.required).size !== value.required.length || value.required.some((tag: unknown) => !value.allowed.includes(tag))) throw new Error(`${label}.required must be a non-empty subset of the allowed locales`);
    if (!value.fallback || Array.isArray(value.fallback) || typeof value.fallback !== 'object' || Object.entries(value.fallback).some(([from, to]) => !value.allowed.includes(from) || value.required.includes(from) || !value.required.includes(to))) throw new Error(`${label}.fallback must map optional allowed locales to required locales`);
    validateRule(value.items, `${label}.items`, depth + 1, count);
    if ((value.items as ContractRule).type !== 'object') throw new Error(`${label}.items must be an object rule`);
    return;
  }
  throw new Error(`${label} has unsupported rule type`);
}
export function validatePayloadContract(contract: unknown): asserts contract is PayloadContract {
  validateRule(contract, 'payload contract', 0, { value: 0 });
  if ((contract as ContractRule).type !== 'object') throw new Error('payload contract root must be an object');
  const audience = (contract as ObjectRule).fields.audience;
  if (!audience || audience.type !== 'string' || !audience.enum || audience.enum.some((item) => !['public', 'members', 'internal'].includes(item))) throw new Error('payload contract must declare a required top-level audience enum');
}
/** RFC 3339 date-time: a calendar date, a T, a time with optional fraction, and Z or a numeric offset. */
export const DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/;
/**
 * A date-time names a moment that exists: the month has that day, the clock reads that time, and the offset is one a
 * zone can have. Date.parse alone is not enough, because it turns February 30 into March 2 rather than refusing it.
 */
export function isCalendarDateTime(value: string): boolean {
  const match = DATE_TIME_PATTERN.exec(value);
  if (!match) return false;
  const [year, month, day, hour, minute, second, offsetHours, offsetMinutes] = match.slice(1).map((part) => (part === undefined ? 0 : Number(part)));
  // Plain Gregorian arithmetic rather than Date.UTC, which reads years 0 through 99 as 1900 through 1999.
  const leap = (year! % 4 === 0 && year! % 100 !== 0) || year! % 400 === 0;
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month! - 1] ?? 0;
  return month! >= 1 && month! <= 12 && day! >= 1 && day! <= daysInMonth
    && hour! <= 23 && minute! <= 59 && second! <= 59 && offsetHours! <= 23 && offsetMinutes! <= 59;
}
function validateValue(value: unknown, rule: ContractRule, label: string): asserts value is JsonValue {
  if (rule.type === 'string') {
    if (typeof value !== 'string') throw new Error(`${label} must be a string`); const length = codePoints(value);
    if ((rule.minLength !== undefined && length < rule.minLength) || (rule.maxLength !== undefined && length > rule.maxLength)) throw new Error(`${label} violates string length bounds`);
    if (rule.enum && !rule.enum.includes(value)) throw new Error(`${label} must be one of: ${rule.enum.join(', ')}`);
    if (rule.format === 'sha256-digest' && !digestPattern.test(value)) throw new Error(`${label} must be an exact sha256 digest`);
    if (rule.format === 'date-time' && !isCalendarDateTime(value)) throw new Error(`${label} must be an RFC 3339 date-time that names a real moment, such as 2026-10-26T09:30:00Z`);
    return;
  }
  if (rule.type === 'integer') {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < rule.minimum || value > rule.maximum) throw new Error(`${label} violates integer bounds`);
    return;
  }
  if (rule.type === 'array') { if (!Array.isArray(value) || value.length < rule.minItems || value.length > rule.maxItems) throw new Error(`${label} violates array bounds`); value.forEach((item, index) => validateValue(item, rule.items, `${label}[${index}]`)); return; }
  if (rule.type === 'localeMap') {
    if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error(`${label} must be an object keyed by locale tag`);
    const locales = Object.keys(value);
    for (const locale of locales) if (!rule.allowed.includes(locale)) throw new Error(`${label} locale ${locale} is not an allowed locale (allowed: ${rule.allowed.join(', ')})`);
    for (const locale of rule.required) if (!locales.includes(locale)) throw new Error(`${label} is missing required locale ${locale}`);
    for (const locale of locales) validateValue((value as Record<string, unknown>)[locale], rule.items, `${label}.${locale}`);
    return;
  }
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error(`${label} must be an object`);
  const actual = Object.keys(value).sort(); const expected = [...rule.required].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new Error(`${label} fields must be exactly: ${expected.join(', ')}`);
  for (const field of expected) validateValue((value as Record<string, unknown>)[field], rule.fields[field]!, `${label}.${field}`);
}
export type DependencyEntry = { artifactId: string; artifactVersion: number; payloadDigest: string };
export type DependencySet = { entries: DependencyEntry[] };
export function validateDependencySet(value: unknown): asserts value is DependencySet {
  requireExactObjectKeys(value, ['entries'], 'dependencySet');
  if (!Array.isArray(value.entries)) throw new Error('dependencySet.entries must be an array');
  let previous: string | undefined;
  for (const entry of value.entries) {
    requireExactObjectKeys(entry, ['artifactId', 'artifactVersion', 'payloadDigest'], 'dependency entry');
    if (typeof entry.artifactId !== 'string' || !entry.artifactId || !Number.isSafeInteger(entry.artifactVersion) || entry.artifactVersion < 1 || typeof entry.payloadDigest !== 'string' || !digestPattern.test(entry.payloadDigest)) throw new Error('dependency entry has invalid identity, version, or digest');
    if (previous !== undefined && previous >= entry.artifactId) throw new Error('dependency entries must have unique IDs in ascending UTF-16 order');
    previous = entry.artifactId;
  }
}
export function validatePayload(payload: unknown, contract: PayloadContract): asserts payload is JsonValue {
  validatePayloadContract(contract);
  if (payload && typeof payload === 'object' && !Array.isArray(payload) && Object.hasOwn(payload, 'dependencySet')) validateDependencySet((payload as Record<string, unknown>).dependencySet);
  validateValue(payload, contract, 'payload');
}
export function payloadAudience(payload: JsonValue): Audience {
  if (!payload || Array.isArray(payload) || typeof payload !== 'object' || !['public', 'members', 'internal'].includes(String(payload.audience))) throw new Error('payload lacks a supported audience');
  return payload.audience as Audience;
}
export function exactPin(profile: ProfileRevision): ProfilePin { return { profileId: profile.profileId, revision: profile.revision, digest: profile.digest }; }
export function samePin(left: ProfilePin, right: ProfilePin): boolean { return left.profileId === right.profileId && left.revision === right.revision && left.digest === right.digest; }
