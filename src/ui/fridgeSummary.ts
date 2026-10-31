import type { InventoryItem } from '../domain/model.ts';
import { emptyInventoryQuery, queryInventory } from '../domain/inventory-query.ts';
import { expirationStatus } from '../domain/expiration.ts';

/** Presentation only: keep batches separate and never sum unlike quantity units. */
export function fridgeSummary(items: readonly InventoryItem[], locationId: string, today: string) {
  const ordered = queryInventory(items, { ...emptyInventoryQuery, locationId }, today);
  const attention = { past: 0, soon: 0, unknown: 0 };
  for (const item of ordered) {
    const { status } = expirationStatus(item.expiration, today);
    if (status === 'past-date') attention.past++;
    if (status === 'due-soon') attention.soon++;
    if (status === 'unknown') attention.unknown++;
  }
  const attentionText = [attention.past && `${attention.past} 条已到期`, attention.soon && `${attention.soon} 条临近到期`,
    attention.unknown && `${attention.unknown} 条保质期待确认`].filter(Boolean).join('，');
  return { items: ordered, count: ordered.length, attentionCount: attention.past + attention.soon + attention.unknown, attentionText };
}
