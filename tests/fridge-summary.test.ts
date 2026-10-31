import test from 'node:test';
import assert from 'node:assert/strict';
import type { InventoryItem } from '../src/domain/model.ts';
import { exactExpiration, estimatedExpiration } from '../src/domain/expiration.ts';
import { fridgeSummary } from '../src/ui/fridgeSummary.ts';

const today = '2026-10-31';
test('map preview isolates the location, orders existing dates and keeps batches and source data intact', () => {
  const items: InventoryItem[] = [
    { id: 'unknown', name: 'Milk', locationId: 'upper-shelf', expiration: null, quantity: { value: 3, unit: '盒' } },
    { id: 'later', name: 'Milk', locationId: 'upper-shelf', expiration: estimatedExpiration(10, 'days', '2026-10-29', '10 days'), quantity: { value: 500, unit: 'ml' } },
    { id: 'today', name: 'Eggs', locationId: 'upper-shelf', expiration: exactExpiration(today, today) },
    { id: 'past', name: 'Leftovers', locationId: 'upper-shelf', expiration: exactExpiration('2026-10-30', today) },
    { id: 'other', name: 'Butter', locationId: 'door-top', expiration: null },
  ];
  const before = structuredClone(items);
  const summary = fridgeSummary(items, 'upper-shelf', today);
  assert.deepEqual(summary.items.map(item => item.id), ['past', 'today', 'later', 'unknown']);
  assert.equal(summary.count, 4);
  assert.equal(summary.attentionCount, 3);
  assert.equal(summary.attentionText, '1 条已到期，1 条临近到期，1 条保质期待确认');
  assert.deepEqual(items, before);
  assert.deepEqual(summary.items.at(-1)?.quantity, { value: 3, unit: '盒' });
});

test('map attention includes day three and unknown dates without treating day four as due', () => {
  const items: InventoryItem[] = [
    { id: 'a', name: 'A', locationId: 'x', expiration: exactExpiration('2026-11-03', today) },
    { id: 'b', name: 'B', locationId: 'x', expiration: exactExpiration('2026-11-04', today) },
    { id: 'c', name: 'C', locationId: 'x', expiration: null },
  ];
  assert.equal(fridgeSummary(items, 'x', today).attentionText, '1 条临近到期，1 条保质期待确认');
  assert.deepEqual(fridgeSummary(items, 'empty', today), { items: [], count: 0, attentionCount: 0, attentionText: '' });
});

test('same-day map previews have a stable order even when imported inventory order changes', () => {
  const items: InventoryItem[] = ['c', 'a', 'b'].map(id => ({ id, name: 'Milk', locationId: 'x', expiration: null }));
  assert.deepEqual(fridgeSummary(items, 'x', today).items.map(item => item.id), ['a', 'b', 'c']);
  assert.deepEqual(fridgeSummary([...items].reverse(), 'x', today).items.map(item => item.id), ['a', 'b', 'c']);
});
