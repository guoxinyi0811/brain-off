import type { InventoryState } from '../domain/model.ts';
import { validateState } from '../domain/validation.ts';
import { validTimestamp } from '../domain/backup.ts';

// Async contract permits a later network adapter. Cloud auth, conflicts and
// concurrent updates still need an explicit design; this adapter is single-client.
export interface InventoryRepository {
  load(): Promise<InventoryState | null>;
  save(state: InventoryState): Promise<void>;
}
export interface RecoveryPoint {
  capturedAt: string;
  raw: string | null;
  snapshot: InventoryState | null;
}
export interface BackupRepository extends InventoryRepository {
  loadRecovery(): Promise<RecoveryPoint | null>;
  replaceWithRecovery(state: InventoryState, fallback: InventoryState | null): Promise<void>;
}
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export class PersistenceError extends Error {
  constructor(message: string, cause: unknown) { super(message, { cause }); this.name = 'PersistenceError'; }
}
export class LocalStorageRepository implements BackupRepository {
  private storage: KeyValueStorage;
  private key: string;
  private lastRaw: string | null | undefined;
  constructor(storage: KeyValueStorage, key = 'brain-off:v1') { this.storage = storage; this.key = key; }
  async load(): Promise<InventoryState | null> {
    try {
      const raw = this.storage.getItem(this.key);
      this.lastRaw = raw;
      if (raw === null) return null;
      const value: unknown = JSON.parse(raw);
      validateState(value);
      return value;
    } catch (cause) { throw new PersistenceError('Unable to load inventory; stored data was not changed', cause); }
  }
  async save(state: InventoryState): Promise<void> {
    try { validateState(state); const raw = JSON.stringify(state); this.storage.setItem(this.key, raw); this.lastRaw = raw; }
    catch (cause) { throw new PersistenceError('Unable to save inventory', cause); }
  }
  async loadRecovery(): Promise<RecoveryPoint | null> {
    try {
      const stored = this.storage.getItem(`${this.key}:recovery`);
      if (stored === null) return null;
      const point = JSON.parse(stored);
      if (!point || point.formatVersion !== 1 || !validTimestamp(point.capturedAt)
        || point.raw !== null && typeof point.raw !== 'string') throw new Error('Invalid recovery point');
      let snapshot: InventoryState | null = null;
      if (point.raw !== null) {
        try { const value: unknown = JSON.parse(point.raw); validateState(value); snapshot = value; }
        catch { /* Retain corrupt originals for download, without offering a blind restore. */ }
      }
      return { capturedAt: point.capturedAt, raw: point.raw, snapshot };
    } catch (cause) { throw new PersistenceError('无法读取恢复副本，副本未被更改。', cause); }
  }
  async replaceWithRecovery(state: InventoryState, fallback: InventoryState | null): Promise<void> {
    validateState(state);
    const nextRaw = JSON.stringify(state);
    const readRaw = () => {
      try { return this.storage.getItem(this.key); }
      catch (cause) { throw new PersistenceError('无法读取当前数据，恢复未生效。', cause); }
    };
    const raw = readRaw();
    const assertUnchanged = () => {
      if (this.lastRaw === undefined || raw !== this.lastRaw || readRaw() !== raw)
        throw new Error('其他标签页或浏览器已更改数据，请刷新页面后再恢复。');
    };
    assertUnchanged();
    if (raw === null && fallback) validateState(fallback);
    const recovery = JSON.stringify({ formatVersion: 1, capturedAt: new Date().toISOString(),
      raw: raw ?? (fallback ? JSON.stringify(fallback) : null) });
    try { this.storage.setItem(`${this.key}:recovery`, recovery); }
    catch (cause) { throw new PersistenceError('无法保留恢复副本，导入未生效。请检查存储权限或空间。', cause); }
    assertUnchanged();
    try { this.storage.setItem(this.key, nextRaw); this.lastRaw = nextRaw; }
    catch (cause) { throw new PersistenceError('恢复失败，原库存未被替换。恢复副本已保留。', cause); }
  }
}
export class MemoryStorage implements KeyValueStorage {
  private values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}
