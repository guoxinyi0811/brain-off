# Cross-device synchronization — proposed next milestone

Status: cloud design proposal, not implemented. Local IndexedDB transactions, revision conflicts and page notifications are implemented separately in [storage-design.md](storage-design.md); they do not synchronize devices. Provider, login method and deployment remain undecided. No external account, service, database or authentication has been created.

## Product outcome

Inventory entered at home must be visible on a signed-in phone at the store. A successful server save must survive signing in on another device. The existing spatial layout and exact/estimated expiration provenance must remain intact.

## Smallest first cloud milestone

1. One owner and one fridge per signed-in account; household sharing remains later scope.
2. Store a validated inventory snapshot with a server-controlled revision and owner identity. Keep stable location/item IDs and configuration revision 2.
3. Implement the existing asynchronous repository boundary for remote load/save. Keep UI components and domain operations independent of a particular provider. Add a typed conflict outcome and revision envelope at the persistence boundary as needed.
4. Use a server-side authorization rule on every read/write. Never trust a client-supplied owner field, and never ship an administrative credential to the browser.
5. Save with an expected revision. If another device saved first, reject the stale write, retain the user's input and offer reload/retry. Do not silently overwrite or pretend that a whole-snapshot merge is safe.
6. Load the current revision on sign-in, returning to the app, and before accepting a stale session's write. Add live subscriptions only if the simpler refresh behavior proves inadequate.

This first version should require a connection for writes and clearly distinguish cached reads from current server data. A durable offline operation queue, automatic conflict resolution and background synchronization are separate proposals, not part of this minimal milestone.

## Importing current browser data

After sign-in, inspect server and local data separately. If cloud storage is empty, offer to import the current browser's inventory; do not upload browser data automatically merely because someone signs in. If both contain data, present an explicit choice and preserve the local copy until the chosen cloud save succeeds. Do not infer that the two snapshots represent the same fridge just from item names.

Read data through the existing validation/migration boundary. A failed import must not clear the browser inventory. Sign-out must isolate the previous account's cache and prevent its records from appearing for another account.

## Required verification before calling sync complete

- Two independent sessions: create on one, reload on the other; repeat with edit, move, purpose change and removal.
- Unauthorized read/write attempts rejected, including guessing another owner's IDs.
- Concurrent edits rejected or explicitly reconciled without dropped inventory.
- Network failure and expired-session paths preserve form input and never show a false “synced” status.
- First import, existing-cloud-data choice, sign-out/account switch and configuration migration preserve original expiration input.

## Decisions still needed

Choose a provider and sign-in method, approve deployment, and supply a development project through its normal connection flow. Supabase remains an earlier candidate rather than a selected dependency. Estimate dates stay user-entered organizational data; cloud sync introduces no food-safety recommendation feature.
