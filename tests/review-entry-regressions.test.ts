import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEntryDraft } from '../src/domain/entry-draft.ts';
import { createSampleFridge } from '../src/config/sample-fridge.ts';

for (const scenario of [
  { text: '和牛', quantity: undefined, mode: 'automatic', duration: '' },
  { text: '一盒和牛，还有七天', quantity: { value: 1, unit: '盒' }, mode: 'estimate', duration: '7' },
]) {
  test(`review regression: preserve a single food name containing 和 — ${scenario.text}`, () => {
    const state = createSampleFridge(); const before = structuredClone(state);
    const draft = parseEntryDraft(scenario.text, 'text', state, 'upper-shelf', '2026-11-06');
    assert.equal(draft.name, '和牛');
    assert.deepEqual(draft.quantity, scenario.quantity);
    assert.equal(draft.mode, scenario.mode); assert.equal(draft.duration, scenario.duration);
    assert.equal(draft.reviewExpiration, false);
    assert.equal(draft.entry.text, scenario.text); assert.deepEqual(state, before);
  });
}

test('review control: accepting a name containing 和 must still reject actual multi-food entries', () => {
  for (const text of ['牛奶和鸡蛋', '和牛和鸡蛋', '一盒和牛和两盒鸡蛋', '和牛、鸡蛋']) {
    assert.throws(() => parseEntryDraft(text, 'text', createSampleFridge(), 'upper-shelf', '2026-11-06'), /一次录入一种食物/);
  }
});
