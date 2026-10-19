import type { InventoryItem } from './model.ts';

export function validateQuantity(quantity: unknown): asserts quantity is NonNullable<InventoryItem['quantity']> {
  if (!quantity || typeof quantity !== 'object' || Array.isArray(quantity)) throw new Error('数量格式无效。');
  const q = quantity as Record<string, unknown>;
  if (typeof q.value !== 'number' || !Number.isFinite(q.value) || q.value <= 0 || q.value > 1_000_000_000)
    throw new Error('数量须大于 0，且不超过 10 亿。');
  if (typeof q.unit !== 'string' || q.unit !== q.unit.trim() || q.unit.length > 16)
    throw new Error('单位最多 16 个字符。');
}

export function quantityInput(value: string, unit: string): InventoryItem['quantity'] {
  if (!value.trim()) {
    if (unit.trim()) throw new Error('请填写数量，或同时清空数量和单位。');
    return undefined;
  }
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) throw new Error('请填写有效数量。');
  const quantity = { value: Number(value), unit: unit.trim() };
  validateQuantity(quantity);
  return quantity;
}

export function quantityLabel(item: Pick<InventoryItem, 'quantity'>): string {
  return item.quantity ? `${item.quantity.value}${item.quantity.unit ? ` ${item.quantity.unit}` : ''}` : '';
}
