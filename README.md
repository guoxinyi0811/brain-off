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
- `src/persistence`: async `InventoryRepository` contract and `LocalStorageRepository` adapter.
- `src/ui`: React interface, controlled dialogs, expiration input mapping and the persistence hook.
- `tests`: domain, persistence, configuration, geometry relationships and expiration input regression tests using Node's built-in test runner.

### Configuration upgrades

Inventory snapshots remain schema version 1. The optional `fridge.configurationVersion` records the programmatic sample configuration revision.

Existing `sample-fridge` snapshots without a revision upgrade once to revision 2. Existing `upper-shelf`, `lower-shelf`, `produce-drawer` and `freezer-shelf` IDs remain stable. The old freezer shelf becomes the first freezer drawer. The upgrade adds missing locations/categories and applies the owner's corrected purposes once. Food records, IDs, location references and original expiration input remain unchanged. Extra custom locations/categories remain, and independently identified custom fridges are untouched.

The upgraded snapshot is validated and saved before the new layout is exposed. Failed load/save operations use the retry/error UI without clearing stored data. Subsequent reloads retain user-edited purposes; they do not reapply defaults. Future configuration changes for existing users should include an explicit revision/migration.

### Expiration

Exact dates and estimates retain original input, recorded date and exact/computed date. Estimates retain numeric duration and unit. Editing a food name or location does not renew its estimate. Date arithmetic uses calendar days and the browser supplies today's local date; the reminder threshold defaults to three days inclusive. Estimated status remains visibly distinct from an exact date.

Dates are organizational reminders, not food-safety assessments. No automated placement or food-safety recommendation feature is implemented.

## Verification

23 automated tests pass, along with strict TypeScript checking and the Vite production build. Tests cover configuration/geometry, inventory-preserving upgrades, expiration provenance, search normalization, combined filters, inclusive date boundaries, stable sorting and physical location ordering.

Browser checks covered the desktop two-column layout and narrow-screen layout without horizontal overflow, selecting the tall door basket, adding an estimate, reload persistence, moving the item into freezer drawer 3 and confirmed removal. Permission/quota failure behavior is covered at the repository boundary; browser permission/quota failure UI has not been exercised in a real browser.

Inventory browser checks covered creating records across compartments, name search, locating a result and focusing its region, retaining filters across view switches, expired filtering, editing a record out of its filter, defaulting new food to the filtered location, deletion/focus recovery, and layouts at 390px/1280px without horizontal overflow. Browser QA records were removed after testing.

## Limits and next decisions

Data stays in the same browser and origin. Cross-device sync is accepted future scope; provider, authentication and deployment remain undecided. A provider-neutral proposal covering authorization, revision conflicts, import and verification is in [docs/cloud-sync-plan.md](docs/cloud-sync-plan.md). It is not implemented. The local adapter is single-client and concurrent tabs can overwrite changes.

No setup editor, quantity/batch merging, automatic photo recognition or notifications have been added. The application is not deployed.

The owner has authorized syncing completed, verified project updates to GitHub. Deployment and GitHub Releases remain separate decisions. No open-source license or unsupported authorship claims have been added.
