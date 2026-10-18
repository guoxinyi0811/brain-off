import type { InventoryState } from '../domain/model.ts';
import { validateState } from '../domain/validation.ts';

export function createSampleFridge(): InventoryState {
  const state: InventoryState = {
    schemaVersion: 1,
    fridge: { id: 'sample-fridge', name: 'Sample refrigerator' },
    locations: [
      { id: 'freezer', fridgeId: 'sample-fridge', parentId: null, kind: 'compartment', label: 'Freezer', order: 0, canHoldItems: false },
      { id: 'freezer-shelf', fridgeId: 'sample-fridge', parentId: 'freezer', kind: 'shelf', label: 'Freezer shelf', order: 0, canHoldItems: true },
      { id: 'chilled', fridgeId: 'sample-fridge', parentId: null, kind: 'compartment', label: 'Refrigerator', order: 1, canHoldItems: false },
      { id: 'upper-shelf', fridgeId: 'sample-fridge', parentId: 'chilled', kind: 'shelf', label: 'Upper shelf', order: 0, canHoldItems: true },
      { id: 'lower-shelf', fridgeId: 'sample-fridge', parentId: 'chilled', kind: 'shelf', label: 'Lower shelf', order: 1, canHoldItems: true },
      { id: 'produce-drawer', fridgeId: 'sample-fridge', parentId: 'chilled', kind: 'drawer', label: 'Produce drawer', order: 2, canHoldItems: true },
    ],
    categories: ['Vegetables', 'Fruits', 'Raw meat', 'Dairy', 'Beverages', 'Wine', 'Condiments', 'Other'].map(label => ({ id: label.toLowerCase().replaceAll(' ', '-'), label })),
    purposes: [
      { locationId: 'upper-shelf', categoryId: 'dairy' },
      { locationId: 'upper-shelf', categoryId: 'beverages' },
      { locationId: 'produce-drawer', categoryId: 'vegetables' },
      { locationId: 'produce-drawer', categoryId: 'fruits' },
    ],
    items: [],
  };
  validateState(state);
  return state;
}
