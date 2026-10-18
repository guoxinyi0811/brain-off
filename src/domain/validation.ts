import type { InventoryState } from './model.ts';
import { calendarDay, estimatedExpiration } from './expiration.ts';

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function text(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0; }
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }

// All persisted data enters through this runtime boundary, including future cloud data.
export function validateState(value: unknown): asserts value is InventoryState {
  ensure(record(value), 'Invalid state');
  ensure(value.schemaVersion === 1, 'Unsupported schema version');
  ensure(record(value.fridge) && text(value.fridge.id) && text(value.fridge.name), 'Invalid fridge');
  for (const key of ['locations', 'categories', 'purposes', 'items']) ensure(Array.isArray(value[key]), `Invalid ${key}`);
  const state = value as unknown as InventoryState;
  for (const collection of [state.locations, state.categories, state.items]) {
    const ids = new Set<string>();
    for (const entity of collection) {
      ensure(record(entity) && text(entity.id) && !ids.has(entity.id), 'Invalid or duplicate ID');
      ids.add(entity.id);
    }
  }
  const nodes = new Map(state.locations.map(node => [node.id, node]));
  for (const node of state.locations) {
    ensure(node.fridgeId === state.fridge.id && text(node.label), 'Invalid location');
    ensure(['compartment', 'shelf', 'drawer', 'section'].includes(node.kind), 'Invalid location kind');
    ensure(Number.isSafeInteger(node.order) && node.order >= 0 && typeof node.canHoldItems === 'boolean', 'Invalid location properties');
    ensure(node.parentId === null || nodes.has(node.parentId), 'Missing parent');
    const visited = new Set<string>([node.id]);
    let parent = node.parentId;
    while (parent !== null) {
      ensure(!visited.has(parent), 'Location cycle');
      visited.add(parent);
      const ancestor = nodes.get(parent);
      ensure(ancestor, 'Missing ancestor');
      parent = ancestor.parentId;
    }
  }
  for (const category of state.categories) ensure(text(category.label), 'Invalid category');
  const purposeKeys = new Set<string>();
  for (const purpose of state.purposes) {
    ensure(record(purpose) && nodes.has(purpose.locationId) && state.categories.some(c => c.id === purpose.categoryId), 'Invalid purpose');
    const key = JSON.stringify([purpose.locationId, purpose.categoryId]);
    ensure(!purposeKeys.has(key), 'Duplicate purpose'); purposeKeys.add(key);
  }
  for (const item of state.items) {
    ensure(text(item.name) && nodes.get(item.locationId)?.canHoldItems, 'Invalid item or storage location');
    const expiry = item.expiration;
    ensure(record(expiry) && text(expiry.originalInput) && text(expiry.recordedOn), 'Invalid expiration');
    calendarDay(expiry.recordedOn);
    if (expiry.kind === 'exact') { ensure(text(expiry.date), 'Missing date'); calendarDay(expiry.date); }
    else {
      ensure(expiry.kind === 'estimate' && record(expiry.duration), 'Invalid estimate');
      const expected = estimatedExpiration(expiry.duration.value, expiry.duration.unit, expiry.recordedOn, expiry.originalInput);
      ensure(expected.kind === 'estimate' && expected.estimatedDate === expiry.estimatedDate, 'Inconsistent estimated date');
    }
  }
}
