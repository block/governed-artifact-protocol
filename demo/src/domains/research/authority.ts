// Authority signatures in the exact GAP shape (specification, Authority signature): Ed25519 over a domain-separated
// canonical statement naming the signer and the exact subject digest, verified against a trust store the consumer
// configures. This module is the consumer's half: it holds no key, reads no file, and touches no workspace, so a
// reader can copy it beside verify.ts and check a proof with nothing but the bytes and a trust store. Key custody
// and signing live in signing.ts.
import { createHash, createPublicKey, verify as edVerify, type KeyObject } from 'node:crypto';

export type AuthorityAction = 'ratify-profile' | 'approve-release' | 'reject-release' | 'authorize-release' | 'withdraw-release';
export type AuthoritySignature = { signerId: string; signature: string };
export type TrustStore = Record<string, { publicKey: string; actions: AuthorityAction[] }>;
export const authorityActions: readonly AuthorityAction[] = ['ratify-profile', 'approve-release', 'reject-release', 'authorize-release', 'withdraw-release'];

export function canonical(value: any): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isSafeInteger(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  throw new Error('unsupported canonical JSON value');
}
export function digest(domain: string, value: unknown) { return `sha256:${createHash('sha256').update(`${domain}\n${canonical(value)}`).digest('hex')}`; }
export const isDigest = (value: unknown): value is string => typeof value === 'string' && /^sha256:[0-9a-f]{64}$/.test(value);

// The bytes a signer signs: the action's fixed domain line, one line feed, then the canonical statement.
export const signingDomain = (action: AuthorityAction) => `governed-artifact.authority.${action}.ed25519.v1`;
export const signedBytes = (action: AuthorityAction, signerId: string, subjectDigest: string) =>
  Buffer.from(`${signingDomain(action)}\n${canonical({ signerId, subjectDigest })}`, 'utf8');

// Unpadded base64url (RFC 4648 section 5) of exactly the expected length; padding, other alphabets, and
// non-canonical trailing bits are rejected by requiring the decoded bytes to re-encode to the same text.
export function decodeExact(text: unknown, bytes: number): Buffer {
  if (typeof text !== 'string' || !/^[A-Za-z0-9_-]+$/.test(text)) throw new Error('malformed base64url value');
  const decoded = Buffer.from(text, 'base64url');
  if (decoded.length !== bytes || decoded.toString('base64url') !== text) throw new Error(`base64url value must decode to exactly ${bytes} bytes`);
  return decoded;
}
export const publicKeyObject = (publicKey: unknown): KeyObject => createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: decodeExact(publicKey, 32).toString('base64url') }, format: 'jwk' });

// Verify one authority signature against configured trust. Fails closed on everything it cannot resolve: a missing
// or malformed signature record, a signer the store does not name or does not trust for this action, a signer ID
// that differs from the record's actor, a key or signature of the wrong length, or bytes that do not verify.
export function verifyAuthoritySignature(action: AuthorityAction, subjectDigest: string, signature: unknown, store: TrustStore, expectedSignerId: string): string {
  const failure = (detail: string) => new Error(`authority signature failure (${action}): ${detail}`);
  if (!signature || typeof signature !== 'object' || Array.isArray(signature)) throw failure('missing signature');
  const record = signature as Record<string, unknown>;
  if (Object.keys(record).sort().join(',') !== 'signature,signerId') throw failure('signature record must carry exactly signerId and signature');
  if (typeof record.signerId !== 'string' || !record.signerId) throw failure('malformed signer ID');
  if (record.signerId !== expectedSignerId) throw failure('signer ID differs from the record actor');
  if (!store || typeof store !== 'object' || Array.isArray(store)) throw failure('no trust store');
  const trusted = Object.prototype.hasOwnProperty.call(store, record.signerId) ? store[record.signerId] : undefined;
  if (!trusted || typeof trusted !== 'object') throw failure('signer is not in configured trust');
  if (!Array.isArray(trusted.actions) || !trusted.actions.includes(action)) throw failure('signer is not trusted for this action');
  if (!isDigest(subjectDigest)) throw failure('malformed subject digest');
  let verified = false;
  try { verified = edVerify(null, signedBytes(action, record.signerId, subjectDigest), publicKeyObject(trusted.publicKey), decodeExact(record.signature, 64)); }
  catch (error) { throw failure((error as Error).message); }
  if (!verified) throw failure('signature does not verify over the exact subject');
  return record.signerId;
}
