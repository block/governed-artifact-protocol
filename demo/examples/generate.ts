/**
 * Regenerate the specification's example record sets from the demo applications.
 *
 *   pnpm examples:generate   write every example file that differs from what the applications produce
 *   pnpm examples:check      write nothing; exit non-zero and list the differences if any file would change
 *
 * Each set comes from one domain's scenario module beside this file, which drives only
 * that domain's own functions with fixed actors, times, reasons, and content. Scenarios
 * run in a fresh scratch directory under the system temporary directory, never in the
 * demo's local workspace, and the directory is removed afterwards.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cmsExamples } from './cms.js';
import { issueTrackingExamples } from './issue-tracking.js';
import { researchExamples } from './research.js';
import { compareSet, examplesRoot, hasDrift, summarize, writeSet, type Drift, type ExampleSet } from './records.js';

/** One scenario per example set, keyed by the set's folder under specification/draft/examples. */
const scenarios: Record<string, (workspaceRoot: string) => Promise<ExampleSet>> = {
  cms: cmsExamples,
  'issue-tracking': issueTrackingExamples,
  'research': researchExamples,
};

/** Run every scenario in a scratch directory and return the records each set should hold. */
export async function generateExamples(): Promise<ExampleSet[]> {
  const scratch = await mkdtemp(join(tmpdir(), 'gap-examples-'));
  try {
    const sets: ExampleSet[] = [];
    for (const [set, scenario] of Object.entries(scenarios)) {
      const generated = await scenario(join(scratch, set));
      if (generated.set !== set) throw new Error(`the ${set} scenario returned records for ${generated.set}`);
      sets.push(generated);
    }
    return sets;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

/** Compare every generated set with the committed files. Writes nothing. */
export async function checkExamples(root = examplesRoot): Promise<Drift[]> {
  return Promise.all((await generateExamples()).map((set) => compareSet(set, root)));
}

async function main(mode: 'generate' | 'check') {
  const sets = await generateExamples();
  const total = sets.reduce((count, set) => count + Object.keys(set.files).length, 0);
  if (mode === 'check') {
    const drifts = await Promise.all(sets.map((set) => compareSet(set)));
    if (!drifts.some(hasDrift)) { console.log(`The ${total} example files in ${sets.length} sets match what the demo applications produce.`); return; }
    console.error(`${summarize(drifts)}\n\nThe committed examples differ from what the demo applications produce. If the change is intended, run pnpm examples:generate, review the diff, and commit it.`);
    process.exitCode = 1;
    return;
  }
  const drifts = await Promise.all(sets.map((set) => writeSet(set)));
  const written = drifts.flatMap((drift) => [...drift.added, ...drift.changed.map((item) => item.file)].map((file) => `${drift.set}/${file}`));
  console.log(written.length ? `Wrote ${written.length} of ${total} example files:\n  ${written.join('\n  ')}` : `All ${total} example files already match; nothing written.`);
  const unproduced = drifts.flatMap((drift) => drift.unproduced.map((file) => `${drift.set}/${file}`));
  if (unproduced.length) {
    console.error(`No scenario produces these committed files:\n  ${unproduced.join('\n  ')}\nRemove them, or add them to a scenario in demo/examples/.`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--check')) { console.error('usage: generate.ts [--check]'); process.exit(2); }
  await main(args.includes('--check') ? 'check' : 'generate');
}
