import test from 'node:test';
import assert from 'node:assert/strict';
import { quantityInput, quantityLabel } from '../src/domain/quantity.ts';
import { suggestLocations } from '../src/domain/placement.ts';
import { createSampleFridge } from '../src/config/sample-fridge.ts';
import { addItem, updateItem, setPurposes } from '../src/domain/inventory.ts';
import { validateState } from '../src/domain/validation.ts';
import { estimatedExpiration } from '../src/domain/expiration.ts';
import { LocalStorageRepository, MemoryStorage } from '../src/persistence/repository.ts';

test('optional quantities support packages, fractional weights, custom units and bare numbers', () => {
  assert.equal(quantityInput('', ''), undefined);
  assert.deepEqual(quantityInput('3', ' 盒 '), { value: 3, unit: '盒' });
  assert.deepEqual(quantityInput('.5', 'kg'), { value: .5, unit: 'kg' });
  assert.equal(quantityLabel({ quantity: quantityInput('2', '罐') }), '2 罐');
  assert.equal(quantityLabel({ quantity: quantityInput('1.25', '') }), '1.25');
  assert.equal(quantityLabel({}), '');
});

test('invalid or incomplete quantities are rejected at form and persistence boundaries', () => {
  for (const value of ['0', '-1', 'NaN', 'Infinity', '1000000001', '0x10', '1,000'])
    assert.throws(() => quantityInput(value, '盒'));
  assert.throws(() => quantityInput('', '盒'));
  assert.throws(() => quantityInput('3', 'a'.repeat(17)));
  const base = { id: 'food', name: 'Food', locationId: 'upper-shelf', expiration: null };
  for (const quantity of [null, [], { value: 0, unit: '' }, { value: -1, unit: 'g' },
    { value: Infinity, unit: '' }, { value: '3', unit: '盒' }, { value: 3, unit: ' 盒 ' }, { value: 3 }]) {
    assert.throws(() => validateState({ ...createSampleFridge(), items: [{ ...base, quantity }] }));
  }
});

test('quantity edits and clearing preserve record identity, location and expiration provenance', async () => {
  const item = { id: 'milk', name: '牛奶', locationId: 'upper-shelf', quantity: quantityInput('3', '盒'),
    expiration: estimatedExpiration(7, 'days', '2026-10-10', '还有 7 天') };
  const initial = addItem(createSampleFridge(), item);
  const edited = updateItem(initial, item.id, { quantity: quantityInput('1.5', 'L') });
  assert.deepEqual(initial.items[0]!.quantity, { value: 3, unit: '盒' });
  assert.deepEqual(edited.items[0]!.expiration, item.expiration);
  assert.equal(edited.items[0]!.id, item.id);
  assert.equal(edited.items[0]!.locationId, item.locationId);
  const repository = new LocalStorageRepository(new MemoryStorage());
  await repository.save(edited); assert.deepEqual((await repository.load())!.items, edited.items);
  await repository.save(updateItem(edited, item.id, { quantity: undefined }));
  assert.equal((await repository.load())!.items[0]!.quantity, undefined);
  assert.deepEqual((await repository.load())!.items[0]!.expiration, item.expiration);
});

test('legacy items without quantity survive load/save without becoming one package', async () => {
  const state = addItem(createSampleFridge(), { id: 'legacy', name: '旧记录', locationId: 'upper-shelf', expiration: null });
  const repository = new LocalStorageRepository(new MemoryStorage()); await repository.save(state);
  assert.deepEqual(await repository.load(), state);
  assert.equal(Object.hasOwn((await repository.load())!.items[0]!, 'quantity'), false);
});

test('placement follows the configured egg zone and real asymmetric door purposes', () => {
  const state = createSampleFridge();
  const locations = (name: string) => suggestLocations(state, name).map(s => s.locationId);
  assert.deepEqual(locations(' 鸡蛋 '), ['lower-shelf']);
  assert.deepEqual(locations('ＥＧＧＳ'), ['lower-shelf']);
  assert.deepEqual(locations('黄油'), ['door-upper-left']);
  assert.deepEqual(locations('番茄酱'), ['door-lower-left']);
  assert.deepEqual(locations('蚝油'), ['door-right-tall']);
  assert.deepEqual(locations('果汁'), ['door-bottom']);
  assert.deepEqual(locations('苹果'), ['produce-drawer']);
});

test('recommendations update immediately when purposes change without moving any existing food', () => {
  const state = addItem(createSampleFridge(), { id: 'eggs', name: '鸡蛋', locationId: 'lower-shelf', expiration: null });
  const before = structuredClone(state);
  const changed = setPurposes(setPurposes(state, 'lower-shelf', []), 'upper-shelf', ['eggs']);
  assert.deepEqual(suggestLocations(changed, '鸡蛋'), [{ locationId: 'upper-shelf', categoryIds: ['eggs'] }]);
  assert.deepEqual(changed.items, state.items);
  assert.deepEqual(state, before);
});

test('multiple matches follow physical order, retain stable IDs and deduplicate purpose reasons', () => {
  let state = createSampleFridge();
  state = setPurposes(state, 'upper-shelf', ['cooked-food', 'leftovers']);
  const reversed = { ...state, locations: [...state.locations].reverse(), purposes: [...state.purposes].reverse() };
  assert.deepEqual(suggestLocations(reversed, '汤').map(s => s.locationId), ['upper-shelf', 'shelf-4']);
  assert.deepEqual(new Set(suggestLocations(reversed, '汤')[0]!.categoryIds), new Set(['cooked-food', 'leftovers']));
  reversed.locations.find(n => n.id === 'upper-shelf')!.label = 'Renamed';
  assert.equal(suggestLocations(reversed, '汤')[0]!.locationId, 'upper-shelf');
});

test('unrecognized foods, missing purposes and non-storage compartments do not produce arbitrary suggestions', () => {
  const state = createSampleFridge();
  assert.deepEqual(suggestLocations(state, '未知食品'), []);
  assert.deepEqual(suggestLocations(state, ''), []);
  assert.deepEqual(suggestLocations(state, '鸡蛋酱'), []);
  assert.deepEqual(suggestLocations(state, '牛奶'), []); // No dairy purpose currently configured.
  state.purposes = [{ locationId: 'chilled', categoryId: 'eggs' }];
  assert.deepEqual(suggestLocations(state, '鸡蛋'), []);
});

test('explicit food subtype can guide placement independently of expiration entry mode', () => {
  const state = createSampleFridge();
  assert.deepEqual(suggestLocations(state, '早餐蛋', 'cooked-eggs').map(s => s.locationId), ['shelf-4']);
  assert.deepEqual(suggestLocations(state, '熟鸡蛋').map(s => s.locationId), ['shelf-4']);
  const before = structuredClone(state); suggestLocations(state, '鸡蛋'); assert.deepEqual(state, before);
});
