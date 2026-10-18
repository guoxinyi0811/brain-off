import { createSampleFridge } from './config/sample-fridge.ts';
import { addItem } from './domain/inventory.ts';
import { estimatedExpiration, expirationStatus } from './domain/expiration.ts';
import { LocalStorageRepository, MemoryStorage } from './persistence/repository.ts';

const storage = new MemoryStorage();
const repository = new LocalStorageRepository(storage);
const state = addItem(createSampleFridge(), {
  id: 'demo-milk', name: 'Milk', locationId: 'upper-shelf',
  expiration: estimatedExpiration(3, 'days', '2026-10-18', 'about 3 days'),
});
await repository.save(state);
const reopened = await new LocalStorageRepository(storage).load();
console.log(JSON.stringify({ note: 'In-memory persistence demonstration, not browser or cloud sync',
  item: reopened?.items[0], expiration: expirationStatus(state.items[0]!.expiration, '2026-10-18') }, null, 2));
