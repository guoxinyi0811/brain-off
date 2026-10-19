import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory, IDBObjectStore as FakeObjectStore } from 'fake-indexeddb';
import { IndexedDbRepository } from '../src/persistence/indexeddb.ts';
import { MemoryStorage, StorageConflictError } from '../src/persistence/repository.ts';
import { createSampleFridge } from '../src/config/sample-fridge.ts';
import { addItem } from '../src/domain/inventory.ts';
import { productionExpiration } from '../src/domain/expiration.ts';

const key = 'brain-off:v1';
function food(id: string) { return { id, name: id, locationId: 'lower-shelf', quantity: { value: 3, unit: '盒' },
  expiration: productionExpiration('2026-10-01', { value: 1, unit: 'months' }, '2026-10-19') }; }
const stocked = (id = 'eggs') => addItem(createSampleFridge(), food(id));
function context(t: { after: (fn: () => Promise<unknown>) => void }) {
  const factory = new IDBFactory(); const legacy = new MemoryStorage(); const instances: IndexedDbRepository[] = [];
  const repo = () => { const r = new IndexedDbRepository({ factory, legacy: () => legacy, name: 'test' }); instances.push(r); return r; };
  t.after(() => Promise.allSettled(instances.map(r => r.close())));
  return { factory, legacy, repo };
}
async function inspect(factory: IDBFactory, action: (store: IDBObjectStore) => IDBRequest, mode: IDBTransactionMode = 'readonly'): Promise<any> {
  return new Promise((resolve, reject) => {
    const open = factory.open('test', 1); open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result; const tx = db.transaction('documents', mode); const request = action(tx.objectStore('documents'));
      tx.oncomplete = () => { db.close(); resolve(request.result); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    };
  });
}

test('migration copies exact legacy bytes and recovery once, across concurrent initial readers', async t => {
  const c = context(t); const original = stocked(); const raw = JSON.stringify(original, null, 2);
  const recovery = JSON.stringify({ formatVersion: 1, capturedAt: '2026-10-19T12:00:00.000Z', raw });
  c.legacy.setItem(key, raw); c.legacy.setItem(`${key}:recovery`, recovery);
  const a = c.repo(), b = c.repo(); assert.deepEqual(await Promise.all([a.load(), b.load()]), [original, original]);
  assert.equal((await a.loadRecovery())!.raw, raw); assert.equal(c.legacy.getItem(key), raw);
  assert.equal(c.legacy.getItem(`${key}:recovery`), recovery);
  await a.save(stocked('new'));
  assert.deepEqual(await c.repo().load(), stocked('new')); // Never reseed from the retained old source.
  assert.equal((await inspect(c.factory, s => s.get('migration'))).legacyRaw, raw);
});

test('a fresh database has a valid baseline; unchanged saves do not invalidate another reader', async t => {
  const c = context(t); const a = c.repo(), b = c.repo();
  assert.equal(await a.load(), null); await a.save(createSampleFridge());
  const state = (await b.load())!; await a.save(state);
  assert.equal(await b.hasExternalChanges(), false);
  assert.equal(c.legacy.getItem(key), null);
});

test('two competing writes have exactly one winner and explicitly reject the stale snapshot', async t => {
  const c = context(t); const a = c.repo(), b = c.repo(); await Promise.all([a.load(), b.load()]);
  const results = await Promise.allSettled([a.save(stocked('a')), b.save(stocked('b'))]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  const failure = results.find(r => r.status === 'rejected'); assert.ok(failure?.status === 'rejected' && failure.reason instanceof StorageConflictError);
  const winner = (await c.repo().load())!; assert.equal(winner.items.length, 1);
  const loser = results[0]!.status === 'rejected' ? a : b;
  assert.equal(await loser.hasExternalChanges(), true);
  const latest = (await loser.load())!;
  await loser.save(addItem(latest, food('explicit-retry')));
  assert.deepEqual((await c.repo().load())!.items.map(i => i.id), [winner.items[0]!.id, 'explicit-retry']);
});

test('stale backup restoration never changes either primary data or the prior recovery point', async t => {
  const c = context(t); const a = c.repo(); await a.load(); await a.save(stocked('original'));
  await a.replaceWithRecovery(stocked('replacement'), null);
  const b = c.repo(); await b.load(); await a.save(stocked('latest'));
  await assert.rejects(b.replaceWithRecovery(createSampleFridge(), null), StorageConflictError);
  assert.deepEqual(await c.repo().load(), stocked('latest'));
  assert.deepEqual((await a.loadRecovery())!.snapshot, stocked('original'));
});

test('a failed primary put rolls back the queued checkpoint and migration metadata in the same transaction', async t => {
  const c = context(t); const a = c.repo(); await a.load(); await a.save(stocked('original'));
  await a.replaceWithRecovery(stocked('current'), null);
  const point = await a.loadRecovery(); const metadata = await inspect(c.factory, s => s.get('migration'));
  const put = FakeObjectStore.prototype.put;
  FakeObjectStore.prototype.put = function(value: unknown, id?: IDBValidKey) {
    if (id === 'inventory') throw new DOMException('Simulated full disk', 'QuotaExceededError');
    return put.call(this, value, id);
  };
  try { await assert.rejects(a.replaceWithRecovery(stocked('failed'), null), /均未更改/); }
  finally { FakeObjectStore.prototype.put = put; }
  assert.deepEqual(await c.repo().load(), stocked('current'));
  assert.deepEqual(await a.loadRecovery(), point);
  assert.deepEqual(await inspect(c.factory, s => s.get('migration')), metadata);
});

test('failed migration commits no partial records and leaves original LocalStorage data intact', async t => {
  const c = context(t); const raw = JSON.stringify(stocked()); c.legacy.setItem(key, raw);
  const put = FakeObjectStore.prototype.put;
  FakeObjectStore.prototype.put = function(value: unknown, id?: IDBValidKey) {
    if (id === 'migration') throw new DOMException('Simulated full disk', 'QuotaExceededError');
    return put.call(this, value, id);
  };
  try { await assert.rejects(c.repo().load()); } finally { FakeObjectStore.prototype.put = put; }
  assert.equal(await inspect(c.factory, s => s.get('inventory')), undefined);
  assert.equal(c.legacy.getItem(key), raw);
  assert.deepEqual(await c.repo().load(), stocked());
});

test('asynchronous request failure aborts the entire replacement rather than reporting success early', async t => {
  const c = context(t); const a = c.repo(); await a.load(); await a.save(stocked('original'));
  await a.replaceWithRecovery(stocked('current'), null); const point = await a.loadRecovery();
  const put = FakeObjectStore.prototype.put;
  FakeObjectStore.prototype.put = function(value: unknown, id?: IDBValidKey) {
    // Duplicate-key add fails asynchronously, after the checkpoint put was already queued.
    return id === 'inventory' ? this.add(value, id) : put.call(this, value, id);
  };
  try { await assert.rejects(a.replaceWithRecovery(stocked('failed'), null), /均未更改/); }
  finally { FakeObjectStore.prototype.put = put; }
  assert.deepEqual(await c.repo().load(), stocked('current')); assert.deepEqual(await a.loadRecovery(), point);
});

test('database version changes close the old connection and never fall back to obsolete LocalStorage', async t => {
  const c = context(t); c.legacy.setItem(key, JSON.stringify(stocked('old'))); const a = c.repo(); await a.load(); await a.save(stocked('current'));
  const upgraded = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = c.factory.open('test', 2); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  await assert.rejects(a.load());
  const current = await new Promise<any>((resolve, reject) => {
    const tx = upgraded.transaction('documents', 'readonly'); const request = tx.objectStore('documents').get('inventory');
    tx.oncomplete = () => resolve(request.result); tx.onabort = () => reject(tx.error);
  });
  assert.deepEqual(JSON.parse(current.raw), stocked('current')); upgraded.close();
});

test('unreadable legacy storage never silently initializes an empty inventory', async t => {
  const c = context(t); const bad = new IndexedDbRepository({ factory: c.factory, name: 'test', legacy() { throw new Error('Denied'); } });
  await assert.rejects(bad.load()); await bad.close();
  assert.equal(await inspect(c.factory, s => s.get('inventory')), undefined);
  c.legacy.setItem(key, JSON.stringify(stocked())); assert.deepEqual(await c.repo().load(), stocked());
});

test('corrupt legacy inventory remains repairable by backup and recoverable as exact original bytes', async t => {
  const c = context(t); c.legacy.setItem(key, '{corrupt source'); const a = c.repo(); await assert.rejects(a.load());
  await a.replaceWithRecovery(stocked(), null); assert.deepEqual(await c.repo().load(), stocked());
  assert.equal((await a.loadRecovery())!.raw, '{corrupt source'); assert.equal((await a.loadRecovery())!.snapshot, null);
  assert.equal(c.legacy.getItem(key), '{corrupt source');
});

test('corrupt migrated recovery is reported and retained through ordinary saves', async t => {
  const c = context(t); c.legacy.setItem(`${key}:recovery`, '{broken checkpoint'); const a = c.repo(); await a.load();
  await assert.rejects(a.loadRecovery()); await a.save(stocked());
  assert.equal(await inspect(c.factory, s => s.get('recovery')), '{broken checkpoint');
});

test('first import checkpoints the visible empty fridge and can restore it after reopening', async t => {
  const c = context(t); const a = c.repo(); await a.load(); await a.replaceWithRecovery(stocked(), createSampleFridge());
  const b = c.repo(); await b.load(); const recovery = (await b.loadRecovery())!;
  assert.deepEqual(recovery.snapshot, createSampleFridge()); await b.replaceWithRecovery(recovery.snapshot!, stocked());
  assert.deepEqual(await c.repo().load(), createSampleFridge()); assert.deepEqual((await b.loadRecovery())!.snapshot, stocked());
});

test('an old client writing after migration blocks ordinary saves; explicit reviewed restore resolves the fork', async t => {
  const c = context(t); const original = JSON.stringify(stocked('original')); c.legacy.setItem(key, original);
  const a = c.repo(); await a.load(); await a.save(stocked('database'));
  const oldClient = JSON.stringify(stocked('old-client')); c.legacy.setItem(key, oldClient);
  await assert.rejects(a.hasExternalChanges(), StorageConflictError);
  await assert.rejects(a.save(stocked('attempt')), StorageConflictError);
  await assert.rejects(a.replaceWithRecovery(stocked('attempt'), null), StorageConflictError);
  assert.deepEqual(await a.load(), stocked('database'));
  await a.replaceWithRecovery(stocked('chosen'), null); await a.save(stocked('continued'));
  assert.equal(c.legacy.getItem(key), oldClient);
  const metadata = await inspect(c.factory, s => s.get('migration'));
  assert.equal(metadata.legacyRaw, original); assert.equal(metadata.acceptedLegacyRaw, oldClient);
  assert.deepEqual((await a.loadRecovery())!.snapshot, stocked('database'));
});

test('invalid saves do not touch revision or primary records and cannot initialize from a missing baseline', async t => {
  const c = context(t); const a = c.repo(); await assert.rejects(a.save(stocked()), /先读取/); await a.load(); await a.save(stocked());
  const before = await inspect(c.factory, s => s.get('inventory')); const invalid = stocked(); invalid.items[0]!.quantity!.value = -1;
  await assert.rejects(a.save(invalid)); assert.deepEqual(await inspect(c.factory, s => s.get('inventory')), before);
});

test('caller mutations after invoking save or after loading cannot alter persisted snapshots', async t => {
  const c = context(t); const a = c.repo(); await a.load(); const state = stocked(); const saving = a.save(state);
  state.items[0]!.name = 'Mutated outside'; await saving;
  const loaded = (await a.load())!; assert.equal(loaded.items[0]!.name, 'eggs'); loaded.items[0]!.quantity!.value = 99;
  assert.equal((await a.load())!.items[0]!.quantity!.value, 3);
});

test('a missing primary alongside migration metadata is corruption, never a signal to reseed from legacy', async t => {
  const c = context(t); c.legacy.setItem(key, JSON.stringify(stocked('old'))); const a = c.repo(); await a.load(); await a.save(stocked('new'));
  await inspect(c.factory, s => s.delete('inventory'), 'readwrite');
  await assert.rejects(c.repo().load());
  assert.equal(await inspect(c.factory, s => s.get('inventory')), undefined);
  assert.equal((await inspect(c.factory, s => s.get('migration'))).legacyRaw, c.legacy.getItem(key));
});
