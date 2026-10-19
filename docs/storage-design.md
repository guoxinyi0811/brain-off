# Local storage design

Implemented: IndexedDB is the default browser repository. Cloud synchronization is a separate, unimplemented proposal in [cloud-sync-plan.md](cloud-sync-plan.md).

## Data layout

Database `brain-off`, version 1, contains one `documents` object store:

| Key | Value |
| --- | --- |
| `inventory` | Format version, opaque revision token, validated inventory JSON (or null before first save) |
| `recovery` | Last successful replacement's pre-replacement JSON, capture time and format version |
| `migration` | Exact original LocalStorage inventory/recovery bytes and, after explicit reconciliation, the last accepted legacy source |

The domain snapshot remains schema version 1. Stable IDs, configuration revision, quantities and expiration provenance do not change. Database and backup format versions are independent of the domain schema.

Snapshots remain appropriate for this single-fridge dataset: domain operations and whole-fridge backup validation remain simple, and recovery can retain exact bytes. This update does not introduce per-item database indexes or an event log, and does not claim to eliminate whole-snapshot serialization/validation. It moves the primary I/O off synchronous LocalStorage and strengthens correctness. Larger datasets may justify a later schema with separate inventory records after measurement.

## Migration

Initialization reads the primary record inside a read/write transaction. If both primary and migration metadata are absent, it copies `brain-off:v1` and `brain-off:v1:recovery` from LocalStorage without modifying either source. Concurrent first readers share the database transaction ordering, so only the first creates the records. The transaction commits before exposing migrated data.

Corrupt source bytes are copied exactly, then rejected during normal snapshot parsing. This preserves the existing valid-backup repair flow: a successful explicit replacement checkpoints those raw bytes for download. Unreadable LocalStorage aborts initialization; it never means "there is no inventory." Missing primary data beside existing migration metadata is treated as corruption and is not reseeded from an obsolete source. IndexedDB failures never trigger an automatic LocalStorage fallback.

Old source keys are retained as migration archives and are not updated by the new app. If a pre-upgrade page writes to them, normal writes stop with a conflict message. Export both versions, close the old page, reload and explicitly choose a backup to restore. That reviewed replacement records the observed legacy source as accepted, retains the original migration bytes, and checkpoints the previous database inventory. Another legacy change after reload rejects restoration again. The two data branches are never silently merged.

## Atomic writes and revisions

Overlapping IndexedDB read/write transactions are ordered by the browser, and aborted transactions roll back their changes. The implementation performs revision comparison and writes within that transaction, resolving the save promise only after `complete`. See the [IndexedDB transaction specification](https://w3c.github.io/IndexedDB/#transaction-scheduling).

Each repository instance keeps the opaque revision it last read or successfully committed. A write compares that revision with the currently stored record. A mismatch throws `StorageConflictError` before changing any data. A fresh UUID is generated only for an accepted change; unchanged ordinary saves keep the revision, while an explicitly requested backup replacement still creates a checkpoint. Both competing writes cannot succeed using the same old revision. Tokens are not timestamps, preventing a clock or same-millisecond tie from accepting a stale write.

Import/restore queues the checkpoint, migration acknowledgement and primary update in one transaction. If any queued request fails, all three roll back, preserving the previous inventory **and previous recovery point**. This strengthens the earlier LocalStorage adapter's two-step behavior. Recovery still retains only one previous successful replacement; daily item edits do not replace it. Snapshots are validated before opening the write transaction. No network or unrelated asynchronous work runs inside transaction callbacks.

## Page coordination

After a committed save, the hook sends a data-free BroadcastChannel notification. Other pages recheck their stored revision; focus, visibility, legacy storage events and a 30-second check provide additional opportunities when notification delivery is unavailable. These notifications improve freshness awareness; transaction revision checks enforce write safety independently.

External changes produce a compact notice with **重新读取**. No incoming notification replaces the state of an open editor. Stale saves are rejected and the form keeps its values. Reload is disabled while an item, purpose, deletion or backup dialog is open; the person must preserve/cancel the draft before reloading. This version does not automatically merge or reapply a stale draft. A failed or blocked database open leaves the existing data intact; connections close on version changes so a future database upgrade can proceed.

## Boundaries

- Browser/profile/origin-local storage; no cross-device sharing, login, remote server or cloud cache.
- Browser storage can still be cleared, evicted, denied or run out of space. Downloaded JSON backups remain necessary for recovery outside the browser.
- A legacy client does not participate in IndexedDB transactions. Its source changes are detected and retained, not automatically reconciled. Two upgraded pages do participate in the same transaction/revision protocol.
- The existing LocalStorage adapter remains for legacy compatibility, demos and regression tests. It is not a runtime fallback or a second active copy of new writes.
- `fake-indexeddb` is a development-only dependency. The shipped app uses the native browser API and adds no database runtime library.

## Verification

71 tests pass with strict TypeScript and a production build. Sixteen IndexedDB tests cover concurrent migration, no-op saves, competing writers, stale restores, synchronous and asynchronous failure rollback, interrupted migration, denied source reads, corrupt originals/recovery, first-import undo, legacy forks, invalid writes, reference isolation, database version changes and missing-record corruption. The existing domain, backup, configuration and quantity tests remain in place.

Browser checks used two real same-origin pages: migration retained the original zero-item fridge and recovery point; one page's write caused a notice in the other; a stale form save was rejected while its name/quantity remained; explicit reload allowed a subsequent edit; notifications worked in both directions; quantity and expiration remained intact. Test records and the extra page were removed. The 319px layout had no horizontal overflow. The browser screenshot service was unavailable, so no screenshot is supplied for this stage. Permission/quota/abort cases were simulated at the repository boundary, not by altering the user's browser permissions.
