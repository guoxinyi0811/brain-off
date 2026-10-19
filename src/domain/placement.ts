import type { InventoryState, StorageNode } from './model.ts';
import { inferFoodType } from './food-estimates.ts';

export function orderedStorageLocations(state: InventoryState): StorageNode[] {
  const result: StorageNode[] = [];
  function visit(parentId: string | null) {
    const children = state.locations.filter(n => n.parentId === parentId).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    for (const node of children) { if (node.canHoldItems) result.push(node); visit(node.id); }
  }
  visit(null);
  return result;
}

const typePurposes: Record<string, readonly string[]> = {
  'shell-eggs': ['eggs'], 'cooked-eggs': ['cooked-food'],
  'raw-poultry': ['raw-meat'], 'ground-meat': ['raw-meat'], 'meat-cuts': ['raw-meat'],
  'cooked-meat': ['cooked-food', 'leftovers'], soup: ['cooked-food', 'leftovers'], pizza: ['cooked-food', 'leftovers'],
};
const aliases: ReadonlyArray<{ categoryId: string; names: readonly string[] }> = [
  { categoryId: 'eggs', names: ['鸡蛋', '生鸡蛋', 'eggs', 'egg'] },
  { categoryId: 'dairy', names: ['牛奶', '酸奶', '奶酪', 'milk', 'yogurt', 'cheese'] },
  { categoryId: 'raw-meat', names: ['生肉', '生鸡肉', '生牛肉', '生猪肉', '生羊肉', '生肉馅'] },
  { categoryId: 'jarred-condiments', names: ['罐装调味料', '罐装酱料'] },
  { categoryId: 'cooked-food', names: ['熟食', '熟肉', '水煮蛋', '煮鸡蛋'] },
  { categoryId: 'leftovers', names: ['剩菜', '剩饭', 'leftovers'] },
  { categoryId: 'vegetables', names: ['蔬菜', '青菜', '白菜', '菠菜', '生菜', '胡萝卜', '黄瓜', '西兰花'] },
  { categoryId: 'fruits', names: ['水果', '苹果', '橙子', '葡萄', '草莓', '蓝莓'] },
  { categoryId: 'butter', names: ['黄油', 'butter'] },
  { categoryId: 'miso', names: ['味噌', '味增', 'miso'] },
  { categoryId: 'chinese-condiments', names: ['黄豆酱', '甜面酱', '番茄酱'] },
  { categoryId: 'japanese-condiments', names: ['日式调味料', '日式酱油', '味醂', '味淋'] },
  { categoryId: 'oyster-sauce', names: ['蚝油', 'oyster sauce'] },
  { categoryId: 'wine', names: ['酒', '红酒', '白葡萄酒', '啤酒', '清酒', 'wine', 'beer'] },
  { categoryId: 'beverages', names: ['饮料', '果汁', '汽水', '可乐', '茶饮料', 'juice'] },
];

export interface PlacementSuggestion { locationId: string; categoryIds: string[] }

/** Match the owner's current purposes, never move food or claim a safety assessment. */
export function suggestLocations(state: InventoryState, name: string, foodType?: string): PlacementSuggestion[] {
  const key = name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
  if (!key) return [];
  const type = foodType ?? inferFoodType(name);
  const categories = typePurposes[type] ?? aliases.filter(a => a.names.includes(key)).map(a => a.categoryId);
  if (!categories.length) return [];
  return orderedStorageLocations(state).flatMap(node => {
    const categoryIds = [...new Set(state.purposes.filter(p => p.locationId === node.id && categories.includes(p.categoryId)
      && state.categories.some(c => c.id === p.categoryId)).map(p => p.categoryId))];
    return categoryIds.length ? [{ locationId: node.id, categoryIds }] : [];
  });
}
