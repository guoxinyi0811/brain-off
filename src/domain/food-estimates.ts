import type { Expiration, InventoryState } from './model.ts';
import { addDays, calendarDay } from './expiration.ts';

export const estimateSource = 'https://www.foodsafety.gov/food-safety-charts/cold-food-storage-charts';
// Conservative lower ends of the cited refrigerated ranges; no blanket rule for groceries.
export const foodTypes = [
  { id: 'shell-eggs', label: '生鸡蛋（带壳）', days: 21 },
  { id: 'cooked-eggs', label: '煮熟的鸡蛋', days: 7 },
  { id: 'raw-poultry', label: '生鸡肉 / 火鸡肉', days: 1 },
  { id: 'ground-meat', label: '生肉馅', days: 1 },
  { id: 'meat-cuts', label: '生牛 / 猪 / 羊肉块', days: 3 },
  { id: 'cooked-meat', label: '熟肉 / 熟禽肉', days: 3 },
  { id: 'soup', label: '汤 / 炖菜', days: 3 },
  { id: 'pizza', label: '披萨', days: 3 },
] as const;

// Deliberately exact aliases: ambiguous names require the person's category choice.
export function inferFoodType(name: string): string {
  const key = name.normalize('NFKC').trim().toLowerCase();
  const aliases: Record<string, string[]> = {
    'shell-eggs': ['鸡蛋', '生鸡蛋', 'eggs'], 'cooked-eggs': ['水煮蛋', '煮鸡蛋', '熟鸡蛋'],
    'raw-poultry': ['生鸡肉', '生火鸡肉'], 'ground-meat': ['生肉馅', '猪肉馅', '牛肉馅'],
    'meat-cuts': ['生牛肉', '生猪肉', '生羊肉'], 'cooked-meat': ['熟牛肉', '熟猪肉', '熟鸡肉'],
    soup: ['汤', '炖菜', 'soup'], pizza: ['披萨', 'pizza'],
  };
  return Object.entries(aliases).find(([, names]) => names.includes(key))?.[0] ?? '';
}

export function isRefrigerated(state: InventoryState, locationId: string): boolean {
  let node = state.locations.find(n => n.id === locationId);
  const visited = new Set<string>();
  while (node && !visited.has(node.id)) {
    if (node.id === 'chilled' || node.id === 'door') return true;
    visited.add(node.id); node = state.locations.find(n => n.id === node?.parentId);
  }
  return false;
}

export function automaticExpiration(foodType: string, basisDate: string, recordedOn: string, refrigerated: boolean): Expiration | null {
  const rule = foodTypes.find(type => type.id === foodType);
  if (!rule || !refrigerated) return null;
  calendarDay(basisDate); calendarDay(recordedOn);
  if (basisDate > recordedOn) throw new Error('起算日期不能晚于今天。');
  return { kind: 'automatic', foodType, basisDate, recordedOn, days: rule.days,
    ruleId: `${rule.id}:refrigerated:v1`, source: estimateSource,
    originalInput: `${rule.label} · ${basisDate} 起算 · 冷藏参考 ${rule.days} 天`,
    estimatedDate: addDays(basisDate, rule.days) };
}
