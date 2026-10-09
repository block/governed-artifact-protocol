/**
 * File handling for the example generator: how a record becomes a file, and how a
 * generated set is compared with, or written over, the committed one.
 *
 * Only files are shared here. Each domain's scenario module drives that domain's
 * own functions; nothing in this module performs a lifecycle step.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { demoRoot } from '../src/gap/workspace.js';

/** One example set: the folder under specification/draft/examples and the records it holds, keyed by file name. */
export type ExampleSet = { set: string; files: Record<string, unknown> };

/** The folder that holds every example set. */
export const examplesRoot = resolve(demoRoot, '..', 'specification', 'draft', 'examples');

type JsonObject = Record<string, unknown>;
const isObject = (value: unknown): value is JsonObject => !!value && typeof value === 'object' && !Array.isArray(value);

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (isObject(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]));
  return value;
}

/*
 * Key order. GAP gives it no meaning: every digest and signature is computed over canonical
 * JSON, which sorts keys first. The files use one reading order instead, so a record reads the
 * way the draft defines it:
 *
 * - Protocol fields follow the draft's type definitions: identity first, then the subject a
 *   decision binds, the decision, and the digest and signature that seal it.
 * - Long content comes last: an artifact version's or release's payload, a profile's contract.
 * - Payload fields follow the profile that governs them: the order of the contract's `required`
 *   list, then any other field alphabetically. A CMS locale map follows its `allowed` list.
 * - A payload contract puts `type` first, then its constraints, its fields, `required`, and
 *   `additionalProperties`, with nested `items` last.
 * - Anything else, such as the signer IDs of a trust store, is alphabetical.
 */

/** Payload contracts by profile digest, so a payload can be laid out by the contract its profile pin names. */
export type Contracts = Map<string, JsonObject>;

/** `first` in that order, then every other key alphabetically, each value laid out by `child`. */
function ordered(value: unknown, first: string[], child: (key: string, value: unknown) => unknown = (_key, item) => sortKeys(item)): unknown {
  if (!isObject(value)) return sortKeys(value);
  const keys = [...first.filter((key) => Object.hasOwn(value, key)), ...Object.keys(value).filter((key) => !first.includes(key)).sort()];
  return Object.fromEntries(keys.map((key) => [key, child(key, value[key])]));
}

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);
const objectAt = (value: JsonObject, key: string): JsonObject | undefined => (isObject(value[key]) ? value[key] : undefined);

function payload(value: unknown, rule: JsonObject | undefined): unknown {
  if (!rule) return sortKeys(value);
  const items = objectAt(rule, 'items');
  if (Array.isArray(value)) return value.map((item) => payload(item, items));
  if (Array.isArray(rule.allowed)) return ordered(value, strings(rule.allowed), (_key, item) => payload(item, items));
  const fields = objectAt(rule, 'properties') ?? objectAt(rule, 'fields') ?? {};
  return ordered(value, strings(rule.required), (key, item) => payload(item, objectAt(fields, key)));
}

const CONTRACT_KEYWORDS = ['$contractLanguage', 'type', 'format', 'pattern', 'enum', 'minLength', 'maxLength', 'minimum', 'maximum', 'minItems', 'maxItems', 'uniqueItems', 'allowed', 'properties', 'fields', 'required', 'fallback', 'additionalProperties', 'items'];

function contract(rule: unknown): unknown {
  if (!isObject(rule)) return sortKeys(rule);
  return ordered(rule, CONTRACT_KEYWORDS, (key, value) => {
    if (key === 'properties' || key === 'fields') return ordered(value, strings(rule.required), (_field, fieldRule) => contract(fieldRule));
    if (key === 'fallback') return ordered(value, strings(rule.allowed));
    if (key === 'items') return contract(value);
    return sortKeys(value);
  });
}

const actor = (value: unknown) => ordered(value, ['actorId', 'actorKind']);
const signature = (value: unknown) => ordered(value, ['signerId', 'signature']);
const pin = (value: unknown) => ordered(value, ['profileId', 'revision', 'digest']);

function contractFor(value: JsonObject, contracts: Contracts): JsonObject {
  const digest = objectAt(value, 'profile')?.digest;
  const found = typeof digest === 'string' ? contracts.get(digest) : undefined;
  if (!found) throw new Error(`no profile revision in the example set has digest ${String(digest)}, so the payload of ${String(value.artifactId)} has no contract to follow`);
  return found;
}

function profileRevision(value: unknown): unknown {
  return ordered(value, ['profileId', 'revision', 'digest', 'ratification', 'payloadContract'], (key, item) => {
    if (key === 'ratification') return ordered(item, ['ratifiedAt', 'actorId', 'actorKind', 'reason', 'authoritySignature'], (field, part) => (field === 'authoritySignature' ? signature(part) : sortKeys(part)));
    if (key === 'payloadContract') return contract(item);
    return sortKeys(item);
  });
}

function versionOrRelease(value: unknown, contracts: Contracts): unknown {
  if (!isObject(value)) return sortKeys(value);
  return ordered(value, ['artifactId', 'artifactVersion', 'profile', 'authoredBy', 'payload'], (key, item) => {
    if (key === 'profile') return pin(item);
    if (key === 'authoredBy') return actor(item);
    if (key === 'payload') return payload(item, contractFor(value, contracts));
    return sortKeys(item);
  });
}

const DECISIONS = ['authorized', 'approved', 'rejected', 'withdrawn'];

function decision(value: unknown, kind: string): unknown {
  return ordered(value, ['artifactId', 'artifactVersion', 'payloadDigest', 'profile', `${kind}At`, `${kind}By`, 'reason', 'authorizationSubjectDigest', 'authoritySignature'], (key, item) => {
    if (key === 'profile') return pin(item);
    if (key === `${kind}By`) return actor(item);
    if (key === 'authoritySignature') return signature(item);
    return sortKeys(item);
  });
}

function proof(value: JsonObject): unknown {
  const contracts = contractsOf({ set: 'proof', files: { proof: value } });
  const each = (item: unknown, kind: string) => (Array.isArray(item) ? item.map((entry) => decision(entry, kind)) : sortKeys(item));
  return ordered(value, ['release', 'profile', 'authorization', 'approvals', 'rejections', 'withdrawal'], (key, item) => {
    if (key === 'release') return versionOrRelease(item, contracts);
    if (key === 'profile') return profileRevision(item);
    if (key === 'authorization') return decision(item, 'authorized');
    if (key === 'approvals') return each(item, 'approved');
    if (key === 'rejections') return each(item, 'rejected');
    if (key === 'withdrawal') return decision(item, 'withdrawn');
    return sortKeys(item);
  });
}

/** One record in reading order. Which record it is follows from its fields, as in the draft's type definitions. */
function layout(value: unknown, contracts: Contracts): unknown {
  if (!isObject(value)) return sortKeys(value);
  if (isObject(value.release) && isObject(value.authorization)) return proof(value);
  if ('payloadContract' in value) return profileRevision(value);
  if ('payload' in value) return versionOrRelease(value, contracts);
  const kind = DECISIONS.find((name) => `${name}At` in value);
  if (kind) return decision(value, kind);
  if (Object.values(value).every((entry) => isObject(entry) && 'publicKey' in entry)) return ordered(value, [], (_signer, entry) => ordered(entry, ['publicKey', 'actions']));
  return sortKeys(value);
}

/** The payload contract of every profile revision in a set, on its own or inside a proof. */
export function contractsOf(set: ExampleSet): Contracts {
  const contracts: Contracts = new Map();
  for (const record of Object.values(set.files)) {
    for (const profile of isObject(record) ? [record, record.profile] : []) {
      if (isObject(profile) && typeof profile.digest === 'string' && isObject(profile.payloadContract)) contracts.set(profile.digest, profile.payloadContract);
    }
  }
  return contracts;
}

/**
 * The bytes of one example file: keys in reading order, two-space indentation, and a final line feed.
 * An artifact version or release needs its profile's contract in `contracts` to order its payload.
 */
export function formatRecord(value: unknown, contracts: Contracts = new Map()): string {
  return `${JSON.stringify(layout(value, contracts), null, 2)}\n`;
}

/** The bytes of every file in a set, keyed by file name. */
export function formatSet(set: ExampleSet): Record<string, string> {
  const contracts = contractsOf(set);
  return Object.fromEntries(Object.entries(set.files).map(([file, record]) => [file, formatRecord(record, contracts)]));
}

/** What differs between a generated set and the files on disk. */
export type Drift = {
  set: string;
  /** Files whose bytes differ, with a short description of each difference. */
  changed: { file: string; details: string[] }[];
  /** Files a scenario produces that are not on disk. */
  added: string[];
  /** JSON files on disk that no scenario produces. */
  unproduced: string[];
};

const MAX_DETAILS = 8;
const shown = (value: unknown) => {
  if (value === undefined) return '(absent)';
  const text = JSON.stringify(value);
  return text.length > 72 ? `${text.slice(0, 69)}...` : text;
};

/** The JSON paths at which two values differ, ignoring key order. */
function differences(committed: unknown, generated: unknown, path: string, out: string[]) {
  if (out.length >= MAX_DETAILS) return;
  if (isObject(committed) && isObject(generated)) {
    for (const key of [...new Set([...Object.keys(committed), ...Object.keys(generated)])].sort()) differences(committed[key], generated[key], `${path}.${key}`, out);
    return;
  }
  if (Array.isArray(committed) && Array.isArray(generated)) {
    for (let index = 0; index < Math.max(committed.length, generated.length); index++) differences(committed[index], generated[index], `${path}[${index}]`, out);
    return;
  }
  if (JSON.stringify(sortKeys(committed)) !== JSON.stringify(sortKeys(generated))) out.push(`${path || '(record)'}: committed ${shown(committed)}, generated ${shown(generated)}`);
}

/** The objects in a committed value whose keys are not in reading order. */
function misordered(committed: unknown, expected: unknown, path: string, out: string[]) {
  if (out.length >= MAX_DETAILS) return;
  if (Array.isArray(committed) && Array.isArray(expected)) { committed.forEach((item, index) => misordered(item, expected[index], `${path}[${index}]`, out)); return; }
  if (!isObject(committed) || !isObject(expected)) return;
  const keys = Object.keys(committed);
  const wanted = Object.keys(expected);
  if (keys.join('\u0000') !== wanted.join('\u0000')) out.push(`same values; keys at ${path || '(record)'} are out of order (committed: ${keys.join(', ')}; expected: ${wanted.join(', ')})`);
  for (const key of keys) misordered(committed[key], expected[key], `${path}.${key}`, out);
}

function describe(committedText: string, generated: unknown, expectedText: string): string[] {
  let committed: unknown;
  try { committed = JSON.parse(committedText); } catch { return ['the committed file is not valid JSON']; }
  const out: string[] = [];
  differences(committed, generated, '', out);
  if (out.length === 0) misordered(committed, JSON.parse(expectedText), '', out);
  if (out.length === 0) return ['same values; whitespace or indentation differs'];
  return out.length >= MAX_DETAILS ? [...out, '(more differences not shown)'] : out;
}

async function committedJson(directory: string): Promise<string[]> {
  try { return (await readdir(directory)).filter((name) => name.endsWith('.json')).sort(); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
}

/** Compare one generated set with the files on disk without writing anything. */
export async function compareSet(generated: ExampleSet, root = examplesRoot): Promise<Drift> {
  const directory = join(root, generated.set);
  const onDisk = await committedJson(directory);
  const drift: Drift = { set: generated.set, changed: [], added: [], unproduced: onDisk.filter((name) => !Object.hasOwn(generated.files, name)) };
  const texts = formatSet(generated);
  for (const [file, record] of Object.entries(generated.files).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (!onDisk.includes(file)) { drift.added.push(file); continue; }
    const text = await readFile(join(directory, file), 'utf8');
    if (text !== texts[file]) drift.changed.push({ file, details: describe(text, record, texts[file]) });
  }
  return drift;
}

/** Write every file in a generated set whose bytes differ from disk. Never deletes: files no scenario produces are reported instead. */
export async function writeSet(generated: ExampleSet, root = examplesRoot): Promise<Drift> {
  const drift = await compareSet(generated, root);
  const texts = formatSet(generated);
  for (const file of [...drift.added, ...drift.changed.map((item) => item.file)]) await writeFile(join(root, generated.set, file), texts[file], 'utf8');
  return drift;
}

export const hasDrift = (drift: Drift) => drift.changed.length > 0 || drift.added.length > 0 || drift.unproduced.length > 0;

/** A readable summary of every difference, one set at a time. */
export function summarize(drifts: Drift[]): string {
  const lines: string[] = [];
  for (const drift of drifts.filter(hasDrift)) {
    lines.push(`${drift.set}:`);
    for (const { file, details } of drift.changed) lines.push(`  changed ${file}`, ...details.map((detail) => `    ${detail}`));
    for (const file of drift.added) lines.push(`  missing ${file} (a scenario produces it; it is not committed)`);
    for (const file of drift.unproduced) lines.push(`  unproduced ${file} (committed; no scenario produces it)`);
  }
  return lines.join('\n');
}
