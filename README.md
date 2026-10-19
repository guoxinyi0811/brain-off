# brain off

A spatial refrigerator inventory app. Select a real storage location, inspect its food, and add, edit, move or remove items with exact or estimated expiration dates.

Repository: https://github.com/guoxinyi0811/brain-off

## Inventory view

The default screen remains the spatial refrigerator. Switch to Inventory for a compact shopping view of all food. Search by name, combine a precise storage-location filter with expiration status, and sort by earliest expiration or name. Name matching normalizes case, whitespace and full-width characters; it is substring search rather than fuzzy matching.

The three-day filter includes today through day 3; past dates are a separate filter. Estimates stay explicitly labeled and use their existing dates. The location button on each result returns to the refrigerator, selects and focuses its region, and highlights the matching food in location details. Search/filter state survives switching views but resets on a browser reload.

Inventory supports the existing add/edit/move/remove flows. Adding under a location filter defaults to that location. Location choices include compartment context and follow physical order. Editing a result out of the current filter updates the list immediately; dialog focus returns to a stable view control if its original row has disappeared. Browser data and fridge configuration remain unchanged by searches.

## Run

Requires Node.js 24 or newer.

```sh
npm ci
npm run dev
```

Open the Local URL printed by Vite. Development data stays in that browser and origin.

```sh
npm test
npm run typecheck
npm run build
npm run demo
```

The demo uses memory storage and a fixed date; it does not persist across process restarts.

## Current layout

The initial configuration follows the owner's reference photos. It is an orthographic approximation of relative structure, not a physical measurement or a photo tracing.

| Location | Intended purpose |
| --- | --- |
| Chilled shelf 1 | Groceries |
| Chilled shelf 2 | Eggs, raw meat |
| Chilled shelf 3 | Jarred sauces and condiments |
| Chilled shelf 4 | Cooked food, leftovers |
| Crisper | Vegetables, fruits |
| Freezer drawers 1–3 | Unassigned |
| Top full-width door basket | Unassigned |
| Upper-left door basket | Butter, miso |
| Lower-left door basket | Chinese cooking condiments |
| Right tall door basket | Japanese cooking condiments, oyster sauce |
| Bottom wide door basket | Alcoholic and nonalcoholic beverages |

The door has five individually positioned baskets. The tall right basket overlaps the vertical ranges of the two left baskets; no uniform grid is imposed. The freezer's three drawers are schematic because their geometry is not visible in the supplied interior photos. No food from the photos is seeded as inventory. Personal reference photos are not included in this repository.

## Visual and interaction design

Flat, precise ink outlines on a near-white background. Restrained silver-blue fill indicates hover/selection, inspired by refrigerator lighting. Expiration uses explicit wording and a separate `!` marker, so it never depends on the blue selection color. No glow, shadows, heavy gradients, marketing copy or decorative illustrations.

Storage regions use configured SVG outlines with native HTML buttons positioned over the same geometry. They support Tab, Enter and Space and expose location, item count, expiration attention count and selection to assistive technology. The source order is chilled shelves/crisper, freezer drawers, then door baskets from top through left pair/right basket to bottom. A detail panel shows the selected location and its editable purposes. Dialogs retain focus behavior and Escape dismissal.

Purpose assignments are many-to-many and descriptive. They do not enforce food-safety rules, move food or delete inventory.

## Architecture

- `src/domain`: type-safe models, immutable inventory operations, calendar-date expiration calculations and runtime data validation.
- `src/config/sample-fridge.ts`: physical locations, stable IDs, category/purpose defaults and one-time configuration upgrades.
- `src/config/fridge-geometry.ts`: drawing dimensions, cabinet/door frames, lines and independently positioned region geometry. These drawing units are separate from inventory records. A region can override its outline path.
- `src/persistence`: async repository contracts, the default `IndexedDbRepository`, and a retained legacy `LocalStorageRepository` adapter.
- `src/ui`: React interface, controlled dialogs, expiration input mapping and the persistence hook.
- `tests`: domain, persistence, configuration, geometry relationships and expiration input regression tests using Node's built-in test runner.

### Configuration upgrades

Inventory snapshots remain schema version 1. The optional `fridge.configurationVersion` records the programmatic sample configuration revision.

Existing `sample-fridge` snapshots without a revision upgrade once to revision 2. Existing `upper-shelf`, `lower-shelf`, `produce-drawer` and `freezer-shelf` IDs remain stable. The old freezer shelf becomes the first freezer drawer. The upgrade adds missing locations/categories and applies the owner's corrected purposes once. Food records, IDs, location references and original expiration input remain unchanged. Extra custom locations/categories remain, and independently identified custom fridges are untouched.

The upgraded snapshot is validated and saved before the new layout is exposed. Failed load/save operations use the retry/error UI without clearing stored data. Subsequent reloads retain user-edited purposes; they do not reapply defaults. Future configuration changes for existing users should include an explicit revision/migration.

### Expiration

Exact dates and estimates retain original input, recorded date and exact/computed date. Estimates retain numeric duration and unit. Editing a food name or location does not renew its estimate. Date arithmetic uses calendar days and the browser supplies today's local date; the reminder threshold defaults to three days inclusive. Estimated status remains visibly distinct from an exact date.

Dates are organizational reminders, not food-safety assessments. Placement suggestions match configured purposes; they do not assess food safety.

## Verification

71 automated tests pass, along with strict TypeScript checking and the Vite production build. Tests cover configuration/geometry, inventory-preserving upgrades, expiration provenance, search normalization, combined filters, inclusive date boundaries, stable sorting and physical location ordering.

Browser checks covered the desktop two-column layout and narrow-screen layout without horizontal overflow, selecting the tall door basket, adding an estimate, reload persistence, moving the item into freezer drawer 3 and confirmed removal. Permission/quota failure behavior is covered at the repository boundary; browser permission/quota failure UI has not been exercised in a real browser.

Inventory browser checks covered creating records across compartments, name search, locating a result and focusing its region, retaining filters across view switches, expired filtering, editing a record out of its filter, defaulting new food to the filtered location, deletion/focus recovery, and layouts at 390px/1280px without horizontal overflow. Browser QA records were removed after testing.

## Limits and next decisions

Data stays in the same browser and origin. Cross-device sync is accepted future scope; provider, authentication and deployment remain undecided. A provider-neutral proposal covering authorization, revision conflicts, import and verification is in [docs/cloud-sync-plan.md](docs/cloud-sync-plan.md). It is not implemented. The default local adapter rejects stale writes from other pages and keeps active inputs intact; see [the implemented storage design](docs/storage-design.md).

No setup editor, batch merging, automatic photo recognition or notifications have been added. The application is not deployed.

The owner has authorized syncing completed, verified project updates to GitHub. Deployment and GitHub Releases remain separate decisions. No open-source license or unsupported authorship claims have been added.

## Expiration input update

Confirmed owner requirements:
- Two manual inputs: estimated remaining days/weeks, or production date plus shelf life (days/weeks/calendar months). Production date is explicitly the manufacturing date, not the purchase or opening date. For example, October 19 + 7 days yields October 26. Month addition clamps to the destination month's last day.
- If neither is supplied, estimate from a food type where a reviewed rule exists. The form defaults to automatic mode, suggests a type only for unambiguous names and allows changing it. Food type is independent of the storage area's purposes.
- All dates remain editable. Existing exact-date records remain readable/editable; an untouched record keeps its original date and provenance, including when its name/location changes. A new explicit expiration input replaces the previous one.

Automatic estimates currently support eight specific refrigerated types in `src/domain/food-estimates.ts`. The source is the [FoodSafety.gov Cold Food Storage Chart](https://www.foodsafety.gov/food-safety-charts/cold-food-storage-charts); the app rules were checked against it on October 19, 2026. Rules use the lower end of each published range. They assume continuous refrigeration at or below 4°C and use an editable purchase/preparation date, initially today. They do not know the food's prior handling; packaging instructions and actual conditions take precedence. Automatic estimates retain food type, start date, recording date, rule version, source and computed date. Reopening the app never recomputes them from today.

There is no universal rule for broad groceries, milk, produce or condiments in this first rule set. Ambiguous names require selecting a supported type or entering a manual duration. Unknown types and freezer locations produce `expiration: null`, visibly labeled "保质期待确认", included in attention counts and available as a separate inventory filter. They sort after dated food and never appear in known-date filters. Missing dates are not evidence that food is safe. Moving an existing dated record preserves its provenance; it does not establish a new cold-storage estimate.

Validation accepts the extended expiration variants and legacy schema-version-1 snapshots. It rejects partial production inputs, invalid/future start dates, negative/fractional durations and inconsistent derived dates. Both empty manual fields fall back to automatic estimation; one populated production field requires the other.

Confirmed future requirement: voice input should produce an editable structured draft (food name, location, expiration input and its origin), then allow the user to check/correct it before saving into the fridge. Speech recognition, microphone access and automatic placement are not implemented in this update. Recognition must not silently invent a production date or overwrite existing stock. Whether saving needs explicit confirmation versus an editable undo flow remains a future UX decision.

Validation for this update: 32 automated tests, TypeScript and the production build passed. Browser checks covered production-date-plus-duration preview, an automatic estimate using a past purchase date, persistence after reload, unchanged expiration after renaming/moving, unknown-date filtering and manual override to remaining weeks. Test-only browser records were removed afterward.

## Daily-use update: quantities and placement suggestions

Items now accept an optional quantity with a positive numeric value and a free-text unit (up to 16 characters). Examples: 3 boxes, 0.5 kg, or a number without a unit. Common units are suggested by a native datalist. Leave both fields blank when the quantity is unknown; clearing both removes a previously entered quantity. Zero/negative/nonfinite values and values above 1 billion are rejected. Zero is not an automatic delete action. Editing quantities preserves IDs, location and the original expiration. Legacy snapshots without quantities load unchanged.

Quantities appear beside names in inventory and location details, and alongside the first visible food name in the desktop fridge diagram. Diagram counters and page totals count inventory records, not a sum of mixed units or packages. Same-name entries remain separate records; there is no batch merging, unit conversion or automatic consumption tracking.

Placement suggestions use conservative name aliases (including full-width/case normalization) or an explicitly selected food subtype to match the refrigerator's current purpose assignments. For example, eggs match the configured egg area; butter/miso, Chinese sauces, oyster sauce and beverages match the corresponding door baskets. Food subtypes used for expiration and location purposes remain separate concepts. Unrecognized names or purposes with no configured storage area produce no suggestion. No generic fallback location is invented.

Suggestions show the full location path and matched purpose. The person explicitly chooses a suggestion or keeps/changes the ordinary location selector. Typing or changing a name never silently moves an item. Multiple matches follow physical order. Renaming locations preserves stable IDs; changing purposes changes future suggestions without moving inventory. These are organizational matches to the owner's settings, not food-safety recommendations or capacity checks.

Validation for this update: 41 automated tests, TypeScript and the production build passed. Browser checks covered entering packages, applying a recommendation with mouse and keyboard, overriding the suggested location, reload persistence, editing/clearing quantities while preserving expiration, rejecting zero, fractional weights and narrow-screen layout. Test-only records were removed afterward. Voice recognition and cross-device synchronization remain future work.

## Backup and recovery

Open **备份** in the header to export the currently displayed fridge as a local JSON file. Export includes inventory IDs, quantities, all expiration inputs/provenance, storage locations, categories, purposes and configuration revision. The file is readable JSON and is not uploaded by the app. Keep a downloaded copy outside the browser; a local recovery point is lost if browser site data is cleared.

Import accepts the version-1 `brain-off` backup envelope or a legacy raw schema-version-1 inventory snapshot (including UTF-8 BOM). It validates the complete snapshot before showing the fridge name, item/location counts and export time. Nothing is replaced until **恢复这份备份** is chosen. This restores the whole fridge instead of merging potentially conflicting IDs. Empty backups can replace nonempty stock, with the counts shown explicitly. Old sample configurations are upgraded in the preview using the existing migration; food IDs, quantities and expiration inputs remain unchanged. Canceling the preview does not change inventory.

The default IndexedDB repository checkpoints the exact previous primary JSON and replaces inventory in one atomic transaction. If either write fails, both inventory and the previous recovery point remain unchanged. If no primary snapshot existed, it checkpoints the empty fridge that was displayed. One recovery point is retained per successful replacement; restoring it checkpoints the current fridge as well. Recovery can be previewed, exported and restored after a reload.

A valid file can also repair an unreadable inventory JSON through the same backup dialog. The unreadable original is retained byte-for-byte for a raw text download. Corrupt recovery metadata is reported without deleting it. Every save and restore checks an expected revision within the write transaction; stale versions are rejected with the current form input preserved. Migration archives the old LocalStorage values without deleting them. Details and remaining browser-storage limits are in [docs/storage-design.md](docs/storage-design.md).

Files are limited to 5 MiB and 10,000 inventory records, 1,000 locations, 200 categories and 5,000 purpose assignments. Invalid JSON, unsupported formats/schema versions, inconsistent dates, invalid quantities, broken references and graph cycles reject without partially importing or truncating data. Export applies the same size/count limits. Serialization/parsing is in `src/domain/backup.ts`; the replace/checkpoint contract extends the replaceable repository interface.

Verification for this update: 55 automated tests, strict TypeScript and production build passed. Tests cover full round trips, legacy/BOM input, limits, invalid snapshots, exact-byte recovery, checkpoint-before-primary ordering, checkpoint/primary/read failures, corrupt originals and observed concurrent changes. Browser QA verified an actual downloaded file by reading it back, rejected malformed JSON, previewed before replacement, restored quantities and original dates, reloaded, restored the previous checkpoint, and checked the 319px layout without horizontal overflow. The original fridge and a clean recovery point were restored after QA. Browser storage-permission/quota failures are tested at the repository boundary, not simulated in a real browser.

Cloud synchronization, voice recognition and deployment remain unimplemented. Backup files support manual transfer; they do not provide automatic device synchronization.


## Storage optimization update

IndexedDB is now the default local persistence engine. Revision-checked transactions prevent upgraded pages from silently overwriting one another and commit inventory plus the recovery point together. Old LocalStorage data is migrated once and retained unchanged. A compact external-update notice offers explicit reload, while open editors keep their input. The backup JSON format and domain model remain unchanged.

71 automated tests, TypeScript and the production build pass. Two real same-origin browser pages verified stale-write rejection, retained drafts, reload/retry, reverse notifications, unchanged expiration/quantity and migration of the old recovery point. Test data was removed. Browser screenshots were unavailable during this stage. See [storage-design.md](docs/storage-design.md) for implementation, migration, verification and limits.
