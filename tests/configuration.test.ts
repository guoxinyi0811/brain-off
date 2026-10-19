import test from 'node:test';
import assert from 'node:assert/strict';
import { createSampleFridge, upgradeFridgeConfiguration } from '../src/config/sample-fridge.ts';
import { fridgeGeometry } from '../src/config/fridge-geometry.ts';
import { estimatedExpiration } from '../src/domain/expiration.ts';
import { validateState } from '../src/domain/validation.ts';
import { LocalStorageRepository, MemoryStorage } from '../src/persistence/repository.ts';

test('photo configuration contains four shelves, crisper, three freezer drawers and five independent baskets', () => {
  const state = createSampleFridge();
  const purpose = (id: string) => state.purposes.filter(p => p.locationId === id).map(p => p.categoryId);
  assert.equal(state.locations.filter(n => n.parentId === 'chilled' && n.kind === 'shelf').length, 4);
  assert.equal(state.locations.filter(n => n.parentId === 'freezer' && n.kind === 'drawer').length, 3);
  assert.equal(state.locations.filter(n => n.parentId === 'door').length, 5);
  assert.deepEqual(purpose('upper-shelf'), ['groceries']);
  assert.deepEqual(purpose('lower-shelf'), ['eggs', 'raw-meat']);
  assert.deepEqual(purpose('shelf-3'), ['jarred-condiments']);
  assert.deepEqual(purpose('shelf-4'), ['cooked-food', 'leftovers']);
  assert.deepEqual(purpose('produce-drawer'), ['vegetables', 'fruits']);
  assert.deepEqual(purpose('door-upper-left'), ['butter', 'miso']);
  assert.deepEqual(purpose('door-lower-left'), ['chinese-condiments']);
  assert.deepEqual(purpose('door-right-tall'), ['japanese-condiments', 'oyster-sauce']);
  assert.deepEqual(purpose('door-bottom'), ['wine', 'beverages']);
  for (const id of ['door-top', 'freezer-shelf', 'freezer-drawer-2', 'freezer-drawer-3']) assert.deepEqual(purpose(id), []);
});

test('every default storage location has unique geometry with staggered, vertically overlapping door baskets', () => {
  const state = createSampleFridge();
  const regions = fridgeGeometry.regions;
  assert.equal(new Set(regions.map(r => r.locationId)).size, regions.length);
  assert.deepEqual(new Set(regions.map(r => r.locationId)), new Set(state.locations.filter(n => n.canHoldItems).map(n => n.id)));
  const region = (id: string) => regions.find(r => r.locationId === id)!;
  const upper = region('door-upper-left'), lower = region('door-lower-left'), right = region('door-right-tall');
  assert.ok(right.x > upper.x && right.height > upper.height);
  assert.ok(right.y > upper.y && right.y < upper.y + upper.height);
  assert.ok(lower.y > right.y && lower.y < right.y + right.height);
  assert.ok(region('door-top').width > right.width && region('door-bottom').width > right.width);
  for (const r of regions) {
    assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.width <= fridgeGeometry.width && r.y + r.height <= fridgeGeometry.height);
  }
});

test('upgrading legacy configuration preserves all inventory, original estimates and stable location IDs', async () => {
  const legacy = createSampleFridge();
  delete legacy.fridge.configurationVersion;
  const oldIds = new Set(['freezer', 'freezer-shelf', 'chilled', 'upper-shelf', 'lower-shelf', 'produce-drawer']);
  legacy.locations = legacy.locations.filter(n => oldIds.has(n.id));
  legacy.purposes = [{ locationId: 'upper-shelf', categoryId: 'dairy' }];
  legacy.items = ['upper-shelf', 'lower-shelf', 'produce-drawer', 'freezer-shelf'].map((locationId, i) => ({
    id: `old-${i}`, name: `Existing food ${i}`, locationId,
    expiration: estimatedExpiration(3, 'days', '2026-10-15', 'about 3 days'),
  }));
  const before = structuredClone(legacy);
  const next = upgradeFridgeConfiguration(legacy);
  validateState(next);
  assert.deepEqual(next.items, before.items);
  assert.deepEqual(legacy, before);
  assert.equal(next.fridge.configurationVersion, 2);
  assert.equal(next.locations.find(n => n.id === 'freezer-shelf')!.kind, 'drawer');
  const storage = new MemoryStorage();
  const repository = new LocalStorageRepository(storage);
  await repository.save(next);
  assert.deepEqual((await repository.load())!.items, before.items);
  next.purposes = [];
  assert.strictEqual(upgradeFridgeConfiguration(next), next);
  assert.deepEqual(next.purposes, []);
});

test('custom fridges are not replaced by the photographed layout', () => {
  const custom = createSampleFridge();
  custom.fridge.id = 'custom-fridge';
  custom.locations.forEach(node => { node.fridgeId = 'custom-fridge'; });
  validateState(custom);
  delete custom.fridge.configurationVersion;
  assert.strictEqual(upgradeFridgeConfiguration(custom), custom);
});
