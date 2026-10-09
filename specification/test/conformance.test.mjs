// Runs the conformance list checks on fixtures built from the maintained manifest and README, so
// the rules for retired requirements are exercised before any requirement is actually retired.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { conformanceChecks, readmeText } from '../conformance.mjs';

const read = (path) => readFile(new URL(`../draft/conformance/${path}`, import.meta.url), 'utf8');
const maintainedManifest = JSON.parse(await read('core-requirements.json'));
const maintainedReadme = await read('README.md');
const lastNumber = maintainedManifest.requirements.length;
const nextId = `GAP-CORE-${String(lastNumber + 1).padStart(3, '0')}`;
const lastId = maintainedManifest.requirements.at(-1).id;

const failures = (manifest, readme) => conformanceChecks(manifest, readme).filter((result) => !result.ok);
const failed = (manifest, readme) => failures(manifest, readme).map((result) => result.name);
const lineFor = (requirement, number) => `${number}. **${requirement.name}** (\`${requirement.id}\`): ${readmeText(requirement)}`;
// Adds one entry to both files, after the last maintained one; `line` overrides its README line.
const withEntry = (entry, line = lineFor(entry, lastNumber + 1)) => {
  const lastLine = maintainedReadme.split('\n').find((text) => text.startsWith(`${lastNumber}. `));
  return {
    manifest: { ...maintainedManifest, requirements: [...structuredClone(maintainedManifest.requirements), entry] },
    readme: maintainedReadme.replace(lastLine, `${lastLine}\n${line}`),
  };
};
const retired = (fields = {}) => ({
  id: nextId, name: 'Trial rule', statement: 'A trial rule MUST hold.',
  retired: { reason: 'Merged into another requirement.', replacedBy: [lastId] }, ...fields,
});

test('the maintained manifest and README pass every check', () => {
  assert.deepEqual(failures(maintainedManifest, maintainedReadme), []);
});

test('a retired requirement stays in place, and its README line names its reason and replacements', () => {
  const { manifest, readme } = withEntry(retired());
  assert.deepEqual(failed(manifest, readme), []);
  assert.ok(readme.includes(`(\`${nextId}\`): Retired. Merged into another requirement. Replaced by \`${lastId}\`.`));
});

test('a retired requirement lists any number of replacements, or none', () => {
  const text = (replacedBy) => readmeText({ statement: 'unused', retired: { reason: 'Dropped.', replacedBy } });
  assert.equal(text([]), 'Retired. Dropped.');
  assert.equal(text(['GAP-CORE-001']), 'Retired. Dropped. Replaced by `GAP-CORE-001`.');
  assert.equal(text(['GAP-CORE-001', 'GAP-CORE-002']), 'Retired. Dropped. Replaced by `GAP-CORE-001` and `GAP-CORE-002`.');
  assert.equal(text(['GAP-CORE-001', 'GAP-CORE-002', 'GAP-CORE-003']),
    'Retired. Dropped. Replaced by `GAP-CORE-001`, `GAP-CORE-002`, and `GAP-CORE-003`.');
});

test('a retired requirement whose README line still shows its statement is refused, with the expected line', () => {
  const entry = retired();
  const { manifest, readme } = withEntry(entry, `${lastNumber + 1}. **${entry.name}** (\`${entry.id}\`): ${entry.statement}`);
  const [failure, ...rest] = failures(manifest, readme);
  assert.equal(rest.length, 0);
  assert.equal(failure.name, 'conformance: README lists exactly the manifest requirements, in order');
  assert.match(failure.detail, new RegExp(`should read: ${lastNumber + 1}\\. \\*\\*Trial rule\\*\\* \\(\`${nextId}\`\\): Retired\\.`));
});

test('a retired requirement needs a reason and replacements that are in force', () => {
  const name = `conformance: ${nextId} is retired with a reason and its replacements`;
  const cases = {
    'no reason': { reason: '', replacedBy: [lastId] },
    'no replacedBy list': { reason: 'Merged.' },
    'an unknown replacement': { reason: 'Merged.', replacedBy: ['GAP-CORE-999'] },
    'a replacement that is itself retired': { reason: 'Merged.', replacedBy: [nextId] },
  };
  for (const [label, fields] of Object.entries(cases)) {
    const { manifest, readme } = withEntry(retired({ retired: fields }));
    assert.deepEqual(failed(manifest, readme), [name], label);
  }
});

test('a retired requirement cites no coverage', () => {
  const { manifest, readme } = withEntry(retired({ coverage: { executable: [], notes: '' } }));
  assert.deepEqual(failed(manifest, readme), [`conformance: ${nextId} is retired, so it cites no coverage`]);
});

test('a requirement in force needs coverage', () => {
  const { manifest, readme } = withEntry({ id: nextId, name: 'Trial rule', statement: 'A trial rule MUST hold.' });
  assert.deepEqual(failed(manifest, readme), [`conformance: ${nextId} declares coverage`]);
});

test('deleting a requirement instead of retiring it is refused', () => {
  const manifest = { ...maintainedManifest, requirements: maintainedManifest.requirements.filter((_, index) => index !== 1) };
  const readme = maintainedReadme.split('\n').filter((line) => !line.startsWith('2. ')).join('\n');
  assert.ok(failed(manifest, readme).includes('conformance: IDs are sequential from GAP-CORE-001, with retired IDs kept in place'));
});

test('a numbered README line that does not parse is refused', () => {
  const readme = maintainedReadme.replace(/^1\. \*\*(.+?)\*\*/m, '1. $1');
  assert.notEqual(readme, maintainedReadme);
  assert.ok(failed(maintainedManifest, readme).includes(
    'conformance: every numbered README entry has the form `N. **Name** (`GAP-CORE-NNN`): statement`'));
});
