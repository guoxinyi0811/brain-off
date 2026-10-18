# brain off

A refrigerator inventory project centered on physical storage locations.

## Milestone 1

Implemented: TypeScript domain models, configurable sample fridge/freezer, independent multi-category storage purposes, immutable inventory operations, expiration calculations, runtime data validation, and an asynchronous persistence interface with a browser-storage adapter.

This milestone is a domain foundation, not a web UI. React + Vite are approved for the next UI milestone. Repository: https://github.com/guoxinyi0811/brain-off. Nothing has been deployed.

## Run

Requires Node.js 24 or newer. From this folder:

```sh
npm ci
npm test
npm run typecheck
npm run demo
```

Tests use Node's built-in test runner and TypeScript stripping; no test framework dependency is needed. TypeScript performs a separate strict type check. The demo uses memory storage and a fixed example date, and does not persist across process restarts.

## Architecture

- `src/domain`: models, pure expiration calculations, immutable operations, runtime validation.
- `src/config/sample-fridge.ts`: replaceable seed configuration with stable IDs and no food inventory.
- `src/persistence`: `InventoryRepository` async load/save contract; `LocalStorageRepository` accepts a storage implementation. In a browser, construct it with `window.localStorage`.
- `tests`: domain behavior and persistence boundary tests.

`StorageNode.parentId` describes the physical tree. Only nodes with `canHoldItems` accept inventory. Purpose assignments may target any node and associate multiple categories; they are descriptive, not placement restrictions or food-safety rules. They do not move or delete inventory, and do not implicitly inherit down the tree.

Renames and reordering retain location IDs. Occupied locations and nodes with children cannot be removed. IDs are provided by callers (the future UI can use `crypto.randomUUID()`). Every operation returns a validated copy. Configuration edits with existing inventory must preserve IDs or explicitly migrate affected items.

Expiration records retain input method, original text, recorded calendar date, and the exact or computed estimated date. Estimates also retain their original numeric value and unit. A future range can be introduced as another discriminated-union variant with a schema migration. Free-text parsing is not implemented: a UI must supply a structured duration alongside the retained text.

Date arithmetic uses calendar dates without time-of-day or timezone conversion. The caller supplies today's local date. The proposed default warning window is three days, inclusive; dates in the past use `past-date`, today through the threshold use `due-soon`, and later dates use `later`. Estimates retain an independent `isEstimated` flag. These statuses are organizational reminders, not food-safety assessments.

## Persistence and limitations

Version 1 snapshots are validated before saving and after loading. Unknown versions, malformed records, storage-denied errors and quota failures reject with `PersistenceError`; failed loads never silently reset stored data. The future UI must display these errors and offer recovery instead of replacing data automatically.

Local storage is limited to the same browser and origin. The adapter is single-client; concurrent tabs can overwrite one another. Cross-device synchronization is an accepted product requirement deferred beyond milestone 1. The async boundary permits a cloud adapter without changing the basic domain entities, but authentication, access rules, conflict handling, retries and offline behavior still require implementation. Supabase is a candidate, not a chosen dependency.

## Decisions and next milestone

Milestone 1 verification: all 10 automated tests passed, strict TypeScript checking passed, and the in-memory demo completed successfully. Real-browser reload and UI behavior are not yet tested because the UI is outside this milestone.

Confirmed: name **brain off**; React/TypeScript/Vite direction; spatial front view remains central; configurable initial structure; independent storage purposes; preservation of expiration provenance; eventual cross-device synchronization.

Reversible implementation defaults: sample layout without door sections, three-day warning threshold, whole-day/week estimates, no quantities or batch merging. The seed is illustrative and is not claimed to represent the user's actual fridge.

Next, after review: create the interactive front view, location detail and food-entry flow; wire the repository with explicit save/error states; verify real browser reload persistence and mobile/keyboard interaction. Homepage entry points for “find something” and “put something away” are recorded UX proposals, not approved scope. Cloud provider, authentication, hosting, quantities and estimated ranges remain open.

The owner has authorized uploading this milestone and syncing future verified project updates to this GitHub repository. Website deployment, GitHub Releases, and changing repository visibility remain separate decisions. No open-source license or authorship claims have been invented.
