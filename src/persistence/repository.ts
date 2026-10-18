import type { InventoryState } from '../domain/model.ts';
import { validateState } from '../domain/validation.ts';

// Async contract permits a later network adapter. Cloud auth, conflicts and
// concurrent updates still need an explicit design; this adapter is single-client.
export interface InventoryRepository {
  load(): Promise<InventoryState | null>;
  save(state: InventoryState): Promise<void>;
}
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export class PersistenceError extends Error {
  constructor(message: string, cause: unknown) { super(message, { cause }); this.name = 'PersistenceError'; }
}
export class LocalStorageRepository implements InventoryRepository {
  private storage: KeyValueStorage;
  private key: string;
  constructor(storage: KeyValueStorage, key = 'brain-off:v1') { this.storage = storage; this.key = key; }
  async load(): Promise<InventoryState | null> {
    try {
      const raw = this.storage.getItem(this.key);
      if (raw === null) return null;
      const value: unknown = JSON.parse(raw);
      validateState(value);
      return value;
    } catch (cause) { throw new PersistenceError('Unable to load inventory; stored data was not changed', cause); }
  }
  async save(state: InventoryState): Promise<void> {
    try { validateState(state); this.storage.setItem(this.key, JSON.stringify(state)); }
    catch (cause) { throw new PersistenceError('Unable to save inventory', cause); }
  }
}
export class MemoryStorage implements KeyValueStorage {
  private values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}
