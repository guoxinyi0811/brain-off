import type { InventoryState } from '../domain/model.ts';
import { validateState } from '../domain/validation.ts';
import { decodeRecovery, PersistenceError, StorageConflictError } from './repository.ts';
import type { BackupRepository, KeyValueStorage, RecoveryPoint } from './repository.ts';

interface Document { formatVersion: 1; revision: string; raw: string | null }
interface Migration { formatVersion: 1; legacyRaw: string | null; legacyRecovery: string | null; acceptedLegacyRaw?: string | null }
interface Options { factory: IDBFactory; legacy: () => KeyValueStorage; name?: string; legacyKey?: string }
function document(value: unknown): Document {
  const v = value as Document | undefined;
  if (!v || v.formatVersion !== 1 || typeof v.revision !== 'string' || !v.revision
    || v.raw !== null && typeof v.raw !== 'string') throw new Error('Invalid database record');
  return v;
}
function migration(value: unknown): Migration {
  const v = value as Migration | undefined;
  if (!v || v.formatVersion !== 1 || v.legacyRaw !== null && typeof v.legacyRaw !== 'string'
    || v.legacyRecovery !== null && typeof v.legacyRecovery !== 'string'
    || v.acceptedLegacyRaw !== undefined && v.acceptedLegacyRaw !== null && typeof v.acceptedLegacyRaw !== 'string') throw new Error('Invalid migration record');
  return v;
}

/** One transaction covers compare-and-swap, primary data and recovery. No network awaits inside it. */
export class IndexedDbRepository implements BackupRepository {
  private options: Options;
  private connection: Promise<IDBDatabase> | null = null;
  private initialized: Promise<IDBDatabase> | null = null;
  private expected: string | undefined;
  private observedLegacy: string | null | undefined;
  constructor(options: Options) { this.options = options; }
  private open(): Promise<IDBDatabase> {
    if (this.connection) return this.connection;
    this.connection = new Promise((resolve, reject) => {
      const request = this.options.factory.open(this.options.name ?? 'brain-off', 1);
      let settled = false;
      const rejectOpen = (error: unknown) => { settled = true; reject(error); };
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('documents')) request.result.createObjectStore('documents'); };
      request.onerror = () => rejectOpen(request.error);
      request.onblocked = () => rejectOpen(new Error('数据库升级被其他页面占用，请关闭其他 brain off 页面后重试。'));
      request.onsuccess = () => {
        const db = request.result;
        if (settled) { db.close(); return; }
        settled = true;
        db.onversionchange = () => { db.close(); this.connection = null; this.initialized = null; };
        db.onclose = () => { this.connection = null; this.initialized = null; };
        resolve(db);
      };
    });
    this.connection.catch(() => { this.connection = null; });
    return this.connection;
  }
  private transaction<T>(db: IDBDatabase, mode: IDBTransactionMode,
    work: (store: IDBObjectStore, done: (value: T) => void, fail: (error: unknown) => void) => void): Promise<T> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('documents', mode);
      let result: T; let failure: unknown;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(failure ?? tx.error ?? new Error('事务已中止，数据未更改。'));
      const fail = (error: unknown) => { failure = error; tx.abort(); };
      try { work(tx.objectStore('documents'), value => { result = value; }, fail); }
      catch (error) { fail(error); }
    });
  }
  private ready(): Promise<IDBDatabase> {
    if (this.initialized) return this.initialized;
    this.initialized = this.open().then(async db => {
      await this.transaction<void>(db, 'readwrite', (store, done, fail) => {
        const request = store.get('inventory');
        request.onsuccess = () => { try {
          if (request.result !== undefined) {
            document(request.result);
            const meta = store.get('migration');
            meta.onsuccess = () => { try { migration(meta.result); done(); } catch (error) { fail(error); } };
          } else {
            const meta = store.get('migration');
            meta.onsuccess = () => { try {
              if (meta.result !== undefined) throw new Error('Primary record is missing; refusing to reinitialize');
              const legacy = this.options.legacy(); const key = this.options.legacyKey ?? 'brain-off:v1';
              const legacyRaw = legacy.getItem(key); const legacyRecovery = legacy.getItem(`${key}:recovery`);
              // Copy even corrupt originals exactly. Parsing happens only after migration commits.
              store.put({ formatVersion: 1, revision: crypto.randomUUID(), raw: legacyRaw }, 'inventory');
              store.put({ formatVersion: 1, legacyRaw, legacyRecovery }, 'migration');
              if (legacyRecovery !== null) store.put(legacyRecovery, 'recovery');
              done();
            } catch (error) { fail(error); } };
          }
        } catch (error) { fail(error); } };
      });
      return db;
    });
    this.initialized.catch(() => { this.initialized = null; });
    return this.initialized;
  }
  private assertLegacy(meta: Migration) {
    const accepted = meta.acceptedLegacyRaw === undefined ? meta.legacyRaw : meta.acceptedLegacyRaw;
    if (this.options.legacy().getItem(this.options.legacyKey ?? 'brain-off:v1') !== accepted)
      throw new StorageConflictError('旧版页面已更改原存储。请先导出两边数据、关闭旧版页面，重新读取后选择备份恢复。');
  }
  async load(): Promise<InventoryState | null> {
    try {
      const db = await this.ready();
      const record = await this.transaction<Document>(db, 'readonly', (store, done, fail) => {
        const request = store.get('inventory');
        request.onsuccess = () => { try { done(document(request.result)); } catch (error) { fail(error); } };
      });
      this.expected = record.revision;
      this.observedLegacy = this.options.legacy().getItem(this.options.legacyKey ?? 'brain-off:v1');
      if (record.raw === null) return null;
      const value: unknown = JSON.parse(record.raw); validateState(value); return value;
    } catch (cause) { throw new PersistenceError('无法读取本地数据库，原数据未被更改。', cause); }
  }
  async hasExternalChanges(): Promise<boolean> {
    const db = await this.ready(); const expected = this.expected;
    return this.transaction<boolean>(db, 'readonly', (store, done, fail) => {
      const request = store.get('inventory');
      request.onsuccess = () => { try {
        const current = document(request.result); const meta = store.get('migration');
        meta.onsuccess = () => { try { this.assertLegacy(migration(meta.result)); done(current.revision !== expected); } catch (error) { fail(error); } };
      } catch (error) { fail(error); } };
    });
  }
  private async write(state: InventoryState, replace: boolean, fallback: InventoryState | null) {
    validateState(state); if (fallback) validateState(fallback);
    const raw = JSON.stringify(state); const expected = this.expected;
    if (expected === undefined) throw new Error('请先读取当前冰箱，再保存修改。');
    try {
      const db = await this.ready();
      const next = await this.transaction<Document>(db, 'readwrite', (store, done, fail) => {
        const request = store.get('inventory');
        request.onsuccess = () => { try {
          const current = document(request.result);
          if (current.revision !== expected) throw new StorageConflictError();
          const meta = store.get('migration');
          meta.onsuccess = () => { try {
            const metadata = migration(meta.result);
            if (replace) {
              const latestLegacy = this.options.legacy().getItem(this.options.legacyKey ?? 'brain-off:v1');
              if (latestLegacy !== this.observedLegacy) throw new StorageConflictError('旧版存储再次变化，请关闭旧版页面并重新读取后再恢复。');
              store.put({ ...metadata, acceptedLegacyRaw: latestLegacy }, 'migration');
            } else this.assertLegacy(metadata);
            if (!replace && current.raw === raw) { done(current); return; }
            if (replace) store.put(JSON.stringify({ formatVersion: 1, capturedAt: new Date().toISOString(),
              raw: current.raw ?? (fallback ? JSON.stringify(fallback) : null) }), 'recovery');
            const updated: Document = { formatVersion: 1, revision: crypto.randomUUID(), raw };
            store.put(updated, 'inventory'); done(updated);
          } catch (error) { fail(error); } };
        } catch (error) { fail(error); } };
      });
      this.expected = next.revision;
    } catch (cause) {
      if (cause instanceof StorageConflictError) throw cause;
      throw new PersistenceError('保存未完成，库存和恢复副本均未更改。请检查浏览器存储权限或空间。', cause);
    }
  }
  async save(state: InventoryState): Promise<void> { await this.write(state, false, null); }
  async replaceWithRecovery(state: InventoryState, fallback: InventoryState | null): Promise<void> { await this.write(state, true, fallback); }
  async loadRecovery(): Promise<RecoveryPoint | null> {
    try {
      const db = await this.ready();
      const stored = await this.transaction<string | null>(db, 'readonly', (store, done, fail) => {
        const request = store.get('recovery');
        request.onsuccess = () => { try {
          if (request.result !== undefined && typeof request.result !== 'string') throw new Error('Invalid recovery');
          done(request.result ?? null);
        } catch (error) { fail(error); } };
      });
      return decodeRecovery(stored);
    } catch (cause) { throw new PersistenceError('无法读取恢复副本，副本未被更改。', cause); }
  }
  async close(): Promise<void> {
    const connection = this.connection; this.connection = null; this.initialized = null;
    if (connection) (await connection).close();
  }
}
