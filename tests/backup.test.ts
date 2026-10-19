import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_BACKUP_BYTES, parseBackup, serializeBackup } from '../src/domain/backup.ts';
import { createSampleFridge, upgradeFridgeConfiguration } from '../src/config/sample-fridge.ts';
import { estimatedExpiration, exactExpiration, productionExpiration } from '../src/domain/expiration.ts';
import { automaticExpiration } from '../src/domain/food-estimates.ts';
import { LocalStorageRepository, MemoryStorage } from '../src/persistence/repository.ts';
import type { KeyValueStorage } from '../src/persistence/repository.ts';

const date = '2026-10-19T12:00:00.000Z';
function stocked() {
  const state = createSampleFridge();
  state.items = [null, exactExpiration('2026-10-22', '2026-10-19'), estimatedExpiration(3, 'days', '2026-10-19', '三天'),
    productionExpiration('2026-10-01', { value: 1, unit: 'months' }, '2026-10-19'),
    automaticExpiration('shell-eggs', '2026-10-02', '2026-10-19', true)].map((expiration, i) => ({
      id: `food-${i}`, name: `食物 ${i}`, locationId: 'door-upper-left', expiration,
      ...(i === 0 ? {} : { quantity: { value: .5, unit: 'kg' } }),
    }));
  state.purposes = [{ locationId: 'upper-shelf', categoryId: 'eggs' }];
  return state;
}
function envelope(snapshot: unknown, extra: object = {}) {
  return JSON.stringify({ app: 'brain-off', formatVersion: 1, exportedAt: date, snapshot, ...extra });
}

test('backup round trip retains the complete configuration, quantities and every expiration input', () => {
  const state = stocked(); const text = serializeBackup(state, date); const parsed = parseBackup(text);
  assert.deepEqual(parsed, { snapshot: state, exportedAt: date });
  assert.equal(Object.hasOwn(parsed.snapshot.items[0]!, 'quantity'), false);
  parsed.snapshot.items[0]!.name = 'Changed'; assert.equal(state.items[0]!.name, '食物 0');
  assert.equal(parseBackup(text).snapshot.items[0]!.name, '食物 0');
});

test('legacy raw snapshots and UTF-8 BOM files are supported without inventing export time', () => {
  const state = stocked(); assert.deepEqual(parseBackup(JSON.stringify(state)), { snapshot: state, exportedAt: null });
  assert.deepEqual(parseBackup('\uFEFF' + serializeBackup(state, date)).snapshot, state);
  delete state.fridge.configurationVersion;
  const parsed = parseBackup(JSON.stringify(state));
  assert.deepEqual(upgradeFridgeConfiguration(parsed.snapshot).items, state.items);
});

test('invalid, foreign and unsupported backups reject rather than produce an empty fridge', () => {
  for (const text of ['', '{broken', 'null', '[]', '{}', envelope(stocked(), { app: 'another-app' }),
    envelope(stocked(), { formatVersion: 2 }), envelope(stocked(), { exportedAt: '2026-02-30T12:00:00.000Z' }),
    envelope({ ...stocked(), schemaVersion: 99 })]) assert.throws(() => parseBackup(text));
  assert.throws(() => serializeBackup(stocked(), 'yesterday'));
});

test('untrusted backup dates, quantities, references and graph cycles cross runtime validation', () => {
  const orphan = stocked(); orphan.items[0]!.locationId = 'not-a-location';
  const quantity = stocked(); quantity.items[1]!.quantity!.value = -1;
  const cycle = stocked(); cycle.locations.find(n => n.id === 'chilled')!.parentId = 'upper-shelf';
  const date = stocked(); const expiry = date.items[2]!.expiration;
  if (expiry?.kind === 'estimate') expiry.estimatedDate = '2027-01-01';
  for (const state of [orphan, quantity, cycle, date]) assert.throws(() => parseBackup(envelope(state)));
});

test('backup limits reject oversized text and excessive collections before expensive validation', () => {
  assert.throws(() => parseBackup(' '.repeat(MAX_BACKUP_BYTES + 1)), /5 MB/);
  assert.throws(() => parseBackup(envelope({ ...createSampleFridge(), items: Array(10001).fill(null) })), /记录过多/);
  const state = stocked(); state.items[0]!.name = '字'.repeat(MAX_BACKUP_BYTES / 2);
  assert.throws(() => serializeBackup(state), /5 MB/);
});

test('replacement preserves exact original bytes and recovery survives a new repository instance', async () => {
  const storage = new MemoryStorage(); const before = stocked(); const raw = JSON.stringify(before, null, 2);
  storage.setItem('main', raw); const repo = new LocalStorageRepository(storage, 'main'); await repo.load();
  const after = createSampleFridge(); await repo.replaceWithRecovery(after, before);
  const second = new LocalStorageRepository(storage, 'main'); assert.deepEqual(await second.load(), after);
  const point = (await second.loadRecovery())!;
  assert.equal(point.raw, raw); assert.deepEqual(point.snapshot, before);
  assert.ok(Number.isFinite(Date.parse(point.capturedAt)));
  await second.replaceWithRecovery(point.snapshot!, after);
  assert.deepEqual(await second.load(), before);
  assert.deepEqual((await second.loadRecovery())!.snapshot, after);
});

test('recovery is written before the main state, and a checkpoint failure leaves both old values intact', async () => {
  const memory = new MemoryStorage(); const before = stocked(); memory.setItem('main', JSON.stringify(before));
  const writes: string[] = []; let failCheckpoint = true;
  const storage: KeyValueStorage = { getItem: key => memory.getItem(key), setItem(key, value) {
    writes.push(key); if (key.endsWith(':recovery') && failCheckpoint) throw new Error('Quota'); memory.setItem(key, value);
  } };
  memory.setItem('main:recovery', 'previous recovery'); const repo = new LocalStorageRepository(storage, 'main'); await repo.load();
  await assert.rejects(repo.replaceWithRecovery(createSampleFridge(), before), /无法保留恢复副本/);
  assert.equal(memory.getItem('main'), JSON.stringify(before)); assert.equal(memory.getItem('main:recovery'), 'previous recovery');
  assert.deepEqual(writes, ['main:recovery']);
  writes.length = 0; failCheckpoint = false; await repo.replaceWithRecovery(createSampleFridge(), before);
  assert.deepEqual(writes, ['main:recovery', 'main']);
});

test('failed primary write keeps the old inventory and an exportable recovery point', async () => {
  const memory = new MemoryStorage(); const before = stocked(); const raw = JSON.stringify(before); memory.setItem('main', raw);
  const repo = new LocalStorageRepository({ getItem: key => memory.getItem(key), setItem(key, value) {
    if (key === 'main') throw new Error('Quota'); memory.setItem(key, value);
  } }, 'main');
  await repo.load(); await assert.rejects(repo.replaceWithRecovery(createSampleFridge(), before), /原库存未被替换/);
  assert.equal(memory.getItem('main'), raw); assert.equal((await repo.loadRecovery())!.raw, raw);
});

test('invalid replacements perform no writes at all', async () => {
  const memory = new MemoryStorage(); const before = stocked(); memory.setItem('main', JSON.stringify(before));
  const repo = new LocalStorageRepository(memory, 'main'); await repo.load();
  const invalid = stocked(); invalid.items[0]!.locationId = 'missing';
  await assert.rejects(repo.replaceWithRecovery(invalid, before));
  assert.equal(memory.getItem('main:recovery'), null); assert.deepEqual(await repo.load(), before);
});

test('storage read failures abort before creating a checkpoint or replacing inventory', async () => {
  let writes = 0;
  const repo = new LocalStorageRepository({ getItem() { throw new Error('Denied'); }, setItem() { writes++; } });
  await assert.rejects(repo.replaceWithRecovery(stocked(), null), /无法读取当前数据/);
  assert.equal(writes, 0);
});

test('known cross-tab changes abort import without overwriting newer inventory', async () => {
  const memory = new MemoryStorage(); const original = createSampleFridge(); memory.setItem('main', JSON.stringify(original));
  const first = new LocalStorageRepository(memory, 'main'); await first.load();
  const second = new LocalStorageRepository(memory, 'main'); await second.save(stocked());
  await assert.rejects(first.replaceWithRecovery(original, original), /其他标签页/);
  assert.deepEqual(await second.load(), stocked()); assert.equal(memory.getItem('main:recovery'), null);
});

test('change observed during checkpoint creation aborts before primary overwrite', async () => {
  const memory = new MemoryStorage(); const before = createSampleFridge(); memory.setItem('main', JSON.stringify(before));
  const concurrent = stocked();
  const repo = new LocalStorageRepository({ getItem: key => memory.getItem(key), setItem(key, value) {
    memory.setItem(key, value); if (key.endsWith(':recovery')) memory.setItem('main', JSON.stringify(concurrent));
  } }, 'main');
  await repo.load(); await assert.rejects(repo.replaceWithRecovery(before, before), /其他标签页/);
  assert.deepEqual(JSON.parse(memory.getItem('main')!), concurrent);
});

test('corrupt original inventory is archived byte-for-byte when replacing it with a valid backup', async () => {
  const memory = new MemoryStorage(); memory.setItem('main', '{broken original');
  const repo = new LocalStorageRepository(memory, 'main'); await assert.rejects(repo.load());
  await repo.replaceWithRecovery(stocked(), null);
  assert.deepEqual(await repo.load(), stocked());
  assert.deepEqual((await repo.loadRecovery())!.snapshot, null);
  assert.equal((await repo.loadRecovery())!.raw, '{broken original');
});

test('first import records the previously visible empty fridge; unreadable recovery is not erased', async () => {
  const memory = new MemoryStorage(); const repo = new LocalStorageRepository(memory, 'main');
  assert.equal(await repo.load(), null); assert.equal(await repo.loadRecovery(), null);
  await repo.replaceWithRecovery(stocked(), createSampleFridge());
  assert.deepEqual((await repo.loadRecovery())!.snapshot, createSampleFridge());
  memory.setItem('main:recovery', '{broken checkpoint'); await assert.rejects(repo.loadRecovery());
  assert.equal(memory.getItem('main:recovery'), '{broken checkpoint');
});
