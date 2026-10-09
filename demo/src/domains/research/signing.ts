// Demo key custody for this local application (specification, Authority signature, key custody outside GAP): the
// configured authorities' Ed25519 key pairs live in seed/research/demo-authority-keys.json so the walkthrough and the
// specification examples are reproducible, and the application signs on a configured authority's behalf. A real
// deployment would have each authority sign with a key only it holds. Nothing here is needed to verify a proof;
// verification is authority.ts and verify.ts, which never import this module.
import { createPrivateKey, createPublicKey, sign as edSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { seedPath } from '../../gap/workspace.js';
import { authorityActions, decodeExact, isDigest, signedBytes, type AuthorityAction, type AuthoritySignature, type TrustStore } from './authority.js';
import { applicationId } from './workspace.js';

export * from './authority.js';

type DemoKeys = { warning: string; signers: Record<string, { publicKey: string; privateKey: string; actions: AuthorityAction[] }> };
const demoKeys = JSON.parse(readFileSync(seedPath(applicationId, 'demo-authority-keys.json'), 'utf8')) as DemoKeys;
for (const [signerId, signer] of Object.entries(demoKeys.signers)) {
  const derived = createPublicKey(createPrivateKey({ key: { kty: 'OKP', crv: 'Ed25519', d: decodeExact(signer.privateKey, 32).toString('base64url'), x: signer.publicKey }, format: 'jwk' })).export({ format: 'jwk' }).x;
  if (derived !== signer.publicKey || !signer.actions.length || signer.actions.some((action) => !authorityActions.includes(action))) throw new Error(`malformed demo authority key for ${signerId}`);
}

// Local choice: the journal and the previously published works it cites are separate source contexts, each with its own
// configured trust (specification, Dependency set: a source verifies under its context's trust). A trust store names the
// actions a signer is trusted for, not the profiles they cover, so each context trusts exactly one release authority:
// the publisher for the journal's papers, reports, and notes, and the cited-works editor for the sources.
export type TrustContext = 'journal' | 'cited-works';
const contextSigners: Record<TrustContext, readonly string[]> = {
  journal: ['human:journal-owner', 'human:journal-editor', 'human:journal-publisher'],
  'cited-works': ['human:journal-owner', 'human:cited-works-editor'],
};
// The trust store this deployment is configured with for one context. A consumer carries this (or its own store)
// away from the application; it never travels in a proof.
export function trustStore(context: TrustContext): TrustStore {
  return Object.fromEntries(contextSigners[context].map((signerId) => {
    const signer = demoKeys.signers[signerId];
    if (!signer) throw new Error(`no demo authority key for ${signerId}`);
    return [signerId, { publicKey: signer.publicKey, actions: [...signer.actions] }];
  }));
}
export const demoKeyCustody = demoKeys.warning;

// Produce the signature the configured authority would supply. Signing is refused for a signer this deployment holds
// no key for or does not trust for the action; permission to act is checked separately by the workflow.
export function signAsAuthority(action: AuthorityAction, signerId: string, subjectDigest: string): AuthoritySignature {
  const signer = demoKeys.signers[signerId];
  if (!signer || !signer.actions.includes(action)) throw new Error(`no configured signing key trusted for ${action}: ${signerId}`);
  if (!isDigest(subjectDigest)) throw new Error('subject digest must be a sha256 digest');
  const privateKey = createPrivateKey({ key: { kty: 'OKP', crv: 'Ed25519', d: signer.privateKey, x: signer.publicKey }, format: 'jwk' });
  return { signerId, signature: edSign(null, signedBytes(action, signerId, subjectDigest), privateKey).toString('base64url') };
}
