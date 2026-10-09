import assert from 'node:assert/strict';
import {test} from 'node:test';
import {visibilityAdjustment} from '../src/theme/TOC/visibility';

test('the active heading remains visible with only the necessary rail movement', () => {
  const rail = {top: 80, bottom: 700};
  assert.equal(visibilityAdjustment(rail, {top: 200, bottom: 240}), 0);
  assert.equal(visibilityAdjustment(rail, {top: 80, bottom: 700}), 0);
  assert.equal(visibilityAdjustment(rail, {top: 60, bottom: 100}), -20);
  assert.equal(visibilityAdjustment(rail, {top: 680, bottom: 720}), 20);
  assert.equal(visibilityAdjustment(rail, {top: 900, bottom: 940}), 240);
  assert.equal(visibilityAdjustment(rail, {top: -80, bottom: -40}), -160);
});
