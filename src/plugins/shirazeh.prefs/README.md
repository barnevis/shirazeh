# shirazeh.prefs

## Purpose

Feature plugin persisting the Shirazeh user's UI preferences (theme, language) on top of the storage infrastructure service.

## Structure

- `manifest.json` — plugin contract.
- `index.js` — Bonyan two-phase entry point, including the `core:service-unavailable` subscription.
- `lib/prefs-service.js` — the preference service.
- `tests/` — unit tests (`node:test`).

## Dependencies

- **Required:** `pey.storage.service` — all persistence goes through the storage infrastructure service.
- **Optional:** none.

## See Also

See [docs/reference.md](docs/reference.md) for the full API, errors, config, business rules, and constraints.
