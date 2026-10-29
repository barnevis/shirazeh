# shirazeh.prefs — Reference

Self-contained reference for the `shirazeh.prefs` feature plugin. The manifest (`manifest.json`) is always the authoritative contract; this document explains it.

## Purpose

Persists the Shirazeh user's UI preferences (currently theme and language) so they survive reloads. It is a thin, graceful wrapper over the storage infrastructure service — deliberately without business rules, so the UI startup can consume it unconditionally.

## Structure

- `manifest.json` — plugin contract.
- `index.js` — Bonyan two-phase entry point (`prepare`/`activate`) and the `core:service-unavailable` subscription.
- `lib/prefs-service.js` — the preference service.
- `tests/prefs-service.test.js`, `tests/entry.test.js` — unit tests.

## Dependencies

- **Required:** `pey.storage.service` — every read/write goes through it.
- **Optional:** none.

## Public API

The service `shirazeh.prefs.service` provides two methods. Neither throws: the graceful-degradation contract keeps UI startup safe when storage is absent or failing.

### `get(key)`

```js
const theme = await prefsService.get('theme'); // 'dark' | null
```

Resolves to the stored value, or `null` when the preference was never stored, storage failed, the plugin is deactivated, or the key is invalid. A stored record without a `value` field reads as null.

### `set(key, value)`

```js
const saved = await prefsService.set('theme', 'dark'); // true | false
```

Writes the record `{ key, value }` and resolves `true` on success, `false` on failure or unavailability.

## Events

The plugin publishes no events.

Listens to (no declaration required):

- `core:service-unavailable` — losing the required storage dependency after activation is reported as a `REQUIRED_DEPENDENCY_LOST` critical error.

## Errors Reference

No error codes cross the boundary in the success/failure model above; the only plugin-reported critical error is `REQUIRED_DEPENDENCY_LOST` (delivered to the Core, not to callers).

## Config

| Key | Type | Required | Default | Purpose |
|---|---|---|---|---|
| `collection` | `string` | No | `prefs` | Storage collection holding the `{ key, value }` records (must exist in `pey.storage`'s configured `stores`). |

## Business Rules

- Preference values are strict JSON-compatible data (validated upstream by the storage service).
- Missing preference ⇒ `null`; failed write ⇒ `false`. No exceptions cross the service boundary.
- Invalid (empty/non-string) keys behave like missing preferences.

## Constraints

- Do not store large documents or sensitive data here; it is a small key-value preference store and the collection is unencrypted.
- Do not call `pey.storage.service` from the UI directly — persistence goes through this plugin so the storage backend stays swappable.
