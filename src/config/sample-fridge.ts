import type { InventoryState, StorageNode } from '../domain/model.ts';
import { validateState } from '../domain/validation.ts';

export const CONFIGURATION_VERSION = 2;
const fridgeId = 'sample-fridge';
const location = (id: string, parentId: string | null, kind: StorageNode['kind'], label: string, order: number, canHoldItems = true): StorageNode =>
  ({ id, fridgeId, parentId, kind, label, order, canHoldItems });

export function createSampleFridge(): InventoryState {
  const state: InventoryState = {
    schemaVersion: 1,
    fridge: { id: fridgeId, name: 'My refrigerator', configurationVersion: CONFIGURATION_VERSION },
    locations: [
      location('freezer', null, 'compartment', 'Freezer', 1, false),
      // Retained IDs keep existing food attached to a real location.
      location('freezer-shelf', 'freezer', 'drawer', '冷冻抽屉 1', 0),
      location('freezer-drawer-2', 'freezer', 'drawer', '冷冻抽屉 2', 1),
      location('freezer-drawer-3', 'freezer', 'drawer', '冷冻抽屉 3', 2),
      location('chilled', null, 'compartment', 'Refrigerator', 0, false),
      location('upper-shelf', 'chilled', 'shelf', '第 1 层', 0),
      location('lower-shelf', 'chilled', 'shelf', '第 2 层', 1),
      location('shelf-3', 'chilled', 'shelf', '第 3 层', 2),
      location('shelf-4', 'chilled', 'shelf', '第 4 层', 3),
      location('produce-drawer', 'chilled', 'drawer', '保鲜抽屉', 4),
      location('door', null, 'compartment', '冰箱门', 2, false),
      location('door-top', 'door', 'section', '顶部通宽篮', 0),
      location('door-upper-left', 'door', 'section', '左上篮', 1),
      location('door-lower-left', 'door', 'section', '左中篮', 2),
      location('door-right-tall', 'door', 'section', '右侧高篮', 3),
      location('door-bottom', 'door', 'section', '底部饮料篮', 4),
    ],
    categories: [
      ['groceries', '杂货'], ['eggs', '鸡蛋'], ['raw-meat', '生肉'],
      ['jarred-condiments', '罐装调味料'], ['cooked-food', '熟食'], ['leftovers', '剩菜'],
      ['vegetables', '蔬菜'], ['fruits', '水果'], ['butter', '黄油'], ['miso', '味噌'],
      ['chinese-condiments', '中式调味料'], ['japanese-condiments', '日式调味料'],
      ['oyster-sauce', '蚝油'], ['wine', '酒类'], ['beverages', '饮料'],
      ['dairy', '乳制品'], ['condiments', '酱料'], ['other', '其他'],
    ].map(([id, label]) => ({ id: id!, label: label! })),
    purposes: [
      ['upper-shelf', 'groceries'],
      ['lower-shelf', 'eggs'], ['lower-shelf', 'raw-meat'],
      ['shelf-3', 'jarred-condiments'],
      ['shelf-4', 'cooked-food'], ['shelf-4', 'leftovers'],
      ['produce-drawer', 'vegetables'], ['produce-drawer', 'fruits'],
      ['door-upper-left', 'butter'], ['door-upper-left', 'miso'],
      ['door-lower-left', 'chinese-condiments'],
      ['door-right-tall', 'japanese-condiments'], ['door-right-tall', 'oyster-sauce'],
      ['door-bottom', 'wine'], ['door-bottom', 'beverages'],
    ].map(([locationId, categoryId]) => ({ locationId: locationId!, categoryId: categoryId! })),
    items: [],
  };
  validateState(state);
  return state;
}

/** One-time seed upgrade. Food IDs, positions and expiration input are untouched.
 * Corrected purposes replace sample defaults once, then remain editable.
 * Custom fridges and extra locations/categories are retained.
 */
export function upgradeFridgeConfiguration(state: InventoryState): InventoryState {
  if (state.fridge.id !== fridgeId || (state.fridge.configurationVersion ?? 1) >= CONFIGURATION_VERSION) return state;
  const next = structuredClone(state);
  const configured = createSampleFridge();
  next.fridge.configurationVersion = CONFIGURATION_VERSION;
  for (const node of configured.locations) {
    const index = next.locations.findIndex(existing => existing.id === node.id);
    if (index < 0) next.locations.push(node);
    else next.locations[index] = node;
  }
  for (const category of configured.categories) {
    if (!next.categories.some(existing => existing.id === category.id)) next.categories.push(category);
  }
  const corrected = new Set(configured.locations.filter(node => node.canHoldItems).map(node => node.id));
  next.purposes = [...next.purposes.filter(purpose => !corrected.has(purpose.locationId)), ...configured.purposes];
  validateState(next);
  return next;
}
