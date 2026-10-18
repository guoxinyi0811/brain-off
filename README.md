# brain off

A refrigerator inventory project centered on physical storage locations.

## Current version — milestone 2

The React + Vite application now includes a functional front-view refrigerator, location details, food entry with exact or estimated expiration, edit/move/remove flows, multi-category storage purpose editing, and browser-local persistence. The UI is in Chinese and uses a responsive single-column layout on narrow screens. No external image or font service is required.

Food entry starts from the selected location; the form also allows choosing any available location. Estimated dates remain explicitly labeled. Editing only the food name or location preserves the original expiration record. Removal requires confirmation. A failed save keeps the form open, and a failed load leaves existing storage untouched.

## Milestone 1 foundation

Implemented: TypeScript domain models, configurable sample fridge/freezer, independent multi-category storage purposes, immutable inventory operations, expiration calculations, runtime data validation, and an asynchronous persistence interface with a browser-storage adapter.

Repository: https://github.com/guoxinyi0811/brain-off (public). Nothing has been deployed.

## Run

Requires Node.js 24 or newer. From this folder:

```sh
npm ci
npm run dev
```

Open the Local URL printed by Vite. To verify and build:

```sh
npm test
npm run typecheck
npm run build
npm run demo
```

Tests use Node's built-in test runner and TypeScript stripping; no test framework dependency is needed. TypeScript performs a separate strict type check. The demo uses memory storage and a fixed example date, and does not persist across process restarts.

## Architecture

- `src/domain`: models, pure expiration calculations, immutable operations, runtime validation.
- `src/config/sample-fridge.ts`: replaceable seed configuration with stable IDs and no food inventory.
- `src/persistence`: `InventoryRepository` async load/save contract; `LocalStorageRepository` accepts a storage implementation. In a browser, construct it with `window.localStorage`.
- `src/ui`: React spatial interface, dialogs, expiration form mapping, and persistence hook. Domain operations run before saving; UI inventory updates only after a successful save.
- `tests`: domain behavior and persistence boundary tests.

`StorageNode.parentId` describes the physical tree. Only nodes with `canHoldItems` accept inventory. Purpose assignments may target any node and associate multiple categories; they are descriptive, not placement restrictions or food-safety rules. They do not move or delete inventory, and do not implicitly inherit down the tree.

Renames and reordering retain location IDs. Occupied locations and nodes with children cannot be removed. IDs are provided by callers (the future UI can use `crypto.randomUUID()`). Every operation returns a validated copy. Configuration edits with existing inventory must preserve IDs or explicitly migrate affected items.

Expiration records retain input method, original text, recorded calendar date, and the exact or computed estimated date. Estimates also retain their original numeric value and unit. A future range can be introduced as another discriminated-union variant with a schema migration. Free-text parsing is not implemented: a UI must supply a structured duration alongside the retained text.

Date arithmetic uses calendar dates without time-of-day or timezone conversion. The caller supplies today's local date. The proposed default warning window is three days, inclusive; dates in the past use `past-date`, today through the threshold use `due-soon`, and later dates use `later`. Estimates retain an independent `isEstimated` flag. These statuses are organizational reminders, not food-safety assessments.

## Persistence and limitations

Version 1 snapshots are validated before saving and after loading. Unknown versions, malformed records, storage-denied errors and quota failures reject with `PersistenceError`; failed loads never silently reset stored data. The UI displays a load error with a retry action, or a save error that preserves form input. Data reset/recovery tooling is not yet implemented.

Local storage is limited to the same browser and origin. The adapter is single-client; concurrent tabs can overwrite one another. Cross-device synchronization is an accepted product requirement deferred beyond milestone 1. The async boundary permits a cloud adapter without changing the basic domain entities, but authentication, access rules, conflict handling, retries and offline behavior still require implementation. Supabase is a candidate, not a chosen dependency.

## Decisions and next milestone

Milestone 2 verification: 13 automated tests cover domain/persistence behavior and expiration form mapping, including preserving older estimates when food is moved. Strict TypeScript checking and the Vite production build pass. Browser QA verified add, reload persistence, move, multi-purpose editing, exact-date/expired display, confirmed removal, and Escape dismissal with focus returning to the opener. Browser checks were performed in the available narrow side-panel viewport; a separate full-width desktop browser check remains outstanding. Storage failures are covered by adapter tests; browser permission/quota failure UI has not been exercised in a real browser.

Confirmed: name **brain off**; React/TypeScript/Vite direction; spatial front view remains central; configurable initial structure; independent storage purposes; preservation of expiration provenance; eventual cross-device synchronization.

Reversible implementation defaults: sample layout without door sections, three-day warning threshold, whole-day/week estimates, no quantities or batch merging. The seed is illustrative and is not claimed to represent the user's actual fridge.

Next, after review: a searchable inventory view for shopping, additional responsive/accessibility QA, and a concrete cloud-sync design. Homepage entry points for “find something” and “put something away” are recorded UX proposals, not approved scope. Cloud provider, authentication, hosting, quantities and estimated ranges remain open.

The owner has authorized uploading this milestone and syncing future verified project updates to this GitHub repository. Website deployment, GitHub Releases, and changing repository visibility remain separate decisions. No open-source license or authorship claims have been invented.
