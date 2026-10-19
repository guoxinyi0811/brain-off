import type { InventoryState } from './model.ts';
import { validateState } from './validation.ts';

export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;
export interface BackupPreview { snapshot: InventoryState; exportedAt: string | null }

function checkSize(text: string) {
  if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) throw new Error('备份文件不能超过 5 MB。');
}
function checkSnapshot(value: unknown): asserts value is InventoryState {
  if (!value || typeof value !== 'object') throw new Error('备份缺少冰箱数据。');
  const data = value as Record<string, unknown>;
  for (const [field, limit] of [['items', 10000], ['locations', 1000], ['categories', 200], ['purposes', 5000]] as const) {
    if (!Array.isArray(data[field]) || data[field].length > limit) throw new Error('备份结构无效或记录过多。');
  }
  validateState(value);
}
export function validTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}
export function serializeBackup(snapshot: InventoryState, exportedAt = new Date().toISOString()): string {
  checkSnapshot(snapshot);
  if (!validTimestamp(exportedAt)) throw new Error('备份时间无效。');
  const text = JSON.stringify({ app: 'brain-off', formatVersion: 1, exportedAt, snapshot }, null, 2);
  checkSize(text);
  return text;
}
export function parseBackup(text: string): BackupPreview {
  checkSize(text);
  let value: unknown;
  try { value = JSON.parse(text.replace(/^\uFEFF/, '')); }
  catch { throw new Error('无法读取 JSON，请选择完整的 brain off 备份。'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('备份格式无效。');
  const data = value as Record<string, unknown>;
  if ('app' in data || 'formatVersion' in data || 'snapshot' in data) {
    if (data.app !== 'brain-off' || data.formatVersion !== 1) throw new Error('不支持这份备份的格式或版本。');
    if (!validTimestamp(data.exportedAt)) throw new Error('备份时间无效。');
    checkSnapshot(data.snapshot);
    return { snapshot: data.snapshot, exportedAt: data.exportedAt };
  }
  // Legacy raw InventoryState JSON remains importable, with no invented export time.
  checkSnapshot(value);
  return { snapshot: value, exportedAt: null };
}
