import type { Expiration, InventoryState, StorageNode } from '../domain/model.ts';
import { expirationStatus } from '../domain/expiration.ts';

const labels: Record<string, string> = {
  'Freezer': '冷冻室', 'Freezer shelf': '冷冻层', 'Refrigerator': '冷藏室',
  'Upper shelf': '上层搁架', 'Lower shelf': '下层搁架', 'Produce drawer': '保鲜抽屉',
  'Vegetables': '蔬菜', 'Fruits': '水果', 'Raw meat': '生肉', 'Dairy': '乳制品',
  'Beverages': '饮料', 'Wine': '酒类', 'Condiments': '酱料', 'Other': '其他',
};
export const label = (text: string) => labels[text] ?? text;
export function storageLocations(state: InventoryState): StorageNode[] {
  const result: StorageNode[] = [];
  function visit(parentId: string | null) {
    const children = state.locations.filter(node => node.parentId === parentId).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    for (const node of children) {
      if (node.canHoldItems) result.push(node);
      visit(node.id);
    }
  }
  visit(null);
  return result;
}
export function locationName(state: InventoryState, id: string): string {
  const names: string[] = [];
  const seen = new Set<string>();
  let current: string | null = id;
  while (current && !seen.has(current)) {
    seen.add(current);
    const node = state.locations.find(location => location.id === current);
    if (!node) break;
    names.unshift(label(node.label));
    current = node.parentId;
  }
  return names.join(' / ') || id;
}
export function localToday() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function expiryLabel(expiration: Expiration, today: string) {
  const value = expirationStatus(expiration, today);
  const prefix = value.isEstimated ? '预计' : '';
  return { ...value, text: value.daysRemaining < 0 ? `${prefix}已过期 ${Math.abs(value.daysRemaining)} 天`
    : value.daysRemaining === 0 ? `${prefix}今天到期` : `${prefix}还有 ${value.daysRemaining} 天` };
}
