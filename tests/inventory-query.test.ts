import test from 'node:test';
import assert from 'node:assert/strict';
import type { InventoryItem } from '../src/domain/model.ts';
import { emptyInventoryQuery, queryInventory } from '../src/domain/inventory-query.ts';
import { estimatedExpiration, exactExpiration } from '../src/domain/expiration.ts';
import { createSampleFridge } from '../src/config/sample-fridge.ts';
import { locationName, storageLocations } from '../src/ui/labels.ts';

const today = '2026-10-19';
const items: InventoryItem[] = [
  { id: 'milk', name: 'Milk', locationId: 'upper-shelf', expiration: estimatedExpiration(3, 'days', '2026-10-19', 'about 3 days') },
  { id: 'eggs', name: '鸡蛋', locationId: 'lower-shelf', expiration: exactExpiration('2026-10-19', '2026-10-18') },
  { id: 'sauce', name: '味噌', locationId: 'door-upper-left', expiration: exactExpiration('2026-10-18', '2026-10-17') },
  { id: 'rice', name: 'Cooked Rice', locationId: 'shelf-4', expiration: exactExpiration('2026-10-23', '2026-10-19') },
];
const ids = (result: InventoryItem[]) => result.map(item => item.id);

test('name search supports Chinese, case differences, whitespace and full-width input', () => {
  assert.deepEqual(ids(queryInventory(items, { ...emptyInventoryQuery, search: '  ＭＩＬＫ  ' }, today)), ['milk']);
  assert.deepEqual(ids(queryInventory(items, { ...emptyInventoryQuery, search: '味' }, today)), ['sauce']);
  assert.deepEqual(ids(queryInventory(items, { ...emptyInventoryQuery, search: 'cooked   rice' }, today)), ['rice']);
});
test('date filters distinguish today, the inclusive three-day boundary, past dates and later food', () => {
  assert.deepEqual(ids(queryInventory(items, { ...emptyInventoryQuery, expiration: 'due-soon' }, today)), ['eggs', 'milk']);
  assert.deepEqual(ids(queryInventory(items, { ...emptyInventoryQuery, expiration: 'past-date' }, today)), ['sauce']);
  assert.deepEqual(ids(queryInventory(items, { ...emptyInventoryQuery, expiration: 'later' }, today)), ['rice']);
});
test('location, name and date filters compose; no match stays empty', () => {
  assert.deepEqual(ids(queryInventory(items, { ...emptyInventoryQuery, search: 'Milk', locationId: 'upper-shelf', expiration: 'due-soon' }, today)), ['milk']);
  assert.deepEqual(queryInventory(items, { ...emptyInventoryQuery, search: 'Milk', locationId: 'door-top' }, today), []);
  assert.deepEqual(queryInventory([], emptyInventoryQuery, today), []);
});
test('query results do not reorder source inventory, clone records or renew estimates', () => {
  const before = structuredClone(items);
  const result = queryInventory(items, emptyInventoryQuery, today);
  assert.deepEqual(ids(result), ['sauce', 'eggs', 'milk', 'rice']);
  assert.deepEqual(items, before);
  assert.strictEqual(result.find(item => item.id === 'milk'), items[0]);
});
test('name sorting is stable and independent of expiration dates', () => {
  const result = queryInventory(items, { ...emptyInventoryQuery, sort: 'name' }, today);
  assert.ok(result.indexOf(items[3]!) < result.indexOf(items[0]!));
  const ties = [{ ...items[0]!, id: 'b' }, { ...items[0]!, id: 'a' }];
  assert.deepEqual(ids(queryInventory(ties, { ...emptyInventoryQuery, sort: 'name' }, today)), ['a', 'b']);
});
test('location names retain compartment context and nested storage ancestry', () => {
  const state = createSampleFridge();
  assert.equal(locationName(state, 'upper-shelf'), '冷藏室 / 第 1 层');
  assert.equal(locationName(state, 'door-upper-left'), '冰箱门 / 左上篮');
  assert.equal(locationName(state, 'freezer-drawer-3'), '冷冻室 / 冷冻抽屉 3');
  assert.equal(locationName(state, 'missing'), 'missing');
  assert.deepEqual(storageLocations(state).slice(0, 5).map(node => node.id), ['upper-shelf', 'lower-shelf', 'shelf-3', 'shelf-4', 'produce-drawer']);
  assert.equal(storageLocations(state).at(-1)!.id, 'door-bottom');
});
