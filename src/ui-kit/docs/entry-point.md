# Application Entry Point Contract

The consuming application's `ui/index.js` is the only UI module loaded by Pey Core. It owns:

- Reading `context.services`, `context.events`, and `context.config`.
- Creating one shared-state instance when the application has shared presentation state.
- Creating and mounting one shell.
- Supplying the Event Bus facade to `PeyElement` through the infrastructure connection envelope.
- Owning the route catalog and the page-loader registry instance built from it.
- Reacting to `router:changed`, then reading `router.getCurrentRoute()`.
- Unmounting all UI and releasing subscriptions only in `context.onShutdown`.

The kit helper `createApplicationSetup()` implements the shared validation and lifecycle policy. The application supplies `mountShell`, `cleanup`, and optional `onCoreShutdown` policies. `onCoreShutdown` is notification-only; final cleanup remains in `context.onShutdown`.

The helper uses an explicit `idle` → `starting` → `active` → `shutting-down` lifecycle. It enters `starting` before invoking application policy code, so reentrant `setup()` calls are rejected. Any startup failure rolls the lifecycle back to `idle`; cleanup failure also releases the state so a later Core restart can proceed.

The Entry Point never registers route patterns. Application plugins register their own patterns during activation.

The Entry Point composes page mounting from three kit modules. `createPageLoaderRegistry()` validates the application's route catalog once at startup, `createPageHost()` subscribes to `router:changed` and mounts/unmounts pages into the shell (guarded against stale async loads), and `pey-page-fallback` renders the internal not-found / load-failed states. The Entry Point owns the route catalog, the shell element, and the base refs (`services`, and `t`/`format`, plus the shared-state instance when one was created); the host owns nothing application-specific. The Entry Point connects and mounts the shell before creating the page host, so the host can never mount a child onto a detached shell.

The Entry Point builds one `createI18n()` instance with the application's catalog and injects `t` and `format` as refs. When no `t` is injected, the page host falls back to the kit's own catalog for the fallback outcomes — seeded from `config.language`, or from the shared-state `language` key when a valid facade is provided (a language change then re-renders an active fallback). The application catalog is application-owned; the kit supplies only its internal infrastructure keys.

The setup helper owns full validation of the Core UI context and Event Bus facade. The application manifest template only demonstrates the required Router lookup.

The setup helper reports missing Router with the structured code `PEY_WEBUI_REQUIRED_SERVICE_UNAVAILABLE`. Invalid context, Event Bus, configuration, or lifecycle policies use stable `PEY_WEBUI_*` codes and the standard Pey error fields.

The Entry Point normalizes `assetBaseUrl` to an absolute directory URL with exactly one trailing slash and passes it to kit infrastructure. Child assets use `new URL(childPath, assetBaseUrl)`. Components never resolve it against `document.baseURI` or Router `basePath`.

`core:shutdown` may be observed as a pre-shutdown notification, but final cleanup runs only in `context.onShutdown`.

`context.onShutdown` is synchronous. Pey Core does not await a returned Promise. `createApplicationSetup()` rejects thenable results from `mountShell` or `cleanup` with `PEY_WEBUI_ASYNC_LIFECYCLE_NOT_SUPPORTED`; applications must arrange asynchronous work outside these lifecycle policies.

Rejected thenables returned accidentally by lifecycle policies are consumed before the structured error is thrown, preventing an unhandled rejection. `onCoreShutdown` is synchronous like `mountShell` and `cleanup`; a returned Promise is rejected as `PEY_WEBUI_ASYNC_LIFECYCLE_NOT_SUPPORTED`, consumed, and logged inside the Event Bus boundary. Other errors thrown by the notification callback are also contained and logged.

If startup fails after mounting and rollback cleanup also fails, the original startup error remains the error returned to the Core. The rollback cleanup error is secondary and is logged without replacing the startup cause.

Required and optional service names must be non-empty strings with no surrounding whitespace — a name with leading or trailing whitespace is rejected with `PEY_WEBUI_INVALID_SETUP_POLICY`, not trimmed — and the lists must be disjoint. Router remains required even when an application supplies its own required-service list. Shared string config values are different: the kit trims them for non-empty validation and exposes the resolved values already trimmed.
