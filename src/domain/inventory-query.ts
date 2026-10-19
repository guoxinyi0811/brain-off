import type { InventoryItem } from './model.ts';
import { expirationStatus } from './expiration.ts';

export type ExpirationFilter = 'all' | 'due-soon' | 'past-date' | 'later' | 'unknown';
export type InventorySort = 'expiration' | 'name';
export interface InventoryQuery {
  search: string;
  locationId: string;
  expiration: ExpirationFilter;
  sort: InventorySort;
}
export const emptyInventoryQuery: InventoryQuery = {
  search: '', locationId: '', expiration: 'all', sort: 'expiration',
};

const normalize = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
const collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' });

/** Pure view query. Estimates use their existing date; searching never renews them. */
export function queryInventory(items: readonly InventoryItem[], query: InventoryQuery, today: string): InventoryItem[] {
  const search = normalize(query.search);
  return items.map(item => ({ item, expiry: expirationStatus(item.expiration, today) }))
    .filter(({ item, expiry }) => (!search || normalize(item.name).includes(search))
      && (!query.locationId || item.locationId === query.locationId)
      && (query.expiration === 'all' || expiry.status === query.expiration))
    .sort((a, b) => (query.sort === 'expiration' ? a.expiry.daysRemaining - b.expiry.daysRemaining : 0)
      || collator.compare(a.item.name, b.item.name) || collator.compare(a.item.id, b.item.id))
    .map(({ item }) => item);
}
