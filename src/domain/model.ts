export type DateOnly = string;

export interface Fridge { id: string; name: string; configurationVersion?: number }
export interface StorageNode {
  id: string;
  fridgeId: string;
  parentId: string | null;
  kind: 'compartment' | 'shelf' | 'drawer' | 'section';
  label: string;
  order: number;
  canHoldItems: boolean;
}
export interface Category { id: string; label: string }
export interface LocationPurpose { locationId: string; categoryId: string }
export interface ShelfLife { value: number; unit: 'days' | 'weeks' | 'months' }

// Keep input provenance separate from derived dates. A future range variant
// can add minDays/maxDays without changing exact-date or duration records.
export type Expiration =
  | { kind: 'exact'; originalInput: string; recordedOn: DateOnly; date: DateOnly }
  | { kind: 'estimate'; originalInput: string; recordedOn: DateOnly;
      duration: { value: number; unit: 'days' | 'weeks' }; estimatedDate: DateOnly }
  | { kind: 'production'; originalInput: string; recordedOn: DateOnly;
      producedOn: DateOnly; duration: ShelfLife; date: DateOnly }
  | { kind: 'automatic'; originalInput: string; recordedOn: DateOnly;
      basisDate: DateOnly; foodType: string; ruleId: string; source: string;
      days: number; estimatedDate: DateOnly };

export interface InventoryItem {
  id: string;
  name: string;
  locationId: string;
  expiration: Expiration | null;
  quantity?: { value: number; unit: string };
}
export interface InventoryState {
  schemaVersion: 1;
  fridge: Fridge;
  locations: StorageNode[];
  categories: Category[];
  purposes: LocationPurpose[];
  items: InventoryItem[];
}
