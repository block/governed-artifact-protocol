import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { STEPS, defineAction, defineApplication, describeSteps, isStepId, step } from '../../src/gap/index.js';

const noopWorkspace = { initialize: async (root?: string) => root ?? '', reset: async (root?: string) => root ?? '' };

test('the lifecycle table carries the six draft steps in order and the three release decisions', () => {
  assert.deepEqual(STEPS.filter((item) => item.kind === 'lifecycle').map((item) => item.number), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(STEPS.filter((item) => item.kind === 'decision').map((item) => item.id), ['approve-release', 'reject-release', 'withdraw-release']);
  assert.equal(step('authorize-release').plane, 'release');
  assert.equal(step('propose-profile').role, 'author');
  for (const item of STEPS) assert.match(item.anchor, /^[a-z0-9-]+$/, `${item.id} names a draft section anchor`);
  assert.equal(isStepId('release'), true);
  assert.equal(isStepId('publish'), false);
});

test('describeSteps reads as a sentence a tool description can end with', () => {
  assert.equal(describeSteps([]), 'Performs no GAP lifecycle step and records no release decision.');
  assert.equal(describeSteps(['create-version', 'authorize-release', 'release']), 'GAP lifecycle steps: 3 create a version, 4 authorize, 5 release.');
  assert.equal(describeSteps(['withdraw-release']), 'GAP release decisions: withdraw a release.');
  assert.equal(describeSteps(['approve-release', 'authorize-release', 'release']), 'GAP lifecycle steps: 4 authorize, 5 release. GAP release decisions: record a release approval.');
});

test('defineAction rejects names, steps, and text a tool cannot carry', () => {
  const valid = { title: 'Do it', description: 'Does it.', group: 'Main', steps: [] as const, input: {}, run: () => 'ok' };
  assert.equal(defineAction({ name: 'do_it', ...valid }).name, 'do_it');
  assert.throws(() => defineAction({ name: 'Do-It', ...valid }), /action name must match/);
  assert.throws(() => defineAction({ name: 'do_it', ...valid, title: ' ' }), /needs a title/);
  assert.throws(() => defineAction({ name: 'do_it', ...valid, description: '' }), /needs a description/);
  assert.throws(() => defineAction({ name: 'do_it', ...valid, steps: ['publish' as never] }), /unknown lifecycle step/);
  assert.throws(() => defineAction({ name: 'do_it', ...valid, steps: ['release', 'release'] }), /lists lifecycle step release twice/);
});

test('defineApplication checks groups and actions against each other and lists actions by group', () => {
  const read = defineAction({ name: 'read_thing', title: 'Read', description: 'Reads.', group: 'Reading', steps: ['verify'], input: { id: z.string() }, run: ({ id }) => ({ id }) });
  const save = defineAction({ name: 'save_thing', title: 'Save', description: 'Saves.', group: 'Writing', steps: ['create-version'], input: {}, run: () => ({}) });
  const application = defineApplication({
    id: 'things', title: 'Things', summary: 'A thing store.', workspace: noopWorkspace,
    groups: [{ name: 'Writing', summary: 'Write.' }, { name: 'Reading', summary: 'Read.' }],
    actions: [read, save],
  });
  assert.deepEqual(application.actionsByGroup().map((group) => [group.name, group.actions.map((action) => action.name)]), [['Writing', ['save_thing']], ['Reading', ['read_thing']]]);
  const base = { title: 'Things', summary: 'A thing store.', workspace: noopWorkspace, groups: [{ name: 'Writing', summary: 'Write.' }] };
  assert.throws(() => defineApplication({ ...base, id: 'Things', actions: [save] }), /application id must match/);
  assert.throws(() => defineApplication({ ...base, id: 'things', groups: [], actions: [save] }), /at least one group/);
  assert.throws(() => defineApplication({ ...base, id: 'things', groups: [...base.groups, ...base.groups], actions: [save] }), /declares group "Writing" twice/);
  assert.throws(() => defineApplication({ ...base, id: 'things', actions: [save, save] }), /declares action save_thing twice/);
  assert.throws(() => defineApplication({ ...base, id: 'things', actions: [read] }), /undeclared group "Reading"/);
  assert.throws(() => defineApplication({ ...base, id: 'things', groups: [...base.groups, { name: 'Empty', summary: '' }], actions: [save] }), /group "Empty" has no actions/);
});
