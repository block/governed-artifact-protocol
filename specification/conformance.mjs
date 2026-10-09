// Checks that the core requirements manifest (draft/conformance/core-requirements.json) and the
// list on draft/conformance/README.md are well formed and agree. check-specification.mjs reports
// the results for the maintained files; specification/test/ runs the same checks on fixtures,
// including retired requirements, which the maintained list may not have.
//
// IDs are append-only. A requirement that is merged into another or dropped from the draft is
// retired, not deleted: it keeps its ID, name, and last statement, drops its coverage, and gains
// `retired: { reason, replacedBy }`, so a citation of its ID still resolves.

const nonEmpty = (value) => typeof value === 'string' && value.length > 0;
const entryPattern = /^\d+\. \*\*(.+?)\*\* \(`(GAP-CORE-\d{3})`\): (.+)$/;
const codeList = (items) => {
  const codes = items.map((item) => `\`${item}\``);
  if (codes.length < 3) return codes.join(' and ');
  return `${codes.slice(0, -1).join(', ')}, and ${codes.at(-1)}`;
};

/** The text after the colon on a requirement's README line. A retired requirement reads "Retired." with its reason and replacements. */
export const readmeText = ({ statement, retired }) => (retired === undefined ? statement
  : `Retired. ${retired.reason}${retired.replacedBy?.length ? ` Replaced by ${codeList(retired.replacedBy)}.` : ''}`);

/** Requirements that are not retired. */
export const inForce = (manifest) => manifest.requirements.filter((requirement) => requirement.retired === undefined);

/** Returns one { name, ok, detail } result per check. */
export function conformanceChecks(manifest, readme) {
  const results = [];
  const check = (name, ok, detail) => results.push({ name: `conformance: ${name}`, ok: Boolean(ok), detail });
  const ids = manifest.requirements.map((requirement) => requirement.id);
  const current = inForce(manifest);

  check('requirement IDs are unique', new Set(ids).size === ids.length, 'duplicate IDs');
  check('IDs are sequential from GAP-CORE-001, with retired IDs kept in place',
    ids.every((id, index) => id === `GAP-CORE-${String(index + 1).padStart(3, '0')}`),
    `IDs: ${ids.join(', ')}; retire a requirement instead of deleting or renumbering it`);
  for (const requirement of manifest.requirements) {
    check(`${requirement.id} has a name and statement`,
      nonEmpty(requirement.name) && nonEmpty(requirement.statement), 'missing name or statement');
    if (requirement.retired === undefined) {
      check(`${requirement.id} declares coverage`,
        typeof requirement.coverage === 'object' && requirement.coverage !== null
          && Array.isArray(requirement.coverage.executable)
          && requirement.coverage.executable.every(nonEmpty)
          && typeof requirement.coverage.notes === 'string',
        'missing or malformed coverage declaration');
      continue;
    }
    const { reason, replacedBy } = requirement.retired ?? {};
    check(`${requirement.id} is retired with a reason and its replacements`,
      nonEmpty(reason) && Array.isArray(replacedBy)
        && replacedBy.every((id) => current.some((other) => other.id === id)),
      'a retired requirement needs a reason and replacedBy listing only requirements in force (or none)');
    check(`${requirement.id} is retired, so it cites no coverage`,
      requirement.coverage === undefined, 'remove coverage from a retired requirement');
  }

  // The README list must match the manifest exactly: same IDs, names, and text, in the same order,
  // with no extra or missing entries. Every numbered line must parse; a malformed entry is a
  // failure, not something to skip.
  const numberedLines = readme.split('\n').filter((line) => /^\d+\. /.test(line));
  const malformedLines = numberedLines.filter((line) => !entryPattern.test(line));
  check('every numbered README entry has the form `N. **Name** (`GAP-CORE-NNN`): statement`',
    malformedLines.length === 0, `malformed: ${malformedLines.join(' | ')}`);
  const readmeEntries = numberedLines.map((line) => line.match(entryPattern)).filter(Boolean)
    .map(([, name, id, statement]) => ({ id, name, statement }));
  const manifestEntries = manifest.requirements.map((requirement) => ({ id: requirement.id, name: requirement.name, statement: readmeText(requirement) }));
  const firstDifference = manifestEntries.findIndex((entry, index) => JSON.stringify(entry) !== JSON.stringify(readmeEntries[index]));
  const expectedLine = (entry, index) => `${index + 1}. **${entry.name}** (\`${entry.id}\`): ${entry.statement}`;
  check('README lists exactly the manifest requirements, in order',
    JSON.stringify(readmeEntries) === JSON.stringify(manifestEntries),
    `README has ${readmeEntries.length} entries; manifest has ${manifestEntries.length}${
      firstDifference < 0 ? '' : `; entry ${firstDifference + 1} should read: ${expectedLine(manifestEntries[firstDifference], firstDifference)}`}`);
  return results;
}
