import type { InventoryItem, InventoryState } from './model.ts';
import { validateState } from './validation.ts';

function change(state: InventoryState, update: (draft: InventoryState) => void): InventoryState {
  const draft = structuredClone(state);
  update(draft);
  validateState(draft);
  return draft;
}
export function addItem(state: InventoryState, item: InventoryItem): InventoryState {
  return change(state, draft => { draft.items.push(structuredClone(item)); });
}
export function updateItem(state: InventoryState, id: string, patch: Partial<Omit<InventoryItem, 'id'>>): InventoryState {
  return change(state, draft => {
    const item = draft.items.find(item => item.id === id);
    if (!item) throw new Error('Item not found');
    Object.assign(item, structuredClone(patch));
  });
}
export function removeItem(state: InventoryState, id: string): InventoryState {
  return change(state, draft => {
    if (!draft.items.some(item => item.id === id)) throw new Error('Item not found');
    draft.items = draft.items.filter(item => item.id !== id);
  });
}
export function setPurposes(state: InventoryState, locationId: string, categoryIds: string[]): InventoryState {
  return change(state, draft => {
    if (!draft.locations.some(node => node.id === locationId)) throw new Error('Location not found');
    draft.purposes = draft.purposes.filter(purpose => purpose.locationId !== locationId);
    draft.purposes.push(...[...new Set(categoryIds)].map(categoryId => ({ locationId, categoryId })));
  });
}
export function removeLocation(state: InventoryState, id: string): InventoryState {
  return change(state, draft => {
    if (!draft.locations.some(node => node.id === id)) throw new Error('Location not found');
    if (draft.items.some(item => item.locationId === id)) throw new Error('Move items before removing location');
    if (draft.locations.some(node => node.parentId === id)) throw new Error('Remove child locations first');
    draft.locations = draft.locations.filter(node => node.id !== id);
    draft.purposes = draft.purposes.filter(purpose => purpose.locationId !== id);
  });
}
