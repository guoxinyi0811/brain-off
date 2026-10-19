import test from 'node:test';
import assert from 'node:assert/strict';
import { createSampleFridge } from '../src/config/sample-fridge.ts';
import { addDays, calendarDay, estimatedExpiration, exactExpiration, expirationStatus } from '../src/domain/expiration.ts';
import { addItem, updateItem, removeItem, removeLocation, setPurposes } from '../src/domain/inventory.ts';
import { validateState } from '../src/domain/validation.ts';
import { LocalStorageRepository, MemoryStorage, PersistenceError } from '../src/persistence/repository.ts';

const milk = () => ({ id: 'milk-1', name: 'Milk', locationId: 'upper-shelf',
  expiration: estimatedExpiration(3, 'days', '2026-10-18', 'about 3 days') });

test('sample config is valid, independent, and starts with no inventory', () => {
  const a = createSampleFridge(); validateState(a); assert.equal(a.items.length, 0);
  a.locations[0]!.label = 'Changed'; assert.equal(createSampleFridge().locations[0]!.label, 'Freezer');
});
test('calendar arithmetic handles leap days, year changes and DST dates', () => {
  assert.equal(addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-07', 2), '2026-03-09');
  assert.equal(addDays('2026-10-31', 2), '2026-11-02');
  for (const date of ['2026-02-29', '2026-04-31', '2026-13-01', '10/18/2026']) assert.throws(() => calendarDay(date));
});
test('expiration preserves source and normalizes weeks without losing input', () => {
  const estimate = estimatedExpiration(1, 'weeks', '2026-10-18', 'roughly one week');
  assert.deepEqual(estimate, { kind: 'estimate', originalInput: 'roughly one week', recordedOn: '2026-10-18',
    duration: { value: 1, unit: 'weeks' }, estimatedDate: '2026-10-25' });
  assert.equal(exactExpiration('2026-10-25', '2026-10-18').kind, 'exact');
  assert.equal(estimatedExpiration(0, 'days', '2026-10-18', 'today').kind, 'estimate');
  for (const value of [-1, 1.5, NaN, Infinity]) assert.throws(() => estimatedExpiration(value, 'days', '2026-10-18', 'input'));
  assert.throws(() => estimatedExpiration(1, 'days', '2026-10-18', ' '));
});
test('warning threshold is inclusive, today is due, past dates stay distinct', () => {
  const expiry = exactExpiration('2026-10-21', '2026-10-18');
  assert.equal(expirationStatus(expiry, '2026-10-17').status, 'later');
  assert.equal(expirationStatus(expiry, '2026-10-18').status, 'due-soon');
  assert.equal(expirationStatus(expiry, '2026-10-21').daysRemaining, 0);
  assert.equal(expirationStatus(expiry, '2026-10-21').status, 'due-soon');
  assert.equal(expirationStatus(expiry, '2026-10-22').status, 'past-date');
  assert.equal(expirationStatus(milk().expiration, '2026-10-18').isEstimated, true);
  assert.equal(expirationStatus(expiry, '2026-10-18').isEstimated, false);
  assert.throws(() => expirationStatus(expiry, '2026-10-18', -1));
});
test('inventory supports immutable add, edit, move and removal', () => {
  const initial = createSampleFridge(); const item = milk();
  const added = addItem(initial, item); item.name = 'Mutated externally';
  assert.equal(initial.items.length, 0); assert.equal(added.items[0]!.name, 'Milk');
  const moved = updateItem(added, 'milk-1', { name: 'Oat milk', locationId: 'lower-shelf' });
  assert.equal(moved.items[0]!.locationId, 'lower-shelf'); assert.equal(added.items[0]!.locationId, 'upper-shelf');
  assert.equal(removeItem(moved, 'milk-1').items.length, 0);
  assert.throws(() => addItem(added, milk()));
  assert.throws(() => updateItem(added, 'missing', { name: 'x' }));
  assert.throws(() => updateItem(added, 'milk-1', { locationId: 'chilled' }));
  assert.throws(() => updateItem(added, 'milk-1', { locationId: 'missing' }));
});
test('purpose changes are many-to-many and do not move or delete items', () => {
  const state = addItem(createSampleFridge(), milk());
  const changed = setPurposes(state, 'upper-shelf', ['fruits', 'vegetables', 'fruits']);
  assert.deepEqual(changed.items, state.items);
  assert.equal(changed.purposes.filter(p => p.locationId === 'upper-shelf').length, 2);
  assert.deepEqual(setPurposes(changed, 'upper-shelf', []).items, state.items);
  assert.throws(() => setPurposes(state, 'upper-shelf', ['unknown']));
});
test('stable IDs preserve inventory after rename/reorder; occupied locations cannot be removed', () => {
  const state = addItem(createSampleFridge(), milk());
  state.locations.find(n => n.id === 'upper-shelf')!.label = 'Renamed shelf';
  state.locations.find(n => n.id === 'upper-shelf')!.order = 10;
  validateState(state); assert.equal(state.items[0]!.locationId, 'upper-shelf');
  assert.throws(() => removeLocation(state, 'upper-shelf'), /Move items/);
  assert.throws(() => removeLocation(state, 'chilled'), /child locations/);
  const moved = updateItem(state, 'milk-1', { locationId: 'lower-shelf' });
  assert.equal(removeLocation(moved, 'upper-shelf').items.length, 1);
});
test('validation rejects cycles, orphan nodes, unsupported versions and inconsistent estimates', () => {
  const cycle = createSampleFridge(); cycle.locations[0]!.parentId = 'freezer-shelf';
  assert.throws(() => validateState(cycle), /cycle/);
  const orphan = createSampleFridge(); orphan.locations[0]!.parentId = 'missing';
  assert.throws(() => validateState(orphan), /parent/);
  assert.throws(() => validateState({ ...createSampleFridge(), schemaVersion: 2 }), /version/);
  const bad = addItem(createSampleFridge(), milk());
  const badExpiry = bad.items[0]!.expiration;
  if (badExpiry?.kind === 'estimate') badExpiry.estimatedDate = '2026-10-30';
  assert.throws(() => validateState(bad), /Inconsistent/);
  assert.throws(() => validateState(null));
});
test('repository round trip survives new adapter instance and preserves expiration input', async () => {
  const storage = new MemoryStorage(); const first = new LocalStorageRepository(storage);
  assert.equal(await first.load(), null);
  const state = addItem(createSampleFridge(), milk()); await first.save(state);
  const second = new LocalStorageRepository(storage); assert.deepEqual(await second.load(), state);
  const loaded = (await second.load())!; loaded.items[0]!.name = 'Unsaved';
  assert.equal((await second.load())!.items[0]!.name, 'Milk');
});
test('corrupt data is preserved and storage failures are surfaced', async () => {
  const storage = new MemoryStorage(); storage.setItem('test', '{broken');
  await assert.rejects(new LocalStorageRepository(storage, 'test').load(), PersistenceError);
  assert.equal(storage.getItem('test'), '{broken');
  storage.setItem('test', JSON.stringify({ schemaVersion: 99 }));
  await assert.rejects(new LocalStorageRepository(storage, 'test').load(), /Unable to load/);
  const broken = new LocalStorageRepository({ getItem() { throw new Error('Denied'); }, setItem() { throw new Error('Quota'); } });
  await assert.rejects(broken.load(), PersistenceError);
  await assert.rejects(broken.save(createSampleFridge()), PersistenceError);
  const invalid = createSampleFridge(); invalid.items.push({ ...milk(), locationId: 'missing' });
  const before = storage.getItem('test');
  await assert.rejects(new LocalStorageRepository(storage, 'test').save(invalid), PersistenceError);
  assert.equal(storage.getItem('test'), before);
});
